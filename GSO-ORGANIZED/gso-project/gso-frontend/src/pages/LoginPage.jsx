import { useState } from "react";
import { api, saveSession } from "../api";
import { PasswordInput } from "../components/common";

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

export function LoginScreen({ onLogin, onGotoRegister }) {
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

// -- Register ------------------------------------------------------------------

export function RegisterScreen({ onSuccess, onGotoLogin }) {
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
