const express = require("express");
const router  = express.Router();
const db      = require("../db");
const { adminOnly } = require("../middleware/auth");
const {
  genId, nowIso, parseDate,
  securityCodeHash, generateSixDigitCode, validatePasswordStrength,
  ok, created, fail, asyncRoute, safeJsonParse, runInBackground,
  writeNotification, writeAuditLog, deliverEmail, getRequiredApprovals,
  serializeService, normalizeServiceFields, normalizeServiceCategory,
  validateRequestDetails, deriveLegacyRequestFields,
} = require("../utils/helpers");
const {
  admin1ApprovedToAdmin2Email, admin1DisapprovedToUserEmail,
  admin2ApprovedToStaffEmail, admin2DisapprovedToUserEmail,
  serviceReadyEmail, requestStatusEmail, broadcastEmail,
} = require("../email");

// ----------------------------------------------------------------
// ADMIN - 2-step approval chain
// ----------------------------------------------------------------

const ADMIN_REQUEST_SELECT = `
  SELECT
    requests.*,
    users.username AS requester_username,
    users.full_name AS requester_full_name,
    users.email AS requester_email,
    users.department AS requester_department,
    users.role AS requester_role,
    users.status AS requester_status,
    users.profile_picture AS requester_profile_picture,
    users.created_at AS requester_created_at
  FROM requests
  LEFT JOIN users ON users.id = requests.user_id
`;

// Get all requests visible to admin (verified + partially/fully approved)
router.get("/api/admin/requests", adminOnly, asyncRoute(async (req, res) => {
  const { status, queue } = req.query;
  const requiredApprovals = await getRequiredApprovals();
  const adminId = req.user.id;

  let sql;
  let params = [];

  if (queue === "mine") {
    if (requiredApprovals === 1) {
      sql = `${ADMIN_REQUEST_SELECT} WHERE requests.status = 'verified' AND requests.admin1_action IS NULL ORDER BY requests.submitted_at DESC`;
    } else {
      sql = `${ADMIN_REQUEST_SELECT} WHERE requests.status = 'verified' AND (
        (requests.admin1_action IS NULL) OR
        (requests.admin1_action = 'approved' AND requests.admin2_action IS NULL AND requests.admin1_id != ?)
      ) ORDER BY requests.submitted_at DESC`;
      params = [adminId];
    }
  } else if (status) {
    sql = `${ADMIN_REQUEST_SELECT} WHERE requests.status = ? ORDER BY requests.submitted_at DESC`;
    params = [status];
  } else {
    sql = `${ADMIN_REQUEST_SELECT} WHERE requests.status IN ('verified','approved','completed','disapproved') ORDER BY requests.submitted_at DESC`;
  }

  const requests = await db.all2(sql, params);
  return ok(res, requests);
}));

router.patch("/api/admin/requests/:id/status", adminOnly, asyncRoute(async (req, res) => {
  const { action, note } = req.body;
  if (!["approved", "disapproved"].includes(action)) {
    return fail(res, 400, "action must be approved or disapproved");
  }

  const request = await db.get2("SELECT * FROM requests WHERE id = ?", [req.params.id]);
  if (!request) return fail(res, 404, "Request not found");
  if (request.status !== "verified") return fail(res, 400, "Can only act on verified requests");

  const requiredApprovals = await getRequiredApprovals();
  const adminUser = await db.get2("SELECT * FROM users WHERE id = ?", [req.user.id]);
  const timestamp = nowIso();

  const isStep1 = !request.admin1_action;
  const isStep2 = request.admin1_action === "approved" && !request.admin2_action && request.admin1_id !== req.user.id;
  if (!isStep1 && !isStep2) {
    return fail(res, 400, "You have already acted on this request, or it is not your turn.");
  }

  if (isStep1) {
    await db.run2(
      "UPDATE requests SET admin1_id = ?, admin1_name = ?, admin1_note = ?, admin1_action = ?, admin1_at = ? WHERE id = ?",
      [req.user.id, adminUser.full_name, note || null, action, timestamp, req.params.id]
    );
    await writeAuditLog(req.user, `request.admin1_${action}`, "request", req.params.id, { note: note || null });

    if (action === "disapproved" || requiredApprovals === 1) {
      const finalStatus = action === "approved" ? "approved" : "disapproved";
      await db.run2(
        "UPDATE requests SET status = ?, admin_note = ?, resolved_at = ? WHERE id = ?",
        [finalStatus, note || null, nowIso(), req.params.id]
      );
      const updated = await db.get2("SELECT * FROM requests WHERE id = ?", [req.params.id]);

      if (action === "approved") {
        await writeNotification(request.user_id, `Your ${request.service_type} request has been APPROVED! The GSO team will contact you shortly.`);
        runInBackground("request.admin_approved.notify_staff", async () => {
          const staffList = await db.all2("SELECT * FROM users WHERE role = 'staff' AND status = 'approved'");
          await deliverEmail(serviceReadyEmail(updated, staffList), {
            actor: req.user,
            entityId: req.params.id,
            details: { event: "request.admin_approved.notify_staff" },
          });
        });
        runInBackground("request.admin_approved.notify_user", async () => {
          await deliverEmail(requestStatusEmail(updated, "approved", note), {
            actor: req.user,
            entityId: req.params.id,
            details: { event: "request.admin_approved.notify_user" },
          });
        });
      } else {
        await writeNotification(request.user_id, `Your ${request.service_type} request was DISAPPROVED.${note ? ` Reason: ${note}` : ""}`);
        runInBackground("request.admin1_disapproved.notify_user", async () => {
          await deliverEmail(admin1DisapprovedToUserEmail(updated, adminUser.full_name, note), {
            actor: req.user,
            entityId: req.params.id,
            details: { event: "request.admin1_disapproved.notify_user" },
          });
        });
      }
      return ok(res, await db.get2("SELECT * FROM requests WHERE id = ?", [req.params.id]));
    }

    const updated = await db.get2("SELECT * FROM requests WHERE id = ?", [req.params.id]);
    runInBackground("request.admin1_approved.notify_admin2", async () => {
      const otherAdmins = await db.all2(
        "SELECT * FROM users WHERE role IN ('admin','head_admin') AND status = 'approved' AND id != ?",
        [req.user.id]
      );
      if (otherAdmins.length > 0) {
        await deliverEmail(admin1ApprovedToAdmin2Email(updated, adminUser.full_name, otherAdmins), {
          actor: req.user,
          entityId: req.params.id,
          details: { event: "request.admin1_approved.notify_admin2" },
        });
      }
    });
    await writeNotification(request.user_id, `Your ${request.service_type} request has been approved by ${adminUser.full_name} (Admin 1) and is awaiting final Admin approval.`);
    return ok(res, updated);
  }

  await db.run2(
    "UPDATE requests SET admin2_id = ?, admin2_name = ?, admin2_note = ?, admin2_action = ?, admin2_at = ? WHERE id = ?",
    [req.user.id, adminUser.full_name, note || null, action, timestamp, req.params.id]
  );
  const finalStatus = action === "approved" ? "approved" : "disapproved";
  await db.run2(
    "UPDATE requests SET status = ?, admin_note = ?, resolved_at = ? WHERE id = ?",
    [finalStatus, note || null, nowIso(), req.params.id]
  );
  await writeAuditLog(req.user, `request.admin2_${action}`, "request", req.params.id, { note: note || null });

  const updated = await db.get2("SELECT * FROM requests WHERE id = ?", [req.params.id]);
  if (action === "approved") {
    await writeNotification(request.user_id, `Your ${request.service_type} request has been FULLY APPROVED by both admins! The GSO team will contact you shortly.`);
    runInBackground("request.admin2_approved.notify_staff", async () => {
      const staffList = await db.all2("SELECT * FROM users WHERE role = 'staff' AND status = 'approved'");
      await deliverEmail(admin2ApprovedToStaffEmail(updated, adminUser.full_name, staffList), {
        actor: req.user,
        entityId: req.params.id,
        details: { event: "request.admin2_approved.notify_staff" },
      });
    });
    runInBackground("request.admin2_approved.notify_user", async () => {
      await deliverEmail(requestStatusEmail(updated, "approved", note), {
        actor: req.user,
        entityId: req.params.id,
        details: { event: "request.admin2_approved.notify_user" },
      });
    });
  } else {
    await writeNotification(request.user_id, `Your ${request.service_type} request was DISAPPROVED by final review.${note ? ` Reason: ${note}` : ""}`);
    runInBackground("request.admin2_disapproved.notify_user", async () => {
      await deliverEmail(admin2DisapprovedToUserEmail(updated, adminUser.full_name, note), {
        actor: req.user,
        entityId: req.params.id,
        details: { event: "request.admin2_disapproved.notify_user" },
      });
    });
  }
  return ok(res, updated);
}));

router.get("/api/admin/stats", adminOnly, async (req, res) => {
  try {
    const requiredApprovals = await getRequiredApprovals();
    const [tu, pu, au, tr, pending, verified, approved, completed, disapproved, declined] = await Promise.all([
      db.get2("SELECT COUNT(*) as c FROM users WHERE role NOT IN ('head_admin')"),
      db.get2("SELECT COUNT(*) as c FROM users WHERE status='pending'"),
      db.get2("SELECT COUNT(*) as c FROM users WHERE status='approved'"),
      db.get2("SELECT COUNT(*) as c FROM requests"),
      db.get2("SELECT COUNT(*) as c FROM requests WHERE status='pending'"),
      db.get2("SELECT COUNT(*) as c FROM requests WHERE status='verified'"),
      db.get2("SELECT COUNT(*) as c FROM requests WHERE status='approved'"),
      db.get2("SELECT COUNT(*) as c FROM requests WHERE status='completed'"),
      db.get2("SELECT COUNT(*) as c FROM requests WHERE status='disapproved'"),
      db.get2("SELECT COUNT(*) as c FROM requests WHERE status='declined'"),
    ]);
    const awaitingAdmin1 = await db.get2("SELECT COUNT(*) as c FROM requests WHERE status='verified' AND admin1_action IS NULL");
    const awaitingAdmin2 = await db.get2("SELECT COUNT(*) as c FROM requests WHERE status='verified' AND admin1_action='approved' AND admin2_action IS NULL");
    res.json({
      total_users: tu.c, pending_users: pu.c, approved_users: au.c,
      total_requests: tr.c, pending_requests: pending.c, verified_requests: verified.c,
      approved_requests: approved.c, completed_requests: completed.c, disapproved_requests: disapproved.c, declined_requests: declined.c,
      awaiting_admin1: awaitingAdmin1.c, awaiting_admin2: awaitingAdmin2.c,
      required_approvals: requiredApprovals,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/api/admin/analytics", adminOnly, asyncRoute(async (req, res) => {
  const filters = [];
  const params = [];
  const { date_from, date_to, service } = req.query;

  if (date_from) {
    filters.push("submitted_at >= ?");
    params.push(`${date_from}T00:00:00.000Z`);
  }
  if (date_to) {
    filters.push("submitted_at <= ?");
    params.push(`${date_to}T23:59:59.999Z`);
  }
  if (service && service !== "all") {
    filters.push("service_type = ?");
    params.push(service);
  }

  const where = filters.length ? `WHERE requests.${filters.join(" AND requests.")}` : "";
  const countFor = (status) => db.get2(`SELECT COUNT(*) as count FROM requests ${where}${where ? " AND" : " WHERE"} requests.status = ?`, [...params, status]);

  const [verified, approved, completed, disapproved, pending, declined] = await Promise.all([
    countFor("verified"),
    countFor("approved"),
    countFor("completed"),
    countFor("disapproved"),
    countFor("pending"),
    countFor("declined"),
  ]);

  const total = await db.get2(`SELECT COUNT(*) as count FROM requests ${where}`, params);

  const byService = await db.all2(
    `SELECT service_type, COUNT(*) as count FROM requests ${where} GROUP BY service_type ORDER BY count DESC`,
    params
  );

  // Group by user's department (stored in requests.department)
  const byDepartment = await db.all2(
    `SELECT department, COUNT(*) as count FROM requests ${where} GROUP BY department ORDER BY count DESC LIMIT 10`,
    params
  );

  // Group by location (stored in requests.location)
  const byLocation = await db.all2(
    `SELECT location, COUNT(*) as count FROM requests ${where} GROUP BY location ORDER BY count DESC LIMIT 10`,
    params
  );

  // Top requesters by number of submitted requests
  const topRequesters = await db.all2(
    `SELECT user_name, department, COUNT(*) as count FROM requests ${where} GROUP BY user_id ORDER BY count DESC LIMIT 8`,
    params
  );

  // Avg feedback
  const feedbackWhere = where ? `${where} AND feedback_rating IS NOT NULL` : `WHERE feedback_rating IS NOT NULL`;
  const avgFeedback = await db.get2(
    `SELECT AVG(feedback_rating) as avg_rating, COUNT(*) as rated_count FROM requests ${feedbackWhere}`,
    params
  );

  // Feedback by service
  const feedbackByService = await db.all2(
    `SELECT service_type, ROUND(AVG(feedback_rating),1) as avg_rating, COUNT(*) as count FROM requests ${feedbackWhere} GROUP BY service_type ORDER BY avg_rating DESC`,
    params
  );

  const requestsByUser = await db.all2(`SELECT * FROM requests ${where} ORDER BY submitted_at DESC LIMIT 200`, params);

  return ok(res, {
    byStatus: [
      { status: "verified", count: verified.count },
      { status: "approved", count: approved.count },
      { status: "completed", count: completed.count },
      { status: "disapproved", count: disapproved.count },
      { status: "pending", count: pending.count },
      { status: "declined", count: declined.count },
    ],
    byService,
    byDepartment,
    byLocation,
    topRequesters,
    feedbackByService,
    avgFeedback: avgFeedback?.avg_rating ? Number(avgFeedback.avg_rating).toFixed(1) : "-",
    avgFeedbackCount: avgFeedback?.rated_count || 0,
    requestsByUser,
    stats: {
      total: total.count,
      verified: verified.count,
      approved: approved.count,
      completed: completed.count,
      disapproved: disapproved.count,
      pending: pending.count,
      declined: declined.count,
    },
    filters: { date_from: date_from || null, date_to: date_to || null, service: service || "all" },
  });
}));

router.get("/api/admin/audit-logs", adminOnly, asyncRoute(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "100", 10) || 100, 500);
  const action = String(req.query.action || "").trim();
  const entityType = String(req.query.entity_type || "").trim();
  const where = [];
  const params = [];
  if (action) {
    where.push("action = ?");
    params.push(action);
  }
  if (entityType) {
    where.push("entity_type = ?");
    params.push(entityType);
  }
  params.push(limit);
  const rows = await db.all2(
    `SELECT * FROM audit_logs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ?`,
    params
  );
  return ok(res, rows.map((row) => ({ ...row, details: safeJsonParse(row.details_json, {}) })));
}));




router.post("/api/admin/users/broadcast", adminOnly, asyncRoute(async (req, res) => {
  const { subject, message } = req.body;
  if (!subject || !message) return fail(res, 400, "subject and message required");
  const users = await db.all2("SELECT * FROM users WHERE status = 'approved'");
  const results = [];
  for (const user of users) {
    const result = await deliverEmail(broadcastEmail(user, subject, message), {
      actor: req.user,
      entityId: user.id,
      details: { event: "broadcast" },
    });
    results.push({ user: user.username, status: result.ok ? "sent" : "fallback", error: result.error || null });
  }
  await writeAuditLog(req.user, "broadcast.send", "broadcast", null, { subject, recipients: users.length });
  return ok(res, { message: `Broadcast to ${users.length} users`, results });
}));

module.exports = router;
