import { webkit, devices } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// One sequential sweep through the existing developer inspector and equipment
// UI. No gameplay mutation API, new models, concurrent browsers or device claims.
const out = resolve(process.env.CC_OUTPUT ?? 'public/verification/goal-009/runtime');
mkdirSync(out, { recursive: true });
const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(90000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const report = { browser: `Linux WebKit ${browser.version()}`, date: new Date().toISOString(),
  method: 'Actual production render meshes, source clips, shared hand patches and existing developer inspector; mobile browser profile, not physical iPhone validation.',
  characters: [], errors };
const save = () => writeFileSync(resolve(out, 'validation.json'), JSON.stringify(report, null, 2));
const snapshot = () => page.evaluate(() => window.centreCourt.snapshot());
const frames = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
try {
  await page.goto(new URL('?dev=1', process.env.CC_URL ?? 'http://127.0.0.1:4174/').href,
    { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (const character of (process.env.CC_CHARACTERS ?? 'kira,zuri,dante,rico,nova').split(',')) {
    console.log(character, 'loading');
    if ((await snapshot()).kira.character !== character)
      await page.locator(`[data-character="${character}"]`).click();
    await page.waitForFunction((id) => {
      const s = window.centreCourt.snapshot();
      return s.kira.character === id && ['ready', 'error'].includes(s.kira.status);
    }, character, { timeout: 180000 });
    const before = await snapshot();
    assert.equal(before.kira.status, 'ready', before.kira.error);
    assert.ok(before.kira.handGrip.skinInstancesPatched > 0, 'Calibration must reach an active render skin');
    assert.equal(before.kira.handGrip.digits, 5);
    const item = { character, initial: before.kira, equipment: null, poses: [] };
    item.menuResources = before.resources;
    report.characters.push(item); save();
    await page.locator('#racket-equipment-open').click();
    await page.waitForFunction(() => !window.centreCourt.snapshot().equipment.pending);
    await frames();
    await page.screenshot({ path: resolve(out, `${character}-equipment.png`) });
    await page.locator('#equipment-equip').click();
    await page.waitForFunction(() => !window.centreCourt.snapshot().equipment.pending);
    item.equipment = (await snapshot()).equipment;
    assert.equal((await snapshot()).kira.equipment.animationInstance, before.kira.equipment.animationInstance);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#racket-equipment-open').evaluate((el) => document.activeElement === el), true);
    await page.locator('#dev-toggle').click();
    await page.locator('#dev-inspect').click();
    await page.locator('#dev-angle').selectOption('grip');
    const poses = JSON.parse(readFileSync(`public/verification/goal-009/graphics/${character}/poses.json`, 'utf8')).states;
    for (const pose of poses) {
      await page.locator('#dev-clip').selectOption(pose.state);
      if (pose.samples.length === 3) await page.locator('#dev-contact-seek').click();
      else await page.locator('#dev-time').evaluate((el, time) => {
          el.value = String(time);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }, pose.seconds);
      await page.waitForFunction(({ state, time }) => {
        const s = window.centreCourt.snapshot();
        return s.developer.markers?.animationState === state && Math.abs(s.developer.timeline.time - time) < 0.002;
      }, { state: pose.state, time: pose.seconds });
      await frames();
      const style = await page.addStyleTag({ content: '#dev-tools{visibility:hidden!important}' });
      await page.screenshot({ path: resolve(out, `${character}-${pose.state}-grip.png`) });
      await style.evaluate((element) => element.remove());
      const s = await snapshot();
      assert.ok(s.kira.handGrip.skinInstancesPatched > 0);
      item.poses.push({ state: pose.state, time: pose.seconds, markers: s.developer.markers,
        grip: s.kira.handGrip, equipment: s.kira.equipment, resources: s.resources });
      save(); console.log(character, pose.state, 'CAPTURED');
    }
    await page.locator('#dev-inspect').click();
    await page.locator('#dev-close').click();
    item.finalResources = (await snapshot()).resources;
    save(); console.log(character, '13 live render poses complete');
  }
  // Reuse the last selected full-resolution model for the real serve and a
  // bounded frame/resource window; do not initialize another unused athlete.
  await page.selectOption('#opponent', 'rico');
  await page.locator('#practice').click();
  await page.waitForFunction(() => window.centreCourt.snapshot().phase === 'serve', undefined, { timeout: 180000 });
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.down('Space'); await page.waitForTimeout(450); await page.keyboard.up('Space');
  await page.waitForFunction(() => window.centreCourt.snapshot().contacts > 0, undefined, { timeout: 60000 });
  await frames();
  const measuredWindow = page.evaluate(() => new Promise((done) => {
    const intervals = [], draws = [], phases = {}; let start, previous;
    const frame = (now) => {
      start ??= now;
      if (previous !== undefined) intervals.push(now - previous);
      previous = now;
      const s = window.centreCourt.snapshot(); draws.push(s.drawCalls);
      phases[s.phase] = (phases[s.phase] ?? 0) + 1;
      if (now - start < 8000) return requestAnimationFrame(frame);
      const sorted = [...intervals].sort((a,b) => a-b);
      done({ method: 'One8-second Linux software-WebKit window after real serve contact; no physical-device, native GPU or sustained thermal claim.',
        elapsedMs: now-start, samples: intervals.length, medianMs: sorted[Math.floor(sorted.length/2)],
        p95Ms: sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)], phases, drawCalls: draws,
        snapshot: s });
    }; requestAnimationFrame(frame);
  }));
  let measurementTimer;
  try {
    report.match = await Promise.race([measuredWindow, new Promise((_, reject) => {
      measurementTimer = setTimeout(() => reject(new Error('Match measurement exceeded45 seconds')), 45000);
    })]);
  } finally { clearTimeout(measurementTimer); }
  await page.screenshot({ path: resolve(out, `${report.characters.at(-1).character}-equipped-match.png`) });
  report.persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('centre-court-equipment-v1')));
  save(); console.log('MATCH_AND_RESOURCE_WINDOW', JSON.stringify({ samples: report.match.samples, medianMs: report.match.medianMs,
    p95Ms: report.match.p95Ms, resources: report.match.snapshot.resources }));
  assert.deepEqual(errors, []);
} catch (error) {
  report.failure = String(error);
  await page.screenshot({ path: resolve(out, 'failure.png'), timeout: 10000 }).catch(() => {});
  save(); throw error;
} finally { save(); await browser.close(); }
