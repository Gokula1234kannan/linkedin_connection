/**
 * stealth.service.js
 *
 * Anti-bot browser fingerprint evasion using fingerprint-generator and fingerprint-injector.
 */

const { FingerprintGenerator } = require('fingerprint-generator');
const { FingerprintInjector } = require('fingerprint-injector');

const fingerprintGenerator = new FingerprintGenerator({
  devices: ['desktop'],
  operatingSystems: ['windows'],
  browsers: ['chrome'],
});

const fingerprintInjector = new FingerprintInjector();

/**
 * Generates a realistic browser fingerprint matching the platform constraints.
 */
function generateFingerprint() {
  const { fingerprint } = fingerprintGenerator.getFingerprint();
  return fingerprint;
}

/**
 * Returns an array of Chrome launch arguments that disable automation detection signals.
 * Args are sourced from rebrowser-patches, patchright, and playwright-extra research.
 * These are passed to launchPersistentContext() and work alongside the CDP-level patches.
 */
function getStealthArgs() {
  return [
    // ── Core automation flag removal ──────────────────────────────────────────
    '--disable-blink-features=AutomationControlled', // Removes navigator.webdriver = true
    '--exclude-switches=enable-automation',           // Removes "Chrome is being controlled" bar
    '--disable-infobars',                             // Removes "Chrome is being controlled" info bar

    // ── Browser startup normalisation ─────────────────────────────────────────
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--password-store=basic',
    '--disable-sync',

    // ── Headless / detection evasion (rebrowser/patchright research) ──────────
    '--disable-features=ChromeWhatsNewUI',            // Suppress new-feature popups
    '--disable-features=Translate',                   // No translation prompts
    '--disable-features=MediaRouter',                 // Removes DevTools logging
    '--disable-features=OptimizationGuideModelDownloading,OptimizationHintsFetching,OptimizationTargetPrediction,OptimizationHints',
    '--disable-client-side-phishing-detection',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--safebrowsing-disable-auto-update',

    // ── Resource / process isolation (stability + evasion) ────────────────────
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-ipc-flooding-protection',

    // ── Media / device fingerprint normalisation ──────────────────────────────
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',

    // ── Network fingerprint (reduces TLS variance) ────────────────────────────
    '--disable-features=IsolateOrigins,site-per-process',

    // ── Window appearance ─────────────────────────────────────────────────────
    '--start-maximized',
  ];
}

/**
 * Fallback randomized viewport dimensions if no fingerprint is available.
 */
function getRandomViewport() {
  const viewports = [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1600, height: 900 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ];
  return viewports[Math.floor(Math.random() * viewports.length)];
}

/**
 * Applies professional fingerprint-based stealth patches to a browser context.
 */
async function applyStealthToContext(context, fingerprint = null) {
  if (!fingerprint) {
    fingerprint = generateFingerprint();
  }
  await fingerprintInjector.attachFingerprintToPlaywright(context, { fingerprint });
}

function getStealthScript() {
  return '';
}

module.exports = {
  getStealthScript,
  getStealthArgs,
  getRandomViewport,
  generateFingerprint,
  applyStealthToContext,
};
