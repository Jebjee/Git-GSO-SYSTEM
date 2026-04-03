const express = require("express");
const router  = express.Router();
const db      = require("../db");
const { staffOnly } = require("../middleware/auth");
const {
  genId, nowIso, parseDate,
  securityCodeHash, generateSixDigitCode, validatePasswordStrength,
  ok, created, fail, asyncRoute, safeJsonParse, runInBackground,
  writeNotification, writeAuditLog, deliverEmail, getRequiredApprovals,
  serializeService, normalizeServiceFields, normalizeServiceCategory,
  validateRequestDetails, deriveLegacyRequestFields,
} = require("../utils/helpers");
const { staffVerifiedToAdmin1Email, staffStatusEmail } = require("../email");

// ----------------------------------------------------------------
// STAFF
// ----------------------------------------------------------------
router.get("/api/staff/requests", staffOnly, asyncRoute(async (req, res) => {
  const { status } = req.query;
  const requests = status
    ? await db.all2("SELECT * FROM requests WHERE status = ? ORDER BY submitted_at DESC", [status])
    : await db.all2("SELECT * FROM requests ORDER BY submitted_at DESC");
  return ok(res, requests);
}));

router.get("/api/staff/feedback", staffOnly, asyncRoute(async (req, res) => {
  const rows = await db.all2(
    "SELECT * FROM requests WHERE feedback_submitted_at IS NOT NULL ORDER BY feedback_submitted_at DESC"
  );
  return ok(res, rows);
}));
router.get("/api/staff/feedback/pending", staffOnly, asyncRoute(async (req, res) => {
  const { service } = req.query;
  const params = [];
  let where = "WHERE status = 'completed' AND feedback_submitted_at IS NULL";
  if (service && service !== "all") {
    where += " AND service_type = ?";
    params.push(service);
  }
  const rows = await db.all2(
    `SELECT * FROM requests ${where} ORDER BY completed_at DESC, submitted_at DESC`,
    params
  );
  return ok(res, rows);
}));

router.post("/api/staff/requests/:id/feedback-reminder", staffOnly, asyncRoute(async (req, res) => {
  const request = await db.get2("SELECT * FROM requests WHERE id = ?", [req.params.id]);
  if (!request) return fail(res, 404, "Request not found");
  if (request.status !== "completed") return fail(res, 400, "Reminder can only be sent for completed requests");
  if (request.feedback_submitted_at) return fail(res, 409, "Feedback already submitted for this request");

  const reminderMessage = `Reminder: Please submit your feedback for completed ${request.service_type} service request (Request ID: ${request.id}).`;
  await writeNotification(request.user_id, reminderMessage);
  await writeAuditLog(req.user, "request.feedback.reminder", "request", req.params.id, { user_id: request.user_id });

  if (request.user_email) {
    runInBackground("request.feedback.reminder_email", async () => {
      await deliverEmail({
        to: request.user_email,
        subject: `[GSO] Feedback Reminder - ${request.service_type}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
          <h2 style="margin:0 0 12px 0;color:#0f172a;">Feedback Reminder</h2>
          <p>Dear <strong>${request.user_name || "Requester"}</strong>,</p>
          <p>Your <strong>${request.service_type}</strong> request has been marked completed. Please submit your required feedback in the GSO system.</p>
          <p><strong>Request ID:</strong> ${request.id}</p>
          <p style="margin-top:20px;color:#475569;">Thank you.</p>
        </div>`
      }, {
        actor: req.user,
        entityId: req.params.id,
        details: { event: "request.feedback.reminder_email" },
      });
    });
  }

  return ok(res, { message: "Feedback reminder sent." });
}));

router.patch("/api/staff/requests/:id/status", staffOnly, asyncRoute(async (req, res) => {
  const { status, staff_note } = req.body;
  const priorityNumber = String(req.body.priority_number || "").trim() || null;
  if (!["verified", "pending", "declined", "completed"].includes(status)) {
    return fail(res, 400, "Status must be verified, pending, declined, or completed");
  }

  const request = await db.get2("SELECT * FROM requests WHERE id = ?", [req.params.id]);
  if (!request) return fail(res, 404, "Request not found");
  if (status === "completed") {
    const requiredApprovals = await getRequiredApprovals();
    const hasAdmin1Approval = request.admin1_action === "approved";
    const hasAdmin2Approval = request.admin2_action === "approved";
    const hasRequiredApprovals = requiredApprovals === 1
      ? hasAdmin1Approval
      : (hasAdmin1Approval && hasAdmin2Approval);

    if (!hasRequiredApprovals) {
      return fail(
        res,
        400,
        requiredApprovals === 1
          ? "Cannot mark as done yet. Admin 1 approval is required."
          : "Cannot mark as done yet. Both Admin 1 and Admin 2 approvals are required."
      );
    }
    if (request.status !== "approved") {
      return fail(res, 400, "Only approved requests can be marked completed");
    }
  }
  if (status === "verified" && !priorityNumber) {
    return fail(res, 400, "Priority number is required before verifying and forwarding to head admin");
  }

  const verifiedAt = status === "verified" ? nowIso() : request.staff_verified_at;
  const completedAt = status === "completed" ? nowIso() : request.completed_at;
  const completedById = status === "completed" ? req.user.id : request.completed_by_id;
  const completedByName = status === "completed" ? (req.user.full_name || req.user.username || null) : request.completed_by_name;
  await db.run2(
    "UPDATE requests SET status = ?, staff_note = ?, priority_number = ?, staff_verified_at = ?, completed_at = ?, completed_by_id = ?, completed_by_name = ? WHERE id = ?",
    [status, staff_note || null, status === "verified" ? priorityNumber : request.priority_number, verifiedAt || null, completedAt || null, completedById, completedByName, req.params.id]
  );

  const msgs = {
    verified: `Your ${request.service_type} request has been VERIFIED by staff and forwarded for Admin review.`,
    pending: `Your ${request.service_type} request has been marked PENDING by staff.${staff_note ? ` Note: ${staff_note}` : ""}`,
    declined: `Your ${request.service_type} request has been DECLINED by staff.${staff_note ? ` Reason: ${staff_note}` : ""}`,
    completed: `Your ${request.service_type} request has been marked DONE by staff.${staff_note ? ` Note: ${staff_note}` : ""} Please submit your required feedback.`,
  };
  await writeNotification(request.user_id, msgs[status]);

  const updated = await db.get2("SELECT * FROM requests WHERE id = ?", [req.params.id]);
  await writeAuditLog(req.user, `request.staff_${status}`, "request", req.params.id, {
    staff_note: staff_note || null,
    priority_number: status === "verified" ? priorityNumber : request.priority_number || null,
    previous_status: request.status,
    next_status: status,
  });

  if (status !== "completed") {
    runInBackground("request.staff_status_email", async () => {
      await deliverEmail(require("../email").staffStatusEmail(updated, status), {
        actor: req.user,
        entityId: req.params.id,
        details: { event: "request.staff_status" },
      });
    });
  }

  if (status === "verified") {
    runInBackground("request.staff_verified.notify_admins", async () => {
      const requiredApprovals = await getRequiredApprovals();
      const adminList = await db.all2("SELECT * FROM users WHERE role IN ('admin','head_admin') AND status = 'approved'");
      if (adminList.length > 0) {
        await deliverEmail(staffVerifiedToAdmin1Email(updated, adminList, requiredApprovals), {
          actor: req.user,
          entityId: req.params.id,
          details: { event: "request.staff_verified.notify_admins" },
        });
      }
    });
  }
  return ok(res, updated);
}));

router.get("/api/staff/analytics", staffOnly, asyncRoute(async (req, res) => {
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

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const countFor = (status) => db.get2(`SELECT COUNT(*) as c FROM requests ${where}${where ? " AND" : " WHERE"} status = ?`, [...params, status]);

  const [total, pending, verified, declined, approved, completed, disapproved] = await Promise.all([
    db.get2(`SELECT COUNT(*) as c FROM requests ${where}`, params),
    countFor("pending"),
    countFor("verified"),
    countFor("declined"),
    countFor("approved"),
    countFor("completed"),
    countFor("disapproved"),
  ]);
  const admin1Pending = await db.get2(
    `SELECT COUNT(*) as c FROM requests ${where}${where ? " AND" : " WHERE"} status='verified' AND admin1_action IS NULL`,
    params
  );
  const admin2Pending = await db.get2(
    `SELECT COUNT(*) as c FROM requests ${where}${where ? " AND" : " WHERE"} status='verified' AND admin1_action='approved' AND admin2_action IS NULL`,
    params
  );
  const byService = await db.all2(
    `SELECT service_type, COUNT(*) as count FROM requests ${where} GROUP BY service_type ORDER BY count DESC`,
    params
  );
  const recent = await db.all2(
    `SELECT * FROM requests ${where} ORDER BY submitted_at DESC LIMIT 20`,
    params
  );
  return ok(res, {
    stats: {
      total: total.c,
      pending: pending.c,
      verified: verified.c,
      declined: declined.c,
      approved: approved.c,
      completed: completed.c,
      disapproved: disapproved.c,
      admin1_pending: admin1Pending.c,
      admin2_pending: admin2Pending.c,
    },
    byService,
    recent,
    filters: { date_from: date_from || null, date_to: date_to || null, service: service || "all" },
  });
}));

module.exports = router;
