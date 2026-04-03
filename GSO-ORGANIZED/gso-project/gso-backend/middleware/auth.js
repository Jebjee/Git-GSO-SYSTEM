const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/constants");

// Verify JWT and attach req.user — any valid role.
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
}

// Gate a route to one or more specific roles.
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

const adminOnly     = roleMiddleware("admin", "head_admin");
const staffOnly     = roleMiddleware("staff");
const headAdminOnly = roleMiddleware("head_admin");

module.exports = { authMiddleware, roleMiddleware, adminOnly, staffOnly, headAdminOnly };
