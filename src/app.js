/**
 * app.js — Express application entry point
 */
require('dotenv').config();

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const { initDb }         = require('./db/database');
const uploadRoutes        = require('./routes/upload.routes');
const dashboardRoutes     = require('./routes/dashboard.routes');
const campaignRoutes      = require('./routes/campaign.routes');
const quickConnectRoutes  = require('./routes/quickconnect.routes');
const apiRoutes           = require('./routes/api.routes');

// Ensure required directories exist
['uploads', 'screenshots', 'browser-profile'].forEach((dir) => {
  fs.mkdirSync(path.join(__dirname, '..', dir), { recursive: true });
});

// Initialise SQLite database (creates tables if they don't exist)
initDb();

const app = express();

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use('/screenshots', express.static(path.resolve(process.env.SCREENSHOT_DIR || './screenshots')));

// Routes
app.use('/',               dashboardRoutes);
app.use('/upload',         uploadRoutes);
app.use('/campaign',       campaignRoutes);
app.use('/quick-connect',  quickConnectRoutes);
app.use('/api',            apiRoutes);           // JSON API for real-time dashboard polling

// 404 handler
app.use((req, res) => {
  res.status(404).send(`Page not found: ${req.path}`);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send(`Internal server error: ${err.message}`);
});

const port = +(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`\n✅ LinkedIn Connection Engine running`);
  console.log(`   Dashboard: http://localhost:${port}`);
  console.log(`   Start worker in another terminal: npm run worker\n`);
});
