// Actual production rendering and shipped diagnostic controls; feeds are labeled fixtures.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const dir = 'public/verification/goal-003';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const base = process.env.CC_URL ?? 'http://localhost:4173/';
const snap = () => page.evaluate(() => window.centreCourt.snapshot());
const audits = [];
async function capture(name, provenance) {
  await page.waitForTimeout(150);
  const s = await snap();
  if (!s.kira.racketAttached || !s.kira.bodyVisible || !s.royalBall.textured)
    throw Error('Production assets missing');
  await page.screenshot({ path: `${dir}/${name}.png` });
  audits.push({ name, provenance, ...s });
  console.log(name, s.ai?.state, s.ai?.tactic?.name);
}
await page.goto(`${base}?dev=1`);
await page.locator('#play').waitFor({ state: 'visible' });
await page.waitForFunction(() => !document.querySelector('#play').disabled, { timeout: 45000 });
await page.locator('#difficulty').selectOption('hard');
await capture('difficulty-selection', 'Existing match setup, Hard selected');
await page.locator('#play').click();
await page.waitForTimeout(1000);
await capture('baseline-positioning', 'Unmodified match before human serve; AI receiving position');
await page.locator('#dev-toggle').click();
await page.locator('#dev-ai').check();
await page.locator('#dev-scale').selectOption('1.5');
await page.locator('#dev-close').click();
async function feed(name, seed, state, file) {
  await page.locator('#dev-toggle').click();
  await page.locator('#dev-comparison').selectOption('live');
  await page.locator('#dev-seed').fill(String(seed));
  await page.locator('#dev-ai-feed').selectOption(name);
  await page.locator('#dev-ai-launch').click();
  await page.locator('#dev-close').click();
  await page.waitForFunction(
    (state) => {
      const s = window.centreCourt.snapshot();
      if (s.ai.state !== state) return false;
      // Freeze with the existing visual comparison control, leaving the match and poses intact.
      const freeze = document.querySelector('#dev-comparison');
      freeze.value = 'frozen';
      freeze.dispatchEvent(new Event('change'));
      return true;
    },
    state,
    { timeout: 12000 },
  );
  await capture(
    file,
    `Developer feed: ${name}, seed ${seed}; production AI reached ${state}; frozen using existing comparison control`,
  );
}
await feed('Wide defence', 1, 'ball interception', 'predicted-interception');
await feed('Wide defence', 1, 'defensive recovery', 'defensive-recovery');
await feed('Open court', 1, 'neutral court recovery', 'open-court-attack');
await feed('Short ball', 8, 'net approach', 'net-approach');
await page.locator('#dev-toggle').click();
await capture(
  'ai-diagnostics',
  'Existing DEV panel with AI overlay, seed, feed and export controls',
);
await page.locator('#dev-ai').uncheck();
await page.locator('#dev-comparison').selectOption('live');
await page.locator('#dev-seed-restart').click();
await page.locator('#dev-close').click();
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${dir}/mobile-setup.png` });
await page.goto(`${base}?debug`);
await page.waitForFunction(() => !document.querySelector('#play').disabled, { timeout: 45000 });
await page.locator('#play').click();
await page.keyboard.down('Space');
await page.waitForTimeout(550);
await page.keyboard.up('Space');
await page.waitForTimeout(450);
await capture(
  'normal-gameplay',
  'Ordinary visit with developer tools absent, human serve through production controls; portrait Chromium',
);
writeFileSync(`${dir}/browser-evidence.json`, JSON.stringify({ errors, audits }, null, 2));
if (errors.length) throw Error(errors.join('\n'));
await browser.close();
