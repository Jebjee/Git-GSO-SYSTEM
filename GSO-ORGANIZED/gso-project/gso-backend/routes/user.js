const express = require("express");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const router  = express.Router();
const db      = require("../db");
const { JWT_SECRET, SECURITY_CODE_TTL_MINUTES, SECURITY_CODE_MIN_RETRY_SECONDS, SECURITY_CODE_MAX_ATTEMPTS } = require("../config/constants");
const { authMiddleware, headAdminOnly } = require("../middleware/auth");
const {
  genId, nowIso, parseDate,
  securityCodeHash, generateSixDigitCode, validatePasswordStrength,
  ok, created, fail, asyncRoute, safeJsonParse, runInBackground,
  writeNotification, writeAuditLog, deliverEmail, getRequiredApprovals,
  serializeService, normalizeServiceFields, normalizeServiceCategory,
  validateRequestDetails, deriveLegacyRequestFields,
} = require("../utils/helpers");
const {
  newRequestToStaffEmail, securityVerificationEmail, securityChangedEmail,
} = require("../email");

// ----------------------------------------------------------------
// USER / SHARED
// ----------------------------------------------------------------
router.get("/api/user/profile", authMiddleware, async (req, res) => {
  const user = await db.get2("SELECT id, full_name, email, username, department, role, profile_picture, status, created_at FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

router.patch("/api/user/profile", authMiddleware, async (req, res) => {
  try {
    const { profile_picture } = req.body;
    if (profile_picture) await db.run2("UPDATE users SET profile_picture = ? WHERE id = ?", [profile_picture, req.user.id]);
    const user = await db.get2("SELECT id, full_name, email, username, department, role, profile_picture, status, created_at FROM users WHERE id = ?", [req.user.id]);
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/api/user/security/request-code", authMiddleware, asyncRoute(async (req, res) => {
  const action = String(req.body.action || "").trim().toLowerCase();
  const allowed = new Set(["username", "password"]);
  if (!allowed.has(action)) return fail(res, 400, "Invalid action");

  const user = await db.get2("SELECT id, full_name, email, username, password, role, status FROM users WHERE id = ?", [req.user.id]);
  if (!user) return fail(res, 404, "User not found");

  const latest = await db.get2(
    "SELECT id, created_at, expires_at, used_at FROM verification_codes WHERE user_id = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1",
    [user.id, action]
  );
  if (latest && !latest.used_at) {
    const createdAt = parseDate(latest.created_at);
    if (createdAt) {
      const retryMs = SECURITY_CODE_MIN_RETRY_SECONDS * 1000;
      const waitMs = retryMs - (Date.now() - createdAt.getTime());
      if (waitMs > 0) {
        return fail(res, 429, `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting a new code`);
      }
    }
  }

  let payload = {};
  if (action === "username") {
    const newUsername = String(req.body.new_username || "").trim();
    if (newUsername.length < 3) return fail(res, 400, "Username must be at least 3 characters");
    if (newUsername === user.username) return fail(res, 400, "New username must be different from your current username");
    const taken = await db.get2("SELECT id FROM users WHERE username = ? AND id <> ?", [newUsername, user.id]);
    if (taken) return fail(res, 409, "This username is already taken. Please choose another");
    payload = { new_username: newUsername };
  }

  if (action === "password") {
    const newPassword = String(req.body.new_password || "");
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) return fail(res, 400, passwordError);
    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) return fail(res, 400, "New password must be different from your current password");
    payload = { new_password_hash: await bcrypt.hash(newPassword, 10) };
  }

  const code = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + SECURITY_CODE_TTL_MINUTES * 60 * 1000).toISOString();

  await db.run2(
    "UPDATE verification_codes SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL",
    [nowIso(), user.id, action]
  );
  await db.run2(
    `INSERT INTO verification_codes (id, user_id, purpose, code_hash, payload_json, attempt_count, expires_at, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?)`,
    [genId(), user.id, action, securityCodeHash(code), JSON.stringify(payload), expiresAt, nowIso()]
  );

  const actionLabel = action === "username" ? "Username Change" : "Password Change";
  const mailResult = await deliverEmail(securityVerificationEmail(user, actionLabel, code, SECURITY_CODE_TTL_MINUTES), {
    actor: req.user,
    entityId: user.id,
    details: { event: "security_code_sent", action },
  });
  if (!mailResult.ok) {
    await db.run2("DELETE FROM verification_codes WHERE user_id = ? AND purpose = ? AND code_hash = ?", [
      user.id,
      action,
      securityCodeHash(code),
    ]);
    return fail(res, 503, `Unable to send verification code email. ${mailResult.error || "Please check SMTP settings."}`);
  }
  await writeAuditLog(req.user, "security.code.requested", "user", user.id, { action });

  return ok(res, { message: `Verification code sent to ${user.email}`, expires_in_seconds: SECURITY_CODE_TTL_MINUTES * 60 });
}));

router.post("/api/user/security/confirm-code", authMiddleware, asyncRoute(async (req, res) => {
  const action = String(req.body.action || "").trim().toLowerCase();
  const code = String(req.body.code || "").trim();
  if (!["username", "password"].includes(action)) return fail(res, 400, "Invalid action");
  if (!/^\d{6}$/.test(code)) return fail(res, 400, "Verification code must be 6 digits");

  const user = await db.get2("SELECT id, full_name, email, username, role, status FROM users WHERE id = ?", [req.user.id]);
  if (!user) return fail(res, 404, "User not found");

  const record = await db.get2(
    `SELECT id, code_hash, payload_json, attempt_count, expires_at, used_at, created_at
     FROM verification_codes
     WHERE user_id = ? AND purpose = ? AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [user.id, action]
  );
  if (!record) return fail(res, 404, "No pending verification request found. Request a new code first.");

  const expiresAt = parseDate(record.expires_at);
  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    await db.run2("UPDATE verification_codes SET used_at = ? WHERE id = ?", [nowIso(), record.id]);
    return fail(res, 410, "Verification code expired. Request a new code.");
  }

  if ((record.attempt_count || 0) >= SECURITY_CODE_MAX_ATTEMPTS) {
    await db.run2("UPDATE verification_codes SET used_at = ? WHERE id = ?", [nowIso(), record.id]);
    return fail(res, 429, "Too many attempts. Request a new code.");
  }

  const codeValid = securityCodeHash(code) === record.code_hash;
  if (!codeValid) {
    const nextAttempts = (record.attempt_count || 0) + 1;
    const shouldInvalidate = nextAttempts >= SECURITY_CODE_MAX_ATTEMPTS;
    await db.run2(
      "UPDATE verification_codes SET attempt_count = ?, used_at = ? WHERE id = ?",
      [nextAttempts, shouldInvalidate ? nowIso() : null, record.id]
    );
    if (shouldInvalidate) return fail(res, 429, "Too many invalid attempts. Request a new code.");
    return fail(res, 400, `Invalid verification code. ${SECURITY_CODE_MAX_ATTEMPTS - nextAttempts} attempt(s) left.`);
  }

  const payload = safeJsonParse(record.payload_json, {});
  if (action === "username") {
    const newUsername = String(payload.new_username || "").trim();
    if (!newUsername || newUsername.length < 3) return fail(res, 400, "Invalid username change payload. Request a new code.");
    const taken = await db.get2("SELECT id FROM users WHERE username = ? AND id <> ?", [newUsername, user.id]);
    if (taken) return fail(res, 409, "This username is already taken. Please request a new code with another username.");
    await db.run2("UPDATE users SET username = ? WHERE id = ?", [newUsername, user.id]);
  } else {
    const newPasswordHash = String(payload.new_password_hash || "");
    if (!newPasswordHash) return fail(res, 400, "Invalid password change payload. Request a new code.");
    await db.run2("UPDATE users SET password = ? WHERE id = ?", [newPasswordHash, user.id]);
  }

  await db.run2("UPDATE verification_codes SET used_at = ? WHERE id = ?", [nowIso(), record.id]);

  const updated = await db.get2(
    "SELECT id, full_name, email, username, department, role, profile_picture, status, created_at FROM users WHERE id = ?",
    [user.id]
  );
  const actionLabel = action === "username" ? "Username" : "Password";
  const token = jwt.sign(
    { role: updated.role, id: updated.id, username: updated.username, full_name: updated.full_name },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  await deliverEmail(securityChangedEmail(updated, actionLabel), {
    actor: req.user,
    entityId: user.id,
    details: { event: "security_change_success", action },
  });
  await writeAuditLog(req.user, "security.change.completed", "user", user.id, { action });

  return ok(res, { message: `${actionLabel} updated successfully`, user: updated, token });
}));

router.get("/api/services", authMiddleware, asyncRoute(async (req, res) => {
  const includeAll = req.query.include_all === "1" && ["admin", "head_admin"].includes(req.user.role);
  const rows = includeAll
    ? await db.all2("SELECT * FROM services ORDER BY category ASC, name ASC")
    : await db.all2("SELECT * FROM services WHERE is_active = 1 ORDER BY category ASC, name ASC");
  return ok(res, rows.map(serializeService));
}));

router.post("/api/admin/services", headAdminOnly, asyncRoute(async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const icon = String(req.body.icon || "").trim();
    const color = String(req.body.color || "").trim() || "#3b82f6";
    const category = normalizeServiceCategory(req.body.category);
    const fields = normalizeServiceFields(req.body.fields);
    const isActive = req.body.is_active === false ? 0 : 1;

    if (!name) return fail(res, 400, "Service name is required");
    if (!icon) return fail(res, 400, "Service icon is required");

    const id = genId();
    const timestamp = nowIso();
    await db.run2(
      `INSERT INTO services (id, name, icon, color, category, fields_json, is_active, created_by_id, archived_at, archived_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, icon, color, category, JSON.stringify(fields), isActive, req.user.id, null, null, timestamp, timestamp]
    );

    const createdService = await db.get2("SELECT * FROM services WHERE id = ?", [id]);
    await writeAuditLog(req.user, "service.create", "service", id, {
      name,
      category,
      field_count: fields.length,
      is_active: Boolean(isActive),
    });
    return created(res, serializeService(createdService));
  } catch (err) {
    const status = /UNIQUE/i.test(err.message) ? 409 : 400;
    return fail(res, status, err.message);
  }
}));

router.patch("/api/admin/services/:id", headAdminOnly, asyncRoute(async (req, res) => {
  try {
    const existing = await db.get2("SELECT * FROM services WHERE id = ?", [req.params.id]);
    if (!existing) return fail(res, 404, "Service not found");

    const name = String(req.body.name ?? existing.name).trim();
    const icon = String(req.body.icon ?? existing.icon).trim();
    const color = String(req.body.color ?? existing.color).trim() || "#3b82f6";
    const category = normalizeServiceCategory(req.body.category ?? existing.category);
    const isActive = req.body.is_active === undefined ? existing.is_active : (req.body.is_active ? 1 : 0);
    const fields = normalizeServiceFields(req.body.fields ?? safeJsonParse(existing.fields_json, []));
    const archivedAt = isActive ? null : (existing.archived_at || nowIso());
    const archivedById = isActive ? null : req.user.id;

    if (!name) return fail(res, 400, "Service name is required");
    if (!icon) return fail(res, 400, "Service icon is required");

    await db.run2(
      `UPDATE services
       SET name = ?, icon = ?, color = ?, category = ?, fields_json = ?, is_active = ?, archived_at = ?, archived_by_id = ?, updated_at = ?
       WHERE id = ?`,
      [name, icon, color, category, JSON.stringify(fields), isActive, archivedAt, archivedById, nowIso(), req.params.id]
    );

    const updated = await db.get2("SELECT * FROM services WHERE id = ?", [req.params.id]);
    await writeAuditLog(req.user, isActive ? "service.update" : "service.archive", "service", req.params.id, {
      name,
      category,
      field_count: fields.length,
      is_active: Boolean(isActive),
    });
    return ok(res, serializeService(updated));
  } catch (err) {
    const status = /UNIQUE/i.test(err.message) ? 409 : 400;
    return fail(res, status, err.message);
  }
}));

router.delete("/api/admin/services/:id", headAdminOnly, asyncRoute(async (req, res) => {
  const existing = await db.get2("SELECT * FROM services WHERE id = ?", [req.params.id]);
  if (!existing) return fail(res, 404, "Service not found");

  const usage = await db.get2(
    "SELECT COUNT(*) as c FROM requests WHERE service_id = ? OR service_type = ?",
    [req.params.id, existing.name]
  );
  if (usage?.c > 0) {
    return fail(res, 400, "This service already has request records. Disable it instead of deleting.");
  }

  await db.run2("DELETE FROM services WHERE id = ?", [req.params.id]);
  await writeAuditLog(req.user, "service.delete", "service", req.params.id, {
    name: existing.name,
    category: existing.category || "General",
  });
  return ok(res, { message: "Service deleted permanently" });
}));

router.get("/api/user/requests", authMiddleware, asyncRoute(async (req, res) => {
  const requests = await db.all2("SELECT * FROM requests WHERE user_id = ? ORDER BY submitted_at DESC", [req.user.id]);
  return ok(res, requests);
}));

router.post("/api/user/requests", authMiddleware, asyncRoute(async (req, res) => {
  const user = await db.get2("SELECT * FROM users WHERE id = ?", [req.user.id]);
  if (!user) {
    return fail(res, 401, "Your account was not found in the active database. Please log in again.");
  }

  const pendingFeedback = await db.get2(
    "SELECT COUNT(*) as c FROM requests WHERE user_id = ? AND status = 'completed' AND feedback_submitted_at IS NULL",
    [req.user.id]
  );
  if ((pendingFeedback?.c || 0) > 0) {
    return fail(res, 400, "You have completed request(s) without feedback. Please submit required feedback first.");
  }

  let serviceId = req.body.service_id || null;
  let serviceType = String(req.body.service_type || "").trim();
  let requestDetails = {};
  let description = String(req.body.description || "").trim();
  let location = String(req.body.location || "").trim();
  let preferredDate = req.body.preferred_date || null;

  if (serviceId) {
    const serviceRow = await db.get2("SELECT * FROM services WHERE id = ?", [serviceId]);
    if (!serviceRow) return fail(res, 404, "Selected service was not found");
    if (!serviceRow.is_active) return fail(res, 400, "Selected service is inactive");

    const service = serializeService(serviceRow);
    requestDetails = validateRequestDetails(req.body.details, service);
    const legacy = deriveLegacyRequestFields(service, requestDetails);
    serviceType = service.name;
    description = legacy.description;
    location = legacy.location;
    preferredDate = legacy.preferred_date;
  } else {
    if (!serviceType || !description || !location || !preferredDate) {
      return fail(res, 400, "service_type, description, location, and preferred_date are required");
    }
    requestDetails = {
      description,
      location,
      preferred_date: preferredDate,
    };
  }

  if (!serviceType) return fail(res, 400, "Service type is required");

  const id = genId();
  const submittedAt = nowIso();
  await db.run2(
    `INSERT INTO requests
     (id, priority_number, user_id, service_id, user_name, user_email, department, service_type, description, location, preferred_date, request_details_json, status, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [id, null, user.id, serviceId, user.full_name, user.email, user.department, serviceType, description, location, preferredDate, JSON.stringify(requestDetails), submittedAt]
  );
  await writeNotification(user.id, `Your ${serviceType} request has been submitted. Staff will review it shortly.`);
  const newReq = {
    id,
    priority_number: null,
    user_id: user.id,
    service_id: serviceId,
    user_name: user.full_name,
    user_email: user.email,
    department: user.department,
    service_type: serviceType,
    description,
    location,
    preferred_date: preferredDate,
    request_details_json: JSON.stringify(requestDetails),
    status: "pending",
    submitted_at: submittedAt,
  };
  runInBackground("request.submitted.notify_staff", async () => {
    const staffList = await db.all2("SELECT * FROM users WHERE role = 'staff' AND status = 'approved'");
    if (staffList.length > 0) {
      await deliverEmail(newRequestToStaffEmail(newReq, staffList), {
        actor: req.user,
        entityId: id,
        details: { event: "request.submitted.notify_staff" },
      });
    }
  });
  await writeAuditLog(req.user, "request.submit", "request", id, {
    priority_number: null,
    service_id: serviceId,
    service_type: serviceType,
    preferred_date: preferredDate,
  });
  return created(res, newReq);
}));

router.post("/api/user/requests/:id/feedback", authMiddleware, asyncRoute(async (req, res) => {
  const request = await db.get2("SELECT * FROM requests WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  if (!request) return fail(res, 404, "Request not found");
  if (request.status !== "completed") return fail(res, 400, "Feedback is only allowed for completed requests");
  if (request.feedback_submitted_at) return fail(res, 409, "Feedback already submitted for this request");

  const rating = Number(req.body.rating);
  const comment = String(req.body.comment || "").trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return fail(res, 400, "Rating must be a whole number from 1 to 5");
  }
  if (!comment) {
    return fail(res, 400, "Feedback comment is required");
  }
  if (comment.length > 1200) {
    return fail(res, 400, "Feedback comment must be 1200 characters or fewer");
  }

  const submittedAt = nowIso();
  await db.run2(
    "UPDATE requests SET feedback_rating = ?, feedback_comment = ?, feedback_submitted_at = ? WHERE id = ?",
    [rating, comment, submittedAt, req.params.id]
  );

  await writeAuditLog(req.user, "request.feedback.submit", "request", req.params.id, { rating });

  const staffList = await db.all2("SELECT id FROM users WHERE role = 'staff' AND status = 'approved'");
  for (const staff of staffList) {
    await writeNotification(staff.id, `New feedback submitted for ${request.service_type}: ${rating}/5 from ${request.user_name}.`);
  }

  const updated = await db.get2("SELECT * FROM requests WHERE id = ?", [req.params.id]);
  return ok(res, { message: "Feedback submitted. Thank you!", request: updated });
}));
router.get("/api/user/notifications", authMiddleware, asyncRoute(async (req, res) => {
  const notifs = await db.all2("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
  return ok(res, notifs);
}));

router.patch("/api/user/notifications/read", authMiddleware, asyncRoute(async (req, res) => {
  await db.run2("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [req.user.id]);
  return ok(res, { message: "Marked as read" });
}));

module.exports = router;
