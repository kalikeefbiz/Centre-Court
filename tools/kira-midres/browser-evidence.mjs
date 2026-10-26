// Exercise the existing production inspector; optionally substitute the candidate
// response before changing the production configuration. No match code is patched.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const directory = process.env.EVIDENCE_DIR || 'public/verification/kira-midres/browser';
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
page.setDefaultTimeout(60000);
const errors = [];
try {
  page.on('pageerror', (e) => errors.push(e.message));
  if (process.env.SOURCE_GLB) {
    await page.route('**/characters/kira/*.glb?*', (route) =>
      route.fulfill({
        path: resolve(process.env.SOURCE_GLB),
        contentType: 'model/gltf-binary',
      }),
    );
  }
  const snapshot = () => page.evaluate(() => window.centreCourt.snapshot());
  await page.goto((process.env.CC_URL || 'http://127.0.0.1:5173/') + '?dev=1');
  await page.waitForFunction(() => !document.querySelector('#play').disabled, { timeout: 60000 });
  await page.locator('#dev-toggle').click();
  await page.locator('#dev-inspect').click();
  await page.locator('#dev-close').click();
  const samples = [];
  const states = {
    Idle: [0, 2, 4, 6],
    Walk: [0, 0.25, 0.5, 0.75],
    Run: [0, 0.15, 0.3, 0.45],
    ShuffleLeft: [0, 0.7, 1.4, 2.1],
    ShuffleRight: [0, 0.7, 1.4, 2.1],
    Forehand: [0.5, 28 / 30, 1.4, 2],
    Backhand: [0.5, 1, 1.4, 2],
    ForehandVolley: [0.5, 29 / 30, 1.3, 2],
    BackhandVolley: [0.5, 29 / 30, 1.3, 2],
    Serve: [0.5, 1.2, 46 / 30, 2],
    Smash: [0.5, 26 / 30, 1.4, 2],
    Slice: [0.5, 0.9, 1.4, 2],
    Lob: [0.5, 37 / 30, 1.6, 2],
  };
  for (const [state, times] of Object.entries(states)) {
    for (const [i, time] of times.entries()) {
      if (process.env.QUICK === '1' && i !== 1) continue;
      // Dispatch the existing inspector controls while its panel is closed, so
      // evidence capture does not spend frames opening and closing the overlay.
      await page.evaluate(
        ({ state, time }) => {
          const clip = document.querySelector('#dev-clip');
          clip.value = state;
          clip.dispatchEvent(new Event('change'));
          const seek = document.querySelector('#dev-time');
          seek.max = '9';
          seek.value = String(time);
          seek.dispatchEvent(new Event('input'));
        },
        { state, time },
      );
      await page.waitForFunction(
        ({ state, time }) => {
          const s = window.centreCourt.snapshot();
          return (
            s.developer.markers.animationState === state &&
            Math.abs(s.developer.markers.animationTime - time) < 0.001
          );
        },
        { state, time },
      );
      await page.waitForTimeout(80);
      await page.screenshot({
        path: `${directory}/${state}-${i}.jpg`,
        type: 'jpeg',
        quality: 85,
        timeout: 60000,
      });
      const s = await snapshot();
      if (
        !s.kira.texturedSkin ||
        !s.kira.racketAttached ||
        !s.kira.bodyVisible ||
        s.kira.clips.length !== 13
      )
        throw Error(`Invalid rig at ${state} ${time}`);
      samples.push({ state, time, markers: s.developer.markers, kira: s.kira });
    }
    console.log(
      state,
      process.env.QUICK === '1' ? '1 production pose rendered' : '4 production poses rendered',
    );
  }
  for (const state of ['Forehand', 'Backhand', 'Serve', 'Run']) {
    await page.evaluate(
      ({ state, time }) => {
        const clip = document.querySelector('#dev-clip');
        clip.value = state;
        clip.dispatchEvent(new Event('change'));
        const seek = document.querySelector('#dev-time');
        seek.value = String(time);
        seek.dispatchEvent(new Event('input'));
        const angle = document.querySelector('#dev-angle');
        angle.value = 'side';
        angle.dispatchEvent(new Event('change'));
      },
      { state, time: states[state][1] },
    );
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${directory}/${state}-side.jpg`, type: 'jpeg', quality: 90 });
  }
  writeFileSync(`${directory}/samples.json`, JSON.stringify({ errors, samples }, null, 2));
  if (errors.length) throw Error(errors.join('\n'));
} finally {
  await browser.close();
}
