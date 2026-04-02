require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("./db");
const {
  sendEmail, registrationEmail, newAccountEmail, userStatusEmail,
  newRequestToStaffEmail, staffVerifiedToAdmin1Email,
  admin1ApprovedToAdmin2Email, admin1DisapprovedToUserEmail,
  admin2ApprovedToStaffEmail, admin2DisapprovedToUserEmail,
  serviceReadyEmail, requestStatusEmail, broadcastEmail,
  securityVerificationEmail, securityChangedEmail,
} = require("./email");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "gso_secret_key";
const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const nowIso = () => db.nowIso();
const SECURITY_CODE_TTL_MINUTES = Number(process.env.SECURITY_CODE_TTL_MINUTES || 10);
const SECURITY_CODE_MIN_RETRY_SECONDS = Number(process.env.SECURITY_CODE_MIN_RETRY_SECONDS || 60);
const SECURITY_CODE_MAX_ATTEMPTS = Number(process.env.SECURITY_CODE_MAX_ATTEMPTS || 5);

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "50mb" }));

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function securityCodeHash(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

function generateSixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const strengthScore = (password.length >= 8 ? 1 : 0) + (password.length >= 12 ? 1 : 0) + (hasUpper ? 1 : 0) + (hasNumber ? 1 : 0) + (hasSpecial ? 1 : 0);
  if (strengthScore < 2) {
    return "Password is too weak. Use at least 8 characters with uppercase letters, numbers, or symbols.";
  }
  return null;
}

// -- Auth Middleware -----------------------------------------------------------
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
}

function roleMiddleware(...roles) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token provided" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!roles.includes(decoded.role))
        return res.status(403).json({ error: "Access denied" });
      req.user = decoded; next();
    } catch { res.status(401).json({ error: "Invalid token" }); }
  };
}

const adminOnly    = roleMiddleware("admin", "head_admin");
const staffOnly    = roleMiddleware("staff");
const headAdminOnly = roleMiddleware("head_admin");

// Helper: get required approvals setting
async function getRequiredApprovals() {
  const s = await db.get2("SELECT value FROM settings WHERE `key` = 'required_admin_approvals'");
  return s ? parseInt(s.value) : 2;
}

function ok(res, data = {}, meta = undefined) {
  return res.json(meta ? { ...data, meta } : data);
}

function created(res, data = {}) {
  return res.status(201).json(data);
}

function fail(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch((err) => {
    console.error(err);
    const status = err.statusCode || 500;
    fail(res, status, err.publicMessage || err.message || "Request failed");
  });
}

async function writeNotification(userId, message) {
  await db.run2(
    "INSERT INTO notifications (id, user_id, message, created_at) VALUES (?, ?, ?, ?)",
    [genId(), userId, message, nowIso()]
  );
}

async function writeAuditLog(actor, action, entityType, entityId, details = {}) {
  await db.run2(
    `INSERT INTO audit_logs
     (id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      genId(),
      actor?.id || null,
      actor?.full_name || actor?.username || null,
      actor?.role || null,
      action,
      entityType,
      entityId || null,
      JSON.stringify(details),
      nowIso(),
    ]
  );
}

async function deliverEmail(payload, context = {}) {
  const result = await sendEmail(payload);
  if (!result.ok) {
    await writeAuditLog(
      context.actor || null,
      "email.fallback",
      "email",
      context.entityId || null,
      {
        subject: payload.subject,
        to: payload.to,
        reason: result.error || "fallback",
        ...context.details,
      }
    );
  }
  return result;
}

function runInBackground(label, task) {
  setImmediate(() => {
    Promise.resolve()
      .then(task)
      .catch((err) => {
        console.error(`[Background:${label}]`, err);
      });
  });
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function slugifyFieldKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "field";
}

function normalizeServiceField(field, index) {
  const type = ["text", "textarea", "date", "time", "number", "select"].includes(field?.type) ? field.type : "text";
  const label = String(field?.label || `Field ${index + 1}`).trim();
  const key = slugifyFieldKey(field?.key || label);
  const options = type === "select"
    ? (Array.isArray(field?.options) ? field.options : String(field?.options || "").split("\n"))
        .map(opt => String(opt).trim())
        .filter(Boolean)
    : [];

  return {
    key,
    label,
    type,
    required: Boolean(field?.required),
    options,
  };
}

function normalizeServiceFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("At least one field is required");
  }
  if (fields.length > 20) {
    throw new Error("A service can only have up to 20 fields");
  }

  const normalized = fields.map(normalizeServiceField);
  const seen = new Set();
  for (const field of normalized) {
    if (seen.has(field.key)) throw new Error(`Duplicate field key: ${field.key}`);
    if (!field.label || field.label.length > 80) throw new Error("Field labels must be between 1 and 80 characters");
    if (field.type === "select" && field.options.length === 0) {
      throw new Error(`Field "${field.label}" needs at least one option`);
    }
    if (field.type === "select" && field.options.length > 30) {
      throw new Error(`Field "${field.label}" can only have up to 30 options`);
    }
    seen.add(field.key);
  }
  return normalized;
}

function serializeService(row) {
  return {
    ...row,
    is_active: Boolean(row.is_active),
    category: row.category || "General",
    archived: Boolean(row.archived_at),
    fields: safeJsonParse(row.fields_json, []),
  };
}

function normalizeServiceCategory(value) {
  const category = String(value || "General").trim();
  if (!category) return "General";
  if (category.length > 60) throw new Error("Service category must be 60 characters or fewer");
  return category;
}

function validateRequestDetails(rawDetails, service) {
  const details = rawDetails && typeof rawDetails === "object" && !Array.isArray(rawDetails) ? rawDetails : {};
  const fields = service.fields || [];
  const clean = {};

  for (const field of fields) {
    const rawValue = details[field.key];
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    const empty = value === undefined || value === null || value === "";

    if (field.required && empty) {
      throw new Error(`${field.label} is required`);
    }
    if (empty) continue;

    if (field.type === "number") {
      const num = Number(value);
      if (!Number.isFinite(num)) throw new Error(`${field.label} must be a valid number`);
      clean[field.key] = String(value);
      continue;
    }

    if (field.type === "select" && !field.options.includes(String(value))) {
      throw new Error(`${field.label} has an invalid option`);
    }

    clean[field.key] = String(value);
  }

  return clean;
}

function deriveLegacyRequestFields(service, details) {
  const fields = service.fields || [];
  const orderedValues = fields
    .map(field => ({ field, value: details[field.key] }))
    .filter(entry => entry.value);

  const findByKey = (keys, fallbackTypes = []) => {
    const byKey = orderedValues.find(entry => keys.includes(entry.field.key));
    if (byKey) return byKey.value;
    const byType = orderedValues.find(entry => fallbackTypes.includes(entry.field.type));
    return byType ? byType.value : "";
  };

  const description = findByKey(["description", "purpose", "issue", "details", "reason"], ["textarea", "text"]) || "See submitted request details";
  const location = findByKey(["location", "room", "venue", "destination", "pickup_location"], ["text"]) || "Not specified";
  const preferred_date = findByKey(["preferred_date", "date", "reservation_date", "service_date"], ["date"]) || null;

  return { description, location, preferred_date };
}

// ----------------------------------------------------------------
// AUTH
// ----------------------------------------------------------------
app.post("/api/auth/register", asyncRoute(async (req, res) => {
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

app.post("/api/auth/login", async (req, res) => {
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

app.post("/api/auth/forgot-password/request-code", asyncRoute(async (req, res) => {
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

  const mailResult = await deliverEmail(securityVerificationEmail(user, "Password Reset", code, SECURITY_CODE_TTL_MINUTES), {
    entityId: user.id,
    details: { event: "forgot_password_code_sent" },
  });
  if (!mailResult.ok) {
    await db.run2(
      "DELETE FROM verification_codes WHERE user_id = ? AND purpose = ? AND code_hash = ?",
      [user.id, "forgot_password", securityCodeHash(code)]
    );
    return fail(res, 503, `Unable to send verification code email. ${mailResult.error || "Please check SMTP settings."}`);
  }

  await writeAuditLog({ id: user.id, username: user.username, full_name: user.full_name, role: "user" }, "auth.forgot_password.code_requested", "user", user.id, {});
  return ok(res, { message: "Verification code sent to your registered email." });
}));

app.post("/api/auth/forgot-password/confirm", asyncRoute(async (req, res) => {
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

  await deliverEmail(securityChangedEmail(user, "Password"), {
    entityId: user.id,
    details: { event: "forgot_password_success" },
  });
  await writeAuditLog({ id: user.id, username: user.username, full_name: user.full_name, role: "user" }, "auth.forgot_password.completed", "user", user.id, {});
  return ok(res, { message: "Password reset successful. You can now log in with your new password." });
}));

// ----------------------------------------------------------------
// USER / SHARED
// ----------------------------------------------------------------
app.get("/api/user/profile", authMiddleware, async (req, res) => {
  const user = await db.get2("SELECT id, full_name, email, username, department, role, profile_picture, status, created_at FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.patch("/api/user/profile", authMiddleware, async (req, res) => {
  try {
    const { profile_picture } = req.body;
    if (profile_picture) await db.run2("UPDATE users SET profile_picture = ? WHERE id = ?", [profile_picture, req.user.id]);
    const user = await db.get2("SELECT id, full_name, email, username, department, role, profile_picture, status, created_at FROM users WHERE id = ?", [req.user.id]);
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/user/security/request-code", authMiddleware, asyncRoute(async (req, res) => {
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

app.post("/api/user/security/confirm-code", authMiddleware, asyncRoute(async (req, res) => {
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

app.get("/api/services", authMiddleware, asyncRoute(async (req, res) => {
  const includeAll = req.query.include_all === "1" && ["admin", "head_admin"].includes(req.user.role);
  const rows = includeAll
    ? await db.all2("SELECT * FROM services ORDER BY category ASC, name ASC")
    : await db.all2("SELECT * FROM services WHERE is_active = 1 ORDER BY category ASC, name ASC");
  return ok(res, rows.map(serializeService));
}));

app.post("/api/admin/services", headAdminOnly, asyncRoute(async (req, res) => {
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

app.patch("/api/admin/services/:id", headAdminOnly, asyncRoute(async (req, res) => {
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

app.delete("/api/admin/services/:id", headAdminOnly, asyncRoute(async (req, res) => {
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

app.get("/api/user/requests", authMiddleware, asyncRoute(async (req, res) => {
  const requests = await db.all2("SELECT * FROM requests WHERE user_id = ? ORDER BY submitted_at DESC", [req.user.id]);
  return ok(res, requests);
}));

app.post("/api/user/requests", authMiddleware, asyncRoute(async (req, res) => {
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

app.post("/api/user/requests/:id/feedback", authMiddleware, asyncRoute(async (req, res) => {
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
app.get("/api/user/notifications", authMiddleware, asyncRoute(async (req, res) => {
  const notifs = await db.all2("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
  return ok(res, notifs);
}));

app.patch("/api/user/notifications/read", authMiddleware, asyncRoute(async (req, res) => {
  await db.run2("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [req.user.id]);
  return ok(res, { message: "Marked as read" });
}));

// ----------------------------------------------------------------
// STAFF
// ----------------------------------------------------------------
app.get("/api/staff/requests", staffOnly, asyncRoute(async (req, res) => {
  const { status } = req.query;
  const requests = status
    ? await db.all2("SELECT * FROM requests WHERE status = ? ORDER BY submitted_at DESC", [status])
    : await db.all2("SELECT * FROM requests ORDER BY submitted_at DESC");
  return ok(res, requests);
}));

app.get("/api/staff/feedback", staffOnly, asyncRoute(async (req, res) => {
  const rows = await db.all2(
    "SELECT * FROM requests WHERE feedback_submitted_at IS NOT NULL ORDER BY feedback_submitted_at DESC"
  );
  return ok(res, rows);
}));
app.get("/api/staff/feedback/pending", staffOnly, asyncRoute(async (req, res) => {
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

app.post("/api/staff/requests/:id/feedback-reminder", staffOnly, asyncRoute(async (req, res) => {
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

app.patch("/api/staff/requests/:id/status", staffOnly, asyncRoute(async (req, res) => {
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
      await deliverEmail(require("./email").staffStatusEmail(updated, status), {
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

app.get("/api/staff/analytics", staffOnly, asyncRoute(async (req, res) => {
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
app.get("/api/admin/requests", adminOnly, asyncRoute(async (req, res) => {
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

app.patch("/api/admin/requests/:id/status", adminOnly, asyncRoute(async (req, res) => {
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

app.get("/api/admin/stats", adminOnly, async (req, res) => {
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

app.get("/api/admin/analytics", adminOnly, asyncRoute(async (req, res) => {
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
  const countFor = (status) => db.get2(`SELECT COUNT(*) as count FROM requests ${where}${where ? " AND" : " WHERE"} status = ?`, [...params, status]);

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
  const requests = await db.all2(`SELECT * FROM requests ${where} ORDER BY submitted_at DESC LIMIT 200`, params);
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
    requestsByUser: requests,
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

app.get("/api/admin/audit-logs", adminOnly, asyncRoute(async (req, res) => {
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

// ----------------------------------------------------------------
// HEAD ADMIN
// ----------------------------------------------------------------
app.get("/api/head-admin/users", headAdminOnly, asyncRoute(async (req, res) => {
  const users = await db.all2("SELECT id, full_name, email, username, department, role, status, created_at FROM users ORDER BY created_at DESC");
  return ok(res, users);
}));

app.get("/api/head-admin/requests", headAdminOnly, asyncRoute(async (req, res) => {
  const { status } = req.query;
  const sql = status
    ? `${ADMIN_REQUEST_SELECT} WHERE requests.status = ? ORDER BY requests.submitted_at DESC`
    : `${ADMIN_REQUEST_SELECT} ORDER BY requests.submitted_at DESC`;
  const requests = await db.all2(sql, status ? [status] : []);
  return ok(res, requests);
}));

app.patch("/api/head-admin/users/:id/status", headAdminOnly, asyncRoute(async (req, res) => {
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

app.get("/api/head-admin/stats", headAdminOnly, async (req, res) => {
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
app.patch("/api/head-admin/settings/approvals", headAdminOnly, asyncRoute(async (req, res) => {
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

app.get("/api/settings", authMiddleware, asyncRoute(async (req, res) => {
  const s = await db.get2("SELECT value FROM settings WHERE `key` = 'required_admin_approvals'");
  return ok(res, { required_approvals: s ? parseInt(s.value) : 2 });
}));

app.get("/api/head-admin/audit-logs", headAdminOnly, asyncRoute(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "200", 10) || 200, 500);
  const rows = await db.all2("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?", [limit]);
  return ok(res, rows.map((row) => ({ ...row, details: safeJsonParse(row.details_json, {}) })));
}));

app.post("/api/admin/users/broadcast", adminOnly, asyncRoute(async (req, res) => {
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

app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

db.ready.then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\nGSO Backend on http://localhost:${PORT}`);
    console.log(`Head Admin: ${process.env.ADMIN_USERNAME || "brenda"} / ${process.env.ADMIN_PASSWORD || "admin123"}`);
    console.log(`\nFlow: User -> Staff (verify) -> Admin1 -> Admin2 -> Staff (service ready) -> User\n`);
  });
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});



