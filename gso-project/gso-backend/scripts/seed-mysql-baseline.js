require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const bcrypt = require("bcryptjs");
const db = require("../db");

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || "Gso@12345";

async function ensureUser(user) {
  const existing = await db.get2(
    "SELECT id, username, email, role, status FROM users WHERE username = ? OR email = ?",
    [user.username, user.email]
  );
  if (existing) return { created: false, user: existing };

  const id = `seed_${user.username}`;
  const hash = await bcrypt.hash(user.password || DEFAULT_PASSWORD, 10);
  await db.run2(
    "INSERT INTO users (id, full_name, email, username, password, department, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, user.full_name, user.email, user.username, hash, user.department, user.role, user.status || "approved", db.nowIso()]
  );
  return { created: true, user: { id, username: user.username, email: user.email, role: user.role, status: user.status || "approved" } };
}

async function main() {
  await db.ready;
  if (db.client !== "mysql") {
    throw new Error(`DB_CLIENT must be mysql. Current: ${db.client}`);
  }

  const adminUsername = process.env.ADMIN_USERNAME || "brenda";
  const adminEmail = process.env.ADMIN_EMAIL || "brenda@gso.local";

  const seeds = [
    {
      full_name: "Head Admin",
      email: adminEmail,
      username: adminUsername,
      department: "Administration",
      role: "head_admin",
      status: "approved",
      password: process.env.ADMIN_PASSWORD || "admin123",
    },
    {
      full_name: "Admin One",
      email: "admin1@gso.local",
      username: "admin1",
      department: "Administration",
      role: "admin",
      status: "approved",
    },
    {
      full_name: "Staff One",
      email: "staff1@gso.local",
      username: "staff1",
      department: "GSO Staff",
      role: "staff",
      status: "approved",
    },
    {
      full_name: "Bryant User",
      email: "bryant.user@gso.local",
      username: "bryant1",
      department: "Engineering",
      role: "user",
      status: "approved",
    },
  ];

  const results = [];
  for (const seed of seeds) {
    results.push(await ensureUser(seed));
  }

  const services = await db.get2("SELECT COUNT(*) as c FROM services");
  const users = await db.all2("SELECT role, COUNT(*) as c FROM users GROUP BY role ORDER BY role");
  const settings = await db.all2("SELECT `key`, value FROM settings");

  console.log("Seed complete.");
  console.log("Created users:", results.filter((r) => r.created).map((r) => r.user.username).join(", ") || "none");
  console.log("Services:", services.c);
  console.log("Users by role:", users);
  console.log("Settings:", settings);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
