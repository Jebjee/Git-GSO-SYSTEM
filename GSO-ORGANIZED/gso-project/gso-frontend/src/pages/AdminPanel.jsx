import { useState, useEffect, useCallback } from "react";
import { api, saveSession, clearSession, getSession } from "../api";
import { Badge, RoleBadge, Toast, useToast, ServiceDetailBlock, ApprovalTrail, ProfileTab, PasswordInput } from "../components/common";
import { HorizontalBarChart, DonutChart, exportRowsToCsv } from "../components/charts";
import { DynamicServiceForm, ServiceManager } from "../components/ServiceManager";
import { formatDateTime } from "../utils/date";
import { getServiceCatalog, getServiceMeta, getServiceOptionsForRequests, getRequestDescription, getRequestLocation, getRequestPreferredDate, getRequesterIdentity, getRequesterDepartment, getRequesterEmail } from "../utils/services";

export default function AdminPanel({ currentUser, onLogout, services, refreshServices }) {
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
                        <div className="req-meta" style={{marginTop:"0.5rem"}}><span>Submitted: {formatDateTime(r.submitted_at)}</span><span style={{color:"var(--primary)",fontWeight:600}}>Click to view full details</span></div>
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
                      <div className="req-meta" style={{marginTop:"0.5rem"}}><span>Submitted: {formatDateTime(r.submitted_at)}</span><span style={{color:"var(--primary)",fontWeight:600}}>Click to view full details</span></div>
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
                     <button className="btn-ghost" onClick={() => exportRowsToCsv("admin-analytics.csv", (analytics.requestsByUser || []).map(item => ({ service: item.service_type, status: item.status, requester: item.user_name, department: item.department, location: item.location, submitted_at: item.submitted_at })))}>
                       📥 Export CSV
                     </button>
                </div>
                 </div>

                {/* KPI Row */}
                <div className="overview-top-grid" style={{marginTop:"1.25rem"}}>
                  {[
                    { label:"Total Requests", value:analytics.stats.total, note:`${analytics.stats.pending} pending`, color:"#60a5fa" },
                    { label:"Completed", value:analytics.stats.completed, note:`${analytics.stats.approved} ready for service`, color:"#4ade80" },
                    { label:"In Review", value:analytics.stats.verified, note:"Awaiting admin action", color:"#38bdf8" },
                    { label:"Rejected", value:(analytics.stats.disapproved||0)+(analytics.stats.declined||0), note:"Disapproved + declined", color:"#f87171" },
                    { label:"Feedback Received", value:adminFeedbackSubmitted, note:`${adminFeedbackPending} still pending`, color:"#34d399" },
                    { label:"Avg Rating", value:analytics.avgFeedback||adminFeedbackAvg, note:`From ${analytics.avgFeedbackCount||0} ratings`, color:"#a78bfa" },
                  ].map(item=>(
                    <div className="overview-kpi" key={item.label}>
                      <div className="kpi-label">{item.label}</div>
                      <div className="kpi-value" style={{color:item.color}}>{item.value}</div>
                      <div className="kpi-note">{item.note}</div>
                    </div>
                  ))}
                </div>

                {/* Status & Service Charts */}
                <div className="viz-grid" style={{marginTop:"1.5rem"}}>
                  <div className="chart-panel">
                    <h4>📊 Request Status Flow</h4>
                    <p>Distribution of requests across the workflow pipeline.</p>
                    <HorizontalBarChart items={adminStatusChart} />
                  </div>
                  <div className="chart-panel">
                    <h4>🧰 Service Demand</h4>
                    <p>Most requested service types in the selected period.</p>
                    <DonutChart items={adminServiceChart.length ? adminServiceChart : [{ label:"No Data", value:1, color:"rgba(255,255,255,0.12)" }]} totalLabel="Requests" />
                  </div>
                </div>

                {/* Department & Location */}
                <div className="viz-grid" style={{marginTop:"1.5rem"}}>
                  <div className="chart-panel">
                    <h4>🏢 Department Usage</h4>
                    <p>Which departments submit the most service requests.</p>
                    {analytics.byDepartment?.length ? (
                      <HorizontalBarChart items={analytics.byDepartment.slice(0,8).map((d,i)=>({
                        label: d.department || "Unknown",
                        value: Number(d.count),
                        color: ["#60a5fa","#38bdf8","#a78bfa","#4ade80","#f59e0b","#f87171","#34d399","#fb7185"][i%8],
                      }))} />
                    ) : <div className="empty-state" style={{fontSize:"0.85rem"}}>No department data yet.</div>}
                  </div>
                  <div className="chart-panel">
                    <h4>📍 Top Locations</h4>
                    <p>Rooms and buildings with the highest request volume.</p>
                    {analytics.byLocation?.length ? (
                      <div style={{display:"flex",flexDirection:"column",gap:"0.55rem",marginTop:"0.75rem"}}>
                        {analytics.byLocation.slice(0,8).map((loc,i)=>{
                          const max = Number(analytics.byLocation[0]?.count) || 1;
                          return (
                            <div key={i} style={{display:"flex",alignItems:"center",gap:"0.75rem",fontSize:"0.85rem"}}>
                              <span style={{width:"1.5rem",textAlign:"right",color:"var(--text-muted)",fontSize:"0.75rem",fontWeight:600}}>#{i+1}</span>
                              <span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{loc.location||"Unknown"}</span>
                              <div style={{flex:2,background:"rgba(255,255,255,0.05)",borderRadius:"4px",overflow:"hidden",height:"10px"}}>
                                <div style={{height:"100%",background:"#38bdf8",width:`${(Number(loc.count)/max)*100}%`,borderRadius:"4px",transition:"width 0.4s"}}/>
                              </div>
                              <span style={{minWidth:"2rem",textAlign:"right",fontWeight:700,color:"#38bdf8"}}>{loc.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : <div className="empty-state" style={{fontSize:"0.85rem"}}>No location data yet.</div>}
                  </div>
                </div>

                {/* Top Requesters & Feedback by Service */}
                <div className="viz-grid" style={{marginTop:"1.5rem"}}>
                  <div className="chart-panel">
                    <h4>👤 Top Requesters</h4>
                    <p>Instructors and users who submit the most requests.</p>
                    {analytics.topRequesters?.length ? (
                      <div style={{display:"flex",flexDirection:"column",gap:"0.5rem",marginTop:"0.75rem"}}>
                        {analytics.topRequesters.map((u,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"0.5rem 0.75rem",background:"rgba(255,255,255,0.03)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)"}}>
                            <div style={{width:"1.75rem",height:"1.75rem",borderRadius:"50%",background:["#60a5fa","#f59e0b","#4ade80"][i%3],display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.75rem",fontWeight:700,color:"#0f172a",flexShrink:0}}>
                              {(u.user_name||"?")[0].toUpperCase()}
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:600,fontSize:"0.85rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.user_name}</div>
                              <div style={{fontSize:"0.75rem",color:"var(--text-muted)"}}>{u.department}</div>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontWeight:700,color:"#60a5fa",fontSize:"1rem"}}>{u.count}</div>
                              <div style={{fontSize:"0.7rem",color:"var(--text-muted)"}}>requests</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <div className="empty-state" style={{fontSize:"0.85rem"}}>No requester data yet.</div>}
                  </div>
                  <div className="chart-panel">
                    <h4>⭐ Feedback by Service</h4>
                    <p>Average user satisfaction rating per service type.</p>
                    {analytics.feedbackByService?.length ? (
                      <div style={{display:"flex",flexDirection:"column",gap:"0.6rem",marginTop:"0.75rem"}}>
                        {analytics.feedbackByService.map((fb,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:"0.75rem",fontSize:"0.85rem"}}>
                            <span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{fb.service_type}</span>
                            <div style={{display:"flex",gap:"2px"}}>
                              {[1,2,3,4,5].map(star=>(
                                <span key={star} style={{fontSize:"0.85rem",color:star<=Math.round(fb.avg_rating)?"#f59e0b":"rgba(255,255,255,0.15)"}}>★</span>
                              ))}
                            </div>
                            <span style={{fontWeight:700,color:"#f59e0b",minWidth:"2.5rem",textAlign:"right"}}>{Number(fb.avg_rating).toFixed(1)}</span>
                            <span style={{color:"var(--text-muted)",fontSize:"0.75rem"}}>({fb.count})</span>
                          </div>
                        ))}
                      </div>
                    ) : <div className="empty-state" style={{fontSize:"0.85rem"}}>No feedback data yet.</div>}
                  </div>
                </div>

                {/* Core Stats Row */}
                <div className="stats-grid" style={{marginTop:"1.5rem"}}>
                  {[
                    {lbl:"Total",num:analytics.stats.total,color:"#93c5fd",bg:"rgba(59,130,246,0.1)",bc:"rgba(59,130,246,0.3)"},
                    {lbl:"Completed",num:analytics.stats.completed,color:"#5eead4",bg:"rgba(20,184,166,0.1)",bc:"rgba(20,184,166,0.3)"},
                    {lbl:"Pending",num:analytics.stats.pending,color:"#fbbf24",bg:"rgba(245,158,11,0.1)",bc:"rgba(245,158,11,0.3)"},
                    {lbl:"Feedback Submitted",num:adminFeedbackSubmitted,color:"#4ade80",bg:"rgba(34,197,94,0.1)",bc:"rgba(34,197,94,0.3)"},
                    {lbl:"Feedback Pending",num:adminFeedbackPending,color:"#fb7185",bg:"rgba(244,63,94,0.1)",bc:"rgba(244,63,94,0.3)"},
                    {lbl:"Avg Rating",num:analytics.avgFeedback||adminFeedbackAvg,color:"#a78bfa",bg:"rgba(139,92,246,0.1)",bc:"rgba(139,92,246,0.3)"},
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
