/**
 * Browser verification script for ADR-152 Code tab UI
 * Verifies: ProjectQualityTrend, ProjectRepoStats, CodeMetricsBar, suggestion cards
 */
import pkg from '/home/robert/code/trix/trix-app/node_modules/playwright/index.js';
const { chromium } = pkg;
import { mkdir } from 'fs/promises';

const APP_URL = 'http://localhost:5173';
const EMAIL = 'test@trix.local';
const PASSWORD = 'TestPassword123!';
const SCREENSHOTS_DIR = '/home/robert/code/trix/screenshots';

async function run() {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  // Capture console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  console.log('Navigating to app…');
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/01-landing.png` });
  console.log('Screenshot: 01-landing.png');

  // Log in
  // Log in via UI form
  console.log('Logging in…');
  const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first();
  await emailInput.waitFor({ timeout: 10000 });
  await emailInput.fill(EMAIL);

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(PASSWORD);

  const submitBtn = page.locator('button[type="submit"], button:has-text("Log in")').first();
  await submitBtn.click();

  // Wait for redirect away from login
  try {
    await page.waitForFunction(
      () => !window.location.pathname.startsWith('/login'),
      { timeout: 15000 }
    );
  } catch {
    const url = page.url();
    console.log('Login may have failed — still at:', url);
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/02-after-login.png` });
  console.log('Screenshot: 02-after-login.png — URL:', page.url());

  // Navigate to stats tab
  const PROJECT_ID = '5280fbba-08b0-47c0-b50a-1becfe38e804';
  const codeTabUrl = `${APP_URL}/app/projects/${PROJECT_ID}?tab=stats`;

  console.log('Navigating to Code tab:', codeTabUrl);
  await page.goto(codeTabUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000); // Let Svelte reactivity settle
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/03-code-tab.png` });
  console.log('Screenshot: 03-code-tab.png');

  // Check for key UI elements
  const checks = [
    { name: 'RepoStats panel',        selector: '.repo-stats, [data-testid="repo-stats"], .stats-grid' },
    { name: 'QualityTrend sparkline', selector: 'svg polyline, .quality-trend, [data-testid="quality-trend"]' },
    { name: 'CodeMetricsBar',         selector: '.metrics-bar, [data-testid="metrics-bar"]' },
    { name: 'Suggestion cards',       selector: '.suggestion-card, [data-testid="suggestion-card"]' },
    { name: 'Scan button',            selector: 'button:has-text("Scan"), button:has-text("Analyse")' },
  ];

  console.log('\n--- UI Element Check ---');
  for (const check of checks) {
    const el = page.locator(check.selector).first();
    const visible = await el.isVisible().catch(() => false);
    console.log(`${visible ? '✓' : '✗'} ${check.name}`);
  }

  // Also screenshot overview tab
  const overviewTabUrl = `${APP_URL}/app/projects/${PROJECT_ID}?tab=overview`;
  await page.goto(overviewTabUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/04-overview-tab.png` });
  console.log('Screenshot: 04-overview-tab.png');

  // Check for SVG sparklines specifically
  const svgCount = await page.locator('svg').count();
  const polylineCount = await page.locator('polyline').count();
  console.log(`\nSVG elements on page: ${svgCount}`);
  console.log(`Polyline elements (sparklines): ${polylineCount}`);

  // Check for any Svelte/JS errors
  if (errors.length > 0) {
    console.log('\n--- Console Errors ---');
    errors.slice(0, 10).forEach(e => console.log('  ERROR:', e));
  } else {
    console.log('\nNo console errors detected.');
  }

  await browser.close();
  console.log('\nDone. Check screenshots/ directory.');
}

run().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
// This will be ignored - just viewing the file
