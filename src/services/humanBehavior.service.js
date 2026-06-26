/**
 * humanBehavior.service.js
 *
 * All human-mimic functions for browser automation:
 *  - Gaussian random delays (bell-curve timing, not uniform)
 *  - Bézier curve mouse paths (organic curves, not straight lines)
 *  - Realistic typing (char-by-char, occasional typos + corrections)
 *  - Inertia scroll (accelerates then decelerates)
 *  - Idle mouse drift (micro-jitter while "reading")
 *  - Session warm-up (browse feed before taking action)
 *  - Reading simulation (delay proportional to content length)
 *  - Focus/blur events (simulate window switching)
 */

// ── Core timing utilities ──────────────────────────────────────────────────────

/**
 * Returns a random duration using a Gaussian (bell-curve) distribution.
 * Much more human-like than uniform random — most values cluster near the mean.
 * @param {number} meanMs  - Centre of the distribution in ms
 * @param {number} stdMs   - Spread. ~68% of values fall within mean ± std.
 */
function gaussianMs(meanMs, stdMs) {
  // Box-Muller transform to generate Gaussian random number
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const gauss = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  const ms = Math.round(meanMs + gauss * stdMs);
  return Math.max(50, ms); // Never less than 50ms
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Math.round(ms))));
}

/**
 * Random sleep using Gaussian distribution.
 * Feels natural — not robotic uniform distribution.
 */
function randomSleep(minMs = 800, maxMs = 2200) {
  const mean = (minMs + maxMs) / 2;
  const std  = (maxMs - minMs) / 6; // 99.7% of values within [min, max]
  return sleep(gaussianMs(mean, std));
}

/**
 * Idle pause — simulates the user reading/thinking.
 * Longer pauses have a small probability to feel like the user got distracted.
 */
async function idlePause(label = '') {
  // 5% chance of a "distracted" long pause (4–10 seconds)
  const distracted = Math.random() < 0.05;
  const ms = distracted
    ? gaussianMs(6000, 1500)
    : gaussianMs(1800, 500);
  if (label) console.log(`  ⏱ [${label}] ${ms}ms`);
  return sleep(ms);
}

// ── Mouse movement ─────────────────────────────────────────────────────────────

/**
 * Compute a cubic Bézier curve point at parameter t.
 */
function bezierPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
    y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
  };
}

/**
 * Move mouse from (x1,y1) to (x2,y2) along a natural Bézier curve.
 * Steps and curve control points are randomised each call.
 */
async function bezierMouseMove(page, x1, y1, x2, y2) {
  if (page.cursor) {
    try {
      await page.cursor.actions.move({ x: x2, y: y2 });
      return;
    } catch (err) {
      console.log('   ⚠️  ghost-cursor move failed, falling back to manual bezier:', err.message);
    }
  }

  const steps = 12 + Math.floor(Math.random() * 18); // 12–30 steps

  // Two random control points create the curve (slight arc away from straight line)
  const cp1 = {
    x: x1 + (x2 - x1) * 0.25 + (Math.random() - 0.5) * 180,
    y: y1 + (y2 - y1) * 0.25 + (Math.random() - 0.5) * 120,
  };
  const cp2 = {
    x: x1 + (x2 - x1) * 0.75 + (Math.random() - 0.5) * 180,
    y: y1 + (y2 - y1) * 0.75 + (Math.random() - 0.5) * 120,
  };

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt = bezierPoint({ x: x1, y: y1 }, cp1, cp2, { x: x2, y: y2 }, t);

    // Speed varies: slow start → fast middle → slow finish (ease-in-out)
    const speed = Math.sin(Math.PI * t); // 0→1→0
    const delay = gaussianMs(12, 4) * (1 - speed * 0.6); // 5–15ms per step

    await page.mouse.move(pt.x, pt.y);
    await sleep(delay);
  }
}

/**
 * Move mouse to a Playwright locator element via a Bézier path, then click.
 * Simulates a human moving the cursor across the screen naturally.
 */
async function humanClick(page, locator, options = {}) {
  // Scroll element into view first
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
  } catch (err) {
    // Ignore scrolling failures
  }

  if (page.cursor) {
    try {
      const box = await locator.boundingBox();
      if (box) {
        // Move naturally to the target element's bounding box using ghost-cursor
        await page.cursor.actions.move(box);
        // Human reaction time pause before executing physical click
        await sleep(gaussianMs(150, 50));
        // Trigger click at the current coordinates
        const { x, y } = page.cursor.previous;
        await page.mouse.click(x, y, options);
        return;
      }
    } catch (err) {
      console.log('   ⚠️  ghost-cursor click failed, falling back to bezier:', err.message);
    }
  }

  try {
    const box = await locator.boundingBox();
    if (box) {
      const currentPos = await page.evaluate(() => ({
        x: window.__lastMouseX || Math.floor(Math.random() * 400 + 200),
        y: window.__lastMouseY || Math.floor(Math.random() * 300 + 100),
      }));

      // Ensure current positions are numbers
      let startX = Number(currentPos.x) || 400;
      let startY = Number(currentPos.y) || 300;

      // Target is a random point inside the element (not always the centre)
      let targetX = box.x + box.width  * (0.25 + Math.random() * 0.5);
      let targetY = box.y + box.height * (0.25 + Math.random() * 0.5);

      // Ensure target coordinates are valid numbers and integers
      startX = Math.max(0, Math.floor(startX));
      startY = Math.max(0, Math.floor(startY));
      targetX = Math.max(0, Math.floor(targetX));
      targetY = Math.max(0, Math.floor(targetY));

      await bezierMouseMove(page, startX, startY, targetX, targetY);

      // Store last position for next movement
      await page.evaluate((pos) => {
        window.__lastMouseX = pos.x;
        window.__lastMouseY = pos.y;
      }, { x: targetX, y: targetY });

      // Tiny pause after arriving at element (human reads the button label)
      await sleep(gaussianMs(120, 40));
    }
  } catch (err) {
    console.log('   ⚠️  Bézier mouse movement failed:', err.message);
  }

  // Now attempt to perform the click.
  // Fallback chain: Playwright click -> DOM element.click()
  try {
    await locator.click({ force: true, timeout: 5000, ...options });
  } catch (err) {
    console.log('   ⚠️  Playwright click failed, falling back to DOM click:', err.message);
    try {
      await locator.evaluate((el) => {
        if (el && typeof el.click === 'function') {
          el.click();
        } else if (el) {
          const event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
          el.dispatchEvent(event);
        }
      });
    } catch (domErr) {
      console.error('   ❌  DOM click fallback also failed:', domErr.message);
      throw err; // Rethrow the original click error if even DOM click fails
    }
  }
}

// ── Typing ─────────────────────────────────────────────────────────────────────

/**
 * Common typing mistakes per key (adjacent keys on QWERTY layout).
 * Used to simulate occasional typos that the user then corrects.
 */
const ADJACENT_KEYS = {
  a: ['s', 'q'], b: ['v', 'n', 'g'], c: ['x', 'v', 'd'],
  d: ['s', 'f', 'e'], e: ['w', 'r', 'd'], f: ['d', 'g', 'r'],
  g: ['f', 'h', 't'], h: ['g', 'j', 'y'], i: ['u', 'o', 'k'],
  j: ['h', 'k', 'u'], k: ['j', 'l', 'i'], l: ['k', 'o'],
  m: ['n', 'j'], n: ['b', 'm', 'h'], o: ['i', 'p', 'l'],
  p: ['o', 'l'], q: ['w', 'a'], r: ['e', 't', 'f'],
  s: ['a', 'd', 'w'], t: ['r', 'y', 'g'], u: ['y', 'i', 'j'],
  v: ['c', 'b', 'g'], w: ['q', 'e', 's'], x: ['z', 'c', 's'],
  y: ['t', 'u', 'h'], z: ['a', 's', 'x'],
};

/**
 * Type text character-by-character with:
 *  - Gaussian inter-key delays (realistic WPM variation)
 *  - Occasional typos with immediate correction (Backspace)
 *  - Longer pauses at word boundaries and sentence ends
 *  - Brief "burst" phases followed by slower careful phases
 */
async function humanType(locator, text) {
  // Move mouse to field and click before typing
  await locator.click({ force: true });
  await sleep(gaussianMs(180, 60));

  // Decide a "typing speed profile" for this session: slow/normal/fast
  const wpm = gaussianMs(55, 15); // 40–70 WPM is realistic
  const baseDelay = Math.round(60000 / (wpm * 5)); // ms per character

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    // Chance of making a typo (3% per character)
    if (Math.random() < 0.03 && char.match(/[a-z]/i)) {
      const adjacent = ADJACENT_KEYS[char.toLowerCase()];
      if (adjacent && adjacent.length > 0) {
        // Type wrong key
        const typo = adjacent[Math.floor(Math.random() * adjacent.length)];
        await locator.pressSequentially(typo, { delay: gaussianMs(baseDelay, baseDelay * 0.3) });

        // Notice the mistake after 150–600ms
        await sleep(gaussianMs(350, 120));

        // Press backspace to correct
        await locator.press('Backspace');
        await sleep(gaussianMs(180, 60));
      }
    }

    // Type the correct character
    const charDelay = gaussianMs(baseDelay, baseDelay * 0.35);
    await locator.pressSequentially(char, { delay: charDelay });

    // Pause at word boundaries
    if (char === ' ') {
      await sleep(gaussianMs(80, 30));
    }

    // Pause at sentence endings
    if (['.', '!', '?', ','].includes(char)) {
      await sleep(gaussianMs(250, 80));
    }

    // Occasional "thinking" pause (2% chance mid-word)
    if (Math.random() < 0.02) {
      await sleep(gaussianMs(600, 200));
    }

    i++;
  }

  // Brief pause after finishing typing (re-reading)
  await sleep(gaussianMs(300, 100));
}

// ── Scrolling ──────────────────────────────────────────────────────────────────

/**
 * Simulate human scroll with inertia:
 *  - Starts fast, decelerates (like a flick + finger lift)
 *  - Random chance to scroll back up slightly
 *  - Pauses between scroll events
 */
async function humanScroll(page, direction = 'down') {
  const totalScroll = gaussianMs(350, 120); // Total pixels to scroll
  const scrollEvents = 3 + Math.floor(Math.random() * 5); // 3–7 events

  for (let i = 0; i < scrollEvents; i++) {
    // Inertia: bigger scroll at start, smaller at end
    const progress = i / scrollEvents;
    const inertia = Math.sin(Math.PI * progress * 0.9 + 0.1); // 0.1 → 1 → 0.1
    const delta = Math.round((totalScroll / scrollEvents) * inertia);
    const scrollDelta = direction === 'down' ? delta : -delta;

    await page.mouse.wheel(0, scrollDelta);
    await sleep(gaussianMs(80, 30));
  }

  // 35% chance to scroll back up a bit (like checking something above)
  if (Math.random() < 0.35) {
    await sleep(gaussianMs(400, 150));
    const upAmount = gaussianMs(80, 30);
    await page.mouse.wheel(0, -upAmount);
    await sleep(gaussianMs(200, 80));
  }
}

/**
 * Move mouse in small random micro-jitter patterns while "reading".
 * Mimics the subconscious mouse movement humans make while reading a page.
 */
async function idleMouseDrift(page, durationMs) {
  const startTime = Date.now();
  let lastX = page.cursor ? page.cursor.previous.x : (await page.evaluate(() => window.__lastMouseX || 600));
  let lastY = page.cursor ? page.cursor.previous.y : (await page.evaluate(() => window.__lastMouseY || 400));

  while (Date.now() - startTime < durationMs) {
    // Tiny random displacement
    const dx = (Math.random() - 0.5) * 60;
    const dy = (Math.random() - 0.5) * 40;
    const newX = Math.max(100, Math.min(1200, lastX + dx));
    const newY = Math.max(100, Math.min(600,  lastY + dy));

    if (page.cursor) {
      try {
        await page.cursor.actions.move({ x: newX, y: newY });
      } catch {
        await page.mouse.move(newX, newY, { steps: 4 });
      }
    } else {
      await page.mouse.move(newX, newY, { steps: 4 });
    }
    lastX = newX;
    lastY = newY;

    // Wait 0.5–2s between micro-movements
    await sleep(gaussianMs(1000, 400));
  }

  if (!page.cursor) {
    await page.evaluate((pos) => {
      window.__lastMouseX = pos.x;
      window.__lastMouseY = pos.y;
    }, { x: lastX, y: lastY });
  }
}

// ── Session Warming ────────────────────────────────────────────────────────────

/**
 * Warm up the session by browsing the LinkedIn feed naturally before acting.
 * This builds up realistic session activity so LinkedIn's systems see normal usage.
 *
 * @param {import('playwright').Page} page
 * @param {number} durationMs  How long to warm (default: 20–45s random)
 */
async function warmSession(page) {
  const duration = gaussianMs(30000, 8000); // 22–38s typically
  console.log(`  🔥 Session warm-up: browsing feed for ${Math.round(duration / 1000)}s...`);

  // Navigate to feed
  const currentUrl = page.url();
  if (!currentUrl.includes('/feed')) {
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await sleep(gaussianMs(2000, 500));
  }

  const startTime = Date.now();
  let scrollCount = 0;

  while (Date.now() - startTime < duration) {
    // Scroll down to read more posts
    await humanScroll(page, 'down');
    scrollCount++;

    // Occasionally pause on a post (simulating reading it)
    if (Math.random() < 0.4) {
      const readTime = gaussianMs(4000, 1500); // 2.5–5.5s to read a post
      console.log(`    📰 Reading post for ${Math.round(readTime / 1000)}s...`);
      await idleMouseDrift(page, readTime);
    } else {
      await sleep(gaussianMs(1500, 500));
    }

    // Occasionally hover over a profile image (simulate curiosity)
    if (Math.random() < 0.2) {
      try {
        const profileLinks = await page.locator('a[href*="/in/"]').all();
        if (profileLinks.length > 0) {
          const randomLink = profileLinks[Math.floor(Math.random() * Math.min(profileLinks.length, 5))];
          const box = await randomLink.boundingBox().catch(() => null);
          if (box) {
            await page.mouse.move(
              box.x + box.width / 2,
              box.y + box.height / 2,
              { steps: 8 }
            );
            await sleep(gaussianMs(800, 300));
            await page.mouse.move(
              box.x + box.width / 2 + 50,
              box.y + 10,
              { steps: 5 }
            );
          }
        }
      } catch { /* ignore */ }
    }
  }

  console.log(`  ✅ Warm-up complete (${scrollCount} scrolls).`);
}

/**
 * Simulate reading a profile — scroll through it naturally before acting.
 * Call after navigating to a target profile, before clicking any buttons.
 */
async function readProfile(page) {
  console.log('  📖 Reading profile before acting...');
  const readDuration = gaussianMs(5000, 1500); // 3.5–6.5s

  // Scroll down to see more of the profile
  await humanScroll(page, 'down');
  await sleep(gaussianMs(1000, 300));

  // Idle mouse drift while "reading"
  await idleMouseDrift(page, readDuration);

  // Scroll back up to the top card buttons
  await page.mouse.wheel(0, -500);
  await sleep(gaussianMs(800, 200));
}

module.exports = {
  sleep,
  randomSleep,
  gaussianMs,
  idlePause,
  bezierMouseMove,
  humanClick,
  humanType,
  humanScroll,
  idleMouseDrift,
  warmSession,
  readProfile,
};
