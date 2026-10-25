import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const dir = 'public/verification/goal-004';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
});
const page = await browser.newPage({
  viewport: { width: 1100, height: 800 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const url = process.env.CC_URL ?? 'http://localhost:4173/';
const audits = [];
const snap = () => page.evaluate(() => window.centreCourt.snapshot());
async function settled(y) {
  await page.waitForFunction(
    (y) => Math.abs(window.centreCourt.snapshot().presentation.cameraPosition[1] - y) < 0.1,
    y,
    { timeout: 30000 },
  );
}
async function capture(name, provenance) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/${name}.png` });
  audits.push({ name, provenance, ...(await snap()) });
  console.log(name);
}
await page.goto(`${url}?dev=1`);
await page.waitForFunction(() => !document.querySelector('#play').disabled, { timeout: 60000 });
await page.locator('#play').click();
await page.locator('#pause-button').click();
await page.locator('#stadium-quality').selectOption('full');
await page.locator('#resume').click();
await page.locator('#dev-toggle').click();
await page.locator('#dev-scale').selectOption('1.5');
await page.locator('#dev-close').click();
await settled(25);
await capture(
  'broadcast-gameplay',
  'Actual broadcast gameplay camera, full crowd, 1.50x visual ball; pre-serve',
);
await page.locator('#camera-button').click();
await settled(10);
await capture(
  'behind-player-gameplay',
  'Existing behind-player camera, full crowd, 1.50x visual ball; pre-serve',
);
for (const view of ['overview', 'net', 'seating', 'courtside', 'scoreboard']) {
  await page.locator('#dev-toggle').click();
  await page.locator('#dev-stadium').selectOption(view);
  await page.locator('#dev-close').click();
  await capture(
    view,
    `Shipped DEV stadium inspection: ${view}. Actual frozen rendered scene; no match mutation, gameplay rig unchanged.`,
  );
}
await page.locator('#dev-toggle').click();
await page.locator('#dev-stadium').selectOption('gameplay');
await page.locator('#dev-close').click();
await page.setViewportSize({ width: 390, height: 844 });
await settled(15);
await capture(
  'mobile-behind',
  '390x844 Chromium viewport, existing behind camera, full crowd override',
);
await page.locator('#camera-button').click();
await settled(32);
await capture('mobile-broadcast', '390x844 Chromium viewport, existing broadcast camera');
// Ordinary navigation: no developer tool DOM is loaded.
await page.goto(`${url}?debug`);
await page.waitForFunction(() => !document.querySelector('#play').disabled, { timeout: 60000 });
await page.locator('#play').click();
await settled(32);
await page.keyboard.down('Space');
await page.waitForTimeout(550);
await page.keyboard.up('Space');
await page.waitForTimeout(400);
await capture(
  'normal-gameplay',
  'Ordinary production visit with read-only debug snapshot, developer tools absent, native keyboard serve, reduced crowd',
);
writeFileSync(
  `${dir}/browser-evidence.json`,
  JSON.stringify(
    {
      environment: 'Linux Chromium 156, SwiftShader software WebGL; not physical iPhone',
      errors,
      audits,
    },
    null,
    2,
  ),
);
await browser.close();
if (errors.length) throw Error(errors.join('\n'));
