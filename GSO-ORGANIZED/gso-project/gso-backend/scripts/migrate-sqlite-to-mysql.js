require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const path = require("path");
const sqlite3 = require("sqlite3").verbose();

function openSqlite(dbPath) {
  const db = new sqlite3.Database(dbPath);
  return {
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
      });
    },
    close() {
      return new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())));
    },
  };
}

async function main() {
  let mysql;
  try {
    mysql = require("mysql2/promise");
  } catch {
    throw new Error("mysql2 is required. Run npm install in gso-backend before running this migration.");
  }

  const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, "..", "gso.db");
  const sqlite = openSqlite(sqlitePath);

  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "gso_system",
    waitForConnections: true,
    connectionLimit: 5,
  });

  process.env.DB_CLIENT = "mysql";
  const db = require("../db");
  await db.ready;

  const tables = ["users", "requests", "services", "notifications", "settings", "audit_logs"];
  for (const table of tables) {
    const rows = await sqlite.all(`SELECT * FROM ${table}`);
    if (!rows.length) {
      console.log(`Skipping ${table}: no rows`);
      continue;
    }

    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => "?").join(", ");
    const insertSql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;

    for (const row of rows) {
      await pool.execute(insertSql, columns.map((column) => row[column]));
    }
    console.log(`Migrated ${rows.length} row(s) into ${table}`);
  }

  await sqlite.close();
  await pool.end();
  console.log("SQLite to MySQL migration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
