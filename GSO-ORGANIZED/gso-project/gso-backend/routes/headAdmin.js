const express = require("express");
const router  = express.Router();
const db      = require("../db");
const { headAdminOnly, adminOnly, authMiddleware } = require("../middleware/auth");
const {
  genId, nowIso, parseDate,
  securityCodeHash, generateSixDigitCode, validatePasswordStrength,
  ok, created, fail, asyncRoute, safeJsonParse, runInBackground,
  writeNotification, writeAuditLog, deliverEmail, getRequiredApprovals,
  serializeService, normalizeServiceFields, normalizeServiceCategory,
  validateRequestDetails, deriveLegacyRequestFields,
} = require("../utils/helpers");
const { userStatusEmail, broadcastEmail } = require("../email");

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


// ----------------------------------------------------------------
// HEAD ADMIN
// ----------------------------------------------------------------
router.get("/api/head-admin/users", headAdminOnly, asyncRoute(async (req, res) => {
  const users = await db.all2("SELECT id, full_name, email, username, department, role, status, created_at FROM users ORDER BY created_at DESC");
  return ok(res, users);
}));

router.get("/api/head-admin/requests", headAdminOnly, asyncRoute(async (req, res) => {
  const { status } = req.query;
  const sql = status
    ? `${ADMIN_REQUEST_SELECT} WHERE requests.status = ? ORDER BY requests.submitted_at DESC`
    : `${ADMIN_REQUEST_SELECT} ORDER BY requests.submitted_at DESC`;
  const requests = await db.all2(sql, status ? [status] : []);
  return ok(res, requests);
}));

router.patch("/api/head-admin/users/:id/status", headAdminOnly, asyncRoute(async (req, res) => {
  const { status } = req.body;
  if (!["approved", "rejected"].includes(status)) {
    return fail(res, 400, "Status must be approved or rejected");
  }
  const user = await db.get2("SELECT * FROM users WHERE id = ?", [req.params.id]);
  if (!user) return fail(res, 404, "User not found");
  await db.run2("UPDATE users SET status = ? WHERE id = ?", [status, req.params.id]);
  const msg = status === "approved"
    ? "Your account has been APPROVED. You can now log in to the GSO system."
    : "Your account registration has been REJECTED. Contact the admin.";
  await writeNotification(user.id, msg);
  await writeAuditLog(req.user, `user.${status}`, "user", req.params.id, { username: user.username, role: user.role });
  runInBackground("user.status_changed.email", async () => {
    await deliverEmail(userStatusEmail(user, status), {
      actor: req.user,
      entityId: req.params.id,
      details: { event: "user.status_changed" },
    });
  });
  return ok(res, { message: `User ${status}` });
}));

router.get("/api/head-admin/stats", headAdminOnly, async (req, res) => {
  try {
    const requiredApprovals = await getRequiredApprovals();
    const [tu, staff, admins, pendingUsers, approvedUsers, tr, pending, verified, approved, completed, disapproved, declined] = await Promise.all([
      db.get2("SELECT COUNT(*) as c FROM users WHERE role = 'user'"),
      db.get2("SELECT COUNT(*) as c FROM users WHERE role = 'staff'"),
      db.get2("SELECT COUNT(*) as c FROM users WHERE role = 'admin'"),
      db.get2("SELECT COUNT(*) as c FROM users WHERE status = 'pending'"),
      db.get2("SELECT COUNT(*) as c FROM users WHERE status = 'approved'"),
      db.get2("SELECT COUNT(*) as c FROM requests"),
      db.get2("SELECT COUNT(*) as c FROM requests WHERE status='pending'"),
      db.get2("SELECT COUNT(*) as c FROM requests WHERE status='verified'"),
      db.get2("SELECT COUNT(*) as c FROM requests WHERE status='approved'"),
      db.get2("SELECT COUNT(*) as c FROM requests WHERE status='completed'"),
      db.get2("SELECT COUNT(*) as c FROM requests WHERE status='disapproved'"),
      db.get2("SELECT COUNT(*) as c FROM requests WHERE status='declined'"),
    ]);
    res.json({
      required_approvals: requiredApprovals,
      users: { total: tu.c, staff: staff.c, admins: admins.c, pending: pendingUsers.c, approved: approvedUsers.c },
      requests: { total: tr.c, pending: pending.c, verified: verified.c, approved: approved.c, completed: completed.c, disapproved: disapproved.c, declined: declined.c },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Head admin sets required approvals (1 or 2)
router.patch("/api/head-admin/settings/approvals", headAdminOnly, asyncRoute(async (req, res) => {
  const { required_approvals } = req.body;
  const nextApprovals = parseInt(required_approvals, 10);
  if (![1, 2].includes(nextApprovals)) {
    return fail(res, 400, "required_approvals must be 1 or 2");
  }

  const current = await db.get2("SELECT value FROM settings WHERE `key` = 'required_admin_approvals'");
  const prevApprovals = current ? parseInt(current.value, 10) : 2;

  if (prevApprovals !== nextApprovals) {
    if (nextApprovals === 1) {
      // Promote in-flight step-2 queue into final approved when policy moves to single approver.
      await db.run2(
        `UPDATE requests
         SET status = 'approved', resolved_at = ?
         WHERE status = 'verified' AND admin1_action = 'approved' AND admin2_action IS NULL`,
        [nowIso()]
      );
    } else {
      // Reopen previously single-approved requests so Admin 2 can complete final review.
      await db.run2(
        `UPDATE requests
         SET status = 'verified', resolved_at = NULL
         WHERE status = 'approved' AND admin1_action = 'approved' AND admin2_action IS NULL`,
        []
      );
    }
  }

  await db.run2("UPDATE settings SET value = ? WHERE `key` = 'required_admin_approvals'", [String(nextApprovals)]);
  await writeAuditLog(req.user, "settings.required_approvals", "setting", "required_admin_approvals", {
    previous_value: prevApprovals,
    value: nextApprovals,
  });
  return ok(res, { message: "Setting updated", required_approvals: nextApprovals });
}));

router.get("/api/settings", authMiddleware, asyncRoute(async (req, res) => {
  const s = await db.get2("SELECT value FROM settings WHERE `key` = 'required_admin_approvals'");
  return ok(res, { required_approvals: s ? parseInt(s.value) : 2 });
}));

router.get("/api/head-admin/audit-logs", headAdminOnly, asyncRoute(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "200", 10) || 200, 500);
  const rows = await db.all2("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?", [limit]);
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
