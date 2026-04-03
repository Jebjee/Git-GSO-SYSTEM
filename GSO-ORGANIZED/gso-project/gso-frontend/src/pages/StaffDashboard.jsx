import { useState, useEffect, useCallback } from "react";
import { api, saveSession, clearSession, getSession } from "../api";
import { Badge, RoleBadge, Toast, useToast, ServiceDetailBlock, ApprovalTrail, ProfileTab, PasswordInput } from "../components/common";
import { HorizontalBarChart, DonutChart, exportRowsToCsv } from "../components/charts";
import { DynamicServiceForm, ServiceManager } from "../components/ServiceManager";
import { formatDateTime } from "../utils/date";
import { getServiceCatalog, getServiceMeta, getServiceOptionsForRequests, getRequestDescription, getRequestLocation, getRequestPreferredDate } from "../utils/services";

export default function StaffDashboard({ currentUser, onLogout, services }) {
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
