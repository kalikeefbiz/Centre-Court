import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const version = process.env.CC_VERSION ?? 'goal004';
const url = process.env.CC_URL ?? 'http://localhost:4173/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}?dev=1`);
await page.waitForFunction(() => !document.querySelector('#play').disabled, { timeout: 45000 });
await page.locator('#practice').click();
await page.locator('#dev-toggle').click();
await page.locator('#dev-scenario').selectOption('Serving');
await page.locator('#dev-scale').selectOption('1.5');
await page.locator('#dev-perf').check();
await page.waitForTimeout(2000);
const results = [];
for (let sample = 0; sample < 3; sample++) {
  if (sample) {
    await page.locator('#dev-close').click();
    await page.locator('#pause-button').click();
    await page.locator('#restart-pause').click();
    await page.locator('#dev-toggle').click();
  }
  await page.locator('#dev-record').click();
  await page.locator('#dev-close').click();
  await page.evaluate(
    () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
  );
  await page.keyboard.down('Space');
  await page.waitForTimeout(550);
  await page.keyboard.up('Space');
  await page.waitForTimeout(10300);
  const s = await page.evaluate(() => window.centreCourt.snapshot());
  results.push({
    sample,
    build: s.build,
    readyMs: s.developer.readyMs,
    assets: s.developer.assets,
    drawCalls: s.drawCalls,
    stadium: s.stadium,
    record: s.developer.records.at(-1),
  });
  console.log(version, sample, s.drawCalls, s.developer.records.at(-1)?.frameIntervals);
  await page.locator('#dev-toggle').click();
}
mkdirSync('public/verification/goal-004', { recursive: true });
writeFileSync(
  `public/verification/goal-004/performance-${version}.json`,
  JSON.stringify(
    {
      environment:
        'Linux headless Chromium 156 / SwiftShader software WebGL, 390x844 DPR1; tools closed, perf overlay on; three serving/idle-return 10s records; not iPhone or GPU timings',
      errors,
      results,
    },
    null,
    2,
  ),
);
await browser.close();
if (errors.length) throw Error(errors.join('\n'));
