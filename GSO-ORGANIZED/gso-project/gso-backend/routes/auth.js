const express = require("express");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const router  = express.Router();
const db      = require("../db");
const { JWT_SECRET, SECURITY_CODE_TTL_MINUTES, SECURITY_CODE_MIN_RETRY_SECONDS, SECURITY_CODE_MAX_ATTEMPTS } = require("../config/constants");
const {
  genId, nowIso, parseDate,
  securityCodeHash, generateSixDigitCode, validatePasswordStrength,
  ok, created, fail, asyncRoute, safeJsonParse, runInBackground,
  writeNotification, writeAuditLog, deliverEmail, getRequiredApprovals,
  serializeService, normalizeServiceFields, normalizeServiceCategory,
  validateRequestDetails, deriveLegacyRequestFields,
} = require("../utils/helpers");
const {
  registrationEmail, newAccountEmail, securityVerificationEmail, securityChangedEmail,
} = require("../email");

// ----------------------------------------------------------------
// AUTH
// ----------------------------------------------------------------
router.post("/api/auth/register", asyncRoute(async (req, res) => {
  const { full_name, email, username, password, department, role } = req.body;
  if (!full_name || !email || !username || !password || !department) {
    return fail(res, 400, "All fields are required");
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return fail(res, 400, "Please enter a valid email address");
  }

  // Username length
  if (username.length < 3) {
    return fail(res, 400, "Username must be at least 3 characters");
  }

  // Password strength enforcement
  if (password.length < 8) {
    return fail(res, 400, "Password must be at least 8 characters");
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const strengthScore = (password.length >= 8 ? 1 : 0) + (password.length >= 12 ? 1 : 0) + (hasUpper ? 1 : 0) + (hasNumber ? 1 : 0) + (hasSpecial ? 1 : 0);
  if (strengthScore < 2) {
    return fail(res, 400, "Password is too weak. Use at least 8 characters with a mix of uppercase letters, numbers, or symbols.");
  }

  // Check duplicates separately for clear error messages
  const emailTaken = await db.get2("SELECT id FROM users WHERE email = ?", [email]);
  if (emailTaken) return fail(res, 409, "An account with this email address already exists");

  const usernameTaken = await db.get2("SELECT id FROM users WHERE username = ?", [username]);
  if (usernameTaken) return fail(res, 409, "This username is already taken. Please choose another");

  const allowedRoles = ["user", "staff", "admin"];
  const assignedRole = allowedRoles.includes(role) ? role : "user";

  const hashed = await bcrypt.hash(password, 10);
  const id = genId();
  await db.run2(
    "INSERT INTO users (id, full_name, email, username, password, department, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
    [id, full_name, email, username, hashed, department, assignedRole, nowIso()]
  );
  const newUser = await db.get2("SELECT * FROM users WHERE id = ?", [id]);
  await writeAuditLog(
    { id, full_name, username, role: assignedRole },
    "auth.register",
    "user",
    id,
    { department, email, requested_role: assignedRole }
  );
  runInBackground("auth.register.notify_head_admin", async () => {
    const headAdmins = await db.all2("SELECT id, username, full_name FROM users WHERE role = 'head_admin' AND status = 'approved'");
    for (const admin of headAdmins) {
      await writeNotification(
        admin.id,
        `New account registration pending approval: ${full_name} (@${username}) as ${assignedRole}.`
      );
    }
  });
  runInBackground("auth.register.emails", async () => {
    await deliverEmail(registrationEmail(newUser), { entityId: id, details: { event: "registration_user_copy" } });
    if (process.env.ADMIN_EMAIL) {
      await deliverEmail(newAccountEmail(newUser), { entityId: id, details: { event: "registration_admin_notice" } });
    }
  });
  return created(res, { message: "Account created. Awaiting Head Admin approval." });
}));

router.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (username === (process.env.ADMIN_USERNAME || "brenda") &&
        password === (process.env.ADMIN_PASSWORD || "admin123")) {
      let adminUser = await db.get2("SELECT * FROM users WHERE username = ?", [process.env.ADMIN_USERNAME || "brenda"]);
      if (!adminUser) {
        const id = genId();
        const hashed = await bcrypt.hash(password, 10);
        await db.run2(
          "INSERT INTO users (id, full_name, email, username, password, department, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'head_admin', 'approved', ?)",
          [id, "Brenda Bantilan", process.env.ADMIN_EMAIL || "brenda.bantilan001@gmail.com", process.env.ADMIN_USERNAME || "brenda", hashed, "Administration", nowIso()]
        );
        adminUser = await db.get2("SELECT * FROM users WHERE username = ?", [process.env.ADMIN_USERNAME || "brenda"]);
      }
      if (adminUser.role !== "head_admin") {
        await db.run2("UPDATE users SET role = 'head_admin', status = 'approved' WHERE id = ?", [adminUser.id]);
        adminUser.role = "head_admin"; adminUser.status = "approved";
      }
      const valid = await bcrypt.compare(password, adminUser.password);
      if (!valid) return res.status(401).json({ error: "Invalid password" });
      const token = jwt.sign({ role: "head_admin", id: adminUser.id, username: adminUser.username, full_name: adminUser.full_name }, JWT_SECRET, { expiresIn: "8h" });
      const { password: _, ...safe } = adminUser;
      return res.json({ token, role: "head_admin", user: safe });
    }

    const user = await db.get2("SELECT * FROM users WHERE username = ?", [username]);
    if (!user) return res.status(401).json({ error: "Account not found" });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid password" });
    if (user.status === "pending") return res.status(403).json({ error: "Account pending Head Admin approval" });
    if (user.status === "rejected") return res.status(403).json({ error: "Account rejected. Contact admin." });

    const token = jwt.sign({ role: user.role, id: user.id, username: user.username, full_name: user.full_name }, JWT_SECRET, { expiresIn: "8h" });
    const { password: _, ...safe } = user;
    res.json({ token, role: user.role, user: safe });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/api/auth/forgot-password/request-code", asyncRoute(async (req, res) => {
  const identifier = String(req.body.identifier || "").trim();
  if (!identifier) return fail(res, 400, "Username or email is required");

  const user = await db.get2(
    "SELECT id, full_name, email, username FROM users WHERE username = ? OR email = ?",
    [identifier, identifier]
  );

  // Do not reveal if account exists
  if (!user) {
    return ok(res, { message: "If the account exists, a verification code has been sent to the registered email." });
  }

  const latest = await db.get2(
    "SELECT id, created_at, used_at FROM verification_codes WHERE user_id = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1",
    [user.id, "forgot_password"]
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

  const code = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + SECURITY_CODE_TTL_MINUTES * 60 * 1000).toISOString();
  await db.run2(
    "UPDATE verification_codes SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL",
    [nowIso(), user.id, "forgot_password"]
  );
  await db.run2(
    `INSERT INTO verification_codes (id, user_id, purpose, code_hash, payload_json, attempt_count, expires_at, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?)`,
    [genId(), user.id, "forgot_password", securityCodeHash(code), null, expiresAt, nowIso()]
  );

  runInBackground("auth.forgot_password.email_code", async () => {
    const mailResult = await deliverEmail(securityVerificationEmail(user, "Password Reset", code, SECURITY_CODE_TTL_MINUTES), {
      entityId: user.id,
      details: { event: "forgot_password_code_sent" },
    });
    if (!mailResult.ok) {
      await db.run2(
        "DELETE FROM verification_codes WHERE user_id = ? AND purpose = ? AND code_hash = ?",
        [user.id, "forgot_password", securityCodeHash(code)]
      );
    }
  });

  await writeAuditLog({ id: user.id, username: user.username, full_name: user.full_name, role: "user" }, "auth.forgot_password.code_requested", "user", user.id, {});
  return ok(res, { message: "Verification code sent to your registered email." });
}));

router.post("/api/auth/forgot-password/confirm", asyncRoute(async (req, res) => {
  const identifier = String(req.body.identifier || "").trim();
  const code = String(req.body.code || "").trim();
  const newPassword = String(req.body.new_password || "");

  if (!identifier) return fail(res, 400, "Username or email is required");
  if (!/^\d{6}$/.test(code)) return fail(res, 400, "Verification code must be 6 digits");
  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) return fail(res, 400, passwordError);

  const user = await db.get2(
    "SELECT id, full_name, email, username, password FROM users WHERE username = ? OR email = ?",
    [identifier, identifier]
  );
  if (!user) return fail(res, 404, "Account not found");

  const record = await db.get2(
    `SELECT id, code_hash, attempt_count, expires_at, used_at, created_at
     FROM verification_codes
     WHERE user_id = ? AND purpose = ? AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [user.id, "forgot_password"]
  );
  if (!record) return fail(res, 404, "No pending reset request found. Request a verification code first.");

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

  const sameAsOld = await bcrypt.compare(newPassword, user.password);
  if (sameAsOld) return fail(res, 400, "New password must be different from your current password");

  const newHash = await bcrypt.hash(newPassword, 10);
  await db.run2("UPDATE users SET password = ? WHERE id = ?", [newHash, user.id]);
  await db.run2("UPDATE verification_codes SET used_at = ? WHERE id = ?", [nowIso(), record.id]);

  runInBackground("auth.forgot_password.success_email", async () => {
    await deliverEmail(securityChangedEmail(user, "Password"), {
      entityId: user.id,
      details: { event: "forgot_password_success" },
    });
  });
  await writeAuditLog({ id: user.id, username: user.username, full_name: user.full_name, role: "user" }, "auth.forgot_password.completed", "user", user.id, {});
  return ok(res, { message: "Password reset successful. You can now log in with your new password." });
}));

module.exports = router;
