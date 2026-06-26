/**
 * stateDetector.service.js
 *
 * Detects the state of the current LinkedIn page using:
 *  1. URL checks  (most reliable — not affected by page content)
 *  2. Specific button/element selectors in the profile top card
 *  3. Body text ONLY for very specific multi-word friction phrases
 *
 * Design rules:
 *  - Single short words like "checkpoint" are REMOVED from body-text signals
 *    because they appear in LinkedIn's own page scripts/links (false positive).
 *  - URL-based checkpoint detection is kept (reliable).
 *  - "Follow-only" profiles (creator mode) are detected and skipped cleanly.
 *  - Check for Connect button directly or in the More dropdown to determine connection state.
 */

const { humanClick, randomSleep } = require('./humanBehavior.service');

// Only multi-word, very specific phrases that reliably indicate account friction.
// Single words like "checkpoint" are intentionally excluded — LinkedIn's own
// page JS/links contain that word and caused false positives.
const FRICTION_SIGNALS = [
  'security verification',
  'verify your identity',
  'verify your phone',
  'unusual activity detected',
  'temporarily restricted',
  'your account has been restricted',
  'limited your account',
  'weekly invitation limit',
  'out of invitations',
  'reached the weekly limit',
  'we noticed unusual',
];

async function detectPageState(page) {
  // ── 1. URL-based checks (most reliable) ──────────────────────────────────────
  const url = page.url();

  // Security checkpoint / challenge pages (URL is the most reliable signal)
  if (url.includes('/checkpoint') || url.includes('/challenge')) {
    return { state: 'FRICTION_DETECTED', severity: 'CRITICAL', reason: 'Security checkpoint URL detected' };
  }

  if (url.includes('/login') || url.includes('/authwall') || url.includes('join?')) {
    return { state: 'LOGIN_REQUIRED', severity: 'HIGH', reason: 'Redirected to login page' };
  }

  if (!url.includes('/in/')) {
    return { state: 'UNKNOWN', reason: `Not on profile page (URL: ${url})` };
  }

  // ── 2. Body text — ONLY multi-word friction phrases (not single words) ───────
  const bodyText = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
  const lower = bodyText.toLowerCase();

  for (const signal of FRICTION_SIGNALS) {
    if (lower.includes(signal)) {
      return { state: 'FRICTION_DETECTED', severity: 'CRITICAL', reason: signal };
    }
  }

  if (lower.includes('sign in') && lower.includes('join linkedin')) {
    return { state: 'LOGIN_REQUIRED', severity: 'HIGH', reason: 'Not logged in' };
  }

  // ── 3. Button/element checks — find the profile action area ─────────────────
  // Strategy: Find where the action buttons (Connect/Message/More/Follow) are.
  // We try increasingly broad selectors to handle LinkedIn's changing HTML structure.

  // Try to find the profile action area by looking for its action buttons.
  // This is more reliable than matching specific class names which LinkedIn changes frequently.
  const actionAreaCandidates = [
    // Standard profile top card containers
    'main section.artdeco-card',
    '.pv-top-card',
    '[data-member-id]',
    // Broader fallback: any section in main that has action buttons
    'main section',
    // Last resort: use all of main
    'main',
  ];

  let topCard = null;
  for (const selector of actionAreaCandidates) {
    const candidate = page.locator(selector).first();
    const count = await candidate.count().catch(() => 0);
    if (count === 0) continue;
    // Check if this element contains action buttons
    const btns = await candidate.locator('button, a, [role="button"]')
      .filter({ hasText: /connect|message|more|follow|pending/i })
      .count().catch(() => 0);
    if (btns > 0) {
      topCard = candidate;
      console.log(`  [StateDetector] Found profile action area using selector: ${selector} (${btns} action buttons)`);
      break;
    }
  }

  if (!topCard) {
    return { state: 'UNKNOWN', reason: 'No action buttons (Connect, Message, More, Follow, Pending) found on page' };
  }

  // ── Already sent = "Pending" button ────────────────────────────────────────
  const pendingBtn = await topCard.locator('button, a, [role="button"]')
    .filter({ hasText: /^Pending$/i })
    .or(topCard.locator('button, a, [role="button"]').filter({ hasText: /invitation sent/i }))
    .first()
    .count().catch(() => 0);
  if (pendingBtn > 0) return { state: 'ALREADY_PENDING' };

  // ── Direct "Connect" button (1st / 2nd degree or direct link) ──────────────
  const directConnect = await topCard.locator('button, a, [role="button"]')
    .filter({ hasText: /^connect$/i })
    .or(topCard.locator('a[href*="/preload/custom-invite/"]'))
    .or(topCard.locator('a[aria-label*="connect" i], button[aria-label*="connect" i]'))
    .first()
    .count().catch(() => 0);
  if (directConnect > 0) return { state: 'CONNECT_AVAILABLE', via: 'direct' };

  // ── "More" dropdown — Check if Connect is in the dropdown ─────────────────
  const moreBtn = topCard.locator('button, a, [role="button"]')
    .filter({ hasText: /^More$/i })
    .first();
  const hasMore = await moreBtn.count().catch(() => 0);

  let hasConnectOption = false;
  if (hasMore > 0) {
    console.log('  [StateDetector] "More" button found. Checking dropdown options...');
    try {
      await humanClick(page, moreBtn);
      await randomSleep(900, 1600); // wait for dropdown animation

      // ── Find "Connect" in the open dropdown ────────────────────────────────
      // Priority order (most → least reliable), confirmed from DevTools:
      //  1. aria-label="Invite [Name] to connect" — LinkedIn's own accessible label (confirmed)
      //  2. componentkey ending in _connect — stable internal key LinkedIn uses
      //  3. href patterns for custom invite URLs
      //  4. SVG id starting with "connect-small" — confirmed in DevTools
      //  5. Text-based fallbacks (least reliable but always a last resort)
      const dropdown = page.locator('.artdeco-dropdown__content, .artdeco-dropdown, [role="menu"]');
      const connectOption = page
        // #1 BEST: aria-label confirmed in DevTools — "Invite [Name] to connect"
        .locator('[aria-label*="to connect" i]')
        .or(dropdown.locator('[componentkey*="_connect"]'))
        .or(dropdown.locator('a[href*="/custom-invite/"]'))
        .or(dropdown.locator('a[href*="/preload/custom-invite/"]'))
        // SVG id starts with connect-small (DevTools confirmed)
        .or(dropdown.locator('[role="menuitem"]').filter({ has: page.locator('[id^="connect-small"]') }))
        .or(dropdown.locator('li').filter({ has: page.locator('[id^="connect-small"]') }))
        // Text fallbacks
        .or(dropdown.locator('.artdeco-dropdown__item').filter({ hasText: /^connect$/i }))
        .or(dropdown.locator('li').filter({ hasText: /^connect$/i }))
        .or(dropdown.locator('[role="menuitem"]').filter({ hasText: /^connect$/i }))
        .first();

      hasConnectOption = await connectOption.isVisible({ timeout: 2500 }).catch(() => false);
      console.log(`  [StateDetector] Connect option in dropdown visible: ${hasConnectOption}`);
    } catch (err) {
      console.log('  ⚠️  [StateDetector] Error opening More dropdown:', err.message);
    } finally {
      // ALWAYS close the dropdown by pressing Escape to restore page state
      await page.keyboard.press('Escape').catch(() => {});
      await randomSleep(500, 1000); // wait for closing animation
    }
  }

  if (hasConnectOption) {
    return { state: 'CONNECT_AVAILABLE', via: 'more_menu' };
  }

  // ── "Follow" button check ──────────────────────────────────────────────────
  const followBtn = await topCard.locator('button, a, [role="button"]')
    .filter({ hasText: /^\+?\s*Follow$/i })
    .first()
    .count().catch(() => 0);

  if (followBtn > 0) {
    return { state: 'FOLLOW_ONLY', reason: 'Creator profile — connections disabled (Follow button present, no Connect option)' };
  }

  // If no Connect is available directly or in the More dropdown, and no Follow button is visible,
  // then they must already be connected (or we cannot connect to them).
  return { state: 'ALREADY_CONNECTED', reason: 'No Connect or Follow options available' };
}

module.exports = { detectPageState };
