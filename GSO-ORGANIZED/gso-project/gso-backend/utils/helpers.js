const crypto = require("crypto");
const db      = require("../db");

// ── IDs & time ────────────────────────────────────────────────────────────────
const genId  = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const nowIso = () => db.nowIso();

// ── Date ──────────────────────────────────────────────────────────────────────
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ── Security codes ────────────────────────────────────────────────────────────
function securityCodeHash(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}
function generateSixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Password strength ─────────────────────────────────────────────────────────
function validatePasswordStrength(password) {
  if (!password || password.length < 8) return "Password must be at least 8 characters";
  const hasUpper   = /[A-Z]/.test(password);
  const hasNumber  = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const strengthScore = (password.length >= 8 ? 1 : 0) + (password.length >= 12 ? 1 : 0) +
    (hasUpper ? 1 : 0) + (hasNumber ? 1 : 0) + (hasSpecial ? 1 : 0);
  if (strengthScore < 2)
    return "Password is too weak. Use at least 8 characters with uppercase letters, numbers, or symbols.";
  return null;
}

// ── HTTP response helpers ─────────────────────────────────────────────────────
function ok(res, data = {}, meta = undefined) {
  return res.json(meta ? { ...data, meta } : data);
}
function created(res, data = {}) { return res.status(201).json(data); }
function fail(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

// ── Async route wrapper ───────────────────────────────────────────────────────
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch((err) => {
    console.error(err);
    const status = err.statusCode || 500;
    fail(res, status, err.publicMessage || err.message || "Request failed");
  });
}

// ── JSON parse without throwing ───────────────────────────────────────────────
function safeJsonParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

// ── Background tasks ──────────────────────────────────────────────────────────
function runInBackground(label, task) {
  setImmediate(() => Promise.resolve().then(task).catch((err) =>
    console.error(`[Background:${label}]`, err)
  ));
}

// ── DB write helpers ──────────────────────────────────────────────────────────
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
    [genId(), actor?.id || null, actor?.full_name || actor?.username || null,
     actor?.role || null, action, entityType, entityId || null, JSON.stringify(details), nowIso()]
  );
}

async function deliverEmail(payload, context = {}) {
  const { sendEmail } = require("../email");
  const result = await sendEmail(payload);
  if (!result.ok) {
    await writeAuditLog(context.actor || null, "email.fallback", "email", context.entityId || null, {
      subject: payload.subject, to: payload.to, reason: result.error || "fallback", ...context.details,
    });
  }
  return result;
}

async function getRequiredApprovals() {
  const s = await db.get2("SELECT value FROM settings WHERE `key` = 'required_admin_approvals'");
  return s ? parseInt(s.value) : 2;
}

// ── Service helpers ───────────────────────────────────────────────────────────
function slugifyFieldKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
}

function normalizeServiceField(field, index) {
  const type = ["text","textarea","date","time","number","select"].includes(field?.type) ? field.type : "text";
  const label = String(field?.label || `Field ${index + 1}`).trim();
  const key = slugifyFieldKey(field?.key || label);
  const options = type === "select"
    ? (Array.isArray(field?.options) ? field.options : String(field?.options || "").split("\n"))
        .map(opt => String(opt).trim()).filter(Boolean)
    : [];
  return { key, label, type, required: Boolean(field?.required), options };
}

function normalizeServiceFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) throw new Error("At least one field is required");
  if (fields.length > 20) throw new Error("A service can only have up to 20 fields");
  const normalized = fields.map(normalizeServiceField);
  const seen = new Set();
  for (const field of normalized) {
    if (seen.has(field.key)) throw new Error(`Duplicate field key: ${field.key}`);
    if (!field.label || field.label.length > 80) throw new Error("Field labels must be between 1 and 80 characters");
    if (field.type === "select" && field.options.length === 0)
      throw new Error(`Field "${field.label}" needs at least one option`);
    if (field.type === "select" && field.options.length > 30)
      throw new Error(`Field "${field.label}" can only have up to 30 options`);
    seen.add(field.key);
  }
  return normalized;
}

function serializeService(row) {
  return { ...row, is_active: Boolean(row.is_active), category: row.category || "General",
           archived: Boolean(row.archived_at), fields: safeJsonParse(row.fields_json, []) };
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
    if (field.required && empty) throw new Error(`${field.label} is required`);
    if (empty) continue;
    if (field.type === "number") {
      const num = Number(value);
      if (!Number.isFinite(num)) throw new Error(`${field.label} must be a valid number`);
      clean[field.key] = String(value); continue;
    }
    if (field.type === "select" && !field.options.includes(String(value)))
      throw new Error(`${field.label} has an invalid option`);
    clean[field.key] = String(value);
  }
  return clean;
}

function deriveLegacyRequestFields(service, details) {
  const fields = service.fields || [];
  const orderedValues = fields.map(field => ({ field, value: details[field.key] })).filter(entry => entry.value);
  const findByKey = (keys, fallbackTypes = []) => {
    const byKey = orderedValues.find(entry => keys.includes(entry.field.key));
    if (byKey) return byKey.value;
    const byType = orderedValues.find(entry => fallbackTypes.includes(entry.field.type));
    return byType ? byType.value : "";
  };
  return {
    description:    findByKey(["description","purpose","issue","details","reason"], ["textarea","text"]) || "See submitted request details",
    location:       findByKey(["location","room","venue","destination","pickup_location"], ["text"]) || "Not specified",
    preferred_date: findByKey(["preferred_date","date","reservation_date","service_date"], ["date"]) || null,
  };
}

module.exports = {
  genId, nowIso, parseDate,
  securityCodeHash, generateSixDigitCode, validatePasswordStrength,
  ok, created, fail, asyncRoute, safeJsonParse, runInBackground,
  writeNotification, writeAuditLog, deliverEmail, getRequiredApprovals,
  slugifyFieldKey, normalizeServiceFields, serializeService,
  normalizeServiceCategory, validateRequestDetails, deriveLegacyRequestFields,
};
