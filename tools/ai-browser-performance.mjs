import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
// Run sequentially on an idle host. SwiftShader is not an iPhone GPU benchmark.
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
});
const results = [];
for (const [version, url] of [
  ['baseline', 'http://localhost:4175/'],
  ['goal003', process.env.CC_URL ?? 'http://localhost:4173/'],
]) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  await page.goto(`${url}?dev=1`);
  await page.waitForFunction(() => !document.querySelector('#play').disabled, { timeout: 45000 });
  await page.locator('#practice').click();
  await page.locator('#dev-toggle').click();
  await page.locator('#dev-scenario').selectOption('Serving');
  await page.locator('#dev-perf').check();
  await page.waitForTimeout(2000);
  for (let sample = 0; sample < 3; sample++) {
    if (sample) {
      await page.locator('#dev-close').click();
      await page.locator('#pause-button').click();
      await page.locator('#restart-pause').click();
      await page.locator('#dev-toggle').click();
    }
    await page.locator('#dev-record').click();
    await page.locator('#dev-close').click();
    // Closing the accessible panel focuses its toggle. Return keyboard focus to gameplay.
    await page.evaluate(
      () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
    );
    await page.keyboard.down('Space');
    await page.waitForTimeout(550);
    await page.keyboard.up('Space');
    await page.waitForTimeout(10300);
    const s = await page.evaluate(() => window.centreCourt.snapshot());
    results.push({
      version,
      sample,
      build: s.build,
      drawCalls: s.drawCalls,
      record: s.developer.records.at(-1),
      ai: s.ai,
    });
    console.log(version, sample, s.developer.records.at(-1)?.frameIntervals);
    await page.locator('#dev-toggle').click();
  }
  await page.close();
}
writeFileSync(
  'public/verification/goal-003/browser-performance.json',
  JSON.stringify(
    {
      environment:
        'Headless Linux Chromium, SwiftShader software WebGL, 390x844 DPR1; same host, sequential builds, 3 serving/idle-return windows per build; not GPU timing or physical iPhone data',
      results,
    },
    null,
    2,
  ),
);
await browser.close();
