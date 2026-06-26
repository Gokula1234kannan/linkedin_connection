/**
 * playwright.service.js
 *
 * Handles ALL browser automation:
 *  1. Login to LinkedIn using credentials from .env
 *  2. Navigate to lead's profile
 *  3. Detect page state
 *  4. Send connection request WITH a personalised note
 *
 * Anti-detection layers (layered defence-in-depth):
 *  - rebrowser-playwright  : Binary-level CDP patch — eliminates Runtime.enable leak
 *                            (the #1 way LinkedIn detects Playwright at protocol level)
 *  - playwright-extra      : JS-layer stealth plugin battery (webdriver, iframe,
 *                            chrome runtime, permissions, WebGL, plugins, languages)
 *  - stealth.service.js    : Fingerprint-generator + injector (Canvas, WebGL, UA, screen)
 *  - humanBehavior.service.js : Gaussian delays, Bézier mouse, realistic typing,
 *                              inertia scrolling, session warm-up, profile reading sim
 *  - ghost-cursor-playwright  : High-fidelity Bézier cursor paths
 */

// ── Security layer 1: rebrowser-playwright (CDP patch) ────────────────────────
// Drop-in replacement for playwright — patches Runtime.enable CDP leak that
// LinkedIn's bot detection uses to fingerprint automation tools.
const { chromium: rebrowserChromium } = require('rebrowser-playwright');

// ── Security layer 2: playwright-extra + stealth plugin ───────────────────────
// Wraps chromium with the full JS-level stealth plugin battery.
// NOTE: puppeteer-extra-plugin-stealth (v2.11.2) is the REAL maintained plugin.
//       playwright-extra-plugin-stealth was just a placeholder (v0.0.1, empty stub).
const { chromium: extraChromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
extraChromium.use(StealthPlugin());
const path = require('path');
const { detectPageState } = require('./stateDetector.service');
const { getStealthArgs, getRandomViewport, generateFingerprint, applyStealthToContext } = require('./stealth.service');
const {
  sleep,
  randomSleep,
  gaussianMs,
  idlePause,
  humanClick,
  humanType,
  humanScroll,
  idleMouseDrift,
  warmSession,
  readProfile,
} = require('./humanBehavior.service');

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || './screenshots';

async function takeScreenshot(page, label) {
  const filePath = path.join(SCREENSHOT_DIR, `${label}-${Date.now()}.png`);
  await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
  return filePath;
}


// ── Login ─────────────────────────────────────────────────────────────────────

/**
 * Fills a form field using the first matching selector that is visible.
 * Tries multiple selectors as fallbacks (LinkedIn changes their HTML occasionally).
 */
async function fillField(page, selectors, value, label) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    const visible = await el.isVisible({ timeout: 3000 }).catch(() => false);
    if (visible) {
      // Human-like: move mouse to field, pause, then type char-by-char
      await humanClick(page, el);
      await sleep(150 + Math.random() * 200);
      await humanType(el, value);
      console.log(`  ✓ ${label} filled [${sel}]`);
      return true;
    }
  }
  console.log(`  ✗ ${label} field not found with selectors: ${selectors.join(', ')}`);
  return false;
}

/**
 * Clicks the first visible submit/sign-in button.
 */
async function clickSubmit(page) {
  const selectors = [
    'button[type="submit"]',
    'button[data-litms-control-urn="login-submit"]',
    '.btn__primary--large',
    'button:has-text("Sign in")',
  ];
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    const visible = await el.isVisible({ timeout: 2000 }).catch(() => false);
    if (visible) {
      await randomSleep(400, 900); // human pause before hitting submit
      await humanClick(page, el);
      console.log(`  ✓ Submit clicked [${sel}]`);
      return true;
    }
  }
  return false;
}

/**
 * Checks whether the current page is the LinkedIn feed (i.e., logged in).
 */
async function isLoggedIn(page) {
  // Wait up to 5s for either a logged-in indicator or a login redirect/form
  try {
    await Promise.race([
      page.waitForSelector('.global-nav, [data-test-id="nav-settings-icon"], .feed-identity-module', { state: 'visible', timeout: 5000 }),
      page.waitForSelector('input[name="session_key"], #username, button:has-text("Sign in"), button:has-text("Join now")', { state: 'visible', timeout: 5000 }),
      page.waitForURL((url) => {
        const u = url.toString();
        return u.includes('/login') || u.includes('/authwall') || u.includes('/signup') || u.includes('/challenge');
      }, { timeout: 5000 })
    ]);
  } catch (err) {
    // Timeout is fine, check current state
  }

  const url = page.url();
  if (url.includes('/login') || url.includes('/authwall') || url.includes('/signup') || url.includes('/challenge') || url.includes('/checkpoint')) {
    return false;
  }

  // Look for stable logged-in elements
  const loggedInIndicators = [
    '.global-nav',
    '[data-test-id="nav-settings-icon"]',
    '.feed-identity-module',
  ];
  for (const sel of loggedInIndicators) {
    const count = await page.locator(sel).count().catch(() => 0);
    if (count > 0) return true;
  }

  return false;
}

/**
 * Full LinkedIn login flow with:
 *  - Proper `waitForSelector` before filling (fixes the timeout error)
 *  - Multiple selector fallbacks for each field
 *  - Screenshot on failure for debugging
 *  - Manual login fallback (waits 3 min for user to log in manually)
 */
async function doLogin(page) {
  const email    = process.env.LINKEDIN_EMAIL;
  const password = process.env.LINKEDIN_PASSWORD;

  if (!email || !password) {
    return {
      success: false,
      reason: 'LINKEDIN_EMAIL and LINKEDIN_PASSWORD must be set in .env',
    };
  }

  const initialUrl = page.url();
  if (!initialUrl.includes('/login') && !initialUrl.includes('/authwall') && !initialUrl.includes('/signup')) {
    console.log('🔐 Navigating to LinkedIn login page...');
    try {
      await page.goto('https://www.linkedin.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    } catch (err) {
      if (err.message.includes('ERR_ABORTED')) {
        console.log('  ℹ️ Navigation aborted, likely due to an active auto-signin redirect. Waiting for page to settle...');
      } else {
        throw err;
      }
    }
  } else {
    console.log('  ℹ️ Already on login/authwall/signup page. Settle and check form...');
  }

  // Wait for page to fully settle (LinkedIn has heavy JS) + human idle
  await randomSleep(2500, 4000);

  // ── Wait for the email field to become visible ────────────────────────────
  console.log('  Waiting for email/username field...');
  const emailLoc = page.locator('input[type="email"]:visible, input[name="session_key"]:visible, #username:visible, input[autocomplete*="username"]:visible').first();
  let emailFieldFound = false;
  try {
    await emailLoc.waitFor({ state: 'visible', timeout: 10000 });
    emailFieldFound = true;
    console.log('  ✓ Email field found');
  } catch (err) {
    // Try next check
  }

  if (!emailFieldFound) {
    // Take a screenshot so the user can see what LinkedIn showed
    const screenshotPath = await takeScreenshot(page, 'login-page-unexpected');
    console.log(`  ✗ Email field not found. Screenshot saved: ${screenshotPath}`);

    // ── Manual login fallback ─────────────────────────────────────────────
    if (await isLoggedIn(page)) {
      console.log('  ℹ Already logged in (no email field needed)');
      return { success: true };
    }

    // Wait up to 3 minutes for the user to log in manually in the browser window
    console.log('\n  ⚠️  AUTO-LOGIN FAILED');
    console.log('  ► The browser window is open. Please log in to LinkedIn manually.');
    console.log('  ► Waiting up to 3 minutes for you to complete login...\n');

    try {
      await page.waitForURL(
        (url) => !url.toString().includes('/login') && !url.toString().includes('/authwall'),
        { timeout: 3 * 60 * 1000 }  // 3 minutes
      );
      console.log('  ✅ Manual login detected!');
      return { success: true };
    } catch {
      return {
        success: false,
        reason: `Auto-login failed and manual login timed out. Screenshot: ${screenshotPath}`,
      };
    }
  }

  // ── Fill credentials ──────────────────────────────────────────────────────
  try {
    await idlePause('before email');
    await humanType(emailLoc, email);
    console.log('  ✓ Email filled (human-like)');
  } catch (err) {
    const screenshotPath = await takeScreenshot(page, 'login-email-fail');
    return { success: false, reason: `Could not fill email field. Screenshot: ${screenshotPath}` };
  }

  await randomSleep(600, 1200);

  const passwordLoc = page.locator('input[type="password"]:visible, input[name="session_password"]:visible, #password:visible').first();
  try {
    await passwordLoc.waitFor({ state: 'visible', timeout: 5000 });
    await idlePause('before password');
    await humanType(passwordLoc, password);
    console.log('  ✓ Password filled (human-like)');
  } catch (err) {
    const screenshotPath = await takeScreenshot(page, 'login-password-fail');
    return { success: false, reason: `Could not fill password field. Screenshot: ${screenshotPath}` };
  }

  await randomSleep(800, 1800);

  // ── Submit ────────────────────────────────────────────────────────────────
  const submitLoc = page.locator('button[type="submit"]:visible, button:has-text("Sign in"):visible, button:text("Sign in"):visible, input[type="submit"]:visible').first();
  try {
    await submitLoc.waitFor({ state: 'visible', timeout: 5000 });
    await humanClick(page, submitLoc);
    console.log('  ✓ Submit clicked (human-like)');
  } catch (err) {
    const screenshotPath = await takeScreenshot(page, 'login-submit-fail');
    return { success: false, reason: `Submit button not found. Screenshot: ${screenshotPath}` };
  }

  // ── Wait for redirect ─────────────────────────────────────────────────────
  console.log('  Waiting for post-login redirect...');
  try {
    await page.waitForURL(
      (url) => !url.toString().includes('/login'),
      { timeout: 30000 }
    );
  } catch {
    // May have stayed on /login (wrong password, CAPTCHA, etc.)
  }

  await sleep(1000);
  const currentUrl = page.url();
  console.log('  Post-login URL:', currentUrl);

  if (currentUrl.includes('/checkpoint') || currentUrl.includes('/challenge')) {
    const screenshotPath = await takeScreenshot(page, 'login-checkpoint');
    return {
      success: false,
      reason: 'LinkedIn security checkpoint detected. Please log in manually once to clear it.',
      screenshotPath,
    };
  }

  if (currentUrl.includes('/login')) {
    const screenshotPath = await takeScreenshot(page, 'login-wrong-credentials');
    return {
      success: false,
      reason: 'Login failed — wrong email/password, or CAPTCHA required. Check credentials in .env.',
      screenshotPath,
    };
  }

  console.log('✅ Logged in successfully!');
  return { success: true };
}

/**
 * Ensures the browser is logged into LinkedIn.
 * First checks if already logged in (session in browser-profile) before trying to log in.
 */
async function ensureLoggedIn(page) {
  const url = page.url();

  // Already on a login page → login immediately
  if (url.includes('/login') || url.includes('/authwall') || url.includes('/signup')) {
    return doLogin(page);
  }

  // Check if we're actually logged in
  if (await isLoggedIn(page)) {
    console.log('  ✓ Already logged in (session active in browser-profile)');
    return { success: true };
  }

  // Not logged in → do login
  return doLogin(page);
}

// ── Send connection with note ──────────────────────────────────────────────────

/**
 * Sends a LinkedIn connection request with an optional personalised note.
 *
 * Flow (based on screenshots):
 *   1. Look for direct "Connect" button OR open "More" dropdown and click "Connect"
 *   2. Handle optional "How do you know [Name]?" modal
 *   3. Click "Add a note" → fill textarea → click "Send invitation"
 */
async function sendConnectionWithNote(page, lead, state = {}) {
  const note = (lead.message || '').trim().slice(0, 299); // LinkedIn max = 300 chars

  // Find the profile action area using cascading fallback selectors
  // (same strategy as stateDetector — avoids breaking when LinkedIn changes HTML)
  let topCard = null;
  for (const sel of ['main section.artdeco-card', '.pv-top-card', '[data-member-id]', 'main section', 'main']) {
    const candidate = page.locator(sel).first();
    const count = await candidate.count().catch(() => 0);
    if (count === 0) continue;
    const btns = await candidate.locator('button, a, [role="button"]')
      .filter({ hasText: /connect|message|more|follow|pending/i })
      .count().catch(() => 0);
    if (btns > 0) { topCard = candidate; break; }
  }
  if (!topCard) topCard = page.locator('main').first(); // absolute fallback

  // Human behaviour: scroll page slightly to appear to be reading the profile
  await humanScroll(page);
  await randomSleep(800, 1800);

  // ── Step 1: Find and click Connect ─────────────────────────────────────────
  // Use state.via from detectPageState to know exactly which path to take.
  // This avoids re-detection which could find the hidden dropdown Connect button
  // (LinkedIn keeps it in the DOM even when the dropdown is closed — it passes
  //  isVisible() because it's not display:none, causing false "direct" detection).

  const via = state.via || 'direct'; // default to direct if not specified
  console.log(`  → Connect path: ${via}`);

  if (via === 'direct') {
    // Direct "Connect" button (1st/2nd degree) — only match a VISIBLE top-level button
    // Do NOT use aria-label*="connect" here — that also matches the hidden dropdown item!
    const directBtn = topCard.locator('button')
      .filter({ hasText: /^connect$/i })  // exact text match only
      .or(topCard.locator('a[href*="/preload/custom-invite/"]'))
      .first();
    const hasDirectBtn = await directBtn.isVisible({ timeout: 2000 }).catch(() => false);

    if (!hasDirectBtn) {
      // Fallback: try the More dropdown even though state said direct
      // (edge case where the page changed between detect and click)
      console.log('  ⚠ Direct Connect not visible — falling back to More dropdown');
      state = { ...state, via: 'more_menu' };
    } else {
      console.log('  → Clicking direct Connect button');
      await idlePause('before direct connect click');
      await humanClick(page, directBtn);
    }
  }

  // Note: this is an if (not else-if) so the fallback above can flow into it
  if (via === 'more_menu' || state.via === 'more_menu') {
    // Connect is inside the "More" dropdown (3rd-degree connections)
    console.log('  → Opening "More" dropdown to find Connect');
    const moreBtn = topCard.locator('button, a, [role="button"]')
      .filter({ hasText: /^More$/i })
      .first();
    const hasMore = await moreBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasMore) {
      return { success: false, error: 'Neither "Connect" nor "More" button found on profile page' };
    }

    await idlePause('before more click');
    await humanClick(page, moreBtn);
    await randomSleep(900, 1600); // wait for dropdown animation

    // Take a screenshot the moment the dropdown opens — helps debug selector mismatches
    await takeScreenshot(page, 'more-dropdown-open');

    // ── Find "Connect" in the open dropdown ────────────────────────────────
    // Priority order (most → least reliable), confirmed from DevTools screenshots:
    //  1. aria-label="Invite [Name] to connect" — LinkedIn's accessible label (confirmed)
    //  2. componentkey ending in _connect
    //  3. Custom invite URL in href
    //  4. SVG id starting with "connect-small" (confirmed in DevTools)
    //  5. Text fallbacks
    const dropdown = page.locator('.artdeco-dropdown__content, .artdeco-dropdown, [role="menu"]');
    const connectOption = page
      // #1 BEST — aria-label confirmed from DevTools: "Invite [Name] to connect"
      .locator('[aria-label*="to connect" i]')
      .or(dropdown.locator('[componentkey*="_connect"]'))
      .or(dropdown.locator('a[href*="/custom-invite/"]'))
      .or(dropdown.locator('a[href*="/preload/custom-invite/"]'))
      // SVG id starts with connect-small (confirmed in DevTools)
      .or(dropdown.locator('[role="menuitem"]').filter({ has: page.locator('[id^="connect-small"]') }))
      .or(dropdown.locator('li').filter({ has: page.locator('[id^="connect-small"]') }))
      // Text fallbacks (exact "Connect" word only)
      .or(dropdown.locator('.artdeco-dropdown__item').filter({ hasText: /^connect$/i }))
      .or(dropdown.locator('li').filter({ hasText: /^connect$/i }))
      .or(dropdown.locator('[role="menuitem"]').filter({ hasText: /^connect$/i }))
      .first();

    const hasConnectOption = await connectOption.isVisible({ timeout: 4000 }).catch(() => false);
    console.log(`  → Connect in More dropdown visible: ${hasConnectOption}`);

    if (!hasConnectOption) {
      await page.keyboard.press('Escape');
      const hasFollowBtn = await topCard.locator('button, a, [role="button"]')
        .filter({ hasText: /^\+?\s*Follow$/i })
        .first()
        .count().catch(() => 0);

      if (hasFollowBtn > 0) {
        return { success: false, isFollowOnly: true, error: 'Creator profile — connections disabled' };
      }
      return { success: false, error: '"Connect" option not found inside "More" dropdown' };
    }

    console.log('  → Clicking Connect in More dropdown');
    await randomSleep(400, 900); // brief pause before selecting menu item
    await humanClick(page, connectOption);
  }

  // ── Step 2: Wait for the connection modal ──────────────────────────────────
  await randomSleep(1200, 2200); // initial reaction sleep

  // Wait up to 7 seconds for the dialog/modal to appear
  const modalLocator = page.locator('div[role="dialog"], .artdeco-modal').first();
  await modalLocator.waitFor({ state: 'visible', timeout: 7000 }).catch(() => {
    console.log('  ℹ️  No modal appeared yet — checking for direct send or how-do-you-know page');
  });

  await takeScreenshot(page, '03-modal');

  // Handle "How do you know [Name]?" modal if LinkedIn shows it
  const howDoYouKnow = await page.locator('h2, h3').filter({ hasText: /how do you know/i }).count().catch(() => 0);
  if (howDoYouKnow > 0) {
    console.log('  → Handling "How do you know" modal — selecting "Other"');
    await idlePause('reading how-do-you-know modal');
    const otherLabel = page.locator('label').filter({ hasText: /other/i }).first();
    if (await otherLabel.isVisible().catch(() => false)) {
      await humanClick(page, otherLabel);
      await randomSleep(400, 800);
    }
    const nextBtn = page.locator('button, a, [role="button"]').filter({ hasText: /next/i }).first();
    if (await nextBtn.isVisible().catch(() => false)) {
      await randomSleep(500, 1000);
      await humanClick(page, nextBtn);
      await randomSleep(1200, 2000); // wait for modal transition
    }
  }

  // ── Step 3: Add personalised note ──────────────────────────────────────────
  // LinkedIn modal flow has TWO variants:
  //  Variant A: Shows "Add a note" + "Send without a note" buttons first
  //             → Must click "Add a note" to reveal the textarea + "Send" button
  //  Variant B: Shows textarea directly (Premium users / different flow)
  //             → Type in textarea and click "Send" directly

  if (note) {
    // DevTools confirmed: initial modal shows aria-label="Add a note" button
    // Clicking it reveals the textarea + "Send invitation" button
    const addNoteBtn = page
      .locator('button[aria-label="Add a note"]')
      .or(page.locator('button, a, [role="button"]').filter({ hasText: /add a note/i }))
      .first();
    await addNoteBtn.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
    const hasAddNote = await addNoteBtn.isVisible().catch(() => false);

    if (hasAddNote) {
      console.log('  → Clicking "Add a note" to open note textarea');
      await idlePause('before add note click');
      await humanClick(page, addNoteBtn);
      await randomSleep(900, 1600); // wait for textarea to animate in
    }

    // Now find the textarea (works for both Variant A and B)
    const textarea = page.locator('textarea[name="message"]').or(page.locator('textarea')).first();
    await textarea.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
    const hasTextarea = await textarea.isVisible().catch(() => false);

    if (hasTextarea) {
      await idlePause('before typing note');
      await humanType(textarea, note);
      console.log(`  → Note typed (${note.length} chars)`);
      await randomSleep(600, 1200);
      await takeScreenshot(page, '04-note-filled');
    } else {
      console.log('  ⚠ No textarea found — will attempt "Send without a note"');
    }
  }

  // ── Step 4: Send the invitation ─────────────────────────────────────────────
  // LinkedIn shows different button labels depending on modal variant:
  //  • After filling note textarea: aria-label="Send invitation" (confirmed DevTools)
  //  • Initial modal skip note:    aria-label="Send without a note" (confirmed DevTools)
  //  • Older flow:                 aria-label="Send" or text "Send invitation"
  await sleep(600);
  await takeScreenshot(page, '05-before-send');

  const sendSelectors = [
    // #1 BEST — exact aria-labels confirmed from DevTools
    'button[aria-label="Send invitation"]',
    'button[aria-label="Send without a note"]',
    'button[aria-label="Send now"]',
    'button[aria-label="Send"]',
    // Dialog-scoped text selectors
    'div[role="dialog"] button:has-text("Send invitation")',
    'div[role="dialog"] button:has-text("Send now")',
    'div[role="dialog"] button:has-text("Send")',
    '.artdeco-modal button:has-text("Send invitation")',
    '.artdeco-modal button:has-text("Send now")',
    '.artdeco-modal button:has-text("Send")',
    // Broad fallbacks
    'button:has-text("Send without a note")',
    'button:has-text("Send invitation")',
    'button:has-text("Send now")',
    'button:has-text("Send")',
  ];

  let sendBtn = null;
  for (const sel of sendSelectors) {
    // Use .last() for generic selectors to skip hidden/aria-hidden copies,
    // but .first() for aria-label selectors which are always unique.
    const candidate = sel.includes('aria-label')
      ? page.locator(sel).first()
      : page.locator(sel).last();
    const visible = await candidate.isVisible({ timeout: 1500 }).catch(() => false);
    if (visible) {
      sendBtn = candidate;
      console.log(`  ✓ Send button found: [${sel}]`);
      break;
    }
  }

  if (!sendBtn) {
    await takeScreenshot(page, 'ERR-no-send-button');
    return { success: false, error: '"Send" button not found in connection modal' };
  }

  // Human pause before clicking send — re-reading the note one last time
  await idlePause('before send click');
  await humanClick(page, sendBtn);
  await randomSleep(2000, 3500);
  await takeScreenshot(page, '06-after-send');
  console.log('  ✅ Connection request sent!');

  return { success: true };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Full pipeline for one lead:
 *  login → navigate → detect state → send connection with note
 */
async function processLeadWithBrowser(lead) {
  let fingerprint;
  let userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  let viewport = getRandomViewport();

  try {
    fingerprint = generateFingerprint();
    if (fingerprint && fingerprint.navigator && fingerprint.navigator.userAgent) {
      userAgent = fingerprint.navigator.userAgent;
    }
    if (fingerprint && fingerprint.screen && fingerprint.screen.width && fingerprint.screen.height) {
      viewport = {
        width: fingerprint.screen.width,
        height: fingerprint.screen.height,
      };
    }
  } catch (err) {
    console.log('  ⚠️  Could not generate custom fingerprint, using fallbacks:', err.message);
  }

  const stealthArgs = getStealthArgs();

  // ── Browser launch — 3-tier security-first strategy ──────────────────────────
  // Tier 1: rebrowser-playwright + real Chrome  (CDP-patched + real browser profile)
  // Tier 2: playwright-extra stealth + real Chrome  (JS stealth battery + real browser)
  // Tier 3: playwright-extra stealth + Chromium  (bundled, last resort)
  let context;
  const profileDir = process.env.BROWSER_PROFILE_DIR || './browser-profile';
  const launchOptions = {
    headless: false,
    viewport,
    args: stealthArgs,
    ignoreDefaultArgs: ['--enable-automation'],
    userAgent,
  };

  try {
    // Tier 1: rebrowser-playwright patches CDP-level Runtime.enable leak
    context = await rebrowserChromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      ...launchOptions,
    });
    console.log('  🛡️  Browser: rebrowser-playwright + real Chrome (full CDP + JS patch)');
  } catch (err) {
    console.log('  ⚠️  rebrowser + Chrome failed, trying playwright-extra + Chrome:', err.message);
    try {
      // Tier 2: playwright-extra stealth plugin battery
      context = await extraChromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        ...launchOptions,
      });
      console.log('  🛡️  Browser: playwright-extra stealth + real Chrome');
    } catch (err2) {
      console.log('  ⚠️  playwright-extra + Chrome failed, falling back to Chromium:', err2.message);
      // Tier 3: bundled Chromium with stealth plugin
      context = await extraChromium.launchPersistentContext(profileDir, launchOptions);
      console.log('  🛡️  Browser: playwright-extra stealth + Chromium (fallback)');
    }
  }

  // Inject fingerprint patches (Canvas, WebGL, UA, screen) on top of stealth layers
  await applyStealthToContext(context, fingerprint);

  const page = await context.newPage();

  // Initialize ghost-cursor-playwright for realistic mouse movements
  try {
    const { createCursor } = require('ghost-cursor-playwright');
    page.cursor = await createCursor(page);
  } catch (err) {
    console.log('  ⚠️  Could not initialize ghost-cursor-playwright:', err.message);
  }

  try {
    // ── 1. Go to feed and ensure we are logged in ───────────────────────────
    console.log(`\n📋 Processing lead: ${lead.first_name} ${lead.last_name} (${lead.company || lead.linkedin_url})`);

    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    // Human: settle on feed page before proceeding
    await randomSleep(1800, 3500);

    const loginResult = await ensureLoggedIn(page);
    if (!loginResult.success) {
      const screenshotPath = await takeScreenshot(page, 'login-failed');
      return {
        success: false,
        status: 'LOGIN_FAILED',
        error: loginResult.reason,
        severity: 'CRITICAL',
        screenshotPath,
      };
    }

    // ── Session warm-up: browse feed naturally before visiting target profile ──
    // This creates realistic activity history in LinkedIn's session tracking.
    // Skip warm-up 20% of the time to vary behavior (humans don’t always browse first)
    if (Math.random() < 0.80) {
      await warmSession(page);
    } else {
      console.log('  ⏭️ Skipping warm-up this session (random variation).');
      await randomSleep(2000, 4000);
    }

    // ── 2. Navigate to the lead's LinkedIn profile ──────────────────────────
    console.log(`   Navigating to: ${lead.linkedin_url}`);
    await page.goto(lead.linkedin_url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // ── CRITICAL: Check if LinkedIn redirected us to authwall ─────────────────
    // LinkedIn's authwall renders a partial public profile with ghost buttons.
    // Those buttons are visible in the DOM but clicking them just triggers a
    // login redirect — they never actually work. Detect and abort immediately.
    const postNavUrl = page.url();
    console.log(`   Final URL: ${postNavUrl}`);
    if (postNavUrl.includes('/authwall') || postNavUrl.includes('/login') || postNavUrl.includes('/signup')) {
      console.log('   ⚠️  Redirected to authwall/login after profile navigation — session may have expired');
      // Try one re-login cycle
      const reloginResult = await doLogin(page);
      if (!reloginResult.success) {
        const screenshotPath = await takeScreenshot(page, `authwall-lead-${lead.id}`);
        return { success: false, status: 'LOGIN_FAILED', error: 'Redirected to authwall — ' + reloginResult.reason, severity: 'CRITICAL', screenshotPath };
      }
      // After re-login, go back to the profile
      await page.goto(lead.linkedin_url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await randomSleep(2000, 3000);
      const afterReloginUrl = page.url();
      console.log(`   URL after re-login: ${afterReloginUrl}`);
      if (afterReloginUrl.includes('/authwall') || afterReloginUrl.includes('/login')) {
        const screenshotPath = await takeScreenshot(page, `authwall-relogin-lead-${lead.id}`);
        return { success: false, status: 'RISK_DETECTED', error: 'Still on authwall after re-login — LinkedIn may be rate-limiting or blocking this session', severity: 'HIGH', screenshotPath };
      }
    }

    console.log('   Waiting for profile page to render...');
    try {
      await page.waitForSelector('main.scaffold-layout, h1.text-heading-xlarge, .pv-profile-card', { state: 'visible', timeout: 15000 });
      console.log('   ✓ Profile page rendered.');
    } catch (err) {
      console.log('   ⚠️  Profile element wait timed out. Checking current state anyway.');
    }
    // Human: read through the profile (scroll + idle mouse drift)
    await readProfile(page);

    // ── 3. Detect page state ────────────────────────────────────────────────
    let state = await detectPageState(page);
    console.log(`   State: ${state.state}`);

    // If we got redirected to login mid-session, log in again
    if (state.state === 'LOGIN_REQUIRED') {
      console.log('   ⚠️  State detector returned LOGIN_REQUIRED — attempting re-login...');
      const relogin = await doLogin(page);
      if (!relogin.success) {
        const screenshotPath = await takeScreenshot(page, `login-required-lead-${lead.id}`);
        return {
          success: false,
          status: 'LOGIN_FAILED',
          error: relogin.reason,
          severity: 'CRITICAL',
          screenshotPath,
        };
      }
      await page.goto(lead.linkedin_url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await randomSleep(2000, 3000);
      // Check URL again after re-login navigation
      const reloginUrl = page.url();
      console.log(`   URL after re-login: ${reloginUrl}`);
      if (reloginUrl.includes('/authwall') || reloginUrl.includes('/login')) {
        const screenshotPath = await takeScreenshot(page, `authwall-after-relogin-lead-${lead.id}`);
        return { success: false, status: 'RISK_DETECTED', error: 'Authwall after re-login', severity: 'HIGH', screenshotPath };
      }
      state = await detectPageState(page);
      console.log(`   State after re-login: ${state.state}`);
    }

    if (state.state === 'FRICTION_DETECTED') {
      const screenshotPath = await takeScreenshot(page, `risk-lead-${lead.id}`);
      return {
        success: false,
        status: 'RISK_DETECTED',
        error: state.reason,
        severity: state.severity || 'HIGH',
        screenshotPath,
      };
    }

    if (state.state === 'ALREADY_CONNECTED') {
      return { success: true, status: 'ALREADY_CONNECTED' };
    }

    if (state.state === 'ALREADY_PENDING') {
      return { success: true, status: 'ALREADY_PENDING' };
    }

    if (state.state === 'FOLLOW_ONLY') {
      // Creator profile — connection requests are disabled, only Follow is available.
      // We skip this lead cleanly (not an error, not a risk).
      console.log('   ℹ️  Creator/follower-only profile — no Connect option available. Skipping.');
      return { success: true, status: 'FOLLOW_ONLY' };
    }

    if (state.state !== 'CONNECT_AVAILABLE') {
      const screenshotPath = await takeScreenshot(page, `no-connect-lead-${lead.id}`);
      return {
        success: false,
        status: 'CONNECT_NOT_AVAILABLE',
        error: state.reason || 'Connect option not available on this profile',
        screenshotPath,
      };
    }

    // ── 4. Send connection with personalised note ───────────────────────────
    // Pass the state so sendConnectionWithNote knows the correct path (direct vs more_menu)
    const connectResult = await sendConnectionWithNote(page, lead, state);

    if (!connectResult.success) {
      if (connectResult.isFollowOnly) {
        console.log('   ℹ️  Creator/follower-only profile — no Connect option available. Skipping.');
        return { success: true, status: 'FOLLOW_ONLY' };
      }
      const screenshotPath = await takeScreenshot(page, `connect-fail-lead-${lead.id}`);
      return {
        success: false,
        status: 'FAILED',
        error: connectResult.error,
        screenshotPath,
      };
    }

    return { success: true, status: 'REQUEST_SENT' };

  } catch (err) {
    console.error('   ❌ Unexpected error:', err.message);
    const screenshotPath = await takeScreenshot(page, `error-lead-${lead.id || 'unknown'}`);
    return { success: false, status: 'FAILED', error: err.message, screenshotPath };
  } finally {
    await context.close();
  }
}

module.exports = { processLeadWithBrowser };
