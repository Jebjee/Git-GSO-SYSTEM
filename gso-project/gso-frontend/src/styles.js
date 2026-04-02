export const APP_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  :root{--bg:#0f1117;--surface:#161b27;--surface2:#1e2535;--border:#2a3347;--primary:#3b82f6;--primary-dark:#2563eb;--success:#22c55e;--warning:#f59e0b;--danger:#ef4444;--text:#e8eaf0;--text-muted:#7c8ba1;--text-dim:#4a5568;--admin-accent:#8b5cf6;--staff-accent:#0ea5e9;--head-accent:#f97316;--font:'DM Sans',sans-serif;--mono:'DM Mono',monospace;--radius:12px;--shadow:0 4px 24px rgba(0,0,0,0.4);}
  body{font-family:var(--font);background:var(--bg);color:var(--text);min-height:100vh;}
  .auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 20% 50%,#1a2744 0%,var(--bg) 60%),radial-gradient(ellipse at 80% 20%,#1a1035 0%,transparent 50%);padding:2rem;}
  .auth-card{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:2.5rem;width:100%;max-width:420px;box-shadow:0 0 60px rgba(59,130,246,0.08),var(--shadow);animation:fadeUp 0.4s ease;}
  .auth-card.wide{max-width:720px;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
  .auth-logo{text-align:center;margin-bottom:2rem;}
  .logo-badge{display:inline-block;background:var(--primary);color:white;font-family:var(--mono);font-weight:500;font-size:1.1rem;padding:6px 14px;border-radius:8px;margin-bottom:0.75rem;letter-spacing:2px;}
  .logo-badge.sm{font-size:0.75rem;padding:4px 10px;border-radius:6px;margin-bottom:0;}
  .logo-badge.admin{background:var(--admin-accent);}
  .logo-badge.staff{background:var(--staff-accent);}
  .logo-badge.head{background:var(--head-accent);}
  .auth-logo h1{font-size:1.4rem;font-weight:700;margin-bottom:0.25rem;}
  .auth-logo p{color:var(--text-muted);font-size:0.875rem;}
  .field-group{margin-bottom:1rem;}
  .field-group label{display:block;font-size:0.8rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.4rem;}
  .field-group input,.field-group textarea,.field-group select{width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:0.7rem 1rem;color:var(--text);font-family:var(--font);font-size:0.95rem;transition:border-color 0.2s;outline:none;}
  .field-group input:focus,.field-group textarea:focus,.field-group select:focus{border-color:var(--primary);}
  .field-group textarea{resize:vertical;min-height:80px;}
  .field-group select option{background:var(--surface2);}
  .pw-wrap{position:relative;}
  .pw-wrap input{padding-right:3rem;}
  .pw-toggle{position:absolute;right:0.75rem;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.1rem;padding:0.25rem;line-height:1;}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:0 1rem;}
  .btn-primary{width:100%;padding:0.8rem;background:var(--primary);color:white;border:none;border-radius:10px;font-family:var(--font);font-size:1rem;font-weight:600;cursor:pointer;transition:background 0.2s;}
  .btn-primary:hover{background:var(--primary-dark);}
  .btn-primary:disabled{opacity:0.6;cursor:not-allowed;}
  .btn-ghost{background:transparent;border:1px solid var(--border);color:var(--text-muted);padding:0.6rem 1.2rem;border-radius:8px;cursor:pointer;font-family:var(--font);font-size:0.875rem;transition:all 0.2s;}
  .btn-ghost:hover{border-color:var(--text-muted);color:var(--text);}
  .err-box{background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;padding:0.7rem 1rem;border-radius:8px;font-size:0.875rem;margin-bottom:1rem;}
  .notice-box{background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);color:#93c5fd;padding:0.7rem 1rem;border-radius:8px;font-size:0.875rem;margin-bottom:1rem;}
  .switch-link{text-align:center;color:var(--text-muted);font-size:0.875rem;margin-top:1rem;}
  .switch-link span{color:var(--primary);cursor:pointer;font-weight:600;}
  .role-selector{display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1.5rem;}
  .role-option{background:var(--surface2);border:2px solid var(--border);border-radius:12px;padding:1rem 0.75rem;text-align:center;cursor:pointer;transition:all 0.2s;}
  .role-option:hover{border-color:var(--text-muted);}
  .role-option.selected{border-color:var(--primary);background:rgba(59,130,246,0.1);}
  .role-option.selected.staff{border-color:var(--staff-accent);background:rgba(14,165,233,0.1);}
  .role-option.selected.admin{border-color:var(--admin-accent);background:rgba(139,92,246,0.1);}
  .role-icon{font-size:1.5rem;margin-bottom:0.4rem;}
  .role-label{font-size:0.8rem;font-weight:600;}
  .role-desc{font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem;}
  .dashboard{min-height:100vh;display:flex;flex-direction:column;}
  .staff-theme{--primary:var(--staff-accent);}
  .admin-theme{--primary:var(--admin-accent);}
  .head-theme{--primary:var(--head-accent);}
  .dash-header{background:var(--surface);border-bottom:1px solid var(--border);padding:0 1.5rem;height:60px;display:flex;align-items:center;justify-content:space-between;gap:1rem;}
  .dash-brand{display:flex;align-items:center;gap:0.75rem;font-weight:600;font-size:0.95rem;min-width:0;}
  .dash-brand span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .dash-user-info{display:flex;align-items:center;gap:0.75rem;min-width:0;flex-shrink:0;}
  .dash-user-meta{display:flex;align-items:center;gap:0.75rem;min-width:0;}
  .dash-body{flex:1;display:flex;}
  .sidebar{width:240px;background:var(--surface);border-right:1px solid var(--border);padding:1rem 0.75rem 1.5rem;display:flex;flex-direction:column;gap:0.25rem;flex-shrink:0;}
  .sidebar-btn{display:flex;align-items:center;padding:0.7rem 1rem;background:transparent;border:none;border-radius:10px;color:var(--text-muted);cursor:pointer;font-family:var(--font);font-size:0.875rem;text-align:left;transition:all 0.2s;width:100%;}
  .sidebar-btn:hover{background:var(--surface2);color:var(--text);}
  .sidebar-btn.active{background:rgba(59,130,246,0.15);color:var(--primary);font-weight:600;}
  .staff-theme .sidebar-btn.active{background:rgba(14,165,233,0.15);}
  .admin-theme .sidebar-btn.active{background:rgba(139,92,246,0.15);}
  .head-theme .sidebar-btn.active{background:rgba(249,115,22,0.15);color:var(--head-accent);}
  .notif-dot{background:var(--danger);color:white;border-radius:20px;font-size:0.7rem;padding:1px 6px;font-weight:700;margin-left:auto;flex-shrink:0;}
  .sidebar-footer{margin-top:auto;padding-top:1rem;border-top:1px solid var(--border);}
  .backend-badge{background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);color:#4ade80;padding:6px 12px;border-radius:8px;font-size:0.75rem;font-weight:600;text-align:center;}
  .sidebar-stats{margin-top:1rem;display:flex;flex-direction:column;gap:0.5rem;}
  .stat-item{padding:0.75rem;background:var(--surface2);border-radius:8px;text-align:center;}
  .stat-item span{font-size:1.5rem;font-weight:700;color:var(--primary);display:block;}
  .stat-item small{color:var(--text-muted);font-size:0.75rem;}
  .dash-main{flex:1;padding:2rem;overflow-y:auto;}
  .section-header{margin-bottom:1.5rem;}
  .section-header h2{font-size:1.3rem;font-weight:700;margin-bottom:0.25rem;}
  .section-header p{color:var(--text-muted);font-size:0.875rem;}
  .service-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1.25rem;}
  .service-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:2rem 1.25rem;min-height:190px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;cursor:pointer;transition:all 0.2s;position:relative;overflow:hidden;}
  .service-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--accent);}
  .service-card:hover{border-color:var(--accent);transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,0.3);}
  .svc-icon{font-size:3.5rem;margin-bottom:1rem;}
  .svc-name{font-weight:700;font-size:1.05rem;margin-bottom:0.6rem;}
  .requests-list,.users-list,.notif-list{display:flex;flex-direction:column;gap:1rem;}
  .req-card,.user-card,.notif-item,.settings-section,.profile-section,.overview-section{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);}
  .req-card{padding:1.25rem;transition:all 0.2s;}
  .req-card.req-approved{border-left:3px solid var(--success);}
  .req-card.req-completed{border-left:3px solid #14b8a6;}
  .req-card.req-disapproved,.req-card.req-declined{border-left:3px solid var(--danger);}
  .req-card.req-pending{border-left:3px solid var(--warning);}
  .req-card.req-verified{border-left:3px solid var(--primary);}
  .req-card.clickable{cursor:pointer;}
  .req-card.clickable:hover{border-color:var(--primary);box-shadow:0 4px 20px rgba(59,130,246,0.15);transform:translateY(-1px);}
  .req-card.compact{padding:1rem 1.1rem;}
  .req-card.compact .req-desc{margin-bottom:0.45rem;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;}
  .req-card.compact .req-meta{gap:0.75rem;}
  .compact-hint{margin-top:0.6rem;font-size:0.76rem;color:var(--text-muted);}
  .req-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem;}
  .req-svc{font-weight:700;font-size:1rem;}
  .req-priority{display:inline-block;margin-left:0.55rem;padding:2px 8px;border-radius:999px;border:1px solid rgba(59,130,246,0.35);background:rgba(59,130,246,0.14);color:#93c5fd;font-size:0.7rem;font-weight:700;letter-spacing:0.03em;vertical-align:middle;}
  .req-user{color:var(--text-muted);font-size:0.8rem;margin-left:0.5rem;}
  .req-desc{color:var(--text-muted);font-size:0.875rem;margin-bottom:0.75rem;line-height:1.5;}
  .req-meta{display:flex;gap:1rem;flex-wrap:wrap;font-size:0.8rem;color:var(--text-dim);}
  .approval-trail{margin-top:0.75rem;display:flex;flex-direction:column;gap:0.4rem;}
  .trail-item{display:flex;align-items:center;gap:0.6rem;font-size:0.8rem;padding:0.5rem 0.75rem;border-radius:8px;border:1px solid var(--border);background:var(--surface2);}
  .trail-item.done-approved{border-color:rgba(34,197,94,0.3);background:rgba(34,197,94,0.05);}
  .trail-item.done-disapproved{border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.05);}
  .trail-item.waiting{border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.05);}
  .trail-name{font-weight:600;color:var(--text);}
  .staff-note{margin-top:0.6rem;background:rgba(14,165,233,0.08);border:1px solid rgba(14,165,233,0.2);color:#7dd3fc;padding:0.5rem 0.75rem;border-radius:8px;font-size:0.8rem;}
  .admin-note{margin-top:0.6rem;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#fca5a5;padding:0.5rem 0.75rem;border-radius:8px;font-size:0.8rem;}
  .req-actions{display:flex;gap:0.5rem;margin-top:1rem;flex-wrap:wrap;}
  .view-btn,.btn-verify,.btn-approve,.btn-reject{padding:0.5rem 1rem;border-radius:8px;cursor:pointer;font-family:var(--font);font-size:0.875rem;font-weight:600;transition:all 0.2s;}
  .view-btn{background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);color:#93c5fd;}
  .btn-verify{background:rgba(14,165,233,0.15);border:1px solid rgba(14,165,233,0.3);color:#7dd3fc;}
  .btn-approve{background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#4ade80;}
  .btn-reject{background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;}
  .btn-approve:disabled,.btn-reject:disabled,.btn-verify:disabled,.btn-approve.disabled{opacity:0.5;cursor:not-allowed;}
  .btn-approve.sm,.btn-reject.sm,.btn-verify.sm{padding:0.35rem 0.75rem;font-size:0.8rem;}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.7rem;font-weight:700;letter-spacing:0.5px;white-space:nowrap;}
  .badge-pending{background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);}
  .badge-verified{background:rgba(59,130,246,0.15);color:#93c5fd;border:1px solid rgba(59,130,246,0.3);}
  .badge-approved{background:rgba(34,197,94,0.15);color:#4ade80;border:1px solid rgba(34,197,94,0.3);}
  .badge-completed{background:rgba(20,184,166,0.15);color:#5eead4;border:1px solid rgba(20,184,166,0.3);}
  .badge-disapproved,.badge-rejected,.badge-declined{background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);}
  .badge-user{background:rgba(107,114,128,0.2);color:#9ca3af;border:1px solid rgba(107,114,128,0.3);}
  .badge-staff{background:rgba(14,165,233,0.15);color:#7dd3fc;border:1px solid rgba(14,165,233,0.3);}
  .badge-admin{background:rgba(139,92,246,0.15);color:#c4b5fd;border:1px solid rgba(139,92,246,0.3);}
  .badge-head_admin{background:rgba(249,115,22,0.15);color:#fdba74;border:1px solid rgba(249,115,22,0.3);}
  .user-card{padding:1rem 1.25rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;}
  .user-card.user-approved{border-left:3px solid var(--success);}
  .user-card.user-pending{border-left:3px solid var(--warning);}
  .user-card.user-rejected{border-left:3px solid var(--danger);}
  .user-info{display:flex;gap:1rem;align-items:center;}
  .user-avatar{width:44px;height:44px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:700;flex-shrink:0;}
  .user-name{font-weight:700;font-size:0.95rem;}
  .user-meta{color:var(--text-muted);font-size:0.78rem;margin-top:2px;}
  .user-right{display:flex;align-items:center;gap:0.75rem;flex-shrink:0;}
  .notif-item{padding:1rem 1.25rem;}
  .notif-item.unread{border-left:3px solid var(--primary);background:rgba(59,130,246,0.05);}
  .notif-msg{font-size:0.9rem;margin-bottom:0.35rem;}
  .notif-time{font-size:0.75rem;color:var(--text-dim);}
  .empty-state,.loading-state{text-align:center;color:var(--text-muted);padding:3rem;background:var(--surface);border:1px dashed var(--border);border-radius:var(--radius);font-size:0.95rem;}
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:100;padding:1rem;backdrop-filter:blur(4px);}
  .modal{background:var(--surface);border:1px solid var(--border);border-radius:16px;width:100%;max-width:520px;box-shadow:var(--shadow);animation:fadeUp 0.2s ease;max-height:90vh;overflow-y:auto;}
  .modal.modal-lg{max-width:640px;}
  .modal-header{padding:1.25rem 1.5rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--surface);z-index:1;}
  .modal-header h3{font-size:1.1rem;font-weight:700;}
  .modal-close{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;flex-shrink:0;}
  .modal-close:hover{background:var(--surface2);color:var(--text);}
  .modal-body{padding:1.5rem;}
  .modal-footer{padding:1rem 1.5rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:0.75rem;position:sticky;bottom:0;background:var(--surface);}
  .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.25rem;}
  .detail-item{background:var(--surface2);border-radius:10px;padding:0.9rem 1rem;}
  .detail-item.full{grid-column:1/-1;}
  .detail-label{font-size:0.72rem;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.35rem;}
  .detail-value{font-size:0.9rem;color:var(--text);font-weight:500;line-height:1.5;}
  .profile-header{display:flex;gap:2rem;align-items:flex-start;margin-bottom:2rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:2rem;}
  .profile-avatar{width:120px;height:120px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:2.5rem;font-weight:700;overflow:hidden;flex-shrink:0;cursor:pointer;position:relative;}
  .profile-avatar img{width:100%;height:100%;object-fit:cover;}
  .profile-avatar:hover::after{content:'📷 Change';position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:white;font-size:0.7rem;padding:0.4rem;text-align:center;}
  .profile-info{flex:1;}
  .profile-name{font-size:1.4rem;font-weight:700;margin-bottom:0.5rem;}
  .profile-email{color:var(--text-muted);margin-bottom:0.75rem;}
  .profile-section{padding:1.5rem;margin-bottom:1.5rem;}
  .profile-section h3{font-size:1.1rem;font-weight:700;margin-bottom:1rem;}
  .profile-fields{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;}
  .profile-field{background:var(--surface2);border-radius:10px;padding:1rem;}
  .profile-field label{font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;display:block;}
  .profile-field .value{font-size:0.95rem;color:var(--text);font-weight:500;}
  .security-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;}
  .security-card{background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:1rem;}
  .security-card h4{font-size:0.95rem;font-weight:700;margin-bottom:0.8rem;}
  .security-confirm-btn{margin-top:0.25rem;}
  .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1rem;margin-bottom:2rem;}
  .stat-card{border-radius:12px;padding:1.25rem;text-align:center;}
  .stat-card .num{font-size:2rem;font-weight:800;display:block;}
  .stat-card .lbl{font-size:0.8rem;color:var(--text-muted);margin-top:0.35rem;}
  .overview-shell{display:flex;flex-direction:column;gap:1.5rem;}
  .overview-section{padding:1.5rem;}
  .overview-title{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;}
  .overview-title h3{font-size:1rem;font-weight:700;}
  .overview-title p{font-size:0.82rem;color:var(--text-muted);}
  .overview-top-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;}
  .overview-kpi{background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0));border:1px solid var(--border);border-radius:14px;padding:1rem 1.1rem;}
  .overview-kpi .kpi-label{font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;}
  .overview-kpi .kpi-value{font-size:2rem;font-weight:800;margin-top:0.4rem;}
  .overview-kpi .kpi-note{font-size:0.8rem;color:var(--text-dim);margin-top:0.3rem;}
  .viz-grid{display:grid;grid-template-columns:minmax(320px,1.4fr) minmax(280px,1fr);gap:1rem;}
  .chart-panel{background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:1rem 1.1rem;}
  .chart-panel h4{font-size:0.92rem;font-weight:700;margin-bottom:0.2rem;}
  .chart-panel p{font-size:0.78rem;color:var(--text-muted);margin-bottom:1rem;}
  .bar-chart{display:flex;flex-direction:column;gap:0.85rem;}
  .bar-row{display:grid;grid-template-columns:110px 1fr 46px;gap:0.75rem;align-items:center;}
  .bar-label{font-size:0.82rem;color:var(--text);}
  .bar-track{height:12px;border-radius:999px;background:rgba(255,255,255,0.06);overflow:hidden;position:relative;}
  .bar-fill{height:100%;border-radius:999px;}
  .bar-value{font-size:0.8rem;color:var(--text-muted);text-align:right;}
  .donut-wrap{display:grid;grid-template-columns:180px 1fr;gap:1rem;align-items:center;}
  .donut-chart{width:180px;height:180px;border-radius:50%;position:relative;display:grid;place-items:center;}
  .donut-chart::after{content:"";width:112px;height:112px;border-radius:50%;background:var(--surface2);border:1px solid rgba(255,255,255,0.06);}
  .donut-center{position:absolute;text-align:center;z-index:1;}
  .donut-center strong{display:block;font-size:1.7rem;line-height:1;}
  .donut-center span{font-size:0.78rem;color:var(--text-muted);}
  .legend-list{display:flex;flex-direction:column;gap:0.65rem;}
  .legend-item{display:flex;align-items:center;justify-content:space-between;gap:1rem;font-size:0.82rem;}
  .legend-left{display:flex;align-items:center;gap:0.6rem;}
  .legend-dot{width:11px;height:11px;border-radius:50%;}
  .legend-value{color:var(--text-muted);}
  .approval-flow{display:flex;align-items:center;gap:0.5rem;margin-bottom:1.5rem;flex-wrap:wrap;}
  .flow-step{display:flex;align-items:center;gap:0.4rem;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:0.4rem 0.9rem;font-size:0.8rem;font-weight:600;}
  .flow-step.done{border-color:rgba(34,197,94,0.4);background:rgba(34,197,94,0.08);color:#4ade80;}
  .flow-step.active{border-color:var(--primary);background:rgba(59,130,246,0.1);color:#93c5fd;}
  .flow-step.waiting{color:var(--text-dim);}
  .flow-arrow{color:var(--text-dim);font-size:1rem;}
  .settings-section{padding:1.5rem;margin-bottom:1.5rem;}
  .settings-section h3{font-size:1rem;font-weight:700;margin-bottom:1rem;}
  .toggle-row{display:flex;align-items:center;justify-content:space-between;padding:1rem;background:var(--surface2);border-radius:10px;}
  .toggle-desc{font-size:0.875rem;color:var(--text-muted);margin-top:0.25rem;}
  .toggle-btns{display:flex;gap:0.5rem;}
  .toggle-btn{padding:0.5rem 1.25rem;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;font-family:var(--font);font-size:0.875rem;font-weight:600;transition:all 0.2s;}
  .toggle-btn.selected{background:var(--primary);border-color:var(--primary);color:white;}
  .toast{position:fixed;bottom:2rem;right:2rem;z-index:999;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1rem 1.5rem;box-shadow:var(--shadow);animation:fadeUp 0.3s ease;font-size:0.9rem;font-weight:500;max-width:360px;}
  .toast-success{border-left:3px solid var(--success);}
  .toast-error{border-left:3px solid var(--danger);}
  .toast-info{border-left:3px solid var(--primary);}
  .service-ready-banner{background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:10px;padding:1rem 1.25rem;margin-bottom:1rem;display:flex;align-items:center;gap:0.75rem;}
  .service-manager-header{display:flex;justify-content:space-between;gap:1rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem;}
  .service-admin-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.25rem;display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;}
  .service-admin-meta{color:var(--text-muted);font-size:0.8rem;margin-top:0.35rem;}
  .service-admin-fields{display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.75rem;}
  .field-chip{background:var(--surface2);border:1px solid var(--border);border-radius:999px;padding:0.3rem 0.7rem;font-size:0.75rem;color:var(--text-muted);}
  .field-builder{display:flex;flex-direction:column;gap:0.75rem;margin-top:1rem;}
  .field-builder-item{background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:1rem;}
  .field-builder-grid{display:grid;grid-template-columns:1.2fr 1fr 1fr auto;gap:0.75rem;align-items:end;}
  .inline-check{display:flex;align-items:center;gap:0.5rem;font-size:0.85rem;color:var(--text-muted);}
  .inline-check input{width:auto;}
  .detail-stack{display:flex;flex-direction:column;gap:0.75rem;margin-bottom:1rem;}
  .detail-stack-item{background:var(--surface2);border-radius:10px;padding:0.9rem 1rem;}
  .detail-stack-label{font-size:0.72rem;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.35rem;}
  .detail-stack-value{font-size:0.9rem;color:var(--text);line-height:1.5;word-break:break-word;}
  .filter-tabs{display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:1rem;}
  .filter-tabs button{padding:0.4rem 1rem;border-radius:20px;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;font-family:var(--font);font-size:0.8rem;font-weight:600;transition:all 0.2s;}
  .filter-tabs button:hover{border-color:var(--text-muted);color:var(--text);}
  .filter-tabs button.active{background:var(--primary);border-color:var(--primary);color:white;}
  .user-avatar-small{width:32px;height:32px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:0.85rem;font-weight:700;flex-shrink:0;overflow:hidden;}
  .user-avatar-small img{width:100%;height:100%;object-fit:cover;display:block;}
  .user-details{display:flex;flex-direction:column;min-width:0;}
  .user-dept{color:var(--text-muted);font-size:0.8rem;background:var(--surface2);padding:3px 10px;border-radius:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;}
  .user-greeting{font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;}
  @media (max-width:980px){.viz-grid{grid-template-columns:1fr;}.donut-wrap{grid-template-columns:1fr;justify-items:center;}.legend-list{width:100%;}}
  @media (max-width:900px){.dash-body{flex-direction:column;}.sidebar{width:100%;border-right:none;border-bottom:1px solid var(--border);}.profile-header,.detail-grid,.profile-fields,.grid-2,.field-builder-grid,.security-grid{grid-template-columns:1fr;display:grid;}.bar-row{grid-template-columns:90px 1fr 40px;}.dash-main{padding:1.2rem;}.dash-header{padding:0 1rem;}}
`;
