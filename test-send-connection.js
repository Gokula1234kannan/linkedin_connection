/**
 * test-send-connection.js
 *
 * Full end-to-end test:
 *  1. Launch browser with saved profile
 *  2. Login to LinkedIn (auto, using .env credentials)
 *  3. Navigate to the target profile
 *  4. Detect state (Connect / More / Already connected)
 *  5. Click More -> Connect
 *  6. Fill note -> Send invitation
 *
 * Run from project root: node test-send-connection.js
 */

require('dotenv').config();

const { chromium } = require('playwright');
const path = require('path');

// Config
const TARGET_PROFILE  = 'https://www.linkedin.com/in/kannankaruppaiya/';
const CONNECTION_NOTE = `Hi Kannan, I came across your profile and would love to connect. I'm impressed by your work and would be glad to stay in touch!`;
const BROWSER_PROFILE = process.env.BROWSER_PROFILE_DIR || './browser-profile';
const SCREENSHOT_DIR  = process.env.SCREENSHOT_DIR      || './screenshots';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function screenshot(page, label) {
  const p = path.join(SCREENSHOT_DIR, `${label}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  console.log(`  📸 ${p}`);
  return p;
}

// Login
async function ensureLoggedIn(page) {
  const url = page.url();
  console.log('\n🔑 Checking login state. URL:', url);

  const nav = await page.locator('.global-nav, a[href*="/feed/"]').count().catch(() => 0);
  if (nav > 0 && !url.includes('/login') && !url.includes('/signup') && !url.includes('/authwall')) {
    console.log('  Already logged in!');
    return true;
  }

  console.log('  Navigating to login page...');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);

  const emailField = page.locator('input[name="session_key"]:visible, #username:visible, input[type="email"]:visible').first();
  await emailField.waitFor({ state: 'visible', timeout: 10000 });
  await emailField.fill(process.env.LINKEDIN_EMAIL);
  console.log('  Email filled:', process.env.LINKEDIN_EMAIL);
  await sleep(400);

  const passField = page.locator('input[name="session_password"]:visible, #password:visible, input[type="password"]:visible').first();
  await passField.waitFor({ state: 'visible', timeout: 5000 });
  await passField.fill(process.env.LINKEDIN_PASSWORD);
  console.log('  Password filled');
  await sleep(400);

  await passField.press('Enter');
  console.log('  Pressed Enter to submit form');

  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {});
  await sleep(2000);
  console.log('  Post-login URL:', page.url());

  if (page.url().includes('/checkpoint') || page.url().includes('/challenge') || page.url().includes('login.live.com')) {
    await screenshot(page, 'checkpoint-or-sso');
    console.log('  Security checkpoint or SSO required! Please complete it in the browser (90s)...');
    await page.waitForURL(
      u => !u.toString().includes('/checkpoint') && !u.toString().includes('/challenge') && !u.toString().includes('login.live.com'),
      { timeout: 90000 }
    ).catch(() => {});
  }

  const loggedIn = await page.locator('.global-nav, a[href*="/feed/"]').count().catch(() => 0) > 0;
  console.log(loggedIn ? '  Login successful!' : '  Login failed');
  return loggedIn;
}

// Main
async function run() {
  console.log('================================================');
  console.log('  LinkedIn Connection Sender - Full E2E Test');
  console.log('================================================');
  console.log('  Profile :', TARGET_PROFILE);
  console.log('  Note    :', CONNECTION_NOTE.substring(0, 70) + '...');
  console.log('  Profile Dir:', BROWSER_PROFILE);
  console.log('================================================\n');

  let context;
  try {
    context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1366, height: 768 },
    });
    console.log('Launched real Chrome');
  } catch {
    context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
      headless: false,
      viewport: { width: 1366, height: 768 },
    });
    console.log('Launched Chromium (fallback)');
  }

  const page = await context.newPage();

  try {
    // Step 1: Login
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    const loggedIn = await ensureLoggedIn(page);
    if (!loggedIn) {
      await screenshot(page, 'login-failed');
      throw new Error('Login failed');
    }

    // Step 2: Navigate to profile
    console.log('\n📄 Navigating to:', TARGET_PROFILE);
    await page.goto(TARGET_PROFILE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    try {
      await page.waitForSelector('main section, .pv-top-card', { state: 'visible', timeout: 15000 });
    } catch { /* continue */ }
    await sleep(2500);
    console.log('  URL:', page.url());
    await screenshot(page, '01-profile-loaded');

    // Step 3: Scope to profile top card
    const topCard = page.locator('.pv-top-card, main section.artdeco-card, main section').first();

    // Step 4: Check Pending first (already sent request)
    const isPending = await topCard.locator('button, a, [role="button"]')
      .filter({ hasText: /Pending/i }).first().isVisible({ timeout: 2000 }).catch(() => false);
    if (isPending) {
      console.log('\nAlready PENDING - request already sent. Exiting.');
      return;
    }

    // Step 5: Look for direct Connect button
    // NOTE: Do NOT check Message button here - LinkedIn shows Message even for non-connections
    // We only treat it as connected after verifying no Connect option exists in More dropdown
    const directBtn = topCard
      .locator('button, a, [role="button"]').filter({ hasText: /^connect$/i })
      .or(topCard.locator('a[href*="/preload/custom-invite/"]'))
      .or(topCard.locator('[aria-label*="connect" i]'))
      .first();

    const hasDirectBtn = await directBtn.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasDirectBtn) {
      console.log('\nDirect Connect button found - clicking...');
      await directBtn.click({ force: true });

    } else {
      // Step 6: Click More and look for Connect inside dropdown
      console.log('\nNo direct Connect - opening More dropdown...');
      const moreBtn = topCard
        .locator('button, a, [role="button"]').filter({ hasText: /^More$/i })
        .first();

      const hasMore = await moreBtn.isVisible({ timeout: 3000 }).catch(() => false);

      if (!hasMore) {
        // No More button - truly connected (only Message button remains)
        const isConnected = await topCard.locator('button, a, [role="button"]')
          .filter({ hasText: /^Message$/i }).first().isVisible({ timeout: 2000 }).catch(() => false);
        if (isConnected) {
          console.log('\nAlready CONNECTED (Message button, no More). Exiting.');
          return;
        }
        await screenshot(page, 'ERR-no-connect-or-more');
        throw new Error('Neither Connect nor More button found in top card');
      }

      console.log('  Clicking More...');
      await moreBtn.click({ force: true });
      await sleep(1200);
      await screenshot(page, '02-more-dropdown-open');

      // Find Connect inside the dropdown
      const connectOption = page
        .locator('[role="menuitem"]').filter({ hasText: /^connect$/i })
        .or(page.locator('a[href*="/preload/custom-invite/"]'))
        .first();

      const hasConnectInDropdown = await connectOption.isVisible({ timeout: 3000 }).catch(() => false);

      if (!hasConnectInDropdown) {
        // No Connect in dropdown = truly already connected
        await page.keyboard.press('Escape');
        console.log('\nAlready CONNECTED (no Connect in More dropdown). Exiting.');
        return;
      }

      console.log('  Connect found in dropdown - clicking...');
      await connectOption.click({ force: true });
    }

    // Step 7: Wait for modal
    console.log('\nWaiting for connection modal...');
    await sleep(2000);
    await screenshot(page, '03-modal');

    // Handle "How do you know X?" modal
    const howDoYouKnow = await page.locator('h2, h3').filter({ hasText: /how do you know/i }).count().catch(() => 0);
    if (howDoYouKnow > 0) {
      console.log('  Handling "How do you know" modal...');
      const otherLabel = page.locator('label').filter({ hasText: /other/i }).first();
      if (await otherLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
        await otherLabel.click({ force: true });
        await sleep(400);
      }
      const nextBtn = page.locator('button').filter({ hasText: /next/i }).first();
      if (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nextBtn.click({ force: true });
        await sleep(1000);
      }
    }

    // Step 8: Add note
    if (CONNECTION_NOTE.trim()) {
      console.log('\nAdding personalised note...');
      const addNoteBtn = page.locator('button, a, [role="button"]').filter({ hasText: /add a note/i }).first();
      const hasAddNote = await addNoteBtn.isVisible({ timeout: 4000 }).catch(() => false);

      if (hasAddNote) {
        console.log('  Clicking "Add a note"...');
        await addNoteBtn.click({ force: true });
        await sleep(1000);
      }

      const textarea = page.locator('textarea[name="message"], textarea').first();
      const hasTextarea = await textarea.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasTextarea) {
        await textarea.click({ force: true });
        await textarea.fill(CONNECTION_NOTE);
        console.log(`  Note filled (${CONNECTION_NOTE.length} chars)`);
        await screenshot(page, '04-note-filled');
      } else {
        console.log('  Textarea not visible - sending without note');
      }
    }

    // Step 9: Send invitation
    // Screenshot confirmed: button text is exactly "Send" (blue button in modal)
    await sleep(600);
    console.log('\nSending invitation...');

    // Try multiple strategies to find the Send button in the modal
    const sendSelectors = [
      'button[aria-label="Send invitation"]',
      'button[aria-label="Send"]',
      'div[role="dialog"] button:has-text("Send")',
      '.artdeco-modal button:has-text("Send")',
      'button:has-text("Send invitation")',
      'button:has-text("Send")',
    ];

    let sendBtn = null;
    let hasSend = false;
    for (const sel of sendSelectors) {
      const candidate = page.locator(sel).last();
      const visible = await candidate.isVisible({ timeout: 2000 }).catch(() => false);
      if (visible) {
        sendBtn = candidate;
        hasSend = true;
        console.log(`  Found send button: ${sel}`);
        break;
      }
    }

    if (!hasSend) {
      await screenshot(page, 'ERR-no-send-button');
      // Log all visible buttons for debugging
      const allBtns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).map(b => ({
          text: b.innerText.trim(),
          visible: b.offsetWidth > 0,
          ariaLabel: b.getAttribute('aria-label') || ''
        }))
      );
      console.log('  All buttons on page:', JSON.stringify(allBtns, null, 2));
      throw new Error('"Send" button not found');
    }

    await screenshot(page, '05-before-send');
    await sendBtn.click({ force: true });
    await sleep(3000);
    await screenshot(page, '06-after-send');

    console.log('\n================================================');
    console.log('  ✅  CONNECTION REQUEST SENT WITH NOTE!');
    console.log('================================================');

  } catch (err) {
    console.error('\nFAILED:', err.message);
    await screenshot(page, 'ERR-fatal').catch(() => {});
    process.exitCode = 1;
  } finally {
    console.log('\nBrowser closes in 5s...');
    await sleep(5000);
    await context.close();
  }
}

run();
