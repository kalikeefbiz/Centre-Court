import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const url = process.env.CENTRE_COURT_URL || 'http://127.0.0.1:4174/';
const directory = 'public/verification/goal-002d';
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (e) => console.error(e.message));
const snap = () => page.evaluate(() => window.centreCourt.snapshot());
await page.goto(url + '?dev=1');
await page.locator('#play').waitFor({ state: 'visible' });
await page.waitForFunction(() => !document.querySelector('#play').disabled, { timeout: 45000 });
await page.locator('#dev-toggle').click();
await page.locator('#dev-inspect').click();
await page.locator('#dev-markers').check();
await page.locator('#dev-clip').selectOption('Forehand');
await page.locator('#dev-contact-seek').click();
await page.waitForTimeout(500);
await page.locator('#dev-panel').evaluate((e) => (e.scrollTop = 0));
await page.screenshot({ path: `${directory}/inspection.png` });
const audit = [];
for (const clip of [
  'Forehand',
  'Backhand',
  'Serve',
  'Slice',
  'Lob',
  'ShuffleLeft',
  'ShuffleRight',
  'Walk',
  'Run',
]) {
  await page.locator('#dev-clip').selectOption(clip);
  if (clip === 'Serve') await page.locator('#dev-serve-prototype').check();
  await page.locator('#dev-time').fill('0');
  const duration =
    (await snap()).kira.clips.find((x) => x.name === { Walk: 'Walking', Run: 'Running' }[clip])
      ?.duration || 2.9666669;
  for (const time of [0, 0.4, 0.8, 1.2, 1.533, 2, 2.6].filter((t) => t < duration)) {
    await page.locator('#dev-time').fill(String(time));
    await page.waitForTimeout(65);
    audit.push({
      clip,
      time,
      ...(await snap()).developer.markers,
      serveStudy: (await snap()).developer.serveStudy,
    });
    if (['Forehand', 'Backhand', 'Serve'].includes(clip)) {
      // Hide the panel for unobstructed full-body source-pose evidence.
      await page.locator('#dev-close').click();
      await page.screenshot({ path: `${directory}/${clip.toLowerCase()}-${time.toFixed(2)}.png` });
      await page.locator('#dev-toggle').click();
    }
  }
}
await page.locator('#dev-clip').selectOption('Serve');
await page.locator('#dev-contact-seek').click();
await page.locator('#dev-close').click();
await page.waitForTimeout(100);
await page.screenshot({ path: `${directory}/serve-contact.png` });
await page.locator('#dev-toggle').click();
await page.locator('#dev-clip').selectOption('Forehand');
await page.locator('#dev-contact-seek').click();
await page.locator('#dev-angle').selectOption('side');
await page.waitForTimeout(300);
await page.screenshot({ path: `${directory}/racket-overlay.png` });
await page.locator('#dev-inspect').click();
await page.locator('#dev-close').click();
await page.locator('#practice').click();
await page.setViewportSize({ width: 390, height: 844 });
await page.locator('#dev-toggle').click();
await page.locator('#dev-perf').check();
await page.locator('#dev-comparison').selectOption('near');
const ballAudit = [];
for (const camera of ['broadcast', 'behind']) {
  await page.locator('#dev-camera').selectOption(camera);
  await page.waitForTimeout(2200);
  for (const position of ['serve', 'near', 'far']) {
    await page.locator('#dev-comparison').selectOption(position);
    for (const scale of ['1', '1.5', '1.75']) {
      await page.locator('#dev-scale').selectOption(scale);
      await page.waitForTimeout(120);
      await page.locator('#dev-close').click();
      await page.screenshot({ path: `${directory}/ball-${camera}-${position}-${scale}.png` });
      ballAudit.push(await snap());
      await page.locator('#dev-toggle').click();
    }
  }
}
await page.screenshot({ path: `${directory}/performance.png` });
await page.locator('#dev-comparison').selectOption('live');
await page.locator('#dev-close').click();
await page.keyboard.down('Space');
await page.waitForTimeout(550);
await page.keyboard.up('Space');
await page.waitForTimeout(350);
await page.screenshot({ path: `${directory}/active-rally.png` });
await page.goto(url);
await page.waitForFunction(() => !document.querySelector('#play').disabled);
await page.locator('#practice').click();
await page.waitForTimeout(1800);
await page.screenshot({ path: `${directory}/normal-gameplay.png` });
writeFileSync(`${directory}/animation-samples.json`, JSON.stringify(audit, null, 2));
writeFileSync(`${directory}/ball-comparisons.json`, JSON.stringify(ballAudit, null, 2));
await browser.close();
