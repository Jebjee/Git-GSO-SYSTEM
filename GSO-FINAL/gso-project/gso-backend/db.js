const fs = require("fs");
const path = require("path");

const DB_CLIENT = (process.env.DB_CLIENT || "sqlite").trim().toLowerCase();

const DEFAULT_SERVICES = [
  {
    id: "svc_carpentry",
    name: "Carpentry",
    icon: "\u{1F528}",
    color: "#c97d3e",
    category: "Maintenance",
    fields: [
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "location", label: "Location / Room", type: "text", required: true },
      { key: "preferred_date", label: "Preferred Date", type: "date", required: true },
    ],
  },
  {
    id: "svc_electrical",
    name: "Electrical",
    icon: "\u26A1",
    color: "#e8c74a",
    category: "Maintenance",
    fields: [
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "location", label: "Location / Room", type: "text", required: true },
      { key: "preferred_date", label: "Preferred Date", type: "date", required: true },
    ],
  },
  {
    id: "svc_room_reservation",
    name: "Room Reservation",
    icon: "\u{1F3DB}\uFE0F",
    color: "#4a90d9",
    category: "Reservation",
    fields: [
      { key: "description", label: "Purpose", type: "textarea", required: true },
      { key: "location", label: "Room / Venue", type: "text", required: true },
      { key: "preferred_date", label: "Reservation Date", type: "date", required: true },
    ],
  },
  {
    id: "svc_plumbing",
    name: "Plumbing",
    icon: "\u{1F527}",
    color: "#4db8a4",
    category: "Maintenance",
    fields: [
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "location", label: "Location / Room", type: "text", required: true },
      { key: "preferred_date", label: "Preferred Date", type: "date", required: true },
    ],
  },
  {
    id: "svc_cleaning",
    name: "Cleaning",
    icon: "\u{1F9F9}",
    color: "#8c6fcf",
    category: "Facility",
    fields: [
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "location", label: "Location / Room", type: "text", required: true },
      { key: "preferred_date", label: "Preferred Date", type: "date", required: true },
    ],
  },
];

function nowIso() {
  return new Date().toISOString();
}

function createSqliteAdapter() {
  const sqlite3 = require("sqlite3").verbose();
  const db = new sqlite3.Database(path.join(__dirname, "gso.db"), (err) => {
    if (err) console.error("DB connection error:", err);
    else console.log("Database: gso.db (SQLite connected)");
  });

  return {
    client: "sqlite",
    ready: Promise.resolve(),
    async run2(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },
    async all2(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
      });
    },
    async get2(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
      });
    },
    async exec2(sql) {
      return new Promise((resolve, reject) => {
        db.exec(sql, (err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function createMysqlAdapter() {
  let mysql;
  try {
    mysql = require("mysql2/promise");
  } catch (err) {
    throw new Error("MySQL support requires the mysql2 package. Run npm install in gso-backend before using DB_CLIENT=mysql.");
  }

  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "gso_system",
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: false,
  });

  function normalizeMysqlDateString(value) {
    if (typeof value !== "string") return value;
    const isoMatch = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
    if (!isoMatch.test(value)) return value;
    return value.slice(0, 19).replace("T", " ");
  }

  function normalizeParams(params = []) {
    return params.map((param) => {
      if (Array.isArray(param)) return param.map(normalizeMysqlDateString);
      return normalizeMysqlDateString(param);
    });
  }

  return {
    client: "mysql",
    ready: Promise.resolve(),
    async run2(sql, params = []) {
      const [result] = await pool.execute(sql, normalizeParams(params));
      return {
        lastID: result.insertId,
        changes: result.affectedRows,
      };
    },
    async all2(sql, params = []) {
      const [rows] = await pool.execute(sql, normalizeParams(params));
      return rows;
    },
    async get2(sql, params = []) {
      const [rows] = await pool.execute(sql, normalizeParams(params));
      return rows[0] || null;
    },
    async exec2(sql) {
      const connection = await pool.getConnection();
      try {
        await connection.query(sql);
      } finally {
        connection.release();
      }
    },
  };
}

function sqliteSchema() {
  return {
    users: `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      department TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      profile_picture TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    )`,
    requests: `CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      priority_number TEXT,
      user_id TEXT NOT NULL,
      service_id TEXT,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      department TEXT NOT NULL,
      service_type TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      preferred_date TEXT,
      request_details_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      staff_note TEXT,
      admin1_id TEXT,
      admin1_name TEXT,
      admin1_note TEXT,
      admin1_action TEXT,
      admin1_at TEXT,
      admin2_id TEXT,
      admin2_name TEXT,
      admin2_note TEXT,
      admin2_action TEXT,
      admin2_at TEXT,
      admin_note TEXT,
      staff_verified_at TEXT,
      completed_at TEXT,
      completed_by_id TEXT,
      completed_by_name TEXT,
      feedback_rating INTEGER,
      feedback_comment TEXT,
      feedback_submitted_at TEXT,
      submitted_at TEXT NOT NULL,
      resolved_at TEXT
    )`,
    services: `CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      fields_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      archived_at TEXT,
      archived_by_id TEXT,
      created_by_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    notifications: `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    settings: `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    audit_logs: `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      actor_name TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT,
      created_at TEXT NOT NULL
    )`,
    verification_codes: `CREATE TABLE IF NOT EXISTS verification_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      payload_json TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    )`,
  };
}

function mysqlSchema() {
  return {
    users: `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      username VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      department VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      profile_picture LONGTEXT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL
    )`,
    requests: `CREATE TABLE IF NOT EXISTS requests (
      id VARCHAR(64) PRIMARY KEY,
      priority_number VARCHAR(64) NULL,
      user_id VARCHAR(64) NOT NULL,
      service_id VARCHAR(64) NULL,
      user_name VARCHAR(255) NOT NULL,
      user_email VARCHAR(255) NOT NULL,
      department VARCHAR(255) NOT NULL,
      service_type VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      location VARCHAR(255) NOT NULL,
      preferred_date VARCHAR(64) NULL,
      request_details_json LONGTEXT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      staff_note TEXT NULL,
      admin1_id VARCHAR(64) NULL,
      admin1_name VARCHAR(255) NULL,
      admin1_note TEXT NULL,
      admin1_action VARCHAR(50) NULL,
      admin1_at DATETIME NULL,
      admin2_id VARCHAR(64) NULL,
      admin2_name VARCHAR(255) NULL,
      admin2_note TEXT NULL,
      admin2_action VARCHAR(50) NULL,
      admin2_at DATETIME NULL,
      admin_note TEXT NULL,
      staff_verified_at DATETIME NULL,
      completed_at DATETIME NULL,
      completed_by_id VARCHAR(64) NULL,
      completed_by_name VARCHAR(255) NULL,
      feedback_rating INT NULL,
      feedback_comment TEXT NULL,
      feedback_submitted_at DATETIME NULL,
      submitted_at DATETIME NOT NULL,
      resolved_at DATETIME NULL
    )`,
    services: `CREATE TABLE IF NOT EXISTS services (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      icon VARCHAR(32) NOT NULL,
      color VARCHAR(32) NOT NULL,
      category VARCHAR(120) NOT NULL DEFAULT 'General',
      fields_json LONGTEXT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      archived_at DATETIME NULL,
      archived_by_id VARCHAR(64) NULL,
      created_by_id VARCHAR(64) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )`,
    notifications: `CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      message TEXT NOT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL
    )`,
    settings: `CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(120) PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    audit_logs: `CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR(64) PRIMARY KEY,
      actor_id VARCHAR(64) NULL,
      actor_name VARCHAR(255) NULL,
      actor_role VARCHAR(50) NULL,
      action VARCHAR(120) NOT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id VARCHAR(64) NULL,
      details_json LONGTEXT NULL,
      created_at DATETIME NOT NULL
    )`,
    verification_codes: `CREATE TABLE IF NOT EXISTS verification_codes (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      purpose VARCHAR(64) NOT NULL,
      code_hash VARCHAR(255) NOT NULL,
      payload_json LONGTEXT NULL,
      attempt_count INT NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL
    )`,
  };
}

async function ensureSqliteColumns(db) {
  const userColumns = await db.all2("PRAGMA table_info(users)");
  const userNames = new Set(userColumns.map((col) => col.name));
  if (!userNames.has("role")) await db.run2("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  if (!userNames.has("profile_picture")) await db.run2("ALTER TABLE users ADD COLUMN profile_picture TEXT");
  if (!userNames.has("created_at")) {
    await db.run2("ALTER TABLE users ADD COLUMN created_at TEXT");
    await db.run2("UPDATE users SET created_at = ? WHERE created_at IS NULL", [nowIso()]);
  }

  const requestColumns = await db.all2("PRAGMA table_info(requests)");
  const requestNames = new Set(requestColumns.map((col) => col.name));
  const newRequestCols = [
    ["priority_number", "TEXT"],
    ["service_id", "TEXT"],
    ["request_details_json", "TEXT"],
    ["staff_note", "TEXT"],
    ["staff_verified_at", "TEXT"],
    ["admin1_id", "TEXT"],
    ["admin1_name", "TEXT"],
    ["admin1_note", "TEXT"],
    ["admin1_action", "TEXT"],
    ["admin1_at", "TEXT"],
    ["admin2_id", "TEXT"],
    ["admin2_name", "TEXT"],
    ["admin2_note", "TEXT"],
    ["admin2_action", "TEXT"],
    ["admin2_at", "TEXT"],
    ["completed_at", "TEXT"],
    ["completed_by_id", "TEXT"],
    ["completed_by_name", "TEXT"],
    ["feedback_rating", "INTEGER"],
    ["feedback_comment", "TEXT"],
    ["feedback_submitted_at", "TEXT"],
    ["submitted_at", "TEXT"],
    ["resolved_at", "TEXT"],
  ];
  for (const [columnName, type] of newRequestCols) {
    if (!requestNames.has(columnName)) {
      await db.run2(`ALTER TABLE requests ADD COLUMN ${columnName} ${type}`);
    }
  }
  await db.run2("UPDATE requests SET submitted_at = ? WHERE submitted_at IS NULL", [nowIso()]);

  const serviceColumns = await db.all2("PRAGMA table_info(services)");
  const serviceNames = new Set(serviceColumns.map((col) => col.name));
  const newServiceCols = [
    ["category", "TEXT NOT NULL DEFAULT 'General'"],
    ["archived_at", "TEXT"],
    ["archived_by_id", "TEXT"],
    ["created_by_id", "TEXT"],
    ["created_at", "TEXT"],
    ["updated_at", "TEXT"],
  ];
  for (const [columnName, type] of newServiceCols) {
    if (!serviceNames.has(columnName)) {
      await db.run2(`ALTER TABLE services ADD COLUMN ${columnName} ${type}`);
    }
  }
  await db.run2("UPDATE services SET category = 'General' WHERE category IS NULL OR TRIM(category) = ''");
  await db.run2("UPDATE services SET created_at = ? WHERE created_at IS NULL", [nowIso()]);
  await db.run2("UPDATE services SET updated_at = COALESCE(updated_at, created_at)", []);

  const notificationColumns = await db.all2("PRAGMA table_info(notifications)");
  const notificationNames = new Set(notificationColumns.map((col) => col.name));
  if (!notificationNames.has("created_at")) {
    await db.run2("ALTER TABLE notifications ADD COLUMN created_at TEXT");
    await db.run2("UPDATE notifications SET created_at = ? WHERE created_at IS NULL", [nowIso()]);
  }
}

async function ensureMysqlColumns(db) {
  const table = async (name) => {
    const rows = await db.all2(
      "SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      [name]
    );
    return new Set(rows.map((row) => row.name));
  };

  const serviceNames = await table("services");
  if (!serviceNames.has("category")) await db.run2("ALTER TABLE services ADD COLUMN category VARCHAR(120) NOT NULL DEFAULT 'General'");
  if (!serviceNames.has("archived_at")) await db.run2("ALTER TABLE services ADD COLUMN archived_at DATETIME NULL");
  if (!serviceNames.has("archived_by_id")) await db.run2("ALTER TABLE services ADD COLUMN archived_by_id VARCHAR(64) NULL");
  if (!serviceNames.has("created_by_id")) await db.run2("ALTER TABLE services ADD COLUMN created_by_id VARCHAR(64) NULL");

  const requestNames = await table("requests");
  if (!requestNames.has("priority_number")) await db.run2("ALTER TABLE requests ADD COLUMN priority_number VARCHAR(64) NULL");
  if (!requestNames.has("feedback_rating")) await db.run2("ALTER TABLE requests ADD COLUMN feedback_rating INT NULL");
  if (!requestNames.has("feedback_comment")) await db.run2("ALTER TABLE requests ADD COLUMN feedback_comment TEXT NULL");
  if (!requestNames.has("feedback_submitted_at")) await db.run2("ALTER TABLE requests ADD COLUMN feedback_submitted_at DATETIME NULL");
}

async function ensureBaseData(db) {
  // Use INSERT IGNORE for MySQL, INSERT OR IGNORE for SQLite
  const insertIgnore = db.client === "mysql"
    ? "INSERT IGNORE INTO settings (`key`, value) VALUES ('required_admin_approvals', '2')"
    : "INSERT OR IGNORE INTO settings (key, value) VALUES ('required_admin_approvals', '2')";
  await db.run2(insertIgnore).catch(async () => {
    const row = await db.get2("SELECT value FROM settings WHERE `key` = ?", ["required_admin_approvals"]);
    if (!row) {
      await db.run2("INSERT INTO settings (`key`, value) VALUES (?, ?)", ["required_admin_approvals", "2"]);
    }
  });

  for (const service of DEFAULT_SERVICES) {
    const existing = await db.get2("SELECT id FROM services WHERE id = ? OR name = ?", [service.id, service.name]);
    if (existing) continue;
    const timestamp = nowIso();
    await db.run2(
      `INSERT INTO services (id, name, icon, color, category, fields_json, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        service.id,
        service.name,
        service.icon,
        service.color,
        service.category || "General",
        JSON.stringify(service.fields),
        timestamp,
        timestamp,
      ]
    );
  }
}

async function ensureSqliteIndexes(db) {
  const statements = [
    "CREATE INDEX IF NOT EXISTS idx_requests_status_submitted ON requests(status, submitted_at)",
    "CREATE INDEX IF NOT EXISTS idx_requests_user_submitted ON requests(user_id, submitted_at)",
    "CREATE INDEX IF NOT EXISTS idx_requests_service_submitted ON requests(service_type, submitted_at)",
    "CREATE INDEX IF NOT EXISTS idx_requests_admin_queue ON requests(status, admin1_action, admin2_action, admin1_id, submitted_at)",
    "CREATE INDEX IF NOT EXISTS idx_requests_feedback_pending ON requests(user_id, status, feedback_submitted_at)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON notifications(user_id, is_read, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_verification_user_purpose_created ON verification_codes(user_id, purpose, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_services_active_category_name ON services(is_active, category, name)",
  ];
  for (const sql of statements) {
    await db.run2(sql);
  }
}

async function ensureMysqlIndexes(db) {
  const statements = [
    "CREATE INDEX idx_requests_status_submitted ON requests(status, submitted_at)",
    "CREATE INDEX idx_requests_user_submitted ON requests(user_id, submitted_at)",
    "CREATE INDEX idx_requests_service_submitted ON requests(service_type, submitted_at)",
    "CREATE INDEX idx_requests_admin_queue ON requests(status, admin1_action, admin2_action, admin1_id, submitted_at)",
    "CREATE INDEX idx_requests_feedback_pending ON requests(user_id, status, feedback_submitted_at)",
    "CREATE INDEX idx_notifications_user_read_created ON notifications(user_id, is_read, created_at)",
    "CREATE INDEX idx_audit_logs_created ON audit_logs(created_at)",
    "CREATE INDEX idx_audit_logs_actor_created ON audit_logs(actor_id, created_at)",
    "CREATE INDEX idx_verification_user_purpose_created ON verification_codes(user_id, purpose, created_at)",
    "CREATE INDEX idx_services_active_category_name ON services(is_active, category, name)",
  ];

  for (const sql of statements) {
    try {
      await db.run2(sql);
    } catch (err) {
      const msg = String(err && err.message ? err.message : "");
      if (!/Duplicate key name|already exists/i.test(msg)) {
        throw err;
      }
    }
  }
}

async function init() {
  const adapter = DB_CLIENT === "mysql" ? await createMysqlAdapter() : createSqliteAdapter();
  const schema = adapter.client === "mysql" ? mysqlSchema() : sqliteSchema();

  for (const statement of Object.values(schema)) {
    await adapter.run2(statement);
  }

  if (adapter.client === "sqlite") {
    await ensureSqliteColumns(adapter);
    await ensureSqliteIndexes(adapter);
  } else {
    await ensureMysqlColumns(adapter);
    await ensureMysqlIndexes(adapter);
  }

  await ensureBaseData(adapter);
  return adapter;
}

const db = {
  client: DB_CLIENT,
  ready: null,
  run2(...args) {
    return this.ready.then((adapter) => adapter.run2(...args));
  },
  all2(...args) {
    return this.ready.then((adapter) => adapter.all2(...args));
  },
  get2(...args) {
    return this.ready.then((adapter) => adapter.get2(...args));
  },
  exec2(...args) {
    return this.ready.then((adapter) => adapter.exec2(...args));
  },
  nowIso,
  defaultServices: DEFAULT_SERVICES,
  dumpMysqlSchema() {
    const schema = mysqlSchema();
    return Object.values(schema).join(";\n\n") + ";\n";
  },
};

db.ready = init().then((adapter) => {
  db.client = adapter.client;
  if (adapter.client === "mysql") {
    console.log("Database: MySQL connected");
  }
  return adapter;
});

module.exports = db;
