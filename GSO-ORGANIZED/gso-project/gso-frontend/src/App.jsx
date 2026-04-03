import { useState, useEffect, useCallback } from "react";
import { api, saveSession, clearSession, getSession } from "./api";
import { APP_CSS } from "./styles";
import { LoginScreen, RegisterScreen } from "./pages/LoginPage";
import UserDashboard  from "./pages/UserDashboard";
import StaffDashboard from "./pages/StaffDashboard";
import AdminPanel     from "./pages/AdminPanel";
import HeadAdminPanel from "./pages/HeadAdminPanel";

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
