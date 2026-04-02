import { useState } from "react";
import { api, getSession, saveSession } from "../api";
import { formatDateOnly, formatDateTime } from "../utils/date";
import { getRequestDetailEntries } from "../utils/services";

export function Badge({ status }) {
  return <span className={`badge badge-${status}`}>{status.toUpperCase()}</span>;
}

export function PasswordInput({ value, onChange, placeholder, onKeyDown, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input type={show ? "text" : "password"} value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown} autoComplete={autoComplete} />
      <button type="button" className="pw-toggle" onClick={() => setShow((current) => !current)} tabIndex={-1}>
        {show ? "\u{1F648}" : "\u{1F441}\uFE0F"}
      </button>
    </div>
  );
}

export function RoleBadge({ role }) {
  const icons = { user: "\u{1F464}", staff: "\u{1F6E1}\uFE0F", admin: "\u2699\uFE0F", head_admin: "\u{1F511}" };
  return <span className={`badge badge-${role}`}>{icons[role]} {role.replace("_", " ").toUpperCase()}</span>;
}

export function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast toast-${toast.type}`}>{toast.msg}</div>;
}

export function useToast() {
  const [toast, setToast] = useState(null);
  const show = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };
  return [toast, show];
}

export function ServiceDetailBlock({ req, services }) {
  const entries = getRequestDetailEntries(req, services);
  if (entries.length === 0) return null;
  return (
    <div className="detail-stack">
      {entries.map((item) => (
        <div className="detail-stack-item" key={item.label}>
          <div className="detail-stack-label">{item.label}</div>
          <div className="detail-stack-value">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function ApprovalTrail({ req, requiredApprovals = 2 }) {
  const steps = [];
  if (req.admin1_name || req.status === "verified") {
    if (req.admin1_action) {
      steps.push({ name: req.admin1_name, action: req.admin1_action, note: req.admin1_note, at: req.admin1_at, step: "Admin 1" });
    } else {
      steps.push({ name: null, action: null, step: "Admin 1 - Pending" });
    }
  }
  if (requiredApprovals === 2 && req.admin1_action === "approved") {
    if (req.admin2_action) {
      steps.push({ name: req.admin2_name, action: req.admin2_action, note: req.admin2_note, at: req.admin2_at, step: "Admin 2 (Final)" });
    } else {
      steps.push({ name: null, action: null, step: "Admin 2 - Pending" });
    }
  }
  if (steps.length === 0) return null;
  return (
    <div className="approval-trail">
      {steps.map((step, index) => (
        <div key={index} className={`trail-item ${step.action ? `done-${step.action}` : "waiting"}`}>
          <span style={{ fontSize: "1rem" }}>{step.action === "approved" ? "\u2705" : step.action === "disapproved" ? "\u274C" : "\u23F3"}</span>
          <span className="trail-name">{step.step}{step.name ? `: ${step.name}` : ""}</span>
          {step.note && <span style={{ color: "var(--text-muted)", marginLeft: "auto", fontSize: "0.75rem" }}>"{step.note}"</span>}
          {step.at && <span style={{ color: "var(--text-dim)", fontSize: "0.72rem", marginLeft: step.note ? "0.5rem" : "auto" }}>{formatDateTime(step.at)}</span>}
        </div>
      ))}
    </div>
  );
}

export function ProfileTab({ user, setUser, showToast }) {
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [confirmingCode, setConfirmingCode] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const updated = await api.updateProfile({ profile_picture: event.target?.result });
        setUser(updated);
        showToast("Profile picture updated!");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    reader.readAsDataURL(file);
  };

  const sendSecurityCode = async () => {
    const nextUsername = newUsername.trim();
    const wantsUsername = nextUsername.length > 0;
    const wantsPassword = newPassword.length > 0 || confirmPassword.length > 0;

    if (!wantsUsername && !wantsPassword) {
      showToast("Enter a new username or password first", "error");
      return;
    }
    if (wantsUsername && wantsPassword) {
      showToast("Change one at a time: username or password", "error");
      return;
    }

    const action = wantsUsername ? "username" : "password";
    if (action === "username") {
      if (nextUsername.length < 3) {
        showToast("Username must be at least 3 characters", "error");
        return;
      }
      if (nextUsername === user.username) {
        showToast("Enter a different username", "error");
        return;
      }
    } else {
      if (newPassword.length < 8) {
        showToast("Password must be at least 8 characters", "error");
        return;
      }
      if (newPassword !== confirmPassword) {
        showToast("Passwords do not match", "error");
        return;
      }
    }

    setSendingCode(true);
    try {
      if (action === "username") {
        await api.requestSecurityCode({ action: "username", new_username: nextUsername });
      } else {
        await api.requestSecurityCode({ action: "password", new_password: newPassword });
      }
      setPendingAction(action);
      setVerificationCode("");
      showToast("Verification code sent to your Gmail");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSendingCode(false);
    }
  };

  const confirmSecurityChange = async () => {
    if (!pendingAction) {
      showToast("Request a verification code first", "error");
      return;
    }
    if (!/^\d{6}$/.test(verificationCode.trim())) {
      showToast("Enter the 6-digit verification code", "error");
      return;
    }
    setConfirmingCode(true);
    try {
      const result = await api.confirmSecurityCode({ action: pendingAction, code: verificationCode.trim() });
      setUser(result.user);
      const session = getSession();
      saveSession(result.token || session.token, session.role || result.user.role, result.user);
      setPendingAction("");
      setVerificationCode("");
      setNewUsername("");
      setNewPassword("");
      setConfirmPassword("");
      showToast(pendingAction === "username" ? "Username updated successfully" : "Password updated successfully");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setConfirmingCode(false);
    }
  };

  return (
    <div>
      <div className="section-header"><h2>My Profile</h2></div>
      <div className="profile-header">
        <div className="profile-avatar" onClick={() => document.getElementById("avUp")?.click()}>
          {user.profile_picture ? <img src={user.profile_picture} alt={user.full_name} /> : <span>{user.full_name?.charAt(0).toUpperCase()}</span>}
        </div>
        <div className="profile-info">
          <div className="profile-name">{user.full_name}</div>
          <div className="profile-email">{user.email}</div>
          <div style={{ marginBottom: "0.75rem" }}><RoleBadge role={user.role} /></div>
          <button className="btn-primary" style={{ maxWidth: "180px" }} onClick={() => document.getElementById("avUp")?.click()}>{`\u{1F4F7} Change Photo`}</button>
          <input type="file" id="avUp" accept="image/*" style={{ display: "none" }} onChange={handleUpload} />
        </div>
      </div>
      <div className="profile-section">
        <h3>{`\u{1F4CB} Account Information`}</h3>
        <div className="profile-fields">
          {[["Full Name", user.full_name], ["Username", user.username], ["Email", user.email], ["Department", user.department]].map(([label, value]) => (
            <div key={label} className="profile-field"><label>{label}</label><div className="value">{value}</div></div>
          ))}
          <div className="profile-field"><label>Role</label><div className="value"><RoleBadge role={user.role} /></div></div>
          <div className="profile-field"><label>Status</label><div className="value"><Badge status={user.status} /></div></div>
          <div className="profile-field"><label>Member Since</label><div className="value">{formatDateOnly(user.created_at)}</div></div>
        </div>
      </div>
      <div className="profile-section">
        <h3>🔐 Account Security</h3>
        <div className="security-grid">
          <div className="security-card">
            <h4>Change Username</h4>
            <div className="field-group">
              <label>New Username</label>
              <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Enter new username" />
            </div>
          </div>

          <div className="security-card">
            <h4>Change Password</h4>
            <div className="field-group">
              <label>New Password</label>
              <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div className="field-group">
              <label>Confirm New Password</label>
              <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" />
            </div>
          </div>
        </div>
        <div style={{ marginTop: "1rem", maxWidth: "420px" }}>
          <button className="btn-ghost" onClick={sendSecurityCode} disabled={sendingCode || confirmingCode}>
            {sendingCode ? "Sending..." : "Send Verification Code"}
          </button>
          {pendingAction && (
            <>
              <div className="field-group" style={{ marginTop: "0.75rem" }}>
                <label>Verification Code</label>
                <input value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} placeholder="6-digit code" maxLength={6} />
              </div>
              <button className="btn-primary security-confirm-btn" onClick={confirmSecurityChange} disabled={confirmingCode}>
                {confirmingCode ? "Confirming..." : `Confirm ${pendingAction === "username" ? "Username" : "Password"} Change`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
