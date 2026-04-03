import { useState, useEffect, useCallback } from "react";
import { api, saveSession, clearSession, getSession } from "../api";
import { Badge, RoleBadge, Toast, useToast, ServiceDetailBlock, ApprovalTrail, ProfileTab, PasswordInput } from "../components/common";
import { HorizontalBarChart, DonutChart, exportRowsToCsv } from "../components/charts";
import { DynamicServiceForm, ServiceManager } from "../components/ServiceManager";
import { formatDateTime } from "../utils/date";
import { getServiceCatalog, getServiceMeta, getServiceOptionsForRequests, getRequestDescription, getRequestLocation, getRequestPreferredDate } from "../utils/services";

export default function UserDashboard({ currentUser, onLogout, services }) {
  const [tab, setTab] = useState("services");
  const [requests, setRequests] = useState([]); const [notifs, setNotifs] = useState([]); const [viewNotif, setViewNotif] = useState(null);
  const catalog = getServiceCatalog(services);
  const [reqModal, setReqModal] = useState(false); const [svcType, setSvcType] = useState(catalog[0]?.name || "Carpentry");
  const [requestStatusFilter, setRequestStatusFilter] = useState("all");
  const [requestServiceFilter, setRequestServiceFilter] = useState("all");
  const [reqValues, setReqValues] = useState({});
  const [expandedReqs, setExpandedReqs] = useState({});
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
                      
                      <button className="btn-ghost" style={{padding:"0.25rem 0.5rem",fontSize:"0.8rem",marginTop:"0.5rem"}} onClick={()=>setExpandedReqs(p=>({...p,[r.id]:!p[r.id]}))}>
                        {expandedReqs[r.id]?"Hide Details \u25B2":"View Details \u25BC"}
                      </button>
                      
                      {expandedReqs[r.id] && (
                        <div style={{marginTop:"0.75rem", borderTop:"1px solid rgba(255,255,255,0.05)", paddingTop:"0.75rem"}}>
                          <ServiceDetailBlock req={r} services={services}/>
                          {r.staff_note&&<div className="staff-note">{"\u{1F6E1}\u{FE0F} Staff: "}{r.staff_note}</div>}
                          <ApprovalTrail req={r} requiredApprovals={settings.required_approvals}/>
                          {r.admin_note&&<div className="admin-note">{"\u2699\uFE0F Final Admin Note: "}{r.admin_note}</div>}
                          {r.feedback_submitted_at && (
                            <div className="staff-note" style={{marginTop:"0.75rem"}}>Feedback: {r.feedback_rating || "-"}/5 - {r.feedback_comment} - {formatDateTime(r.feedback_submitted_at)}</div>
                          )}
                        </div>
                      )}
                      
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
                      
                      {r.feedback_submitted_at && (
                        <>
                          <button className="btn-ghost" style={{padding:"0.25rem 0.5rem",fontSize:"0.8rem",marginTop:"0.5rem"}} onClick={()=>setExpandedReqs(p=>({...p,[r.id]:!p[r.id]}))}>
                            {expandedReqs[r.id]?"Hide Details \u25B2":"View Details \u25BC"}
                          </button>
                          {expandedReqs[r.id] && (
                            <div style={{marginTop:"0.75rem", borderTop:"1px solid rgba(255,255,255,0.05)", paddingTop:"0.75rem"}}>
                               <div className="staff-note">Feedback sent: {r.feedback_rating || "-"}/5 - {r.feedback_comment} - {formatDateTime(r.feedback_submitted_at)}</div>
                               <div style={{marginTop:"0.5rem"}}><ServiceDetailBlock req={r} services={services}/></div>
                            </div>
                          )}
                        </>
                      )}

                      {!r.feedback_submitted_at && (
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
