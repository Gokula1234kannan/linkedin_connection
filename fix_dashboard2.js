const fs = require('fs');
const file = 'src/views/dashboard.ejs';
let content = fs.readFileSync(file, 'utf8');

// 1. timeSince
content = content.replace(
  /function timeSince\(isoString\) \{\s*if \(!isoString\) return '';\s*const sec = Math\.floor\(\(Date\.now\(\) - new Date\(isoString\)\.getTime\(\)\) \/ 1000\);/m,
  `function timeSince(isoString) {
    if (!isoString) return '';
    const dateStr = isoString.endsWith('Z') ? isoString : isoString.replace(' ', 'T') + 'Z';
    const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);`
);

// 2. Activity Feed Header
content = content.replace(
  /<div class="card-header">\s*<h2>📡 Activity Feed<\/h2>\s*<span class="live-badge"><span class="live-dot"><\/span> LIVE<\/span>\s*<\/div>/m,
  `<div class="card-header">
        <div style="display: flex; align-items: center; gap: 12px;">
          <h2 style="margin: 0; border: none; padding: 0;">📡 Activity Feed</h2>
          <span class="live-badge"><span class="live-dot"></span> LIVE</span>
        </div>
        <button id="view-all-activity-btn" class="btn btn-sm" style="background: rgba(226, 232, 240, 0.6); color: #475569; border: 1px solid rgba(203, 213, 225, 0.6);">View All</button>
      </div>`
);

// 3. pollActivity
content = content.replace(
  /const list = document\.getElementById\('activity-list'\);\s*list\.innerHTML = data\.activity\.map\(a => `\s*<li>\s*<span class="activity-icon">\$\{activityIcon\(a\.event_type\)\}<\/span>\s*<span class="activity-msg">\$\{a\.message\}<\/span>\s*<span class="activity-time">\$\{timeSince\(a\.created_at\)\}<\/span>\s*<\/li>`\)\.join\(''\);/m,
  `const list = document.getElementById('activity-list');
      const recent = data.activity.slice(0, 5);
      list.innerHTML = recent.map(a => \`
        <li>
          <span class="activity-icon">\${activityIcon(a.event_type)}</span>
          <span class="activity-msg">\${a.message}</span>
          <span class="activity-time">\${timeSince(a.created_at)}</span>
        </li>\`).join('');
        
      const modalList = document.getElementById('modal-activity-list');
      if (modalList) {
        modalList.innerHTML = data.activity.map(a => \`
          <li>
            <span class="activity-icon">\${activityIcon(a.event_type)}</span>
            <span class="activity-msg">\${a.message}</span>
            <span class="activity-time">\${timeSince(a.created_at)}</span>
          </li>\`).join('');
      }`
);

// 4. Activity Icon map
content = content.replace(
  /WORKER_START: '🚀', WORKER_STOP: '🛑',\s*JOB_STARTED:\s*'▶️', JOB_DONE:\s*'✅',\s*JOB_FAILED:\s*'❌', RISK_PAUSE:\s*'⚠️',/m,
  `WORKER_START: '🚀', WORKER_STOP: '🛑',
      JOB_STARTED:  '▶️', JOB_DONE:    '✅',
      JOB_FAILED:   '❌', RISK_PAUSE:  '⚠️',
      EMAIL_SENT:   '📧', EMAIL_FAILED: '🚫',`
);

// 5. Modal HTML & JS
const modalHtml = `
<!-- Activity Modal -->
<div id="activity-modal" class="modal-overlay" style="display: none;">
  <div class="modal-content">
    <div class="modal-header">
      <h2>📡 All Activity Feed</h2>
      <button id="close-activity-modal" class="close-btn">&times;</button>
    </div>
    <div class="modal-body">
      <ul class="activity-list" id="modal-activity-list">
      </ul>
    </div>
  </div>
</div>

<script>
  document.getElementById('view-all-activity-btn')?.addEventListener('click', () => {
    document.getElementById('activity-modal').style.display = 'flex';
  });
  document.getElementById('close-activity-modal')?.addEventListener('click', () => {
    document.getElementById('activity-modal').style.display = 'none';
  });
  window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('activity-modal')) {
      document.getElementById('activity-modal').style.display = 'none';
    }
  });
</script>
`;

if (!content.includes('id="activity-modal"')) {
  content = content.replace('</body>', modalHtml + '\n</body>');
}

// 6. Modal CSS
const modalCss = `
    /* ── Modal ─────────────────────────────────────────────── */
    .modal-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(8px);
      z-index: 1000; display: flex; align-items: center; justify-content: center;
    }
    .modal-content {
      background: rgba(255, 255, 255, 0.95); border-radius: 24px;
      width: 90%; max-width: 700px; max-height: 80vh; display: flex; flex-direction: column;
      box-shadow: 0 20px 40px -12px rgba(0,0,0,0.2); border: 1px solid rgba(255, 255, 255, 0.8);
    }
    .modal-header {
      padding: 20px 24px; border-bottom: 1px solid rgba(226, 232, 240, 0.6);
      display: flex; align-items: center; justify-content: space-between;
    }
    .modal-header h2 { font-size: 18px; color: #0f172a; margin: 0; border: none; padding: 0; }
    .close-btn { background: none; border: none; font-size: 28px; line-height: 1; color: #64748b; cursor: pointer; transition: color 0.2s; }
    .close-btn:hover { color: #0f172a; }
    .modal-body { padding: 20px 24px; overflow-y: auto; }
`;

if (!content.includes('.modal-overlay')) {
  content = content.replace('  </style>', modalCss + '\n  </style>');
}

fs.writeFileSync(file, content);
console.log('Regex replace complete for dashboard.ejs');
