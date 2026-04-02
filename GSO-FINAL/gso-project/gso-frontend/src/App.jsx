import { useState, useEffect, useCallback } from "react";
import { api, saveSession, clearSession, getSession } from "./api";
import { Badge, RoleBadge, Toast, useToast, ServiceDetailBlock, ApprovalTrail, ProfileTab, PasswordInput } from "./components/common";
import { HorizontalBarChart, DonutChart, exportRowsToCsv } from "./components/charts";
import { DynamicServiceForm, ServiceManager } from "./components/ServiceManager";
import { formatDateTime } from "./utils/date";
import { getServiceCatalog, getServiceMeta, getServiceOptionsForRequests, getRequestDescription, getRequestLocation, getRequestPreferredDate } from "./utils/services";
import { APP_CSS } from "./styles";

function LoginScreen({ onLogin, onGotoRegister }) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [fpIdentifier, setFpIdentifier] = useState("");
  const [fpCode, setFpCode] = useState("");
  const [fpPassword, setFpPassword] = useState("");
  const [fpConfirm, setFpConfirm] = useState("");
  const [fpCodeSent, setFpCodeSent] = useState(false);
  const [fpLoading, setFpLoading] = useState(false);

  const handle = async () => {
    setErr(""); setLoading(true);
    try { const d = await api.login({username,password}); saveSession(d.token,d.role,d.user||null); onLogin(d.role,d.user||null); }
    catch(e){setErr(e.message);} finally{setLoading(false);}
  };

  const requestForgotCode = async () => {
    if (!fpIdentifier.trim()) return setErr("Enter your username or email first.");
    setErr(""); setFpLoading(true);
    try {
      await api.forgotPasswordRequestCode({ identifier: fpIdentifier.trim() });
      setFpCodeSent(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setFpLoading(false);
    }
  };

  const confirmForgotReset = async () => {
    if (!fpIdentifier.trim()) return setErr("Enter your username or email.");
    if (!/^\d{6}$/.test(fpCode.trim())) return setErr("Enter the 6-digit verification code.");
    if (fpPassword.length < 8) return setErr("New password must be at least 8 characters.");
    if (fpPassword !== fpConfirm) return setErr("Passwords do not match.");
    const { score } = getPasswordStrength(fpPassword);
    if (score < 2) return setErr("Password is too weak. Add uppercase letters, numbers, or symbols.");
    setErr(""); setFpLoading(true);
    try {
      await api.forgotPasswordConfirm({
        identifier: fpIdentifier.trim(),
        code: fpCode.trim(),
        new_password: fpPassword,
      });
      setFpCode(""); setFpPassword(""); setFpConfirm("");
      setFpCodeSent(false); setShowForgot(false);
      setErr("Password reset successful. You can now log in.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setFpLoading(false);
    }
  };

  return (
    <div className="auth-wrap"><div className="auth-card">
      <div className="auth-logo"><span className="logo-badge">GSO</span><h1>General Services Office</h1><p>Facility &amp; Service Management System</p></div>
      <div className="field-group"><label>Username</label><input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Enter username" /></div>
      <div className="field-group"><label>Password</label><PasswordInput value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password" onKeyDown={e=>e.key==="Enter"&&handle()} /></div>
      {err && <div className="err-box">Warning: {err}</div>}
      <button className="btn-primary" onClick={handle} disabled={loading}>{loading?"Logging in...":"Login"}</button>
      <p className="switch-link" style={{marginTop:"0.75rem"}}><span onClick={()=>setShowForgot(v=>!v)}>Forgot password?</span></p>
      {showForgot && (
        <div className="notice-box" style={{marginTop:"0.75rem"}}>
          <div className="field-group" style={{marginBottom:"0.75rem"}}>
            <label>Username or Email</label>
            <input value={fpIdentifier} onChange={e=>setFpIdentifier(e.target.value)} placeholder="Enter your username or email" />
          </div>
          <button className="btn-ghost" onClick={requestForgotCode} disabled={fpLoading} style={{width:"100%"}}>
            {fpLoading ? "Sending..." : "Send Verification Code"}
          </button>
          {fpCodeSent && (
            <>
              <div className="field-group" style={{marginTop:"0.75rem",marginBottom:"0.75rem"}}>
                <label>Verification Code</label>
                <input value={fpCode} onChange={e=>setFpCode(e.target.value)} placeholder="6-digit code" maxLength={6} />
              </div>
              <div className="field-group" style={{marginBottom:"0.75rem"}}>
                <label>New Password</label>
                <PasswordInput value={fpPassword} onChange={e=>setFpPassword(e.target.value)} placeholder="At least 8 characters" />
              </div>
              <div className="field-group" style={{marginBottom:"0.75rem"}}>
                <label>Confirm New Password</label>
                <PasswordInput value={fpConfirm} onChange={e=>setFpConfirm(e.target.value)} placeholder="Re-enter new password" />
              </div>
              <button className="btn-primary" onClick={confirmForgotReset} disabled={fpLoading}>
                {fpLoading ? "Confirming..." : "Confirm Reset Password"}
              </button>
            </>
          )}
        </div>
      )}
      <p className="switch-link">No account? <span onClick={onGotoRegister}>Create one here</span></p>
      <p style={{textAlign:"center",marginTop:"1rem",fontSize:"0.75rem",color:"var(--text-dim)"}}>Head Admin: <strong>brenda</strong> / admin123</p>
    </div></div>
  );
}
// -- Password Strength ---------------------------------------------------------
function getPasswordStrength(pw) {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Weak", color: "#ef4444" };
  if (score === 2) return { score, label: "Fair", color: "#f59e0b" };
  if (score === 3) return { score, label: "Good", color: "#3b82f6" };
  return { score, label: "Strong", color: "#22c55e" };
}

function PasswordStrengthBar({ password }) {
  const { score, label, color } = getPasswordStrength(password);
  if (!password) return null;
  const bars = 4;
  const filled = Math.min(score, bars);
  return (
    <div style={{marginTop:"0.5rem"}}>
      <div style={{display:"flex",gap:"4px",marginBottom:"0.3rem"}}>
        {Array.from({length:bars}).map((_,i)=>(
          <div key={i} style={{flex:1,height:"4px",borderRadius:"999px",background:i<filled?color:"rgba(255,255,255,0.08)",transition:"background 0.2s"}}/>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.73rem"}}>
        <span style={{color:"var(--text-dim)"}}>
          {password.length < 8 ? `${8 - password.length} more character${8-password.length!==1?"s":""} needed` :
           !/[A-Z]/.test(password) ? "Add an uppercase letter" :
           !/[0-9]/.test(password) ? "Add a number" :
           !/[^A-Za-z0-9]/.test(password) ? "Add a special character" : ""}
        </span>
        <span style={{color,fontWeight:600}}>{label}</span>
      </div>
    </div>
  );
}

// -- Register ------------------------------------------------------------------
function RegisterScreen({ onSuccess, onGotoLogin }) {
  const [f, setF] = useState({fullName:"",email:"",username:"",password:"",confirm:"",department:"",role:"user"});
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));

  const validate = () => {
    if (!f.fullName||!f.email||!f.username||!f.password||!f.department) return "All fields are required.";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(f.email)) return "Please enter a valid email address.";
    if (f.username.length < 3) return "Username must be at least 3 characters.";
    if (f.password.length < 8) return "Password must be at least 8 characters.";
    const { score } = getPasswordStrength(f.password);
    if (score < 2) return "Password is too weak. Add uppercase letters, numbers, or symbols.";
    if (f.password !== f.confirm) return "Passwords do not match.";
    return null;
  };

  const handle = async () => {
    setErr("");
    const validationError = validate();
    if (validationError) return setErr(validationError);
    setLoading(true);
    try {
      await api.register({full_name:f.fullName,email:f.email,username:f.username,password:f.password,department:f.department,role:f.role});
      onSuccess();
    } catch(e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const strength = getPasswordStrength(f.password);
  const confirmOk = f.confirm && f.password === f.confirm;
  const confirmBad = f.confirm && f.password !== f.confirm;

  const roles = [{key:"user",icon:"-",label:"User",desc:"Request services"},{key:"staff",icon:"-",label:"Staff",desc:"Verify requests"},{key:"admin",icon:"-",label:"Admin",desc:"Approve requests"}];
  return (
    <div className="auth-wrap"><div className="auth-card wide">
      <div className="auth-logo"><span className="logo-badge">GSO</span><h1>Create Account</h1><p>Fill in your details to register</p></div>
      <div className="field-group"><label>Select Your Role</label></div>
      <div className="role-selector">
        {roles.map(r=>(
          <div key={r.key} className={`role-option ${f.role===r.key?`selected ${r.key}`:""}`} onClick={()=>setF(p=>({...p,role:r.key}))}>
            <div className="role-icon">{r.icon}</div><div className="role-label">{r.label}</div><div className="role-desc">{r.desc}</div>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <div className="field-group"><label>Full Name</label><input autoComplete="off" value={f.fullName} onChange={set("fullName")} placeholder="Juan dela Cruz" /></div>
        <div className="field-group">
          <label>Email</label>
          <input type="email" autoComplete="off" value={f.email} onChange={set("email")} placeholder="juan@gso.edu.ph" />
        </div>
        <div className="field-group"><label>Username</label><input autoComplete="off" value={f.username} onChange={set("username")} placeholder="juandc" /></div>
        <div className="field-group"><label>Department</label><input autoComplete="off" value={f.department} onChange={set("department")} placeholder="Engineering Dept." /></div>
        <div className="field-group">
          <label>Password</label>
          <PasswordInput autoComplete="new-password" value={f.password} onChange={set("password")} placeholder="Min. 8 characters" />
          <PasswordStrengthBar password={f.password} />
        </div>
        <div className="field-group">
          <label>Confirm Password</label>
          <div style={{position:"relative"}}>
            <PasswordInput autoComplete="new-password" value={f.confirm} onChange={set("confirm")} placeholder="********" />
            {confirmOk && <span style={{position:"absolute",right:"0.75rem",top:"50%",transform:"translateY(-50%)",color:"#22c55e",fontSize:"0.85rem",pointerEvents:"none"}}>OK</span>}
            {confirmBad && <span style={{position:"absolute",right:"0.75rem",top:"50%",transform:"translateY(-50%)",color:"#ef4444",fontSize:"0.9rem",pointerEvents:"none"}}>!</span>}
          </div>
          {confirmBad && <div style={{fontSize:"0.73rem",color:"#f87171",marginTop:"0.3rem"}}>Passwords do not match</div>}
        </div>
      </div>
      {err && <div className="err-box">Error: {err}</div>}
      <div className="notice-box">Accounts require <strong>Head Admin</strong> approval. You'll receive a confirmation email.</div>
      <button className="btn-primary" onClick={handle} disabled={loading||strength.score<2||f.password.length<8}>{loading?"Registering...":"Submit Registration"}</button>
      <p className="switch-link">Have an account? <span onClick={onGotoLogin}>Login here</span></p>
    </div></div>
  );
}

// -- User Dashboard ------------------------------------------------------------
function UserDashboard({ currentUser, onLogout, services }) {
  const [tab, setTab] = useState("services");
  const [requests, setRequests] = useState([]); const [notifs, setNotifs] = useState([]); const [viewNotif, setViewNotif] = useState(null);
  const catalog = getServiceCatalog(services);
  const [reqModal, setReqModal] = useState(false); const [svcType, setSvcType] = useState(catalog[0]?.name || "Carpentry");
  const [requestStatusFilter, setRequestStatusFilter] = useState("all");
  const [requestServiceFilter, setRequestServiceFilter] = useState("all");
  const [reqValues, setReqValues] = useState({});
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const [feedbackSubmittingId, setFeedbackSubmittingId] = useState("");
  const [loading, setLoading] = useState(true); const [sending, setSending] = useState(false);
  const [toast, showToast] = useToast(); const [user, setUser] = useState(currentUser);
  const [settings, setSettings] = useState({ required_approvals: 2 });
  const activeService = getServiceMeta(svcType, services);

  const fetchData = useCallback(async () => {
    try {
      const [reqs, nfs, s] = await Promise.all([api.getMyRequests(), api.getNotifications(), api.getSettings()]);
      setRequests(reqs); setNotifs(nfs); setSettings(s);
    } catch(e){console.error(e);} finally{setLoading(false);}
  }, []);
  useEffect(()=>{fetchData();},[fetchData]);
  useEffect(()=>{
    if (!catalog.some(service => service.name === svcType)) {
      setSvcType(catalog[0]?.name || "Carpentry");
      setReqValues({});
    }
  }, [catalog, svcType]);

  const submitRequest = async () => {
    const missing = (activeService.fields || []).some(field => field.required && !String(reqValues[field.key] || "").trim());
    const pendingFeedback = requests.filter(r => r.status==="completed" && !r.feedback_submitted_at).length;
    if (pendingFeedback > 0) {
      showToast("Please submit required feedback for completed requests before creating a new request.","error");
      return;
    }
    if (missing) return;
    setSending(true);
    try {
      await api.submitRequest({ service_id: activeService.id, service_type: activeService.name, details: reqValues });
      showToast("Request submitted! Staff will review shortly."); await fetchData();
      setReqModal(false); setReqValues({});
    } catch(e){showToast(e.message,"error");} finally{setSending(false);}
  };
  const submitFeedback = async (requestId) => {
    const draft = feedbackDrafts[requestId] || {};
    const rating = Number(draft.rating);
    const comment = String(draft.comment || "").trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      showToast("Please select a rating from 1 to 5.","error");
      return;
    }
    if (!comment) {
      showToast("Please enter your feedback comment.","error");
      return;
    }
    setFeedbackSubmittingId(requestId);
    try {
      await api.submitRequestFeedback(requestId, { rating, comment });
      showToast("Feedback submitted. Thank you!");
      setFeedbackDrafts(prev => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      await fetchData();
    } catch (e) {
      showToast(e.message || "Failed to submit feedback.","error");
    } finally {
      setFeedbackSubmittingId("");
    }
  };
  const markRead = async () => { await api.markNotifsRead().catch(()=>{}); setNotifs(p=>p.map(n=>({...n,is_read:1}))); };
  const unread = notifs.filter(n=>!n.is_read).length;
  const userRequestServices = getServiceOptionsForRequests(services, requests);
  const filteredUserRequests = requests.filter(r => (requestStatusFilter==="all" || r.status===requestStatusFilter) && (requestServiceFilter==="all" || r.service_type===requestServiceFilter));
  const activeServices = catalog.filter(service => service.is_active !== false);
  const completedRequests = requests.filter(r => r.status==="completed");
  const pendingFeedbackRequests = completedRequests.filter(r => !r.feedback_submitted_at);
  const pendingFeedbackCount = pendingFeedbackRequests.length;

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div className="dash-brand"><span className="logo-badge sm">GSO</span><span>General Services Office</span></div>
        <div className="dash-user-info">
          <div className="dash-user-meta">
            <div className="user-avatar-small">{user.profile_picture?<img src={user.profile_picture} alt={user.full_name}/>:<span>{user.full_name?.charAt(0).toUpperCase()}</span>}</div>
            <div className="user-details"><p className="user-greeting">{user.full_name}</p><span className="user-dept">{user.department}</span></div>
          </div>
          <button className="btn-ghost" onClick={onLogout}>Logout</button>
        </div>
      </header>
      <div className="dash-body">
        <aside className="sidebar">
          {["profile","services","my-requests","done-service","notifications"].map(t=>(
            <button key={t} className={`sidebar-btn ${tab===t?"active":""}`} onClick={()=>{setTab(t);if(t==="notifications")markRead();}}>
              {t==="profile"&&"\u{1F464} My Profile"}
              {t==="services"&&"\u{1F6E0}\u{FE0F} Request Service"}
              {t==="my-requests"&&"\u{1F4CB} My Requests"}
              {t==="done-service"&&<span style={{display:"flex",alignItems:"center",width:"100%"}}><span>{"\u2705 Done Service"}</span>{pendingFeedbackCount>0&&<span className="notif-dot">{pendingFeedbackCount}</span>}</span>}
              {t==="notifications"&&<span style={{display:"flex",alignItems:"center",width:"100%"}}><span>{"\u{1F514} Notifications"}</span>{unread>0&&<span className="notif-dot">{unread}</span>}</span>}
            </button>
          ))}
          <div className="sidebar-footer"><div className="backend-badge">{"\u{1F7E2} Node.js + MySQL"}</div></div>
        </aside>
        <main className="dash-main">
          {loading?<div className="loading-state">{"\u23F3 Loading..."}</div>:<>
            {tab==="profile"&&<ProfileTab user={user} setUser={setUser} showToast={showToast}/>}
            {tab==="services"&&(
              <div>
                <div className="section-header"><h2>Available Services</h2><p>Select a service to submit a request</p></div>
                {pendingFeedbackCount>0 && <div className="notice-box" style={{marginBottom:"1rem"}}>You have {pendingFeedbackCount} completed request(s) without feedback. Feedback is required before sending a new request.</div>}
                <div className="service-grid">
                  {activeServices.map(service=>(
                    <div key={service.id || service.name} className="service-card" style={{"--accent":service.color}} onClick={()=>{setSvcType(service.name);setReqModal(true);setReqValues({});}}>
                      <div className="svc-icon">{service.icon}</div><div className="svc-name">{service.name}</div><div style={{color:"var(--text-dim)",fontSize:"0.78rem",marginTop:"0.25rem"}}>{service.category || "General"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tab==="my-requests"&&(
              <div>
                <div className="section-header"><h2>My Service Requests</h2><p>{requests.length} total</p></div>
                <div style={{display:"flex",gap:"1rem",flexWrap:"wrap",marginBottom:"1rem"}}>
                  <div className="field-group" style={{maxWidth:"280px",marginBottom:0,flex:"1 1 220px"}}>
                    <label>Status</label>
                    <select value={requestStatusFilter} onChange={e=>setRequestStatusFilter(e.target.value)}>
                      {["all","pending","verified","declined","approved","completed","disapproved"].map(f=>(
                        <option key={f} value={f}>{f.charAt(0).toUpperCase()+f.slice(1)} ({requests.filter(r=>f==="all"||r.status===f).length})</option>
                      ))}
                    </select>
                  </div>
                  <div className="field-group" style={{maxWidth:"280px",marginBottom:0,flex:"1 1 220px"}}>
                    <label>Service Type</label>
                    <select value={requestServiceFilter} onChange={e=>setRequestServiceFilter(e.target.value)}>
                      <option value="all">All Services</option>
                      {userRequestServices.filter(s=>s!=="all").map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                {requests.length===0?<div className="empty-state">No requests yet.</div>:
                  filteredUserRequests.length===0?<div className="empty-state">No requests match this filter.</div>:
                  <div className="requests-list">{filteredUserRequests.map(r=>(
                    <div key={r.id} className={`req-card req-${r.status}`}>
                      <div className="req-top"><div><span className="req-svc">{getServiceMeta(r.service_type, services).icon} {r.service_type}</span>{r.priority_number && <span className="req-priority">{r.priority_number}</span>}</div><Badge status={r.status}/></div>
                      <p className="req-desc">{getRequestDescription(r)}</p>
                      <div className="req-meta"><span>{"\u{1F4CD} "}{getRequestLocation(r)}</span>{getRequestPreferredDate(r)&&<span>{"\u{1F4C5} "}{getRequestPreferredDate(r)}</span>}<span>{"\u{1F550} "}{formatDateTime(r.submitted_at)}</span></div>
                      <ServiceDetailBlock req={r} services={services}/>
                      {r.staff_note&&<div className="staff-note">{"\u{1F6E1}\u{FE0F} Staff: "}{r.staff_note}</div>}
                      <ApprovalTrail req={r} requiredApprovals={settings.required_approvals}/>
                      {r.admin_note&&<div className="admin-note">{"\u2699\uFE0F Final Admin Note: "}{r.admin_note}</div>}
                      {r.status==="completed" && !r.feedback_submitted_at && (
                        <div className="notice-box" style={{marginTop:"0.75rem"}}>
                          <div style={{fontWeight:600,marginBottom:"0.5rem"}}>Feedback Required</div>
                          <div className="field-group" style={{marginBottom:"0.5rem"}}> 
                            <label>Rating (1-5)</label>
                            <select value={(feedbackDrafts[r.id]?.rating) || ""} onChange={e=>setFeedbackDrafts(prev=>({...prev,[r.id]:{...(prev[r.id]||{}),rating:e.target.value}}))}>
                              <option value="">Select rating</option>
                              {[5,4,3,2,1].map(n=><option key={n} value={n}>{n} Star{n>1?"s":""}</option>)}
                            </select>
                          </div>
                          <div className="field-group" style={{marginBottom:"0.5rem"}}>
                            <label>Feedback</label>
                            <textarea rows={3} value={(feedbackDrafts[r.id]?.comment) || ""} onChange={e=>setFeedbackDrafts(prev=>({...prev,[r.id]:{...(prev[r.id]||{}),comment:e.target.value}}))} placeholder="Describe service quality, timeliness, and staff assistance"/>
                          </div>
                          <button className="btn-primary" style={{maxWidth:"220px"}} disabled={feedbackSubmittingId===r.id} onClick={()=>submitFeedback(r.id)}>{feedbackSubmittingId===r.id?"Submitting...":"Submit Feedback"}</button>
                        </div>
                      )}
                      {r.feedback_submitted_at && (
                        <div className="staff-note" style={{marginTop:"0.75rem"}}>Feedback: {r.feedback_rating || "-"}/5 - {r.feedback_comment} - {formatDateTime(r.feedback_submitted_at)}</div>
                      )}
                    </div>
                  ))}</div>}
              </div>
            )}
            {tab==="done-service"&&(
              <div>
                <div className="section-header"><h2>Done Services</h2><p>View completed requests and submit pending feedback</p></div>
                {pendingFeedbackCount>0 && <div className="notice-box" style={{marginBottom:"1rem"}}>You have {pendingFeedbackCount} pending feedback item(s). Please submit all feedback.</div>}
                {completedRequests.length===0?<div className="empty-state">No completed services yet.</div>:
                  <div className="requests-list">{completedRequests.map(r=>(
                    <div key={r.id} className="req-card req-completed">
                      <div className="req-top"><div><span className="req-svc">{getServiceMeta(r.service_type, services).icon} {r.service_type}</span>{r.priority_number && <span className="req-priority">{r.priority_number}</span>}</div><Badge status={r.status}/></div>
                      <p className="req-desc">{getRequestDescription(r)}</p>
                      <div className="req-meta"><span>Completed: {r.completed_at ? formatDateTime(r.completed_at) : formatDateTime(r.submitted_at)}</span>{r.completed_by_name&&<span>By: {r.completed_by_name}</span>}</div>
                      {!r.feedback_submitted_at ? (
                        <div className="notice-box" style={{marginTop:"0.75rem"}}>
                          <div style={{fontWeight:600,marginBottom:"0.5rem"}}>Feedback Required</div>
                          <div className="field-group" style={{marginBottom:"0.5rem"}}>
                            <label>Rating (1-5)</label>
                            <select value={(feedbackDrafts[r.id]?.rating) || ""} onChange={e=>setFeedbackDrafts(prev=>({...prev,[r.id]:{...(prev[r.id]||{}),rating:e.target.value}}))}>
                              <option value="">Select rating</option>
                              {[5,4,3,2,1].map(n=><option key={n} value={n}>{n} Star{n>1?"s":""}</option>)}
                            </select>
                          </div>
                          <div className="field-group" style={{marginBottom:"0.5rem"}}>
                            <label>Feedback</label>
                            <textarea rows={3} value={(feedbackDrafts[r.id]?.comment) || ""} onChange={e=>setFeedbackDrafts(prev=>({...prev,[r.id]:{...(prev[r.id]||{}),comment:e.target.value}}))} placeholder="Describe service quality, timeliness, and staff assistance"/>
                          </div>
                          <button className="btn-primary" style={{maxWidth:"220px"}} disabled={feedbackSubmittingId===r.id} onClick={()=>submitFeedback(r.id)}>{feedbackSubmittingId===r.id?"Submitting...":"Send Feedback"}</button>
                        </div>
                      ) : (
                        <div className="staff-note" style={{marginTop:"0.75rem"}}>Feedback sent: {r.feedback_rating || "-"}/5 - {r.feedback_comment} - {formatDateTime(r.feedback_submitted_at)}</div>
                      )}
                    </div>
                  ))}</div>}
              </div>
            )}
            {tab==="notifications"&&(
              <div>
                <div className="section-header"><h2>Notifications</h2></div>
                {notifs.length===0?<div className="empty-state">{"\u{1F515} No notifications."}</div>:
                  <div className="notif-list">{notifs.map(n=>(
                    <div key={n.id} className={`notif-item ${n.is_read?"":"unread"}`} onClick={()=>setViewNotif(n)} style={{cursor:"pointer"}} title="Click to view">
                      <div className="notif-msg">{n.message}</div>
                      <div className="notif-time">{formatDateTime(n.created_at)}</div>
                    </div>
                  ))}</div>}
              </div>
            )}
          </>}
        </main>
      </div>
      {reqModal&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setReqModal(false)}>
          <div className="modal">
            <div className="modal-header"><h3>{activeService.icon} Request {activeService.name}</h3><button className="modal-close" onClick={()=>setReqModal(false)}>x</button></div>
            <div className="modal-body">
              <div className="field-group">
                <label>Service Type</label>
                <select value={svcType} onChange={e=>{setSvcType(e.target.value);setReqValues({});}}>
                  {activeServices.map(service => <option key={service.id || service.name} value={service.name}>{service.name}</option>)}
                </select>
              </div>
              <DynamicServiceForm service={activeService} values={reqValues} onChange={(key, value) => setReqValues(current => ({ ...current, [key]: value }))} />
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={()=>setReqModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={submitRequest} disabled={sending||pendingFeedbackCount>0||(activeService.fields || []).some(field => field.required && !String(reqValues[field.key] || "").trim())}>{sending?"Submitting...":"Submit Request"}</button>
            </div>
          </div>
        </div>
      )}
      {viewNotif&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setViewNotif(null)}>
          <div className="modal" style={{maxWidth:"640px"}}>
            <div className="modal-header"><h3>Notification</h3><button className="modal-close" onClick={()=>setViewNotif(null)}>x</button></div>
            <div className="modal-body">
              <div className="req-desc" style={{marginBottom:"0.75rem"}}>{viewNotif.message}</div>
              <div className="notif-time">{formatDateTime(viewNotif.created_at)}</div>
            </div>
            <div className="modal-footer"><button className="btn-ghost" onClick={()=>setViewNotif(null)}>Close</button></div>
          </div>
        </div>
      )}
      <Toast toast={toast}/>
    </div>
  );
}
function StaffDashboard({ currentUser, onLogout, services }) {
  const [tab, setTab] = useState("inbox");
  const [requests, setRequests] = useState([]); const [myReqs, setMyReqs] = useState([]);
  const [feedbackList, setFeedbackList] = useState([]);
  const [pendingFeedbackList, setPendingFeedbackList] = useState([]);
  const [notifs, setNotifs] = useState([]); const [analytics, setAnalytics] = useState(null); const [viewNotif, setViewNotif] = useState(null);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true); const [actionLoading, setActionLoading] = useState(null);
  const [viewReq, setViewReq] = useState(null); const [actionNote, setActionNote] = useState(""); const [actionPriority, setActionPriority] = useState("");
  const catalog = getServiceCatalog(services);
  const [reqModal, setReqModal] = useState(false); const [svcType, setSvcType] = useState(catalog[0]?.name || "Carpentry");
  const [inboxServiceFilter, setInboxServiceFilter] = useState("all");
  const [readyServiceFilter, setReadyServiceFilter] = useState("all");
  const [completedServiceFilter, setCompletedServiceFilter] = useState("all");
  const [allRequestsServiceFilter, setAllRequestsServiceFilter] = useState("all");
  const [myRequestsServiceFilter, setMyRequestsServiceFilter] = useState("all");
  const [feedbackServiceFilter, setFeedbackServiceFilter] = useState("all");
  const [reqValues, setReqValues] = useState({});
  const [sending, setSending] = useState(false);
  const [reminderLoadingId, setReminderLoadingId] = useState("");
  const [toast, showToast] = useToast(); const [user, setUser] = useState(currentUser);
  const activeService = getServiceMeta(svcType, services);

  const fetchAll = useCallback(async (activeTab = tab, force = false) => {
    setLoading(true);
    try {
      const [reqs, nfs] = await Promise.all([api.getStaffRequests(), api.getNotifications()]);
      setRequests(reqs);
      setNotifs(nfs);

      if (force || activeTab === "my-requests" || myReqs.length === 0) {
        const myR = await api.getMyRequests();
        setMyReqs(myR);
      }

      if (force || activeTab === "analytics") {
        const analy = await api.getStaffAnalytics();
        setAnalytics(analy);
      }

      if (force || activeTab === "feedback-storage") {
        const [fb, pendingFb] = await Promise.all([
          api.getStaffFeedback(),
          api.getStaffPendingFeedback(feedbackServiceFilter),
        ]);
        setFeedbackList(fb);
        setPendingFeedbackList(pendingFb);
      }
    } catch(e){console.error(e);} finally{setLoading(false);}
  },[tab, myReqs.length]);
  useEffect(()=>{fetchAll(tab, false);},[fetchAll, tab]);
  useEffect(()=>{
    if (!catalog.some(service => service.name === svcType)) {
      setSvcType(catalog[0]?.name || "Carpentry");
      setReqValues({});
    }
  }, [catalog, svcType]);

  const handleAction = async (id, status, priorityOverride) => {
    const priorityToUse = status === "verified" ? String(priorityOverride ?? actionPriority).trim() : undefined;
    if (status === "verified" && !priorityToUse) {
      showToast("Priority number is required before verifying", "error");
      return;
    }
    setActionLoading(id+status);
    try {
      await api.staffUpdateRequest(id, status, actionNote||undefined, priorityToUse);
      showToast(
        status==="verified" ? "Verified and forwarded to Admin" :
        status==="declined" ? "Request declined" :
        status==="completed" ? "Job marked as done" :
        "Kept pending"
      );
      await fetchAll(tab, true); setViewReq(null); setActionNote(""); setActionPriority("");
    } catch(e){showToast(e.message,"error");} finally{setActionLoading(null);}
  };
  const handleSendFeedbackReminder = async (requestId) => {
    setReminderLoadingId(requestId);
    try {
      const res = await api.sendStaffFeedbackReminder(requestId);
      showToast(res?.message || "Feedback reminder sent.");
      await fetchAll("feedback-storage", true);
    } catch (e) {
      showToast(e.message || "Failed to send reminder.", "error");
    } finally {
      setReminderLoadingId("");
    }
  };

  const submitOwnReq = async () => {
    const missing = (activeService.fields || []).some(field => field.required && !String(reqValues[field.key] || "").trim());
    if (missing) return; setSending(true);
    try { await api.submitRequest({ service_id: activeService.id, service_type: activeService.name, details: reqValues }); showToast("Request submitted!"); await fetchAll(tab, true); setReqModal(false); setReqValues({}); }
    catch(e){showToast(e.message,"error");} finally{setSending(false);}
  };
  const markRead = async () => { await api.markNotifsRead().catch(()=>{}); setNotifs(p=>p.map(n=>({...n,is_read:1}))); };
  const unread = notifs.filter(n=>!n.is_read).length;
  const pendingCount = requests.filter(r=>r.status==="pending").length;
  const approvedCount = requests.filter(r=>r.status==="approved").length;
  const completedCount = requests.filter(r=>r.status==="completed").length;
  const getServiceOptions = (list) => getServiceOptionsForRequests(services, list);
  const pendingRequests = requests.filter(r=>r.status==="pending");
  const approvedRequests = requests.filter(r=>r.status==="approved");
  const completedRequests = requests.filter(r=>r.status==="completed");
  const inboxServices = getServiceOptions(pendingRequests);
  const readyServices = getServiceOptions(approvedRequests);
  const completedServices = getServiceOptions(completedRequests);
  const allRequestServices = getServiceOptions(requests);
  const myRequestServices = getServiceOptions(myReqs);
  const filteredPending = pendingRequests.filter(r => inboxServiceFilter==="all" || r.service_type===inboxServiceFilter);
  const filteredApproved = requests.filter(r => r.status==="approved" && (readyServiceFilter==="all" || r.service_type===readyServiceFilter));
  const filteredCompleted = completedRequests.filter(r => completedServiceFilter==="all" || r.service_type===completedServiceFilter);
  const filtered = requests.filter(r => (filter==="all" || r.status===filter) && (allRequestsServiceFilter==="all" || r.service_type===allRequestsServiceFilter));
  const filteredMyRequests = myReqs.filter(r => myRequestsServiceFilter==="all" || r.service_type===myRequestsServiceFilter);
  const feedbackServices = getServiceOptionsForRequests(services, feedbackList);
  const filteredFeedback = feedbackList.filter(r => feedbackServiceFilter==="all" || r.service_type===feedbackServiceFilter);
  const filteredPendingFeedback = pendingFeedbackList.filter(r => feedbackServiceFilter==="all" || r.service_type===feedbackServiceFilter);
  const staffFeedbackSubmitted = requests.filter(r => !!r.feedback_submitted_at).length;
  const staffFeedbackPending = requests.filter(r => r.status==="completed" && !r.feedback_submitted_at).length;
  const staffFeedbackRatings = requests.map(r => Number(r.feedback_rating)).filter(v => Number.isFinite(v) && v > 0);
  const staffFeedbackAvg = staffFeedbackRatings.length ? (staffFeedbackRatings.reduce((a,b)=>a+b,0) / staffFeedbackRatings.length).toFixed(1) : "-";
  const staffStatusChart = analytics ? [
    { label: "Pending", value: analytics.stats.pending, color: "#f59e0b" },
    { label: "Verified", value: analytics.stats.verified, color: "#38bdf8" },
    { label: "Approved", value: analytics.stats.approved, color: "#4ade80" },
    { label: "Completed", value: analytics.stats.completed, color: "#2dd4bf" },
    { label: "Declined", value: analytics.stats.declined, color: "#f87171" },
    { label: "Awaiting Admin1", value: analytics.stats.admin1_pending, color: "#a78bfa" },
  ] : [];
  const staffServiceChart = analytics ? (analytics.byService || []).slice(0, 6).map((item, index) => ({
    label: item.service_type,
    value: item.count,
    color: ["#60a5fa", "#38bdf8", "#a78bfa", "#4ade80", "#f59e0b", "#f87171"][index % 6],
  })) : [];

  return (
    <div className="dashboard staff-theme">
      <header className="dash-header">
        <div className="dash-brand"><span className="logo-badge sm staff">GSO</span><span>Staff Panel</span></div>
        <div className="dash-user-info">
          <div className="dash-user-meta">
            <div className="user-avatar-small">{user.profile_picture?<img src={user.profile_picture} alt={user.full_name}/>:<span>{user.full_name?.charAt(0).toUpperCase()}</span>}</div>
            <div className="user-details"><p className="user-greeting">{user.full_name}</p><span className="user-dept">Staff</span></div>
          </div>
          <button className="btn-ghost" onClick={()=>fetchAll(tab, true)} style={{fontSize:"0.8rem",padding:"0.4rem 0.8rem"}}>Refresh</button>
          <button className="btn-ghost" onClick={onLogout}>Logout</button>
        </div>
      </header>
      <div className="dash-body">
        <aside className="sidebar">
          {[
            {id:"inbox",label:"Inbox",icon:"📥",badge:pendingCount},
            {id:"approved-ready",label:"Ready for Service",icon:"✅",badge:approvedCount},
            {id:"completed-jobs",label:"Job Done",icon:"🏁",badge:completedCount},
            {id:"all-requests",label:"All Requests",icon:"📋"},
            {id:"my-service",label:"Request Service",icon:"🛠️"},
            {id:"my-requests",label:"My Requests",icon:"🧾"},
            {id:"analytics",label:"Analytics",icon:"📊"},
            {id:"feedback-storage",label:"Feedback Storage",icon:"💬"},
            {id:"notifications",label:"Notifications",icon:"🔔",badge:unread},
            {id:"profile",label:"My Profile",icon:"👤"},
          ].map(({id,label,icon,badge})=>(
            <button key={id} className={`sidebar-btn ${tab===id?"active":""}`} onClick={()=>{setTab(id);if(id==="notifications")markRead();}}>
              <span style={{display:"flex",alignItems:"center",width:"100%"}}>
                <span>{icon} {label}</span>
                {badge>0&&<span className="notif-dot">{badge}</span>}
              </span>
            </button>
          ))}
          <div className="sidebar-footer"><div className="backend-badge">Node.js + MySQL</div></div>
        </aside>
        <main className="dash-main">
          {loading?<div className="loading-state">Loading...</div>:<>
            {tab==="inbox"&&(
              <div>
                <div className="section-header"><h2>Service Request Inbox</h2><p>Verify, keep pending, or decline user requests</p></div>
                <div className="field-group" style={{maxWidth:"280px",marginBottom:"1rem"}}>
                  <label>Service Type</label>
                  <select value={inboxServiceFilter} onChange={e=>setInboxServiceFilter(e.target.value)}>
                    <option value="all">All Services</option>
                    {inboxServices.filter(s=>s!=="all").map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {pendingCount===0?<div className="empty-state">No pending requests in inbox.</div>:
                  filteredPending.length===0?<div className="empty-state">No pending requests for this service.</div>:
                  <div className="requests-list">{filteredPending.map(r=>(
                    <div key={r.id} className="req-card req-pending clickable" onClick={()=>{setViewReq(r);setActionNote("");setActionPriority(r.priority_number || "");}}>
                      <div className="req-top"><div><span className="req-svc">{getServiceMeta(r.service_type, services).icon} {r.service_type}</span>{r.priority_number && <span className="req-priority">{r.priority_number}</span>}<span className="req-user">by {r.user_name} - {r.department}</span></div><Badge status={r.status}/></div>
                      <p className="req-desc">{r.description}</p>
                      <div className="req-meta"><span>Location: {r.location}</span>{r.preferred_date&&<span>Preferred: {r.preferred_date}</span>}<span>Submitted: {formatDateTime(r.submitted_at)}</span></div>
                      <div className="req-actions" onClick={e=>e.stopPropagation()}>
                        <button className="view-btn" onClick={()=>{setViewReq(r);setActionNote("");setActionPriority(r.priority_number || "");}}>Review</button>
                        <button className="btn-verify sm" disabled={!!actionLoading} onClick={()=>{
                          const p = window.prompt("Enter priority number (example: J9-01-2026):", r.priority_number || "");
                          if (p===null) return;
                          handleAction(r.id,"verified",p);
                        }}>Verify</button>
                        <button className="btn-reject sm" disabled={!!actionLoading} onClick={()=>handleAction(r.id,"declined")}>Decline</button>
                      </div>
                    </div>
                  ))}</div>}
              </div>
            )}
            {tab==="approved-ready"&&(
              <div>
                <div className="section-header"><h2>Ready for Service</h2><p>Requests fully approved by Admin - ready to carry out</p></div>
                <div className="field-group" style={{maxWidth:"280px",marginBottom:"1rem"}}>
                  <label>Service Type</label>
                  <select value={readyServiceFilter} onChange={e=>setReadyServiceFilter(e.target.value)}>
                    <option value="all">All Services</option>
                    {readyServices.filter(s=>s!=="all").map(s=>(
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                {approvedCount===0?<div className="empty-state">No approved requests yet.</div>:
                  filteredApproved.length===0?<div className="empty-state">No approved requests for this service.</div>:
                  <div className="requests-list">{filteredApproved.map(r=>(
                    <div key={r.id} className="req-card req-approved clickable compact" onClick={()=>{setViewReq(r);setActionNote("");}}>
                      <div className="req-top"><div><span className="req-svc">{getServiceMeta(r.service_type, services).icon} {r.service_type}</span>{r.priority_number && <span className="req-priority">{r.priority_number}</span>}<span className="req-user">by {r.user_name} - {r.department}</span></div><Badge status={r.status}/></div>
                      <p className="req-desc">{r.description}</p>
                      <div className="req-meta"><span>Location: {r.location}</span>{r.preferred_date&&<span>Preferred: {r.preferred_date}</span>}<span>Time: {r.resolved_at ? formatDateTime(r.resolved_at) : formatDateTime(r.submitted_at)}</span></div>
                      <div className="compact-hint">Click to view approved details</div>
                    </div>
                  ))}</div>}
              </div>
            )}
            {tab==="completed-jobs"&&(
              <div>
                <div className="section-header"><h2>Job Done</h2><p>Requests already completed by staff</p></div>
                <div className="field-group" style={{maxWidth:"280px",marginBottom:"1rem"}}>
                  <label>Service Type</label>
                  <select value={completedServiceFilter} onChange={e=>setCompletedServiceFilter(e.target.value)}>
                    <option value="all">All Services</option>
                    {completedServices.filter(s=>s!=="all").map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {completedCount===0?<div className="empty-state">No completed jobs yet.</div>:
                  filteredCompleted.length===0?<div className="empty-state">No completed jobs for this service.</div>:
                  <div className="requests-list">{filteredCompleted.map(r=>(
                    <div key={r.id} className="req-card req-completed clickable compact" onClick={()=>{setViewReq(r);setActionNote("");}}>
                      <div className="req-top"><div><span className="req-svc">{getServiceMeta(r.service_type, services).icon} {r.service_type}</span>{r.priority_number && <span className="req-priority">{r.priority_number}</span>}<span className="req-user">by {r.user_name} - {r.department}</span></div><Badge status={r.status}/></div>
                      <p className="req-desc">{r.description}</p>
                      <div className="req-meta">
                        <span>Location: {r.location}</span>
                        <span>Completed: {r.completed_at ? formatDateTime(r.completed_at) : formatDateTime(r.submitted_at)}</span>
                        {r.completed_by_name&&<span>By: {r.completed_by_name}</span>}
                      </div>
                      <div className="compact-hint">Click to view completed job details</div>
                    </div>
                  ))}</div>}
              </div>
            )}
            {tab==="all-requests"&&(
              <div>
                <div className="section-header"><h2>All Requests</h2></div>
                <div style={{display:"flex",gap:"1rem",flexWrap:"wrap",marginBottom:"1rem"}}>
                  <div className="field-group" style={{maxWidth:"280px",marginBottom:0,flex:"1 1 220px"}}>
                    <label>Status</label>
                    <select value={filter} onChange={e=>setFilter(e.target.value)}>
                      {["all","pending","verified","declined","approved","completed","disapproved"].map(f=>(
                        <option key={f} value={f}>{f.charAt(0).toUpperCase()+f.slice(1)} ({requests.filter(r=>f==="all"||r.status===f).length})</option>
                      ))}
                    </select>
                  </div>
                  <div className="field-group" style={{maxWidth:"280px",marginBottom:0,flex:"1 1 220px"}}>
                    <label>Service Type</label>
                    <select value={allRequestsServiceFilter} onChange={e=>setAllRequestsServiceFilter(e.target.value)}>
                      <option value="all">All Services</option>
                      {allRequestServices.filter(s=>s!=="all").map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                {filtered.length===0?<div className="empty-state">No requests.</div>:
                  <div className="requests-list">{filtered.map(r=>(
                    <div key={r.id} className={`req-card req-${r.status}`}>
                      <div className="req-top"><div><span className="req-svc">{getServiceMeta(r.service_type, services).icon} {r.service_type}</span>{r.priority_number && <span className="req-priority">{r.priority_number}</span>}<span className="req-user">by {r.user_name}</span></div><Badge status={r.status}/></div>
                      <p className="req-desc">{r.description}</p>
                      <div className="req-meta"><span>Location: {r.location}</span><span>Submitted: {formatDateTime(r.submitted_at)}</span></div>
                      {r.staff_note&&<div className="staff-note">Note: {r.staff_note}</div>}
                      <ApprovalTrail req={r} requiredApprovals={2}/>
                    </div>
                  ))}</div>}
              </div>
            )}
            {tab==="my-service"&&(
              <div>
                <div className="section-header"><h2>Request a Service</h2><p>Staff can also submit service requests</p></div>
                <div className="service-grid">
                  {catalog.filter(service => service.is_active !== false).map(service=>(
                    <div key={service.id || service.name} className="service-card" style={{"--accent":service.color}} onClick={()=>{setSvcType(service.name);setReqModal(true);setReqValues({});}}>
                      <div className="svc-icon">{service.icon}</div><div className="svc-name">{service.name}</div><div style={{color:"var(--text-dim)",fontSize:"0.78rem",marginTop:"0.25rem"}}>{service.category || "General"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tab==="my-requests"&&(
              <div>
                <div className="section-header"><h2>My Requests</h2></div>
                <div className="field-group" style={{maxWidth:"280px",marginBottom:"1rem"}}>
                  <label>Service Type</label>
                  <select value={myRequestsServiceFilter} onChange={e=>setMyRequestsServiceFilter(e.target.value)}>
                    <option value="all">All Services</option>
                    {myRequestServices.filter(s=>s!=="all").map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {myReqs.length===0?<div className="empty-state">No requests yet.</div>:
                  filteredMyRequests.length===0?<div className="empty-state">No requests for this service.</div>:
                  <div className="requests-list">{filteredMyRequests.map(r=>(
                    <div key={r.id} className={`req-card req-${r.status}`}>
                      <div className="req-top"><div><span className="req-svc">{getServiceMeta(r.service_type, services).icon} {r.service_type}</span>{r.priority_number && <span className="req-priority">{r.priority_number}</span>}</div><Badge status={r.status}/></div>
                      <p className="req-desc">{r.description}</p>
                      <div className="req-meta"><span>Location: {r.location}</span><span>Submitted: {formatDateTime(r.submitted_at)}</span></div>
                      <ApprovalTrail req={r} requiredApprovals={2}/>
                    </div>
                  ))}</div>}
              </div>
            )}
            {tab==="analytics"&&analytics&&(
              <div className="overview-shell">
                <div className="section-header"><h2>Analytics</h2><p>Track request flow, workload, and service demand.</p></div>

                <div className="overview-section">
                  <div className="overview-title">
                    <div>
                      <h3>Staff Summary</h3>
                      <p>Quick numbers to understand what needs attention first.</p>
                    </div>
                  </div>
                  <div className="overview-top-grid">
                    {[
                      { label: "Total Requests", value: analytics.stats.total, note: `${analytics.stats.pending} pending review`, color: "#60a5fa" },
                      { label: "Ready for Service", value: analytics.stats.approved, note: `${analytics.stats.completed} completed`, color: "#4ade80" },
                      { label: "Needs Admin", value: analytics.stats.verified, note: `${analytics.stats.admin1_pending} awaiting admin 1`, color: "#38bdf8" },
                      { label: "Declined", value: analytics.stats.declined, note: "Requests stopped by staff", color: "#f87171" },
                    ].map(item => (
                      <div className="overview-kpi" key={item.label}>
                        <div className="kpi-label">{item.label}</div>
                        <div className="kpi-value" style={{ color: item.color }}>{item.value}</div>
                        <div className="kpi-note">{item.note}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="viz-grid">
                  <div className="chart-panel">
                    <h4>Request Status Flow</h4>
                    <p>See where requests are currently sitting in the staff workflow.</p>
                    <HorizontalBarChart items={staffStatusChart} />
                  </div>

                  <div className="chart-panel">
                    <h4>Service Demand</h4>
                    <p>Top requested service types handled by the office.</p>
                    <DonutChart items={staffServiceChart.length ? staffServiceChart : [{ label: "No Data", value: 1, color: "rgba(255,255,255,0.12)" }]} totalLabel="Services" />
                  </div>
                </div>

                <div className="overview-section">
                  <div className="overview-title">
                    <div>
                      <h3>Core + Feedback Metrics</h3>
                      <p>Only key workflow and feedback numbers.</p>
                    </div>
                  </div>
                  <div className="stats-grid">
                    {[
                      {lbl:"Total",num:analytics.stats.total,color:"#93c5fd",bg:"rgba(59,130,246,0.1)",bc:"rgba(59,130,246,0.3)"},
                      {lbl:"Pending",num:analytics.stats.pending,color:"#fbbf24",bg:"rgba(245,158,11,0.1)",bc:"rgba(245,158,11,0.3)"},
                      {lbl:"Completed",num:analytics.stats.completed,color:"#5eead4",bg:"rgba(20,184,166,0.1)",bc:"rgba(20,184,166,0.3)"},
                      {lbl:"Feedback Submitted",num:staffFeedbackSubmitted,color:"#4ade80",bg:"rgba(34,197,94,0.1)",bc:"rgba(34,197,94,0.3)"},
                      {lbl:"Feedback Pending",num:staffFeedbackPending,color:"#fb7185",bg:"rgba(244,63,94,0.1)",bc:"rgba(244,63,94,0.3)"},
                      {lbl:"Avg Rating",num:staffFeedbackAvg,color:"#a78bfa",bg:"rgba(139,92,246,0.1)",bc:"rgba(139,92,246,0.3)"},
                    ].map(s=><div key={s.lbl} className="stat-card" style={{background:s.bg,border:`1px solid ${s.bc}`}}><span className="num" style={{color:s.color}}>{s.num}</span><div className="lbl">{s.lbl}</div></div>)}
                  </div>
                </div>
              </div>
            )}
            {tab==="feedback-storage"&&(
              <div>
                <div className="section-header"><h2>Feedback Storage</h2><p>Locate users with missing feedback and send reminders</p></div>
                <div className="field-group" style={{maxWidth:"280px",marginBottom:"1rem"}}>
                  <label>Service Type</label>
                  <select value={feedbackServiceFilter} onChange={e=>setFeedbackServiceFilter(e.target.value)}>
                    <option value="all">All Services</option>
                    {feedbackServices.filter(s=>s!=="all").map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="overview-section" style={{marginBottom:"1rem"}}>
                  <div className="overview-title"><div><h3>Pending Feedback Follow-up</h3><p>Users who completed services but still have no feedback.</p></div></div>
                  {filteredPendingFeedback.length===0 ? <div className="empty-state">No pending feedback users.</div> : (
                    <div className="requests-list">{filteredPendingFeedback.map(r=>(
                      <div key={r.id} className="req-card req-pending">
                        <div className="req-top"><div><span className="req-svc">{getServiceMeta(r.service_type, services).icon} {r.service_type}</span><span className="req-user">by {r.user_name} - {r.department}</span></div><Badge status={r.status}/></div>
                        <div className="req-meta"><span>Email: {r.user_email || "No email"}</span><span>Completed: {r.completed_at ? formatDateTime(r.completed_at) : formatDateTime(r.submitted_at)}</span></div>
                        <div className="req-actions" style={{marginTop:"0.75rem"}}>
                          <button className="btn-verify sm" disabled={reminderLoadingId===r.id} onClick={()=>handleSendFeedbackReminder(r.id)}>
                            {reminderLoadingId===r.id ? "Sending..." : "Send Reminder"}
                          </button>
                        </div>
                      </div>
                    ))}</div>
                  )}
                </div>

                <div className="overview-section">
                  <div className="overview-title"><div><h3>Submitted Feedback</h3><p>Feedback records already sent by users.</p></div></div>
                  {filteredFeedback.length===0?<div className="empty-state">No feedback submitted yet.</div>:
                    <div className="requests-list">{filteredFeedback.map(r=>(
                      <div key={r.id} className="req-card req-completed">
                        <div className="req-top"><div><span className="req-svc">{getServiceMeta(r.service_type, services).icon} {r.service_type}</span><span className="req-user">by {r.user_name} - {r.department}</span></div><Badge status={r.status}/></div>
                        <div className="req-meta"><span>Rating: {r.feedback_rating || "-"}/5</span><span>{formatDateTime(r.feedback_submitted_at)}</span></div>
                        <p className="req-desc" style={{marginTop:"0.5rem"}}>{r.feedback_comment}</p>
                        <div className="req-meta"><span>Request ID: {r.id}</span>{r.completed_by_name&&<span>Handled by: {r.completed_by_name}</span>}</div>
                      </div>
                    ))}</div>}
                </div>
              </div>
            )}
            {tab==="notifications"&&(
              <div>
                <div className="section-header"><h2>Notifications</h2></div>
                {notifs.length===0?<div className="empty-state">No notifications.</div>:
                  <div className="notif-list">{notifs.map(n=>(
                    <div key={n.id} className={`notif-item ${n.is_read?"":"unread"}`} onClick={()=>setViewNotif(n)} style={{cursor:"pointer"}} title="Click to view">
                      <div className="notif-msg">{n.message}</div><div className="notif-time">{formatDateTime(n.created_at)}</div>
                    </div>
                  ))}</div>}
              </div>
            )}
            {tab==="profile"&&<ProfileTab user={user} setUser={setUser} showToast={showToast}/>}
          </>}
        </main>
      </div>

      {viewReq&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setViewReq(null)}>
          <div className="modal modal-lg">
            <div className="modal-header"><h3>{viewReq.status==="approved" ? "Approved Request Details" : viewReq.status==="completed" ? "Completed Job Details" : "Review Request"}</h3><button className="modal-close" onClick={()=>setViewReq(null)}>x</button></div>
            <div className="modal-body">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem"}}>
                <strong style={{fontSize:"1.05rem"}}>{getServiceMeta(viewReq.service_type, services).icon} {viewReq.service_type}{viewReq.priority_number ? ` - ${viewReq.priority_number}` : ""}</strong>
                <Badge status={viewReq.status}/>
              </div>
              <div className="detail-grid">
                <div className="detail-item"><div className="detail-label">Requester</div><div className="detail-value">{viewReq.user_name}</div></div>
                <div className="detail-item"><div className="detail-label">Department</div><div className="detail-value">{viewReq.department}</div></div>
                <div className="detail-item"><div className="detail-label">Email</div><div className="detail-value">{viewReq.user_email}</div></div>
                <div className="detail-item"><div className="detail-label">Location</div><div className="detail-value">{viewReq.location}</div></div>
                <div className="detail-item"><div className="detail-label">Submitted</div><div className="detail-value">{formatDateTime(viewReq.submitted_at)}</div></div>
                <div className="detail-item"><div className="detail-label">Preferred Date</div><div className="detail-value">{viewReq.preferred_date||"-"}</div></div>
                <div className="detail-item full"><div className="detail-label">Description</div><div className="detail-value">{viewReq.description}</div></div>
              </div>
              <ServiceDetailBlock req={viewReq} services={services}/>
              {viewReq.staff_note&&<div className="staff-note" style={{marginBottom:"0.75rem"}}>Staff Note: {viewReq.staff_note}</div>}
              {(viewReq.status==="approved" || viewReq.admin1_action || viewReq.admin2_action) && <ApprovalTrail req={viewReq} requiredApprovals={2}/>}
              {viewReq.status==="approved"&&(
                <>
                  <div style={{marginTop:"0.9rem",fontSize:"0.85rem",color:"var(--text-muted)"}}>
                    Ready for service since: {viewReq.resolved_at ? formatDateTime(viewReq.resolved_at) : "-"}
                  </div>
                  <div style={{display:"flex",gap:"0.75rem",marginTop:"1rem"}}>
                    <button className="btn-approve" style={{flex:1}} disabled={!!actionLoading} onClick={()=>handleAction(viewReq.id,"completed")}>
                      {actionLoading===viewReq.id+"completed"?"...":"Mark as Done"}
                    </button>
                  </div>
                </>
              )}
              {viewReq.status==="completed"&&(
                <div style={{marginTop:"0.9rem",fontSize:"0.85rem",color:"var(--text-muted)"}}>
                  Completed: {viewReq.completed_at ? formatDateTime(viewReq.completed_at) : "-"}{viewReq.completed_by_name ? ` by ${viewReq.completed_by_name}` : ""}
                </div>
              )}
              {viewReq.status==="pending"&&(
                <>
                  <div className="field-group"><label>Priority Number (required for verify)</label><input value={actionPriority} onChange={e=>setActionPriority(e.target.value)} placeholder="e.g. J9-01-2026" /></div>
                  <div className="field-group"><label>Staff Note (optional)</label><textarea value={actionNote} onChange={e=>setActionNote(e.target.value)} placeholder="Add a note for the user and admin..." rows={2}/></div>
                  <div style={{display:"flex",gap:"0.75rem"}}>
                    <button className="btn-verify" style={{flex:1}} disabled={!!actionLoading} onClick={()=>handleAction(viewReq.id,"verified")}>{actionLoading===viewReq.id+"verified"?"...":"Verify and Forward to Admin"}</button>
                    <button className="btn-ghost" style={{flex:1}} disabled={!!actionLoading} onClick={()=>handleAction(viewReq.id,"pending")}>{actionLoading===viewReq.id+"pending"?"...":"Keep Pending"}</button>
                    <button className="btn-reject" style={{flex:1}} disabled={!!actionLoading} onClick={()=>handleAction(viewReq.id,"declined")}>{actionLoading===viewReq.id+"declined"?"...":"Decline"}</button>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer"><button className="btn-ghost" onClick={()=>setViewReq(null)}>Close</button></div>
          </div>
        </div>
      )}

      {reqModal&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setReqModal(false)}>
          <div className="modal">
            <div className="modal-header"><h3>{activeService.icon} Request {activeService.name}</h3><button className="modal-close" onClick={()=>setReqModal(false)}>x</button></div>
            <div className="modal-body">
              <div className="field-group"><label>Service</label><select value={svcType} onChange={e=>{setSvcType(e.target.value);setReqValues({});}}>{catalog.filter(service => service.is_active !== false).map(service=><option key={service.id || service.name} value={service.name}>{service.name}</option>)}</select></div>
              <DynamicServiceForm service={activeService} values={reqValues} onChange={(key, value) => setReqValues(current => ({ ...current, [key]: value }))} />
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={()=>setReqModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={submitOwnReq} disabled={sending||(activeService.fields || []).some(field => field.required && !String(reqValues[field.key] || "").trim())}>{sending?"Submitting...":"Submit"}</button>
            </div>
          </div>
        </div>
      )}
      {viewNotif&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setViewNotif(null)}>
          <div className="modal" style={{maxWidth:"640px"}}>
            <div className="modal-header"><h3>Notification</h3><button className="modal-close" onClick={()=>setViewNotif(null)}>x</button></div>
            <div className="modal-body">
              <div className="req-desc" style={{marginBottom:"0.75rem"}}>{viewNotif.message}</div>
              <div className="notif-time">{formatDateTime(viewNotif.created_at)}</div>
            </div>
            <div className="modal-footer"><button className="btn-ghost" onClick={()=>setViewNotif(null)}>Close</button></div>
          </div>
        </div>
      )}
      <Toast toast={toast}/>
    </div>
  );
}

function getRequesterIdentity(req) {
  return req?.requester_full_name || req?.user_name || "Unknown User";
}

function getRequesterDepartment(req) {
  return req?.requester_department || req?.department || "Unknown Department";
}

function getRequesterEmail(req) {
  return req?.requester_email || req?.user_email || "No Email";
}

function AdminPanel({ currentUser, onLogout, services, refreshServices }) {
  const [tab, setTab] = useState("my-queue");
  const [myQueue, setMyQueue] = useState([]); const [allRequests, setAllRequests] = useState([]);
  const [stats, setStats] = useState(null); const [analytics, setAnalytics] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [filter, setFilter] = useState("all");
  const [queueServiceFilter, setQueueServiceFilter] = useState("all");
  const [allRequestsServiceFilterAdmin, setAllRequestsServiceFilterAdmin] = useState("all");
  const [analyticsFilters, setAnalyticsFilters] = useState({ date_from: "", date_to: "", service: "all" });
  const [loading, setLoading] = useState(true); const [actionLoading, setActionLoading] = useState(null);
  const [viewReq, setViewReq] = useState(null); const [actionNote, setActionNote] = useState(""); const [showDisapprove, setShowDisapprove] = useState(false);
  const [toast, showToast] = useToast(); const [user, setUser] = useState(currentUser);
  const [settings, setSettings] = useState({required_approvals:2});

  const fetchAll = useCallback(async (activeTab = tab, force = false) => {
    setLoading(true);
    try {
      const shouldLoadRequests = force || activeTab === "my-queue" || activeTab === "all-requests" || (!myQueue.length && !allRequests.length);
      const shouldLoadAnalytics = force || activeTab === "analytics";
      const shouldLoadLogs = force || activeTab === "activity";

      const [s, st] = await Promise.all([api.getStats(), api.getSettings()]);
      setStats(s);
      setSettings(st);

      if (shouldLoadRequests) {
        const [q, all] = await Promise.all([
          api.getAllRequests(null, "mine"),
          api.getAllRequests(),
        ]);
        setMyQueue(q);
        setAllRequests(all);
      }

      if (shouldLoadAnalytics) {
        const a = await api.getAnalytics(
          analyticsFilters.service === "all" && !analyticsFilters.date_from && !analyticsFilters.date_to
            ? undefined
            : analyticsFilters
        );
        setAnalytics(a);
      }

      if (shouldLoadLogs) {
        const logs = await api.getAdminAuditLogs({ limit: 80 });
        setAuditLogs(logs);
      }
    } catch(e){console.error(e);} finally{setLoading(false);}
  },[tab, analyticsFilters, myQueue.length, allRequests.length]);
  useEffect(()=>{fetchAll(tab, false);},[fetchAll, tab]);

  const handleAction = async (id, action) => {
    setActionLoading(id+action);
    try {
      await api.adminActOnRequest(id, action, actionNote||undefined);
      showToast(action==="approved"?"Approved":"Disapproved");
      await fetchAll(tab, true); setViewReq(null); setActionNote(""); setShowDisapprove(false);
    } catch(e){showToast(e.message,"error");} finally{setActionLoading(null);}
  };

  const myQueueCount = myQueue.length;
  const adminQueueServices = getServiceOptionsForRequests(services, myQueue);
  const adminAllRequestServices = getServiceOptionsForRequests(services, allRequests);
  const filteredQueue = myQueue.filter(r => queueServiceFilter==="all" || r.service_type===queueServiceFilter);
  const filteredAll = allRequests.filter(r => (filter==="all" || r.status===filter) && (allRequestsServiceFilterAdmin==="all" || r.service_type===allRequestsServiceFilterAdmin));
  const adminAnalyticsServiceOptions = getServiceOptionsForRequests(services, analytics?.requestsByUser || []);
  const adminFeedbackSubmitted = allRequests.filter(r => !!r.feedback_submitted_at).length;
  const adminFeedbackPending = allRequests.filter(r => r.status==="completed" && !r.feedback_submitted_at).length;
  const adminFeedbackRatings = allRequests.map(r => Number(r.feedback_rating)).filter(v => Number.isFinite(v) && v > 0);
  const adminFeedbackAvg = adminFeedbackRatings.length ? (adminFeedbackRatings.reduce((a,b)=>a+b,0) / adminFeedbackRatings.length).toFixed(1) : "-";
  const adminStatusChart = analytics ? [
    { label: "Pending", value: analytics.stats.pending, color: "#f59e0b" },
    { label: "Verified", value: analytics.stats.verified, color: "#38bdf8" },
    { label: "Approved", value: analytics.stats.approved, color: "#4ade80" },
    { label: "Completed", value: analytics.stats.completed, color: "#2dd4bf" },
    { label: "Disapproved", value: analytics.stats.disapproved, color: "#f87171" },
    { label: "Declined", value: analytics.stats.declined, color: "#fb7185" },
  ] : [];
  const adminServiceChart = analytics
    ? analytics.byService.slice(0, 6).map((item, index) => ({
        label: item.service_type,
        value: item.count,
        color: ["#60a5fa", "#38bdf8", "#a78bfa", "#34d399", "#f59e0b", "#fb7185"][index % 6],
      }))
    : [];

  const getStepLabel = (req) => {
    if (!req.admin1_action) return settings.required_approvals===1?"Your review needed":"Admin 1 review needed";
    if (req.admin1_action==="approved"&&!req.admin2_action) return "Admin 2 final review needed";
    return null;
  };

  const canIAct = (req) => {
    if (!req.admin1_action) return true;
    if (req.admin1_action==="approved"&&!req.admin2_action&&req.admin1_id!==currentUser.id) return true;
    return false;
  };

  return (
    <div className="dashboard admin-theme">
      <header className="dash-header">
        <div className="dash-brand"><span className="logo-badge sm admin">GSO</span><span>Admin Panel</span></div>
        <div style={{display:"flex",gap:"0.75rem",alignItems:"center"}}>
          <button className="btn-ghost" style={{fontSize:"0.8rem",padding:"0.4rem 0.8rem"}} onClick={()=>fetchAll(tab, true)}>Refresh</button>
          <button className="btn-ghost" onClick={onLogout}>Logout</button>
        </div>
      </header>
      <div className="dash-body">
        <aside className="sidebar">
          {[
            {id:"my-queue",label:"My Approval Queue",icon:"🗂️",badge:myQueueCount},
            {id:"all-requests",label:"All Requests",icon:"📋"},
            {id:"analytics",label:"Analytics",icon:"📊"},
            {id:"activity",label:"Activity Logs",icon:"🕘"},
            {id:"profile",label:"My Profile",icon:"👤"},
          ].map(({id,label,icon,badge})=>(
            <button key={id} className={`sidebar-btn ${tab===id?"active":""}`} onClick={()=>setTab(id)}>
              <span style={{display:"flex",alignItems:"center",width:"100%"}}><span>{icon} {label}</span>{badge>0&&<span className="notif-dot">{badge}</span>}</span>
            </button>
          ))}
          {stats&&(
            <div className="sidebar-stats">
              <div className="stat-item"><span>{stats.awaiting_admin1}</span><small>Awaiting Admin 1</small></div>
              <div className="stat-item"><span>{stats.awaiting_admin2}</span><small>Awaiting Admin 2</small></div>
              <div className="stat-item"><span>{stats.approved_requests}</span><small>Fully Approved</small></div>
            </div>
          )}
          <div className="sidebar-footer"><div className="backend-badge">Node.js + MySQL</div></div>
        </aside>
        <main className="dash-main">
          {loading?<div className="loading-state">Loading...</div>:<>
            {tab==="my-queue"&&(
              <div>
                <div className="section-header">
                  <h2>My Approval Queue</h2>
                  <p>{settings.required_approvals===2?"2-admin approval chain active":"Single admin approval active"} - {myQueueCount} request{myQueueCount!==1?"s":""} waiting for your review</p>
                </div>
                <div className="field-group" style={{maxWidth:"280px",marginBottom:"1rem"}}>
                  <label>Service Type</label>
                  <select value={queueServiceFilter} onChange={e=>setQueueServiceFilter(e.target.value)}>
                    <option value="all">All Services</option>
                    {adminQueueServices.filter(s=>s!=="all").map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {myQueueCount===0?<div className="empty-state">No requests waiting for your approval.</div>:
                  filteredQueue.length===0?<div className="empty-state">No approval requests for this service.</div>:
                  <div className="requests-list">{filteredQueue.map(r=>{
                    const stepLabel = getStepLabel(r);
                    const isStep2 = r.admin1_action==="approved"&&!r.admin2_action;
                    return (
                      <div key={r.id} className="req-card req-verified clickable" onClick={()=>{setViewReq(r);setActionNote("");setShowDisapprove(false);}}>
                        {stepLabel&&<div style={{marginBottom:"0.75rem",display:"flex",alignItems:"center",gap:"0.5rem",fontSize:"0.8rem",color:isStep2?"#fdba74":"#93c5fd",fontWeight:600}}>{isStep2?"Admin 2 final review":"Admin 1 review"}</div>}
                        <div className="req-top">
                          <div><span className="req-svc">{getServiceMeta(r.service_type, services).icon} {r.service_type}</span>{r.priority_number && <span className="req-priority">{r.priority_number}</span>}<span className="req-user">by {getRequesterIdentity(r)} - {getRequesterDepartment(r)}</span></div>
                          <Badge status={r.status}/>
                        </div>
                        <p className="req-desc">{r.description}</p>
                        <div className="req-meta"><span>Location: {r.location}</span><span>Submitted: {formatDateTime(r.submitted_at)}</span><span>Email: {getRequesterEmail(r)}</span></div>
                        {r.staff_note&&<div className="staff-note">Staff: {r.staff_note}</div>}
                        <ApprovalTrail req={r} requiredApprovals={settings.required_approvals}/>
                      </div>
                    );
                  })}</div>}
              </div>
            )}
            {tab==="all-requests"&&(
              <div>
                <div className="section-header"><h2>All Service Requests</h2></div>
                <div style={{display:"flex",gap:"1rem",flexWrap:"wrap",marginBottom:"1rem"}}>
                  <div className="field-group" style={{maxWidth:"280px",marginBottom:0,flex:"1 1 220px"}}>
                    <label>Status</label>
                    <select value={filter} onChange={e=>setFilter(e.target.value)}>
                      {["all","verified","approved","completed","disapproved","pending","declined"].map(f=>(
                        <option key={f} value={f}>{f.charAt(0).toUpperCase()+f.slice(1)} ({allRequests.filter(r=>f==="all"||r.status===f).length})</option>
                      ))}
                    </select>
                  </div>
                  <div className="field-group" style={{maxWidth:"280px",marginBottom:0,flex:"1 1 220px"}}>
                    <label>Service Type</label>
                    <select value={allRequestsServiceFilterAdmin} onChange={e=>setAllRequestsServiceFilterAdmin(e.target.value)}>
                      <option value="all">All Services</option>
                      {adminAllRequestServices.filter(s=>s!=="all").map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                {filteredAll.length===0?<div className="empty-state">No requests.</div>:
                  <div className="requests-list">{filteredAll.map(r=>(
                    <div key={r.id} className={`req-card req-${r.status} clickable`} onClick={()=>{setViewReq(r);setActionNote("");setShowDisapprove(false);}}>
                      <div className="req-top"><div><span className="req-svc">{getServiceMeta(r.service_type, services).icon} {r.service_type}</span>{r.priority_number && <span className="req-priority">{r.priority_number}</span>}<span className="req-user">by {getRequesterIdentity(r)} - {getRequesterDepartment(r)}</span></div><Badge status={r.status}/></div>
                      <p className="req-desc">{r.description}</p>
                      <div className="req-meta"><span>Location: {r.location}</span><span>Submitted: {formatDateTime(r.submitted_at)}</span><span>Email: {getRequesterEmail(r)}</span></div>
                      {r.staff_note&&<div className="staff-note">Staff: {r.staff_note}</div>}
                      <ApprovalTrail req={r} requiredApprovals={settings.required_approvals}/>
                    </div>
                  ))}</div>}
              </div>
            )}
            {tab==="analytics"&&analytics&&(
              <div className="overview-shell">
                <div className="section-header"><h2>Analytics</h2><p>Filter by date and service, then export the current view.</p></div>
                <div className="overview-section">
                  <div style={{display:"flex",gap:"1rem",flexWrap:"wrap",alignItems:"end"}}>
                    <div className="field-group" style={{maxWidth:"220px",marginBottom:0}}>
                      <label>From</label>
                      <input type="date" value={analyticsFilters.date_from} onChange={e=>setAnalyticsFilters(current => ({ ...current, date_from: e.target.value }))} />
                    </div>
                    <div className="field-group" style={{maxWidth:"220px",marginBottom:0}}>
                      <label>To</label>
                      <input type="date" value={analyticsFilters.date_to} onChange={e=>setAnalyticsFilters(current => ({ ...current, date_to: e.target.value }))} />
                    </div>
                    <div className="field-group" style={{maxWidth:"240px",marginBottom:0}}>
                      <label>Service Type</label>
                      <select value={analyticsFilters.service} onChange={e=>setAnalyticsFilters(current => ({ ...current, service: e.target.value }))}>
                        <option value="all">All Services</option>
                        {adminAnalyticsServiceOptions.filter(s=>s!=="all").map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <button className="btn-ghost" onClick={()=>fetchAll("analytics", true)}>Apply</button>
                    <button className="btn-ghost" onClick={() => exportRowsToCsv("admin-analytics-requests.csv", (analytics.requestsByUser || []).map(item => ({
                      service: item.service_type,
                      status: item.status,
                      requester: item.user_name,
                      department: item.department,
                      submitted_at: item.submitted_at,
                    })))}>Export CSV</button>
                  </div>
                </div>
                <div className="viz-grid">
                  <div className="chart-panel">
                    <h4>Request Status Flow</h4>
                    <p>See the current request mix within the selected range.</p>
                    <HorizontalBarChart items={adminStatusChart} />
                  </div>
                  <div className="chart-panel">
                    <h4>Service Demand</h4>
                    <p>Top service types for the selected filters.</p>
                    <DonutChart items={adminServiceChart.length ? adminServiceChart : [{ label:"No Data", value:1, color:"rgba(255,255,255,0.12)" }]} totalLabel="Requests" />
                  </div>
                </div>
                <div className="stats-grid">
                  {[
                    {lbl:"Total",num:analytics.stats.total,color:"#93c5fd",bg:"rgba(59,130,246,0.1)",bc:"rgba(59,130,246,0.3)"},
                    {lbl:"Completed",num:analytics.stats.completed,color:"#5eead4",bg:"rgba(20,184,166,0.1)",bc:"rgba(20,184,166,0.3)"},
                    {lbl:"Pending",num:analytics.stats.pending,color:"#fbbf24",bg:"rgba(245,158,11,0.1)",bc:"rgba(245,158,11,0.3)"},
                    {lbl:"Feedback Submitted",num:adminFeedbackSubmitted,color:"#4ade80",bg:"rgba(34,197,94,0.1)",bc:"rgba(34,197,94,0.3)"},
                    {lbl:"Feedback Pending",num:adminFeedbackPending,color:"#fb7185",bg:"rgba(244,63,94,0.1)",bc:"rgba(244,63,94,0.3)"},
                    {lbl:"Avg Rating",num:adminFeedbackAvg,color:"#a78bfa",bg:"rgba(139,92,246,0.1)",bc:"rgba(139,92,246,0.3)"},
                  ].map(s=><div key={s.lbl} className="stat-card" style={{background:s.bg,border:`1px solid ${s.bc}`}}><span className="num" style={{color:s.color}}>{s.num}</span><div className="lbl">{s.lbl}</div></div>)}
                </div>
              </div>
            )}
            {tab==="activity"&&(
              <div>
                <div className="section-header"><h2>Activity Logs</h2><p>Track who changed what and when.</p></div>
                {auditLogs.length===0 ? <div className="empty-state">No activity logs yet.</div> : (
                  <div className="requests-list">
                    {auditLogs.map(log => (
                      <div key={log.id} className="req-card compact">
                        <div className="req-top">
                          <div><span className="req-svc">{log.action}</span><span className="req-user">by {log.actor_name || "System"} - {log.actor_role || "system"}</span></div>
                          <span className="badge badge-verified">{log.entity_type}</span>
                        </div>
                        <div className="req-meta"><span>ID: {log.entity_id || "-"}</span><span>{formatDateTime(log.created_at)}</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {tab==="profile"&&<ProfileTab user={user} setUser={setUser} showToast={showToast}/>}
          </>}
        </main>
      </div>

      {viewReq&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&(setViewReq(null),setShowDisapprove(false))}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>{getServiceMeta(viewReq.service_type, services).icon} Request Review</h3>
              <button className="modal-close" onClick={()=>{setViewReq(null);setShowDisapprove(false);}}>x</button>
            </div>
            <div className="modal-body">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
                <strong style={{fontSize:"1.05rem"}}>{getServiceMeta(viewReq.service_type, services).icon} {viewReq.service_type}</strong>
                <Badge status={viewReq.status}/>
              </div>
              {getStepLabel(viewReq)&&<div style={{marginBottom:"1rem",padding:"0.75rem",background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.3)",borderRadius:"8px",fontSize:"0.85rem",color:"#c4b5fd",fontWeight:600}}>{canIAct(viewReq)&&(viewReq.admin1_action==="approved"?"You are reviewing as Admin 2 - FINAL DECISION":"You are reviewing as Admin 1")}</div>}
              <div className="detail-grid">
                <div className="detail-item"><div className="detail-label">Requester</div><div className="detail-value">{getRequesterIdentity(viewReq)}</div></div>
                <div className="detail-item"><div className="detail-label">Department</div><div className="detail-value">{getRequesterDepartment(viewReq)}</div></div>
                <div className="detail-item"><div className="detail-label">Email</div><div className="detail-value">{getRequesterEmail(viewReq)}</div></div>
                <div className="detail-item"><div className="detail-label">Username</div><div className="detail-value">{viewReq.requester_username || "Not available"}</div></div>
                <div className="detail-item"><div className="detail-label">Role</div><div className="detail-value">{viewReq.requester_role || "user"}</div></div>
                <div className="detail-item"><div className="detail-label">Account Status</div><div className="detail-value">{viewReq.requester_status || "Unknown"}</div></div>
                <div className="detail-item"><div className="detail-label">Account Created</div><div className="detail-value">{viewReq.requester_created_at ? formatDateTime(viewReq.requester_created_at) : "Not available"}</div></div>
                <div className="detail-item"><div className="detail-label">Location</div><div className="detail-value">{viewReq.location}</div></div>
                <div className="detail-item"><div className="detail-label">Submitted</div><div className="detail-value">{formatDateTime(viewReq.submitted_at)}</div></div>
                <div className="detail-item"><div className="detail-label">Preferred Date</div><div className="detail-value">{viewReq.preferred_date||"Not specified"}</div></div>
                <div className="detail-item full"><div className="detail-label">Description</div><div className="detail-value">{viewReq.description}</div></div>
              </div>
              {viewReq.staff_note&&<div className="staff-note" style={{marginBottom:"0.75rem"}}>Staff Note: {viewReq.staff_note}</div>}
              <ApprovalTrail req={viewReq} requiredApprovals={settings.required_approvals}/>
              {canIAct(viewReq)&&showDisapprove&&(
                <div className="field-group" style={{marginTop:"1rem"}}>
                  <label>Reason for Disapproval (optional)</label>
                  <textarea value={actionNote} onChange={e=>setActionNote(e.target.value)} rows={2} placeholder="Enter reason..."/>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={()=>{setViewReq(null);setShowDisapprove(false);}}>Close</button>
              {canIAct(viewReq)&&!showDisapprove&&(
                <>
                  <button className="btn-reject" onClick={()=>setShowDisapprove(true)}>Disapprove</button>
                  <button className="btn-approve" disabled={!!actionLoading} onClick={()=>handleAction(viewReq.id,"approved")}>
                    {actionLoading===viewReq.id+"approved"?"...":(viewReq.admin1_action==="approved"?"Final Approve":"Approve")}
                  </button>
                </>
              )}
              {canIAct(viewReq)&&showDisapprove&&(
                <>
                  <button className="btn-ghost" onClick={()=>setShowDisapprove(false)}>Back</button>
                  <button className="btn-reject" disabled={!!actionLoading} onClick={()=>handleAction(viewReq.id,"disapproved")}>
                    {actionLoading===viewReq.id+"disapproved"?"...":"Confirm Disapprove"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <Toast toast={toast}/>
    </div>
  );
}

function HeadAdminPanel({ currentUser, onLogout, services, refreshServices }) {
  const [tab, setTab] = useState("accounts");
  const [users, setUsers] = useState([]); const [stats, setStats] = useState(null);
  const [requests, setRequests] = useState([]); const [viewReq, setViewReq] = useState(null);
  const [viewUser, setViewUser] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [userFilter, setUserFilter] = useState("all");
  const [requestFilter, setRequestFilter] = useState("all");
  const [requestServiceFilter, setRequestServiceFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [toast, showToast] = useToast(); const [user, setUser] = useState(currentUser);
  const [requiredApprovals, setRequiredApprovalsState] = useState(2);

  const fetchAll = useCallback(async (activeTab = tab, force = false) => {
    setLoading(true);
    try {
      const shouldLoadUsers = force || activeTab === "accounts" || activeTab === "all-users" || users.length === 0;
      const shouldLoadRequests = force || activeTab === "requests" || requests.length === 0;
      const shouldLoadLogs = force || activeTab === "activity";

      const [s, st] = await Promise.all([api.getHeadAdminStats(), api.getSettings()]);
      setStats(s);
      setRequiredApprovalsState(st.required_approvals);

      if (shouldLoadUsers) {
        const u = await api.getHeadAdminUsers();
        setUsers(u);
      }
      if (shouldLoadRequests) {
        const rq = await api.getHeadAdminRequests();
        setRequests(rq);
      }
      if (shouldLoadLogs) {
        const logs = await api.getHeadAdminAuditLogs({ limit: 100 });
        setAuditLogs(logs);
      }
    } catch(e){console.error(e);} finally{setLoading(false);}
  },[tab, users.length, requests.length]);
  useEffect(()=>{fetchAll(tab, false);},[fetchAll, tab]);
  useEffect(() => {
    if (tab !== "accounts" && tab !== "all-users") return undefined;
    const timer = setInterval(() => {
      fetchAll(tab, true);
    }, 15000);
    return () => clearInterval(timer);
  }, [tab, fetchAll]);

  const handleUserStatus = async (uid, status) => {
    try { await api.updateUserStatus(uid, status); showToast(`Account ${status}! Email sent.`); await fetchAll(tab, true); }
    catch(e){showToast(e.message,"error");}
  };

  const handleSetApprovals = async (n) => {
    try { await api.setRequiredApprovals(n); setRequiredApprovalsState(n); showToast(`Approval chain set to ${n} admin${n>1?"s":""}!`); await fetchAll(tab, true); }
    catch(e){showToast(e.message,"error");}
  };

  const pendingCount = users.filter(u=>u.status==="pending").length;
  const headRequestServices = getServiceOptionsForRequests(services, requests);
  const filteredUsers = userFilter==="all"?users:users.filter(u=>u.status===userFilter);
  const filteredRequests = requests.filter(r => (requestFilter==="all" || r.status===requestFilter) && (requestServiceFilter==="all" || r.service_type===requestServiceFilter));
  const headFeedbackSubmitted = requests.filter(r => !!r.feedback_submitted_at).length;
  const headFeedbackPending = requests.filter(r => r.status==="completed" && !r.feedback_submitted_at).length;
  const headFeedbackRatings = requests.map(r => Number(r.feedback_rating)).filter(v => Number.isFinite(v) && v > 0);
  const headFeedbackAvg = headFeedbackRatings.length ? (headFeedbackRatings.reduce((a,b)=>a+b,0) / headFeedbackRatings.length).toFixed(1) : "-";
  const userBreakdown = stats ? [
    { label: "Users", value: stats.users.total, color: "#60a5fa" },
    { label: "Staff", value: stats.users.staff, color: "#38bdf8" },
    { label: "Admins", value: stats.users.admins, color: "#a78bfa" },
    { label: "Pending", value: stats.users.pending, color: "#f59e0b" },
    { label: "Approved", value: stats.users.approved, color: "#4ade80" },
  ] : [];
  const requestBreakdown = stats ? [
    { label: "Pending", value: stats.requests.pending, color: "#f59e0b" },
    { label: "Verified", value: stats.requests.verified, color: "#38bdf8" },
    { label: "Approved", value: stats.requests.approved, color: "#4ade80" },
    { label: "Completed", value: stats.requests.completed, color: "#2dd4bf" },
    { label: "Disapproved", value: stats.requests.disapproved, color: "#f87171" },
    { label: "Declined", value: stats.requests.declined || 0, color: "#fb7185" },
  ] : [];

  return (
    <div className="dashboard head-theme">
      <header className="dash-header">
        <div className="dash-brand"><span className="logo-badge sm head">GSO</span><span>Head Admin - Brenda</span></div>
        <div style={{display:"flex",gap:"0.75rem",alignItems:"center"}}>
          <button className="btn-ghost" style={{fontSize:"0.8rem",padding:"0.4rem 0.8rem"}} onClick={()=>fetchAll(tab, true)}>Refresh</button>
          <button className="btn-ghost" onClick={onLogout}>Logout</button>
        </div>
      </header>
      <div className="dash-body">
        <aside className="sidebar">
          {[
            {id:"accounts",label:"Pending Accounts",icon:"🕒",badge:pendingCount},
            {id:"all-users",label:"All Users",icon:"👥"},
            {id:"requests",label:"User Requests",icon:"📨"},
            {id:"services",label:"Services",icon:"🧰"},
            {id:"settings",label:"System Settings",icon:"⚙️"},
            {id:"overview",label:"Overview",icon:"📈"},
            {id:"profile",label:"My Profile",icon:"👤"},
          ].map(({id,label,icon,badge})=>(
            <button key={id} className={`sidebar-btn ${tab===id?"active":""}`} onClick={()=>setTab(id)}>
              <span style={{display:"flex",alignItems:"center",width:"100%"}}><span>{icon} {label}</span>{badge>0&&<span className="notif-dot">{badge}</span>}</span>
            </button>
          ))}
          {stats&&(
            <div className="sidebar-stats">
              <div className="stat-item"><span style={{color:"var(--head-accent)"}}>{stats.users.pending}</span><small>Pending Accounts</small></div>
              <div className="stat-item"><span style={{color:"var(--head-accent)"}}>{stats.requests.total}</span><small>Total Requests</small></div>
            </div>
          )}
          <div className="sidebar-footer"><div className="backend-badge">Node.js + MySQL</div></div>
        </aside>
        <main className="dash-main">
          {loading?<div className="loading-state">Loading...</div>:<>
            {tab==="accounts"&&(
              <div>
                <div className="section-header"><h2>Pending Account Approvals</h2><p>Review registrations - users receive email when approved or rejected</p></div>
                {pendingCount===0?<div className="empty-state">No pending accounts.</div>:
                  <div className="users-list">{users.filter(u=>u.status==="pending").map(u=>(
                    <div key={u.id} className="user-card user-pending">
                      <div className="user-info">
                        <div className="user-avatar" style={{background:u.role==="staff"?"var(--staff-accent)":u.role==="admin"?"var(--admin-accent)":"var(--primary)"}}>{u.full_name[0].toUpperCase()}</div>
                        <div>
                          <div className="user-name">{u.full_name}</div>
                          <div className="user-meta">{u.email} - {u.department}</div>
                          <div className="user-meta">@{u.username} - <RoleBadge role={u.role}/> - {formatDateTime(u.created_at)}</div>
                        </div>
                      </div>
                      <div className="user-right">
                        <div className="req-actions">
                          <button className="view-btn" onClick={()=>setViewUser(u)}>View Details</button>
                          <button className="btn-approve sm" onClick={()=>handleUserStatus(u.id,"approved")}>Approve</button>
                          <button className="btn-reject sm" onClick={()=>handleUserStatus(u.id,"rejected")}>Reject</button>
                        </div>
                      </div>
                    </div>
                  ))}</div>}
              </div>
            )}
            {tab==="all-users"&&(
              <div>
                <div className="section-header"><h2>All User Accounts</h2><p>{users.length} total</p></div>
                <div className="filter-tabs">
                  {["all","pending","approved","rejected"].map(f=>(
                    <button key={f} className={`filter-tab ${userFilter===f?"active":""}`} onClick={()=>setUserFilter(f)}>
                      {f.charAt(0).toUpperCase()+f.slice(1)} <span style={{opacity:0.7}}>({users.filter(u=>f==="all"||u.status===f).length})</span>
                    </button>
                  ))}
                </div>
                {filteredUsers.length===0?<div className="empty-state">No users.</div>:
                  <div className="users-list">{filteredUsers.map(u=>(
                    <div key={u.id} className={`user-card user-${u.status}`}>
                      <div className="user-info">
                        <div className="user-avatar" style={{background:u.role==="staff"?"var(--staff-accent)":u.role==="admin"?"var(--admin-accent)":"var(--primary)"}}>{u.full_name[0].toUpperCase()}</div>
                        <div>
                          <div className="user-name">{u.full_name}</div>
                          <div className="user-meta">{u.email} - {u.department}</div>
                          <div className="user-meta">@{u.username} - <RoleBadge role={u.role}/></div>
                        </div>
                      </div>
                      <div className="user-right">
                        <Badge status={u.status}/>
                        {u.status==="pending"&&(
                          <div className="req-actions">
                            <button className="view-btn" onClick={()=>setViewUser(u)}>View</button>
                            <button className="btn-approve sm" onClick={()=>handleUserStatus(u.id,"approved")}>Approve</button>
                            <button className="btn-reject sm" onClick={()=>handleUserStatus(u.id,"rejected")}>Reject</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}</div>}
              </div>
            )}
            {tab==="requests"&&(
              <div>
                <div className="section-header"><h2>User Service Requests</h2><p>Head Admin can inspect request and requester account details</p></div>
                <div style={{display:"flex",gap:"1rem",flexWrap:"wrap",marginBottom:"1rem"}}>
                  <div className="field-group" style={{maxWidth:"280px",marginBottom:0,flex:"1 1 220px"}}>
                    <label>Status</label>
                    <select value={requestFilter} onChange={e=>setRequestFilter(e.target.value)}>
                      {["all","pending","verified","approved","completed","disapproved","declined"].map(f=>(
                        <option key={f} value={f}>{f.charAt(0).toUpperCase()+f.slice(1)} ({requests.filter(r=>f==="all"||r.status===f).length})</option>
                      ))}
                    </select>
                  </div>
                  <div className="field-group" style={{maxWidth:"280px",marginBottom:0,flex:"1 1 220px"}}>
                    <label>Service Type</label>
                    <select value={requestServiceFilter} onChange={e=>setRequestServiceFilter(e.target.value)}>
                      <option value="all">All Services</option>
                      {headRequestServices.filter(s=>s!=="all").map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                {filteredRequests.length===0?<div className="empty-state">No requests.</div>:
                  <div className="requests-list">{filteredRequests.map(r=>(
                    <div key={r.id} className={`req-card req-${r.status} clickable`} onClick={()=>setViewReq(r)}>
                      <div className="req-top"><div><span className="req-svc">{getServiceMeta(r.service_type, services).icon} {r.service_type}</span>{r.priority_number && <span className="req-priority">{r.priority_number}</span>}<span className="req-user">by {getRequesterIdentity(r)} - {getRequesterDepartment(r)}</span></div><Badge status={r.status}/></div>
                      <p className="req-desc">{r.description}</p>
                      <div className="req-meta"><span>Location: {r.location}</span><span>Submitted: {formatDateTime(r.submitted_at)}</span><span>Email: {getRequesterEmail(r)}</span></div>
                      {r.staff_note&&<div className="staff-note">Staff: {r.staff_note}</div>}
                      <ApprovalTrail req={r} requiredApprovals={requiredApprovals}/>
                    </div>
                  ))}</div>}
              </div>
            )}
            {tab==="services"&&<ServiceManager services={getServiceCatalog(services)} onRefresh={refreshServices} showToast={showToast}/>}
            {tab==="settings"&&(
              <div>
                <div className="section-header"><h2>System Settings</h2><p>Control how the approval chain works</p></div>
                <div className="settings-section">
                  <h3>Admin Approval Chain</h3>
                  <div className="toggle-row">
                    <div>
                      <div style={{fontWeight:600}}>Number of Admins Required to Approve a Request</div>
                      <div className="toggle-desc">
                        {requiredApprovals===1?"Single admin approval - one admin approves and the request goes straight to staff.":"Two-admin chain - Admin 1 approves first, then Admin 2 gives final approval before staff is notified."}
                      </div>
                    </div>
                    <div className="toggle-btns">
                      <button className={`toggle-btn ${requiredApprovals===1?"selected":""}`} onClick={()=>handleSetApprovals(1)}>1 Admin</button>
                      <button className={`toggle-btn ${requiredApprovals===2?"selected":""}`} onClick={()=>handleSetApprovals(2)}>2 Admins</button>
                    </div>
                  </div>
                </div>
                <div className="settings-section">
                  <h3>Current Approval Flow</h3>
                  <div style={{padding:"1.25rem",background:"var(--surface2)",borderRadius:"10px"}}>
                    <div className="approval-flow">
                      <div className="flow-step done">User Submits</div>
                      <div className="flow-arrow">&gt;</div>
                      <div className="flow-step done">Staff Verifies</div>
                      <div className="flow-arrow">&gt;</div>
                      <div className="flow-step active">Admin 1 Approves</div>
                      {requiredApprovals===2&&<><div className="flow-arrow">&gt;</div><div className="flow-step active">Admin 2 Final</div></>}
                      <div className="flow-arrow">&gt;</div>
                      <div className="flow-step done">Staff Carries Out</div>
                      <div className="flow-arrow">&gt;</div>
                      <div className="flow-step done">Done</div>
                    </div>
                    <p style={{fontSize:"0.8rem",color:"var(--text-muted)",marginTop:"0.75rem"}}>
                      Emails are sent at every step. {requiredApprovals===2?"Two separate admins must approve - the same admin cannot approve both steps.":"One admin approval is sufficient."}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {tab==="overview"&&stats&&(
              <div className="overview-shell">
                <div className="section-header"><h2>System Overview</h2><p>Clearer analytics for users and request progress</p></div>

                <div className="overview-section">
                  <div className="overview-title">
                    <div>
                      <h3>Quick Summary</h3>
                      <p>Top-level counts to understand the current system state.</p>
                    </div>
                  </div>
                  <div className="overview-top-grid">
                    {[
                      { label: "Approved Accounts", value: stats.users.approved, note: `${stats.users.pending} still pending`, color: "#4ade80" },
                      { label: "Total Requests", value: stats.requests.total, note: `${stats.requests.completed} completed jobs`, color: "#60a5fa" },
                      { label: "Needs Review", value: stats.requests.pending + stats.requests.verified, note: "Pending + verified", color: "#f59e0b" },
                      { label: "Rejected Flow", value: stats.requests.disapproved + (stats.requests.declined || 0), note: "Disapproved + declined", color: "#f87171" },
                      { label: "Feedback Submitted", value: headFeedbackSubmitted, note: `${headFeedbackPending} pending`, color: "#34d399" },
                      { label: "Avg Feedback", value: headFeedbackAvg, note: "Average rating", color: "#a78bfa" },
                    ].map(item => (
                      <div className="overview-kpi" key={item.label}>
                        <div className="kpi-label">{item.label}</div>
                        <div className="kpi-value" style={{ color: item.color }}>{item.value}</div>
                        <div className="kpi-note">{item.note}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="viz-grid">
                  <div className="chart-panel">
                    <h4>User Distribution</h4>
                    <p>Compare account types and approval state side by side.</p>
                    <HorizontalBarChart items={userBreakdown} />
                  </div>

                  <div className="chart-panel">
                    <h4>Request Status Share</h4>
                    <p>See how requests are distributed across the workflow.</p>
                    <DonutChart items={requestBreakdown} totalLabel="Requests" />
                  </div>
                </div>

                <div className="overview-section">
                  <div className="overview-title">
                    <div>
                      <h3>Core + Feedback Metrics</h3>
                      <p>Focused dashboard with only key numbers.</p>
                    </div>
                  </div>
                  <div className="stats-grid">
                    {[
                      {lbl:"Users",num:stats.users.total,color:"#93c5fd",bg:"rgba(59,130,246,0.1)",bc:"rgba(59,130,246,0.3)"},
                      {lbl:"Approved Accounts",num:stats.users.approved,color:"#4ade80",bg:"rgba(34,197,94,0.1)",bc:"rgba(34,197,94,0.3)"},
                      {lbl:"Total Requests",num:stats.requests.total,color:"#93c5fd",bg:"rgba(59,130,246,0.1)",bc:"rgba(59,130,246,0.3)"},
                      {lbl:"Completed",num:stats.requests.completed,color:"#5eead4",bg:"rgba(20,184,166,0.1)",bc:"rgba(20,184,166,0.3)"},
                      {lbl:"Feedback Submitted",num:headFeedbackSubmitted,color:"#34d399",bg:"rgba(16,185,129,0.1)",bc:"rgba(16,185,129,0.3)"},
                      {lbl:"Feedback Pending",num:headFeedbackPending,color:"#fb7185",bg:"rgba(244,63,94,0.1)",bc:"rgba(244,63,94,0.3)"},
                      {lbl:"Avg Rating",num:headFeedbackAvg,color:"#a78bfa",bg:"rgba(139,92,246,0.1)",bc:"rgba(139,92,246,0.3)"},
                    ].map(s=><div key={s.lbl} className="stat-card" style={{background:s.bg,border:`1px solid ${s.bc}`}}><span className="num" style={{color:s.color}}>{s.num}</span><div className="lbl">{s.lbl}</div></div>)}
                  </div>
                </div>
              </div>
            )}
            {tab==="activity"&&(
              <div>
                <div className="section-header"><h2>Activity Logs</h2><p>Recent actions across approvals, services, and account changes.</p></div>
                {auditLogs.length===0 ? <div className="empty-state">No activity logs yet.</div> : (
                  <div className="requests-list">
                    {auditLogs.map(log => (
                      <div key={log.id} className="req-card compact">
                        <div className="req-top">
                          <div><span className="req-svc">{log.action}</span><span className="req-user">by {log.actor_name || "System"} - {log.actor_role || "system"}</span></div>
                          <span className="badge badge-verified">{log.entity_type}</span>
                        </div>
                        <div className="req-meta"><span>ID: {log.entity_id || "-"}</span><span>{formatDateTime(log.created_at)}</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {tab==="profile"&&<ProfileTab user={user} setUser={setUser} showToast={showToast}/>}
          </>}
        </main>
      </div>
      <Toast toast={toast}/>
      {viewUser&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setViewUser(null)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>Account Details</h3>
              <button className="modal-close" onClick={()=>setViewUser(null)}>x</button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item"><div className="detail-label">Full Name</div><div className="detail-value">{viewUser.full_name}</div></div>
                <div className="detail-item"><div className="detail-label">Username</div><div className="detail-value">@{viewUser.username}</div></div>
                <div className="detail-item"><div className="detail-label">Email</div><div className="detail-value">{viewUser.email}</div></div>
                <div className="detail-item"><div className="detail-label">Department</div><div className="detail-value">{viewUser.department}</div></div>
                <div className="detail-item"><div className="detail-label">Role</div><div className="detail-value">{viewUser.role}</div></div>
                <div className="detail-item"><div className="detail-label">Status</div><div className="detail-value">{viewUser.status}</div></div>
                <div className="detail-item"><div className="detail-label">Registered</div><div className="detail-value">{formatDateTime(viewUser.created_at)}</div></div>
              </div>
            </div>
            <div className="modal-footer">
              {viewUser.status==="pending"&&(
                <>
                  <button className="btn-approve" onClick={async()=>{ await handleUserStatus(viewUser.id,"approved"); setViewUser(null); }}>Approve</button>
                  <button className="btn-reject" onClick={async()=>{ await handleUserStatus(viewUser.id,"rejected"); setViewUser(null); }}>Disapprove</button>
                </>
              )}
              <button className="btn-ghost" onClick={()=>setViewUser(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {viewReq&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setViewReq(null)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>{getServiceMeta(viewReq.service_type, services).icon} Request Details</h3>
              <button className="modal-close" onClick={()=>setViewReq(null)}>x</button>
            </div>
            <div className="modal-body">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
                <strong style={{fontSize:"1.05rem"}}>{getServiceMeta(viewReq.service_type, services).icon} {viewReq.service_type}</strong>
                <Badge status={viewReq.status}/>
              </div>
              <div className="detail-grid">
                <div className="detail-item"><div className="detail-label">Requester</div><div className="detail-value">{getRequesterIdentity(viewReq)}</div></div>
                <div className="detail-item"><div className="detail-label">Username</div><div className="detail-value">{viewReq.requester_username || "Not available"}</div></div>
                <div className="detail-item"><div className="detail-label">Email</div><div className="detail-value">{getRequesterEmail(viewReq)}</div></div>
                <div className="detail-item"><div className="detail-label">Department</div><div className="detail-value">{getRequesterDepartment(viewReq)}</div></div>
                <div className="detail-item"><div className="detail-label">Role</div><div className="detail-value">{viewReq.requester_role || "user"}</div></div>
                <div className="detail-item"><div className="detail-label">Account Status</div><div className="detail-value">{viewReq.requester_status || "Unknown"}</div></div>
                <div className="detail-item"><div className="detail-label">Account Created</div><div className="detail-value">{viewReq.requester_created_at ? formatDateTime(viewReq.requester_created_at) : "Not available"}</div></div>
                <div className="detail-item"><div className="detail-label">Location</div><div className="detail-value">{viewReq.location}</div></div>
                <div className="detail-item"><div className="detail-label">Submitted</div><div className="detail-value">{formatDateTime(viewReq.submitted_at)}</div></div>
                <div className="detail-item"><div className="detail-label">Preferred Date</div><div className="detail-value">{viewReq.preferred_date||"Not specified"}</div></div>
                <div className="detail-item full"><div className="detail-label">Description</div><div className="detail-value">{viewReq.description}</div></div>
              </div>
              <ServiceDetailBlock req={viewReq} services={services}/>
              {viewReq.staff_note&&<div className="staff-note" style={{marginBottom:"0.75rem"}}>Staff Note: {viewReq.staff_note}</div>}
              <ApprovalTrail req={viewReq} requiredApprovals={requiredApprovals}/>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={()=>setViewReq(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -- Root ----------------------------------------------------------------------
export default function App() {
  const [screen, setScreen] = useState("login");
  const [currentUser, setCurrentUser] = useState(null);
  const [services, setServices] = useState([]);
  const [globalToast, setGlobalToast] = useState(null);

  useEffect(()=>{
    const {token,role,user} = getSession();
    if (token && role && user) {
      setCurrentUser(user);
      setScreen(role);
      return;
    }
    clearSession();
    setCurrentUser(null);
    setScreen("login");
  },[]);

  const refreshServices = useCallback(async () => {
    const session = getSession();
    if (!session.token) { setServices([]); return; }
    try {
      const includeAll = ["admin", "head_admin"].includes(session.role);
      const next = await api.getServices(includeAll);
      setServices(next);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (currentUser) refreshServices();
  }, [currentUser, refreshServices]);

  const showGT = (msg,type="info") => { setGlobalToast({msg,type}); setTimeout(()=>setGlobalToast(null),4000); };
  const handleLogin = (role,user) => { setCurrentUser(user); setScreen(role); };
  const handleLogout = () => { clearSession(); setCurrentUser(null); setServices([]); setScreen("login"); };

  return (
    <>
      <style>{APP_CSS}</style>
      {(screen==="login" || ((screen==="user"||screen==="staff"||screen==="admin"||screen==="head_admin") && !currentUser)) &&
        <LoginScreen onLogin={handleLogin} onGotoRegister={()=>setScreen("register")}/>}
      {screen==="register"&&<RegisterScreen onSuccess={()=>{showGT("Account created! Check your email. Awaiting Head Admin approval.","info");setScreen("login");}} onGotoLogin={()=>setScreen("login")}/>}
      {screen==="user"&&currentUser&&<UserDashboard currentUser={currentUser} onLogout={handleLogout} services={services}/>}
      {screen==="staff"&&currentUser&&<StaffDashboard currentUser={currentUser} onLogout={handleLogout} services={services}/>}
      {screen==="admin"&&currentUser&&<AdminPanel currentUser={currentUser} onLogout={handleLogout} services={services} refreshServices={refreshServices}/>}
      {screen==="head_admin"&&currentUser&&<HeadAdminPanel currentUser={currentUser} onLogout={handleLogout} services={services} refreshServices={refreshServices}/>}
      {globalToast&&<div className={`toast toast-${globalToast.type}`}>{globalToast.msg}</div>}
    </>
  );
}























