import { useState, useEffect, useCallback } from "react";
import { api, saveSession, clearSession, getSession } from "../api";
import { Badge, RoleBadge, Toast, useToast, ServiceDetailBlock, ApprovalTrail, ProfileTab, PasswordInput } from "../components/common";
import { HorizontalBarChart, DonutChart, exportRowsToCsv } from "../components/charts";
import { DynamicServiceForm, ServiceManager } from "../components/ServiceManager";
import { formatDateTime } from "../utils/date";
import { getServiceCatalog, getServiceMeta, getServiceOptionsForRequests, getRequestDescription, getRequestLocation, getRequestPreferredDate, getRequesterIdentity, getRequesterDepartment, getRequesterEmail } from "../utils/services";

export default function HeadAdminPanel({ currentUser, onLogout, services, refreshServices }) {
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
                      <div className="req-meta" style={{marginTop:"0.5rem"}}><span>Submitted: {formatDateTime(r.submitted_at)}</span><span style={{color:"var(--primary)",fontWeight:600}}>Click to view full details</span></div>
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
                <div className="section-header"><h2>System Overview</h2><p>Professional analytics for administrators — departments, locations, and instructor usage.</p></div>

                <div className="overview-top-grid" style={{marginTop:"0.5rem"}}>
                  {[
                    { label:"Approved Accounts", value:stats.users.approved, note:`${stats.users.pending} still pending`, color:"#4ade80" },
                    { label:"Total Requests", value:stats.requests.total, note:`${stats.requests.completed} completed`, color:"#60a5fa" },
                    { label:"Needs Review", value:stats.requests.pending+stats.requests.verified, note:"Pending + verified", color:"#f59e0b" },
                    { label:"Rejected Flow", value:stats.requests.disapproved+(stats.requests.declined||0), note:"Disapproved + declined", color:"#f87171" },
                    { label:"Feedback Received", value:headFeedbackSubmitted, note:`${headFeedbackPending} pending`, color:"#34d399" },
                    { label:"Avg Rating", value:headFeedbackAvg, note:"Overall average", color:"#a78bfa" },
                  ].map(item=>(
                    <div className="overview-kpi" key={item.label}>
                      <div className="kpi-label">{item.label}</div>
                      <div className="kpi-value" style={{color:item.color}}>{item.value}</div>
                      <div className="kpi-note">{item.note}</div>
                    </div>
                  ))}
                </div>

                <div className="viz-grid" style={{marginTop:"1.5rem"}}>
                  <div className="chart-panel">
                    <h4>👥 User Distribution</h4>
                    <p>Compare account types and approval state side by side.</p>
                    <HorizontalBarChart items={userBreakdown} />
                  </div>
                  <div className="chart-panel">
                    <h4>📊 Request Status Share</h4>
                    <p>See how requests are distributed across the workflow.</p>
                    <DonutChart items={requestBreakdown} totalLabel="Requests" />
                  </div>
                </div>

                <div className="viz-grid" style={{marginTop:"1.5rem"}}>
                  <div className="chart-panel">
                    <h4>🏢 Department Usage</h4>
                    <p>Which departments submit the most service requests.</p>
                    {(() => {
                      const depts = Object.entries(
                        requests.reduce((acc,r)=>{ const d=r.department||"Unknown"; acc[d]=(acc[d]||0)+1; return acc; },{})
                      ).sort((a,b)=>b[1]-a[1]).slice(0,8);
                      return depts.length ? (
                        <HorizontalBarChart items={depts.map(([label,value],i)=>({
                          label, value,
                          color:["#60a5fa","#38bdf8","#a78bfa","#4ade80","#f59e0b","#f87171","#34d399","#fb7185"][i%8],
                        }))} />
                      ) : <div className="empty-state" style={{fontSize:"0.85rem"}}>No department data yet.</div>;
                    })()}
                  </div>
                  <div className="chart-panel">
                    <h4>📍 Top Request Locations</h4>
                    <p>Rooms and buildings with the highest request volume system-wide.</p>
                    {(() => {
                      const locs = Object.entries(
                        requests.reduce((acc,r)=>{ const l=r.location||"Unknown"; acc[l]=(acc[l]||0)+1; return acc; },{})
                      ).sort((a,b)=>b[1]-a[1]).slice(0,8);
                      const max = locs[0]?.[1]||1;
                      return locs.length ? (
                        <div style={{display:"flex",flexDirection:"column",gap:"0.55rem",marginTop:"0.75rem"}}>
                          {locs.map(([loc,cnt],i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:"0.75rem",fontSize:"0.85rem"}}>
                              <span style={{width:"1.5rem",textAlign:"right",color:"var(--text-muted)",fontSize:"0.75rem",fontWeight:600}}>#{i+1}</span>
                              <span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{loc}</span>
                              <div style={{flex:2,background:"rgba(255,255,255,0.05)",borderRadius:"4px",overflow:"hidden",height:"10px"}}>
                                <div style={{height:"100%",background:"#a78bfa",width:`${(cnt/max)*100}%`,borderRadius:"4px",transition:"width 0.4s"}}/>
                              </div>
                              <span style={{minWidth:"2rem",textAlign:"right",fontWeight:700,color:"#a78bfa"}}>{cnt}</span>
                            </div>
                          ))}
                        </div>
                      ) : <div className="empty-state" style={{fontSize:"0.85rem"}}>No location data yet.</div>;
                    })()}
                  </div>
                </div>

                <div className="viz-grid" style={{marginTop:"1.5rem"}}>
                  <div className="chart-panel">
                    <h4>👤 Top Requesters (Instructors)</h4>
                    <p>Users and instructors who submit the most service requests.</p>
                    {(() => {
                      const top = Object.entries(
                        requests.reduce((acc,r)=>{
                          const k=r.user_id||r.user_name;
                          if(!acc[k]) acc[k]={name:r.user_name,dept:r.department,count:0};
                          acc[k].count++; return acc;
                        },{})
                      ).sort((a,b)=>b[1].count-a[1].count).slice(0,8);
                      return top.length ? (
                        <div style={{display:"flex",flexDirection:"column",gap:"0.5rem",marginTop:"0.75rem"}}>
                          {top.map(([,u],i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"0.5rem 0.75rem",background:"rgba(255,255,255,0.03)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)"}}>
                              <div style={{width:"1.75rem",height:"1.75rem",borderRadius:"50%",background:["#60a5fa","#f59e0b","#4ade80","#a78bfa","#f87171"][i%5],display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.75rem",fontWeight:700,color:"#0f172a",flexShrink:0}}>
                                {(u.name||"?")[0].toUpperCase()}
                              </div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontWeight:600,fontSize:"0.85rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.name}</div>
                                <div style={{fontSize:"0.75rem",color:"var(--text-muted)"}}>{u.dept}</div>
                              </div>
                              <div style={{textAlign:"right"}}>
                                <div style={{fontWeight:700,color:"#60a5fa",fontSize:"1rem"}}>{u.count}</div>
                                <div style={{fontSize:"0.7rem",color:"var(--text-muted)"}}>requests</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : <div className="empty-state" style={{fontSize:"0.85rem"}}>No requester data yet.</div>;
                    })()}
                  </div>
                  <div className="chart-panel">
                    <h4>⭐ Feedback by Service</h4>
                    <p>Average satisfaction rating per service type.</p>
                    {(() => {
                      const byService = Object.entries(
                        requests.filter(r=>r.feedback_rating).reduce((acc,r)=>{
                          if(!acc[r.service_type]) acc[r.service_type]={sum:0,count:0};
                          acc[r.service_type].sum+=Number(r.feedback_rating);
                          acc[r.service_type].count++; return acc;
                        },{})
                      ).map(([svc,d])=>({svc,avg:d.sum/d.count,count:d.count})).sort((a,b)=>b.avg-a.avg);
                      return byService.length ? (
                        <div style={{display:"flex",flexDirection:"column",gap:"0.6rem",marginTop:"0.75rem"}}>
                          {byService.map((fb,i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:"0.75rem",fontSize:"0.85rem"}}>
                              <span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{fb.svc}</span>
                              <div style={{display:"flex",gap:"2px"}}>
                                {[1,2,3,4,5].map(star=>(<span key={star} style={{color:star<=Math.round(fb.avg)?"#f59e0b":"rgba(255,255,255,0.15)"}}>★</span>))}
                              </div>
                              <span style={{fontWeight:700,color:"#f59e0b",minWidth:"2.5rem",textAlign:"right"}}>{fb.avg.toFixed(1)}</span>
                              <span style={{color:"var(--text-muted)",fontSize:"0.75rem"}}>({fb.count})</span>
                            </div>
                          ))}
                        </div>
                      ) : <div className="empty-state" style={{fontSize:"0.85rem"}}>No feedback data yet.</div>;
                    })()}
                  </div>
                </div>

                <div className="stats-grid" style={{marginTop:"1.5rem"}}>
                  {[
                    {lbl:"Users",num:stats.users.total,color:"#93c5fd",bg:"rgba(59,130,246,0.1)",bc:"rgba(59,130,246,0.3)"},
                    {lbl:"Approved",num:stats.users.approved,color:"#4ade80",bg:"rgba(34,197,94,0.1)",bc:"rgba(34,197,94,0.3)"},
                    {lbl:"Total Requests",num:stats.requests.total,color:"#93c5fd",bg:"rgba(59,130,246,0.1)",bc:"rgba(59,130,246,0.3)"},
                    {lbl:"Completed",num:stats.requests.completed,color:"#5eead4",bg:"rgba(20,184,166,0.1)",bc:"rgba(20,184,166,0.3)"},
                    {lbl:"Feedback Got",num:headFeedbackSubmitted,color:"#34d399",bg:"rgba(16,185,129,0.1)",bc:"rgba(16,185,129,0.3)"},
                    {lbl:"Avg Rating",num:headFeedbackAvg,color:"#a78bfa",bg:"rgba(139,92,246,0.1)",bc:"rgba(139,92,246,0.3)"},
                  ].map(s=><div key={s.lbl} className="stat-card" style={{background:s.bg,border:`1px solid ${s.bc}`}}><span className="num" style={{color:s.color}}>{s.num}</span><div className="lbl">{s.lbl}</div></div>)}
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
