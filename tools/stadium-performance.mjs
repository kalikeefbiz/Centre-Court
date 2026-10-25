import { chromium, webkit } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const version = process.env.CC_VERSION ?? 'goal004';
const url = process.env.CC_URL ?? 'http://localhost:4173/';
const engine = process.env.CC_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const browser = await (engine === 'webkit'
  ? webkit.launch()
  : chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] }));
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}?dev=1`);
await page.waitForFunction(() => !document.querySelector('#play').disabled, undefined, {
  timeout: 45000,
});
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
  await page.waitForFunction(
    (count) => window.centreCourt.snapshot().developer.records.length >= count,
    sample + 1,
    { timeout: 25000 },
  );
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
      environment: `Linux headless ${engine} ${browser.version()}, 390x844 DPR1; tools closed, perf overlay on; three serving/idle-return 10s records; not iPhone or GPU timings`,
      runtime: await page.evaluate(() => {
        const gl = document.querySelector('canvas').getContext('webgl2');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return {
          userAgent: navigator.userAgent,
          cores: navigator.hardwareConcurrency,
          renderer: gl
            ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)
            : 'unavailable',
        };
      }),
      errors,
      results,
    },
    null,
    2,
  ),
);
await browser.close();
if (errors.length) throw Error(errors.join('\n'));
