import { webkit, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Focused check of the stationary upper-body refinement after the thirteen-clip
// sweep. Fresh isolated save; no gameplay mutation or extra high-resolution actor.
const out = resolve('public/verification/goal-009/runtime');
mkdirSync(out, { recursive: true });
const browser = await webkit.launch();
try {
  const context = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  await context.addInitScript(() => localStorage.setItem('centre-court-circuit-v1', JSON.stringify({
    version: 1, player: 'zuri', stage: 0, wins: 0, losses: 0, completed: false, results: [],
  })));
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4174/?debug', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => {
    const s = window.centreCourt?.snapshot();
    return s?.kira.character === 'zuri' && s.kira.status === 'ready' && s.kira.state === 'ForehandVolley';
  }, undefined, { timeout: 180000 });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const s = await page.evaluate(() => window.centreCourt.snapshot());
  assert.equal(s.kira.nativeState, 'Locomotion');
  assert.equal(s.actions[0], null);
  assert.ok(s.kira.handGrip.skinInstancesPatched > 0);
  assert.equal(s.locomotion[0].speed, 0);
  await page.addStyleTag({ content: '#menu,#menu-note{visibility:hidden!important}' });
  await page.screenshot({ path: resolve(out, 'zuri-stationary-ready.png') });
  writeFileSync(resolve(out, 'ready-validation.json'), JSON.stringify({
    method: 'Actual normal stationary renderer, existing ForehandVolley preparation upper layer, native locomotion legs, no action or simulation change; Linux WebKit, not physical iPhone.', snapshot: s,
  }, null, 2));
  console.log('STATIONARY_READY_PASS', s.kira.character, s.kira.state, s.kira.nativeState);
} finally { await browser.close(); }
