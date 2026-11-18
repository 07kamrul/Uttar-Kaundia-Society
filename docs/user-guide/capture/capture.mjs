// Screenshot capture for the user guide.
// Usage (from repo root, app running with DEMO data only):
//   cd frontend && npm i -D playwright && npx playwright install chromium   (once)
//   GUIDE_BASE_URL=http://localhost:4200 \
//   GUIDE_MEMBER_ID=... GUIDE_MEMBER_PW=... GUIDE_ADMIN_ID=... GUIDE_ADMIN_PW=... \
//   node docs/user-guide/capture/capture.mjs
// Credentials come from env vars only — never commit them.
// Shots needing a mid-flow state (wizard steps, dialogs) are listed as MANUAL at the end.
import { mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUIDE_DIR = join(HERE, '..');
const IMAGES_DIR = join(GUIDE_DIR, 'images');
const BASE_URL = process.env.GUIDE_BASE_URL ?? 'http://localhost:4200';
const VIEWPORT = { width: 412, height: 915 }; // typical Android phone — most members use phones
const LOGIN_TIMEOUT_MS = 15000;

// Page-level shots: image name -> [role, route]. role: 'public' | 'member' | 'admin'.
const SHOTS = {
  'a01-home': ['public', '/'],
  'a03-notices': ['public', '/notices'],
  'a03-events': ['public', '/events'],
  'a04-01-start': ['public', '/'],
  'a04-02-member-info': ['public', '/register'],
  'a05-login': ['public', '/login'],
  'a06-forgot': ['public', '/forgot-password'],
  'a02-display-settings': ['member', '/profile'],
  'a06-change-password': ['member', '/change-password'],
  'b02-home': ['member', '/'],
  'b03-payments': ['member', '/payments'],
  'b06-history': ['member', '/payments'],
  'b07-my-land': ['member', '/my-land'],
  'b07-new-property': ['member', '/property-requests/new'],
  'b08-plot-map': ['member', '/plot-map'],
  'b08-neighbours': ['member', '/neighbours'],
  'b09-membership': ['member', '/membership'],
  'b10-complaint': ['member', '/complaints'],
  'b11-elections': ['member', '/elections'],
  'b11-petitions': ['member', '/petitions'],
  'b12-welfare-fund': ['member', '/welfare-fund'],
  'b13-organisation': ['member', '/organisation'],
  'b14-emergency': ['member', '/emergency-help'],
  'b15-profile': ['member', '/profile'],
  'c02-today': ['admin', '/'],
  'c03-1-list': ['admin', '/submissions'],
  'c04-members': ['admin', '/members'],
  'c05-verify': ['admin', '/payment-verifications'],
  'c06-installments': ['admin', '/installments-management'],
  'c07-fee-settings': ['admin', '/fee-settings'],
  'c07-payment-accounts': ['admin', '/payment-accounts'],
  'c08-property-requests': ['admin', '/property-requests'],
  'c08-plot-boundaries': ['admin', '/plot-boundaries'],
  'c09-complaints': ['admin', '/complaints-admin'],
  'c10-governance': ['admin', '/membership-governance'],
  'c11-elections-admin': ['admin', '/elections-admin'],
  'c12-notices': ['admin', '/notices-management'],
  'c13-resolution-book': ['admin', '/resolution-book'],
  'c15-phone-fixes': ['admin', '/phone-fixes'],
  'c16-roles': ['admin', '/roles'],
};

function referencedImages() {
  const names = new Set();
  for (const file of readdirSync(GUIDE_DIR).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(join(GUIDE_DIR, file), 'utf8');
    for (const m of text.matchAll(/\]\(images\/([\w-]+)\.png\)/g)) names.add(m[1]);
  }
  return [...names].sort();
}

function loadPlaywright() {
  const require = createRequire(join(GUIDE_DIR, '..', '..', 'frontend', 'package.json'));
  try {
    return require('playwright');
  } catch {
    throw new Error('playwright not found — run `npm i -D playwright` in frontend/ first.');
  }
}

function credentialsFor(role) {
  const id = process.env[`GUIDE_${role.toUpperCase()}_ID`];
  const pw = process.env[`GUIDE_${role.toUpperCase()}_PW`];
  if (!id || !pw) throw new Error(`Set GUIDE_${role.toUpperCase()}_ID and _PW (demo account).`);
  return { id, pw };
}

async function newSession(browser, role) {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'bn-BD' });
  const page = await context.newPage();
  if (role !== 'public') {
    const { id, pw } = credentialsFor(role);
    await page.goto(`${BASE_URL}/login`);
    await page.locator('input:not([type="password"])').first().fill(id);
    await page.locator('input[type="password"]').fill(pw);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: LOGIN_TIMEOUT_MS });
  }
  return { context, page };
}

async function captureAll(browser) {
  const sessions = {};
  const failed = [];
  for (const [name, [role, route]] of Object.entries(SHOTS)) {
    try {
      sessions[role] ??= await newSession(browser, role);
      const { page } = sessions[role];
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      await page.screenshot({ path: join(IMAGES_DIR, `${name}.png`) });
      console.log(`ok      ${name}`);
    } catch (err) {
      failed.push(name);
      console.error(`FAILED  ${name}: ${err.message}`);
    }
  }
  return failed;
}

async function main() {
  const { chromium } = loadPlaywright();
  mkdirSync(IMAGES_DIR, { recursive: true });
  const browser = await chromium.launch();
  let failed = [];
  try {
    failed = await captureAll(browser);
  } finally {
    await browser.close();
  }
  const manual = referencedImages().filter((n) => !existsSync(join(IMAGES_DIR, `${n}.png`)));
  if (manual.length) {
    console.log(`\nMANUAL (take by hand, save as images/<name>.png):\n  ${manual.join('\n  ')}`);
  }
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
