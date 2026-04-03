require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const db      = require("./db");
const { PORT } = require("./config/constants");

// ── Route modules ─────────────────────────────────────────────────────────────
const authRoutes      = require("./routes/auth");
const userRoutes      = require("./routes/user");
const staffRoutes     = require("./routes/staff");
const adminRoutes     = require("./routes/admin");
const headAdminRoutes = require("./routes/headAdmin");

const app = express();

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "50mb" }));

// ── Routes (mounted at root; each router keeps its full /api/... paths) ──────
app.use(authRoutes);
app.use(userRoutes);
app.use(staffRoutes);
app.use(adminRoutes);
app.use(headAdminRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", timestamp: new Date().toISOString() })
);

// ── Start server ──────────────────────────────────────────────────────────────
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
