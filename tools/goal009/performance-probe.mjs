import { chromium, webkit } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Functional setup diagnosis only. This probe produces no FPS/GPU benchmark.
const engine = process.env.CC_BROWSER === 'chromium' ? 'chromium' : 'webkit';
const url = process.env.CC_URL ?? 'http://127.0.0.1:4173/';
const out = resolve(process.env.CC_OUTPUT ?? `public/verification/goal-009/performance/baseline-${engine}-probe`);
mkdirSync(out, { recursive: true });
const result = { engine, url, date: new Date().toISOString(), method: 'One functional page probe, capture actual state approximately30s after DOM readiness; no frame timing measurements.', console: [], pageErrors: [], failedRequests: [], responses: [], state: null };
const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] }));
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.on('console', (message) => { result.console.push({ type: message.type(), text: message.text() }); });
page.on('pageerror', (error) => result.pageErrors.push(error.message));
page.on('requestfailed', (request) => result.failedRequests.push({ url: request.url(), failure: request.failure() }));
page.on('response', (response) => {
  if (response.status() >= 400 || /\/assets\/(characters|equipment|balls)\//.test(response.url())) result.responses.push({ url: response.url(), status: response.status() });
});
try {
  console.log('probe', engine, 'navigation');
  await page.goto(new URL('?debug', url).href, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(30000);
  result.state = await page.evaluate(() => ({
    title: document.title,
    loading: document.querySelector('#loading')?.textContent,
    athleteStatus: document.querySelector('#athlete-status')?.textContent,
    playDisabled: document.querySelector('#play')?.disabled,
    debugAvailable: !!window.centreCourt,
    snapshot: window.centreCourt?.snapshot?.(),
    canvas: { width: document.querySelector('#court')?.width, height: document.querySelector('#court')?.height },
    resources: performance.getEntriesByType('resource').filter((r) => /\/assets\/(characters|equipment|balls)\//.test(r.name)).map((r) => ({ url: r.name, durationMs: r.duration, transferBytes: r.transferSize, encodedBytes: r.encodedBodySize })),
  }));
  await page.screenshot({ path: resolve(out, 'probe.png'), timeout: 20000 });
  console.log(JSON.stringify({ engine, pageErrors: result.pageErrors, failedRequests: result.failedRequests, console: result.console, state: result.state }, null, 2));
} catch (error) {
  result.error = String(error);
  console.error(result.error);
} finally {
  writeFileSync(resolve(out, 'probe.json'), JSON.stringify(result, null, 2));
  await browser.close();
}
