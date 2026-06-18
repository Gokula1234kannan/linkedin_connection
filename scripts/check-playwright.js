const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  console.log('Playwright Chromium OK');
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
