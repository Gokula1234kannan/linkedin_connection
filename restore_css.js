const fs = require('fs');
const riskStr = fs.readFileSync('./src/views/risk-events.ejs', 'utf-8');
const dashStr = fs.readFileSync('./src/views/dashboard.ejs', 'utf-8');

// Extract everything from <!doctype html> up to </head>
const riskHeadMatch = riskStr.match(/([\s\S]*?)<\/head>/);
if (!riskHeadMatch) throw new Error('Could not find </head> in risk-events.ejs');

const dashBodyMatch = dashStr.match(/<\/head>([\s\S]*)/);
if (!dashBodyMatch) throw new Error('Could not find </head> in dashboard.ejs');

const newDashStr = riskHeadMatch[1] + '</head>' + dashBodyMatch[1];
fs.writeFileSync('./src/views/dashboard.ejs', newDashStr);
console.log('Restored dashboard.ejs CSS from risk-events.ejs!');
