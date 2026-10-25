// Real production Match; QA reads snapshots and sends ordinary movement/shot key events.
// No state injection, developer feed, teleports, score edits, or altered physics.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 700, height: 650 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const dir = 'public/verification/goal-004';
mkdirSync(dir, { recursive: true });
await page.goto(`${process.env.CC_URL ?? 'http://localhost:4173/'}?debug`);
await page.waitForFunction(() => !document.querySelector('#play').disabled, undefined, {
  timeout: 60000,
});
await page.locator('#difficulty').selectOption('hard');
await page.locator('#play').click();
await page.evaluate(() => {
  const keys = new Set();
  const flow = [];
  let previous = '',
    maxContacts = 0;
  const visited = new Set();
  const key = (code, down) => {
    if (keys.has(code) === down) return;
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    if (down) keys.add(code);
    else keys.delete(code);
  };
  window.stadiumFlow = { flow, maxContacts: 0, complete: false };
  const timer = setInterval(() => {
    const s = window.centreCourt.snapshot();
    maxContacts = Math.max(maxContacts, s.contacts);
    window.stadiumFlow.maxContacts = maxContacts;
    const id = [s.phase, s.contacts, s.bounces, s.totalPoints].join('/');
    if (id !== previous) {
      flow.push(s);
      previous = id;
    }
    if (s.totalPoints > 0) {
      for (const k of [...keys]) key(k, false);
      if (s.phase === 'serve') {
        window.stadiumFlow.complete = true;
        clearInterval(timer);
      }
      return;
    }
    const move = (x, z) => {
      key('KeyA', x < -0.18);
      key('KeyD', x > 0.18);
      key('KeyW', z < -0.25);
      key('KeyS', z > 0.25);
    };
    if (s.phase !== 'rally' || s.lastHitter !== 1 || s.contacts >= 5) {
      move(0, 0);
      return;
    }
    const p = s.players[0],
      b = { ...s.ball },
      v = { ...s.velocity };
    let target = null;
    // Simple finite ballistic observation to find a playable, reachable return position.
    for (let t = 0; t < 2; t += 1 / 60) {
      b.x += v.x / 60;
      b.z += v.z / 60;
      b.y += v.y / 60 - (0.5 * 9.81) / 3600;
      v.y -= 9.81 / 60;
      if (b.y < 0.0335 && v.y < 0) {
        b.y = 0.0335;
        v.y = -v.y * 0.72;
        v.x *= 0.86;
        v.z *= 0.86;
      }
      if (
        b.z > 3 &&
        b.z < 14.5 &&
        b.y > 0.55 &&
        b.y < 1.65 &&
        Math.hypot(b.x - p.x, b.z - p.z) < 6.0 * t + 0.4
      ) {
        target = { ...b };
        break;
      }
    }
    if (target) move(target.x - p.x, target.z - p.z);
    else move(0, 0);
    if (
      !s.serveFlight &&
      s.ball.z > 0 &&
      s.ball.y > 0.35 &&
      s.ball.y < 2 &&
      Math.hypot(s.ball.x - p.x, s.ball.z - p.z) < 1.12 &&
      !visited.has(s.contacts)
    ) {
      visited.add(s.contacts);
      key('Space', true);
      setTimeout(() => key('Space', false), 25);
    }
  }, 35);
});
await page.keyboard.down('Space');
await page.waitForTimeout(550);
await page.keyboard.up('Space');
await page.waitForFunction(() => window.stadiumFlow.complete, undefined, { timeout: 90000 });
const result = await page.evaluate(() => ({
  ...window.stadiumFlow,
  final: window.centreCourt.snapshot(),
}));
await page.screenshot({ path: `${dir}/match-continuation.png` });
writeFileSync(
  `${dir}/match-flow.json`,
  JSON.stringify(
    {
      provenance:
        'Production serve and returns through ordinary keyboard input. QA auto-positioning uses read-only observations, then stops after 5 contacts or point. No developer feeds or state mutation.',
      errors,
      ...result,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    maxContacts: result.maxContacts,
    points: result.final.points,
    scoreboard: result.final.stadium.scoreboard,
    errors,
  }),
);
await browser.close();
if (result.maxContacts < 3 || errors.length)
  throw Error('Match flow did not include a human rally return');
