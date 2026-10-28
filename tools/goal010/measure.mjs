// Bounded comparison workload: one cold menu, 60 wall-frame samples, then N practice cycles.
// Run alone against npm run preview; no physical-device or GPU-timing claims.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const out = {
  browser: browser.version(),
  viewport: '390x844 DPR1 SwiftShader',
  cycles: [],
  errors,
};
const t = Date.now();
await page.goto('http://127.0.0.1:4173/?debug');
await page.locator('#play').waitFor();
await page.waitForFunction(
  () => !document.querySelector('#play').disabled,
  {},
  { timeout: 120000 },
);
out.menuMs = Date.now() - t;
async function frames() {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        let last = performance.now(),
          a = [];
        function f() {
          let n = performance.now();
          a.push(n - last);
          last = n;
          if (a.length < 60) requestAnimationFrame(f);
          else {
            a.sort((x, y) => x - y);
            resolve({ meanMs: a.reduce((x, y) => x + y) / a.length, p95Ms: a[56] });
          }
        }
        requestAnimationFrame(f);
      }),
  );
}
out.menuFrames = await frames();
out.menu = await page.evaluate(() => window.centreCourt.snapshot());
for (let i = 0; i < Number(process.argv[3] ?? 3); i++) {
  let t = Date.now();
  await page.locator('#practice').click();
  await page.locator('#hud').waitFor({ state: 'visible', timeout: 120000 });
  let loadMs = Date.now() - t;
  const match = await page.evaluate(() => window.centreCourt.snapshot());
  let frame = await frames();
  await page.locator('#pause-button').click();
  t = Date.now();
  await page.locator('#menu-pause').click();
  await page.locator('#menu').waitFor();
  out.cycles.push({
    loadMs,
    returnMs: Date.now() - t,
    frame,
    match,
    menu: await page.evaluate(() => window.centreCourt.snapshot()),
  });
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
await browser.close();
