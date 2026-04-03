const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: false }
});

async function sendEmail({ to, subject, html }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    const reason = "SMTP credentials are not configured (SMTP_USER/SMTP_PASS missing)";
    console.error(`Email failed to ${to}: ${reason}`);
    return { ok: false, fallback: true, error: reason };
  }
  try {
    const result = await transporter.sendMail({
      from: `"GSO System" <${process.env.SMTP_USER || "noreply@gso.edu.ph"}>`,
      to, subject, html,
    });
    console.log(`Email sent to ${to}: ${subject}`);
    return { ok: true, fallback: false, result };
  } catch (error) {
    console.error(`Email failed to ${to}:`, error.message);
    console.log(`
[EMAIL FALLBACK] To: ${to}
Subject: ${subject}
Body: ${html.replace(/<[^>]+>/g, "")}
`);
    return { ok: false, fallback: true, error: error.message };
  }
}

const header = (color, icon, title) => `
  <div style="background:${color};color:white;padding:16px 24px;border-radius:8px;margin-bottom:24px;">
    <h2 style="margin:0;">${icon} ${title}</h2>
  </div>`;

const tableRow = (label, value, alt) => `
  <tr style="background:${alt ? '#f1f5f9' : 'white'};">
    <td style="padding:12px 16px;font-weight:600;width:40%;">${label}</td>
    <td style="padding:12px 16px;">${value}</td>
  </tr>`;

const infoTable = (...rows) => `
  <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;margin:16px 0;">
    ${rows.map((r, i) => tableRow(r[0], r[1], i % 2 === 0)).join("")}
  </table>`;

const box = (color, text) => `
  <div style="padding:16px;background:${color}20;border-radius:8px;border-left:4px solid ${color};margin-top:16px;">
    ${text}
  </div>`;

const footer = () => `<p style="color:#6b7280;font-size:12px;margin-top:24px;">GSO Automated System · ${new Date().toLocaleString()}</p>`;

const wrap = (content) => `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
    ${content}
    ${footer()}
  </div>`;

// ── Registration ──────────────────────────────────────────────────────────────
function registrationEmail(user) {
  return {
    to: user.email,
    subject: `[GSO] Account Registration Received`,
    html: wrap(`
      ${header("#3b82f6", "📋", "Registration Received")}
      <p style="font-size:16px;">Hi <strong>${user.full_name}</strong>,</p>
      <p>Your account registration is <strong>pending Head Admin approval</strong>. You will receive an email once reviewed.</p>
      ${infoTable(["Full Name", user.full_name], ["Email", user.email], ["Username", user.username], ["Department", user.department], ["Requested Role", user.role.toUpperCase()])}
    `),
  };
}

function newAccountEmail(user) {
  return {
    to: process.env.ADMIN_EMAIL,
    subject: `[GSO] New Account Registration: ${user.full_name} (${user.role})`,
    html: wrap(`
      ${header("#8b5cf6", "👤", "New Account Pending Approval")}
      ${infoTable(["Full Name", user.full_name], ["Email", user.email], ["Username", user.username], ["Department", user.department], ["Requested Role", `<strong>${user.role.toUpperCase()}</strong>`])}
      ${box("#f59e0b", "<strong>Action Required:</strong> Log in to the Head Admin panel to approve or reject this account.")}
    `),
  };
}

function userStatusEmail(user, status) {
  const ok = status === "approved";
  return {
    to: user.email,
    subject: `[GSO] Account ${ok ? "Approved ✅" : "Rejected ❌"}`,
    html: wrap(`
      ${header(ok ? "#22c55e" : "#ef4444", ok ? "✅" : "❌", `Account ${ok ? "Approved" : "Rejected"}`)}
      <p>Dear <strong>${user.full_name}</strong>,</p>
      <p>Your GSO account has been <strong>${status}</strong> by the Head Admin.</p>
      ${ok ? box("#22c55e", "<strong>You can now log in</strong> to the GSO system.") : box("#ef4444", "<strong>Your account was not approved.</strong> Please contact the admin.")}
    `),
  };
}

// ── Staff ─────────────────────────────────────────────────────────────────────
function newRequestToStaffEmail(req, staffList) {
  return {
    to: staffList.map(s => s.email).join(","),
    subject: `[GSO] New ${req.service_type} Request — Staff Review Needed`,
    html: wrap(`
      ${header("#3b82f6", "📋", "New Service Request — Action Required")}
      ${infoTable(["Requested By", req.user_name], ["Email", req.user_email], ["Department", req.department], ["Service Type", req.service_type], ["Location", req.location], ["Preferred Date", req.preferred_date || "Not specified"], ["Description", req.description])}
      ${box("#f59e0b", "<strong>Action Required:</strong> Log in to the Staff Panel to verify, mark pending, or decline this request.")}
    `),
  };
}

function staffStatusEmail(req, status) {
  const colors = { verified: "#22c55e", pending: "#f59e0b", declined: "#ef4444" };
  const icons  = { verified: "✅", pending: "⏳", declined: "❌" };
  return {
    to: req.user_email,
    subject: `[GSO] Your ${req.service_type} Request: ${status.toUpperCase()} by Staff`,
    html: wrap(`
      ${header(colors[status] || "#3b82f6", icons[status] || "📋", `Request ${status.charAt(0).toUpperCase()+status.slice(1)} by Staff`)}
      <p>Dear <strong>${req.user_name}</strong>,</p>
      <p>Your <strong>${req.service_type}</strong> request has been marked <strong>${status}</strong> by our staff.</p>
      ${req.staff_note ? `<div style="padding:16px;background:#f1f5f9;border-radius:8px;margin:16px 0;"><strong>Staff Note:</strong> ${req.staff_note}</div>` : ""}
      ${status === "verified" ? box("#22c55e", "Your request is now forwarded to Admin for review.") : ""}
      ${status === "declined" ? box("#ef4444", "You may resubmit your request with additional details.") : ""}
    `),
  };
}

// ── Admin 1 → Admin 2 ─────────────────────────────────────────────────────────
function staffVerifiedToAdmin1Email(req, adminList, requiredApprovals) {
  const label = requiredApprovals === 1 ? "Final Approval Needed" : "Admin 1 — First Approval Needed";
  return {
    to: adminList.map(a => a.email).join(","),
    subject: `[GSO] Staff Verified: ${req.service_type} Request — ${label}`,
    html: wrap(`
      ${header("#8b5cf6", "✅", `Staff Verified Request — ${label}`)}
      ${infoTable(["Requested By", req.user_name], ["Department", req.department], ["Service Type", req.service_type], ["Location", req.location], ["Staff Note", req.staff_note || "None"])}
      ${box("#8b5cf6", requiredApprovals === 1
        ? "<strong>Action Required:</strong> Log in to the Admin Panel to approve or disapprove."
        : "<strong>Action Required (Admin 1):</strong> You are the first to review. Log in to approve or disapprove. If approved, a second admin will do final review."
      )}
    `),
  };
}

function admin1ApprovedToAdmin2Email(req, admin1Name, adminList) {
  return {
    to: adminList.map(a => a.email).join(","),
    subject: `[GSO] Admin 2 Review Needed: ${req.service_type} Request (Approved by ${admin1Name})`,
    html: wrap(`
      ${header("#8b5cf6", "🔄", `Admin 2 — Final Approval Needed`)}
      <p><strong>${admin1Name}</strong> has approved this request as Admin 1. Your final review is now required.</p>
      ${infoTable(
        ["Requested By", req.user_name],
        ["Department", req.department],
        ["Service Type", req.service_type],
        ["Location", req.location],
        ["Admin 1", `${admin1Name} ✅ Approved on ${new Date(req.admin1_at).toLocaleString()}`],
        ["Admin 1 Note", req.admin1_note || "None"],
        ["Staff Note", req.staff_note || "None"]
      )}
      ${box("#8b5cf6", "<strong>Action Required (Admin 2):</strong> Log in to the Admin Panel to give your final approval or disapproval.")}
    `),
  };
}

function admin1DisapprovedToUserEmail(req, admin1Name, note) {
  return {
    to: req.user_email,
    subject: `[GSO] Your ${req.service_type} Request was Disapproved ❌`,
    html: wrap(`
      ${header("#ef4444", "❌", "Request Disapproved")}
      <p>Dear <strong>${req.user_name}</strong>,</p>
      <p>Your <strong>${req.service_type}</strong> request has been <strong>disapproved</strong> by Admin (<strong>${admin1Name}</strong>).</p>
      ${note ? `<div style="padding:16px;background:#fee2e2;border-radius:8px;margin:16px 0;"><strong>Reason:</strong> ${note}</div>` : ""}
      ${box("#ef4444", "You may resubmit with additional details if needed.")}
    `),
  };
}

function admin2ApprovedToStaffEmail(req, admin2Name, staffList) {
  return {
    to: staffList.length > 0 ? staffList.map(s => s.email).join(",") : process.env.ADMIN_EMAIL,
    subject: `[GSO] ✅ FULLY APPROVED — ${req.service_type} Request Ready for Service`,
    html: wrap(`
      ${header("#22c55e", "🎉", "Request Fully Approved — Ready for Service")}
      <p>This request has been approved by <strong>both admins</strong> and is now ready for the GSO team to carry out.</p>
      ${infoTable(
        ["Requested By", req.user_name],
        ["Email", req.user_email],
        ["Department", req.department],
        ["Service Type", req.service_type],
        ["Location", req.location],
        ["Preferred Date", req.preferred_date || "Not specified"],
        ["Description", req.description],
        ["Admin 1", `${req.admin1_name} ✅ ${new Date(req.admin1_at).toLocaleString()}`],
        ["Admin 2", `${admin2Name} ✅ ${new Date().toLocaleString()}`]
      )}
      ${box("#22c55e", "<strong>Action Required (Staff):</strong> Please coordinate with the requester to schedule and carry out the service.")}
    `),
  };
}

function admin2DisapprovedToUserEmail(req, admin2Name, note) {
  return {
    to: req.user_email,
    subject: `[GSO] Your ${req.service_type} Request was Disapproved ❌`,
    html: wrap(`
      ${header("#ef4444", "❌", "Request Disapproved by Final Admin")}
      <p>Dear <strong>${req.user_name}</strong>,</p>
      <p>Your <strong>${req.service_type}</strong> request has been <strong>disapproved</strong> upon final review by Admin (<strong>${admin2Name}</strong>).</p>
      ${note ? `<div style="padding:16px;background:#fee2e2;border-radius:8px;margin:16px 0;"><strong>Reason:</strong> ${note}</div>` : ""}
      ${box("#ef4444", "You may resubmit with additional details if needed.")}
    `),
  };
}

function serviceReadyEmail(req, staffList) {
  return admin2ApprovedToStaffEmail(req, req.admin1_name || "Admin", staffList);
}

function requestStatusEmail(req, status, note) {
  const ok = status === "approved";
  const admin2Line = req.admin2_name ? tableRow("Admin 2 (Final)", `${req.admin2_name} ✅`, true) : "";
  return {
    to: req.user_email,
    subject: `[GSO] Your ${req.service_type} Request has been ${ok ? "Approved ✅" : "Disapproved ❌"}`,
    html: wrap(`
      ${header(ok ? "#22c55e" : "#ef4444", ok ? "✅" : "❌", ok ? "Request Fully Approved" : "Request Disapproved")}
      <p>Dear <strong>${req.user_name}</strong>,</p>
      <p>Your <strong>${req.service_type}</strong> request has been <strong>${status}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;margin:16px 0;">
        ${tableRow("Service", req.service_type, true)}
        ${tableRow("Location", req.location, false)}
        ${tableRow("Status", status.toUpperCase(), true)}
        ${req.admin1_name ? tableRow("Admin 1", `${req.admin1_name} ✅`, false) : ""}
        ${admin2Line}
        ${note ? tableRow("Admin Note", note, true) : ""}
      </table>
      ${ok ? box("#22c55e", "<strong>Next Steps:</strong> The GSO team will contact you to coordinate the service.") : box("#ef4444", "You may resubmit with additional details if needed.")}
    `),
  };
}

function broadcastEmail(user, subject, message) {
  return {
    to: user.email,
    subject: subject || `[GSO] Important Announcement`,
    html: wrap(`
      ${header("#3b82f6", "📢", "GSO Announcement")}
      <p>Hi <strong>${user.full_name}</strong>,</p>
      <div style="background:white;border-radius:8px;padding:20px;margin:16px 0;border:1px solid #e5e7eb;line-height:1.7;">${message.replace(/\n/g, "<br>")}</div>
    `),
  };
}

function securityVerificationEmail(user, actionLabel, code, minutesValid) {
  return {
    to: user.email,
    subject: `[GSO] Verification Code for ${actionLabel}`,
    html: wrap(`
      ${header("#3b82f6", "🔐", "Security Verification Required")}
      <p>Hi <strong>${user.full_name}</strong>,</p>
      <p>We received a request to change your <strong>${actionLabel.toLowerCase()}</strong>.</p>
      <p>Use this verification code to continue:</p>
      <div style="font-size:28px;font-weight:800;letter-spacing:6px;text-align:center;background:white;border:1px solid #e5e7eb;border-radius:10px;padding:14px 10px;margin:16px 0;">
        ${code}
      </div>
      ${box("#f59e0b", `This code expires in <strong>${minutesValid} minutes</strong>. If you did not request this, you can ignore this email.`)}
    `),
  };
}

function securityChangedEmail(user, actionLabel) {
  return {
    to: user.email,
    subject: `[GSO] ${actionLabel} Changed Successfully`,
    html: wrap(`
      ${header("#22c55e", "✅", `${actionLabel} Updated`)}
      <p>Hi <strong>${user.full_name}</strong>,</p>
      <p>Your <strong>${actionLabel.toLowerCase()}</strong> has been successfully updated in your GSO account.</p>
      ${box("#22c55e", "If this was not you, contact your system administrator immediately.")}
    `),
  };
}

module.exports = {
  sendEmail, registrationEmail, newAccountEmail, userStatusEmail,
  newRequestToStaffEmail, staffStatusEmail,
  staffVerifiedToAdmin1Email, admin1ApprovedToAdmin2Email,
  admin1DisapprovedToUserEmail, admin2ApprovedToStaffEmail,
  admin2DisapprovedToUserEmail, serviceReadyEmail,
  requestStatusEmail, broadcastEmail,
  securityVerificationEmail, securityChangedEmail,
};
