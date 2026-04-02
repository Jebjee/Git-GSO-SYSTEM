const BASE = "/api";
function getToken() { return localStorage.getItem("gso_token"); }
function authHeaders() { return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }; }

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, { method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined });
  } catch (err) {
    throw new Error("Backend server is unreachable. Please make sure backend is running on port 5000.");
  }
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { data = { error: raw || `${res.status} ${res.statusText || "Request failed"}` }; }
  if (!res.ok) {
    if (String(data.error || "").toLowerCase().includes("invalid token")) {
      clearSession();
    }
    throw new Error(data.error || `${res.status} ${res.statusText || "Request failed"}`);
  }
  return data;
}

function withParams(path, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export const api = {
  register: (body) => request("POST", "/auth/register", body),
  login: (body) => request("POST", "/auth/login", body),
  forgotPasswordRequestCode: (body) => request("POST", "/auth/forgot-password/request-code", body),
  forgotPasswordConfirm: (body) => request("POST", "/auth/forgot-password/confirm", body),
  getProfile: () => request("GET", "/user/profile"),
  updateProfile: (body) => request("PATCH", "/user/profile", body),
  requestSecurityCode: (body) => request("POST", "/user/security/request-code", body),
  confirmSecurityCode: (body) => request("POST", "/user/security/confirm-code", body),
  getServices: (includeAll = false) => request("GET", `/services${includeAll ? "?include_all=1" : ""}`),
  getMyRequests: () => request("GET", "/user/requests"),
  submitRequest: (body) => request("POST", "/user/requests", body),
  submitRequestFeedback: (id, body) => request("POST", `/user/requests/${id}/feedback`, body),
  getNotifications: () => request("GET", "/user/notifications"),
  markNotifsRead: () => request("PATCH", "/user/notifications/read"),
  getSettings: () => request("GET", "/settings"),
  // Staff
  getStaffRequests: (status) => request("GET", `/staff/requests${status ? `?status=${status}` : ""}`),
  getStaffFeedback: () => request("GET", "/staff/feedback"),
  getStaffPendingFeedback: (service) => request("GET", withParams("/staff/feedback/pending", { service })),
  sendStaffFeedbackReminder: (id) => request("POST", `/staff/requests/${id}/feedback-reminder`),
  staffUpdateRequest: (id, status, note, priorityNumber) =>
    request("PATCH", `/staff/requests/${id}/status`, { status, staff_note: note, priority_number: priorityNumber }),
  getStaffAnalytics: (params) => request("GET", withParams("/staff/analytics", params)),
  // Admin
  getAllRequests: (status, queue) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (queue) p.set("queue", queue);
    return request("GET", `/admin/requests${p.toString() ? "?" + p.toString() : ""}`);
  },
  adminActOnRequest: (id, action, note) => request("PATCH", `/admin/requests/${id}/status`, { action, note }),
  getStats: () => request("GET", "/admin/stats"),
  getAnalytics: (params) => request("GET", withParams("/admin/analytics", params)),
  getAdminAuditLogs: (params) => request("GET", withParams("/admin/audit-logs", params)),
  createService: (body) => request("POST", "/admin/services", body),
  updateService: (id, body) => request("PATCH", `/admin/services/${id}`, body),
  deleteService: (id) => request("DELETE", `/admin/services/${id}`),
  broadcast: (body) => request("POST", "/admin/users/broadcast", body),
  // Head Admin
  getHeadAdminUsers: () => request("GET", "/head-admin/users"),
  getHeadAdminRequests: (status) => request("GET", `/head-admin/requests${status ? `?status=${status}` : ""}`),
  updateUserStatus: (id, status) => request("PATCH", `/head-admin/users/${id}/status`, { status }),
  getHeadAdminStats: () => request("GET", "/head-admin/stats"),
  getHeadAdminAuditLogs: (params) => request("GET", withParams("/head-admin/audit-logs", params)),
  setRequiredApprovals: (n) => request("PATCH", "/head-admin/settings/approvals", { required_approvals: n }),
};

export function saveSession(token, role, user) {
  localStorage.setItem("gso_token", token);
  localStorage.setItem("gso_role", role);
  if (user) localStorage.setItem("gso_user", JSON.stringify(user));
}
export function clearSession() {
  ["gso_token","gso_role","gso_user"].forEach(k => localStorage.removeItem(k));
}
export function getSession() {
  let parsedUser = null;
  try {
    parsedUser = JSON.parse(localStorage.getItem("gso_user") || "null");
  } catch {
    parsedUser = null;
    localStorage.removeItem("gso_user");
  }
  return {
    token: localStorage.getItem("gso_token"),
    role: localStorage.getItem("gso_role"),
    user: parsedUser,
  };
}

