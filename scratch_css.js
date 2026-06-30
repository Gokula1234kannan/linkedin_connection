const fs = require('fs');
const path1 = 'd:/linkedin_connection/src/views/dashboard.ejs';
const path2 = 'd:/linkedin_connection/src/views/risk-events.ejs';

const css = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', Arial, sans-serif;
      background: linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%);
      background-attachment: fixed;
      color: #1e293b;
      min-height: 100vh;
    }

    /* ── Nav ─────────────────────────────────────────────────── */
    nav {
      background: rgba(255, 255, 255, 0.25);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      padding: 0 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      height: 60px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.3);
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.05);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    nav .logo { color: #1e293b; font-weight: 800; font-size: 18px; margin-right: 24px; letter-spacing: -0.5px; }
    nav a {
      color: #334155;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 8px;
      transition: all 0.2s ease;
    }
    nav a:hover { background: rgba(255, 255, 255, 0.4); color: #0f172a; transform: translateY(-1px); }
    nav .nav-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }

    /* ── Worker status bar ────────────────────────────────────── */
    #worker-bar {
      background: rgba(255, 255, 255, 0.4);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.5);
      color: #334155;
      font-size: 13px;
      padding: 8px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 16px auto;
      max-width: 1200px;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.03);
    }
    #worker-bar .dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: #94a3b8;
      flex-shrink: 0;
      transition: all 0.3s ease;
    }
    #worker-bar.online .dot  { background: #10b981; box-shadow: 0 0 10px #10b981; }
    #worker-bar.idle .dot    { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; }
    #worker-bar.paused .dot  { background: #f59e0b; }
    #worker-bar.offline .dot { background: #ef4444; box-shadow: 0 0 10px #ef4444; }
    #worker-bar.risk .dot    { background: #ef4444; animation: pulse 1s ease infinite; }
    @keyframes pulse { 0%,100% { opacity:1; box-shadow: 0 0 12px #ef4444; } 50% { opacity:0.4; box-shadow: none; } }
    #worker-label { font-weight: 700; color: #0f172a; }
    #worker-job   { color: #475569; font-size: 12px; font-weight: 500; }
    #worker-queue { margin-left: auto; color: #475569; font-weight: 600; }
    #last-refresh { margin-left: 12px; color: #64748b; font-size: 11px; }

    /* ── Layout ──────────────────────────────────────────────── */
    .container { max-width: 1200px; margin: 0 auto; padding: 0 16px 40px; }

    /* ── Cards (Glassmorphism) ───────────────────────────────── */
    .card {
      background: rgba(255, 255, 255, 0.45);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.6);
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 24px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.06);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 40px rgba(0,0,0,0.08);
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
      border-bottom: 1px solid rgba(255,255,255,0.4);
      padding-bottom: 12px;
    }
    .card h2 {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.3px;
    }
    .live-badge {
      font-size: 11px;
      font-weight: 700;
      color: #065f46;
      background: rgba(209, 250, 229, 0.6);
      border: 1px solid rgba(167, 243, 208, 0.8);
      border-radius: 20px;
      padding: 4px 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      backdrop-filter: blur(4px);
    }
    .live-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #10b981;
      animation: pulseGreen 1.5s ease infinite;
    }
    @keyframes pulseGreen { 0%,100% { opacity:1; } 50% { opacity:0.3; } }

    /* ── Flash messages ──────────────────────────────────────── */
    .flash-success {
      background: rgba(209, 250, 229, 0.7); border: 1px solid rgba(52, 211, 153, 0.4); color: #065f46;
      border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; font-size: 14px; backdrop-filter: blur(10px);
      font-weight: 500;
    }
    .flash-error {
      background: rgba(254, 226, 226, 0.7); border: 1px solid rgba(248, 113, 113, 0.4); color: #991b1b;
      border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; font-size: 14px; backdrop-filter: blur(10px);
      font-weight: 500;
    }
    .flash-info {
      background: rgba(219, 234, 254, 0.7); border: 1px solid rgba(96, 165, 250, 0.4); color: #1e40af;
      border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; font-size: 14px; backdrop-filter: blur(10px);
      font-weight: 500;
    }

    /* ── Quick Connect ───────────────────────────────────────── */
    .qc-form { display: flex; gap: 12px; align-items: stretch; flex-wrap: wrap; margin-bottom: 16px; }
    .qc-form input[type="url"] {
      flex: 1 1 340px; padding: 12px 18px;
      border: 1px solid rgba(255,255,255,0.6); border-radius: 12px;
      background: rgba(255,255,255,0.5);
      font-size: 14px; font-family: inherit; font-weight: 500;
      transition: all 0.2s ease;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
    }
    .qc-form input[type="url"]:focus { outline: none; border-color: #60a5fa; background: #fff; box-shadow: 0 0 0 3px rgba(96,165,250,0.2); }
    .qc-template-preview {
      background: rgba(255,255,255,0.4); border: 1px dashed rgba(148, 163, 184, 0.5); border-radius: 12px;
      padding: 14px 18px; font-size: 13px; color: #475569; margin-top: 12px; font-style: italic;
    }
    .qc-template-preview strong { font-style: normal; color: #0f172a; font-weight: 600; }

    /* ── Spinner ─────────────────────────────────────────────── */
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      display: none; width: 18px; height: 18px;
      border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff;
      border-radius: 50%; animation: spin 0.7s linear infinite;
      vertical-align: middle; margin-right: 8px;
    }
    .processing-overlay {
      display: none; position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(8px); z-index: 999;
      align-items: center; justify-content: center;
    }
    .processing-overlay.active { display: flex; }
    .processing-box {
      background: rgba(255,255,255,0.85); border-radius: 20px; padding: 40px 56px;
      text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      border: 1px solid rgba(255,255,255,0.9);
    }
    .processing-box .big-spinner {
      width: 56px; height: 56px;
      border: 4px solid #e2e8f0; border-top-color: #3b82f6;
      border-radius: 50%; animation: spin 0.9s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
      margin: 0 auto 24px;
    }
    .processing-box p { font-size: 16px; color: #0f172a; font-weight: 600; }
    .processing-box small { color: #64748b; font-size: 13px; display: block; margin-top: 10px; }

    /* ── Status badges ───────────────────────────────────────── */
    .badge {
      display: inline-block; padding: 4px 12px;
      border-radius: 20px; font-size: 11px; font-weight: 700;
      letter-spacing: 0.3px;
    }
    .badge-REQUEST_SENT     { background: #dcfce7; color: #166534; border: 1px solid rgba(22,101,52,0.1); }
    .badge-MESSAGE_READY    { background: #e0f2fe; color: #075985; border: 1px solid rgba(7,89,133,0.1); }
    .badge-QUEUED           { background: #fef9c3; color: #854d0e; border: 1px solid rgba(133,77,14,0.1); }
    .badge-PROCESSING       { background: #dbeafe; color: #1e40af; border: 1px solid rgba(30,64,175,0.1); }
    .badge-FAILED           { background: #fee2e2; color: #991b1b; border: 1px solid rgba(153,27,27,0.1); }
    .badge-RISK_DETECTED    { background: #fee2e2; color: #991b1b; border: 1px solid rgba(153,27,27,0.1); }
    .badge-INVALID          { background: #fee2e2; color: #991b1b; border: 1px solid rgba(153,27,27,0.1); }
    .badge-DUPLICATE        { background: #f1f5f9; color: #475569; border: 1px solid rgba(71,85,105,0.1); }
    .badge-ALREADY_CONNECTED{ background: #dcfce7; color: #166534; border: 1px solid rgba(22,101,52,0.1); }
    .badge-ALREADY_PENDING  { background: #fef9c3; color: #854d0e; border: 1px solid rgba(133,77,14,0.1); }
    .badge-ACTIVE           { background: #dcfce7; color: #166534; border: 1px solid rgba(22,101,52,0.1); }
    .badge-PAUSED           { background: #f1f5f9; color: #475569; border: 1px solid rgba(71,85,105,0.1); }
    .badge-FOLLOW_ONLY      { background: #f1f5f9; color: #475569; border: 1px solid rgba(71,85,105,0.1); }
    .badge-CRITICAL         { background: #fee2e2; color: #991b1b; border: 1px solid rgba(153,27,27,0.1); }
    .badge-HIGH             { background: #fef9c3; color: #854d0e; border: 1px solid rgba(133,77,14,0.1); }
    .badge-MEDIUM           { background: #fef9c3; color: #854d0e; border: 1px solid rgba(133,77,14,0.1); }
    .badge-LOW              { background: #f1f5f9; color: #475569; border: 1px solid rgba(71,85,105,0.1); }
    .badge                  { background: #f1f5f9; color: #475569; border: 1px solid rgba(71,85,105,0.1); }

    /* ── Stats grid ──────────────────────────────────────────── */
    .stats-grid { display: flex; flex-wrap: wrap; gap: 12px; }
    .stat-item {
      background: rgba(255,255,255,0.5); border: 1px solid rgba(255,255,255,0.6);
      border-radius: 12px; padding: 14px 20px; font-size: 13px; min-width: 150px;
      transition: all 0.3s ease; flex-grow: 1; text-align: center; font-weight: 500;
      color: #334155; box-shadow: 0 4px 15px rgba(0,0,0,0.02);
    }
    .stat-item:hover { background: rgba(255,255,255,0.8); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.04); }
    .stat-item.changed { border-color: #3b82f6; background: rgba(219,234,254,0.6); transform: scale(1.05); }
    .stat-item strong { display: block; font-size: 26px; color: #0f172a; font-weight: 800; margin-bottom: 4px; }

    /* ── Upload form ─────────────────────────────────────────── */
    .upload-form { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .upload-form input[type="text"] {
      flex: 1 1 240px; padding: 12px 16px;
      border: 1px solid rgba(255,255,255,0.6); border-radius: 12px;
      background: rgba(255,255,255,0.5); font-weight: 500;
      font-size: 14px; font-family: inherit; transition: all 0.2s;
    }
    .upload-form input[type="text"]:focus { outline: none; border-color: #60a5fa; background: #fff; box-shadow: 0 0 0 3px rgba(96,165,250,0.2); }
    .upload-form input[type="file"] { font-size: 13px; font-weight: 500; padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.3); border: 1px dashed rgba(255,255,255,0.6); }

    .btn {
      padding: 12px 24px; border: none; border-radius: 12px;
      font-size: 14px; font-weight: 700; cursor: pointer;
      font-family: inherit; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(4px); letter-spacing: 0.2px;
    }
    .btn:active { transform: scale(0.96); }
    .btn-primary { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #fff; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4); background: linear-gradient(135deg, #4f8cf6 0%, #2b6bf3 100%); }
    .btn-danger  { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #fff; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); }
    .btn-danger:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(220, 38, 38, 0.4); }
    .btn-success { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3); }
    .btn-success:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(5, 150, 105, 0.4); }
    .btn-sm { padding: 6px 14px; font-size: 12px; border-radius: 8px; }

    /* ── Tables ──────────────────────────────────────────────── */
    .table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.2); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th {
      background: rgba(255,255,255,0.6); font-weight: 700; color: #1e293b;
      padding: 14px 16px; text-align: left;
      border-bottom: 2px solid rgba(255,255,255,0.4); white-space: nowrap;
    }
    td { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.2); vertical-align: middle; color: #334155; font-weight: 500; }
    tr:last-child td { border-bottom: none; }
    tr { transition: background 0.2s; }
    tr:hover td { background: rgba(255,255,255,0.5); }
    tr.row-new td { animation: rowFlash 1.5s ease; }
    tr.row-changed td { animation: rowFlash 1.5s ease; }

    .url-cell   { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .msg-cell   { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .error-cell { color: #dc2626; font-size: 12px; font-weight: 600; max-width: 180px; }

    /* ── Activity feed ───────────────────────────────────────── */
    .activity-list { list-style: none; }
    .activity-list li {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.3); font-size: 13px; font-weight: 500; color: #334155;
      transition: background 0.2s; border-radius: 8px; margin: 0 -8px; padding-left: 8px; padding-right: 8px;
    }
    .activity-list li:hover { background: rgba(255,255,255,0.4); }
    .activity-list li:last-child { border-bottom: none; }
    .activity-icon { font-size: 16px; flex-shrink: 0; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1)); }
    .activity-time { color: #64748b; font-size: 11px; white-space: nowrap; font-weight: 600; }
    .activity-msg  { flex: 1; }
    .activity-empty { color: #64748b; font-size: 14px; font-style: italic; }

    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media (max-width: 768px) { .two-col { grid-template-columns: 1fr; } }

    .hint { font-size: 13px; color: #475569; margin-top: 10px; font-weight: 500; }
    a { color: #2563eb; font-weight: 600; text-decoration: none; transition: color 0.2s; }
    a:hover { color: #1d4ed8; text-decoration: underline; }
`;

function processFile(p) {
    if (fs.existsSync(p)) {
        let content = fs.readFileSync(p, 'utf8');
        content = content.replace(/<style>[\s\S]*?<\/style>/, '<style>\n' + css + '\n  </style>');
        fs.writeFileSync(p, content, 'utf8');
        console.log('Updated', p);
    }
}

processFile(path1);
processFile(path2);
