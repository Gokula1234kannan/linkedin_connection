const fs = require('fs');

const dashboardStr = fs.readFileSync('./src/views/dashboard.ejs', 'utf-8');
const riskStr = fs.readFileSync('./src/views/risk-events.ejs', 'utf-8');

// Extract the head block from dashboard (up to </style>)
const headMatch = dashboardStr.match(/([\s\S]*?)<\/style>/);
if (!headMatch) throw new Error("Could not find style end in dashboard");
let dashboardHead = headMatch[1] + '</style>';

// Fix the title in the copied head
dashboardHead = dashboardHead.replace(
  '<title>Dashboard — LinkedIn Connection Engine</title>', 
  '<title>Risk Events — LinkedIn Connection Engine</title>'
);

// The risk body
let riskBody = `
</head>
<body>

<nav>
  <span class="logo">🔗 LinkedIn Engine</span>
  <a href="/">Dashboard</a>
  <a href="/risk-events">⚠ Risk Events</a>
  <a href="/export">⬇ Export Report</a>
</nav>

<div class="container">
  <div class="card">
    <div class="card-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; border-bottom: 1px solid rgba(226, 232, 240, 0.6); padding-bottom: 16px;">
      <h2 style="margin: 0;">⚠️ Risk Events Log (last 200)</h2>
      <form action="/risk-events/clear" method="post" onsubmit="return confirm('Are you sure you want to clear all risk events?');" style="margin: 0;">
        <button type="submit" class="btn btn-danger btn-sm">Clear All Risks</button>
      </form>
    </div>

    <% if (events.length === 0) { %>
      <p class="hint">No risk events recorded. The worker is running cleanly. ✅</p>
    <% } else { %>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Severity</th>
            <th>Event Type</th>
            <th>Message</th>
            <th>Screenshot</th>
            <th>Date / Time</th>
          </tr>
        </thead>
        <tbody>
          <% events.forEach(e => { %>
          <tr>
            <td><%= e.id %></td>
            <td><span class="badge badge-<%= e.severity %>"><%= e.severity %></span></td>
            <td><code><%= e.event_type %></code></td>
            <td class="msg-cell"><%= e.message %></td>
            <td>
              <% if (e.screenshot_path) { %>
                <a class="screenshot-link" href="/screenshots/<%= e.screenshot_path.split(/[\\\\/]/).pop() %>" target="_blank">View ↗</a>
              <% } else { %>
                —
              <% } %>
            </td>
            <td><%= e.created_at %></td>
          </tr>
          <% }) %>
        </tbody>
      </table>
    </div>
    <% } %>
  </div>
</div>

</body>
</html>
`;

fs.writeFileSync('./src/views/risk-events.ejs', dashboardHead + riskBody);
console.log('Fixed risk-events.ejs');
