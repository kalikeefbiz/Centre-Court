import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
const run = promisify(execFile);
const base = 'https://kalikeefbiz.github.io/Centre-Court/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 700, height: 650 }, deviceScaleFactor: 1 });
// The managed workspace's HTTP proxy and CA trust belong to curl. Retain TLS validation
// while rendering the deployed response bytes at their original URL in Chromium.
await page.route(`${base}**`, async (route) => {
  const url = route.request().url();
  const { stdout } = await run('curl', ['--fail', '--silent', '--show-error', '--location', url], {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  const path = new URL(url).pathname;
  const type = path.endsWith('.js')
    ? 'text/javascript'
    : path.endsWith('.css')
      ? 'text/css'
      : path.endsWith('.json')
        ? 'application/json'
        : path.endsWith('.woff2')
          ? 'font/woff2'
          : path.endsWith('.glb')
            ? 'model/gltf-binary'
            : 'text/html';
  await route.fulfill({ status: 200, contentType: type, body: stdout });
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?debug`);
await page.waitForFunction(() => !document.querySelector('#play').disabled, { timeout: 60000 });
await page.locator('#play').click();
await page.waitForTimeout(1800);
const s = await page.evaluate(() => window.centreCourt.snapshot());
await page.screenshot({ path: 'public/verification/goal-004/live-deployment.png' });
const release = JSON.parse(
  (await run('curl', ['--fail', '--silent', '--show-error', `${base}release.json`])).stdout,
);
writeFileSync(
  'public/verification/goal-004/live-verification.json',
  JSON.stringify(
    {
      url: base,
      transport:
        'Deployed bytes fetched with TLS-verified curl using inherited managed proxy; rendered by Chromium at original URL',
      release,
      errors,
      snapshot: s,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({ release, stadium: s.stadium.status, quality: s.stadium.quality, errors }),
);
await browser.close();
if (s.release !== 'GOAL-004' || s.stadium.status !== 'ready' || errors.length)
  throw Error('Live verification failed');
