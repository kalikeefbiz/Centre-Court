// Drives shipped input handlers against the production build; no mutation/debug cheats.
import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = 'public/verification/goal-002c';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 700, height: 540 } });
page.on('pageerror', console.log);
await page.exposeFunction('report', (s) => console.log(JSON.stringify(s)));
await page.exposeFunction('performServe', async () => {
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.centreCourt.snapshot().input.held >= 0.53, {
    timeout: 15000,
  });
  await page.keyboard.up('Space');
});
await page.goto(process.env.CC_URL || 'http://localhost:4173/?debug');
await page.locator('#practice').waitFor();
await page.waitForFunction(() => !document.querySelector('#practice').disabled, { timeout: 45000 });
await page.selectOption('#difficulty', 'easy');
await page.locator('#practice').click();
const audit = [];
for (const camera of ['broadcast', 'behind']) {
  if ((await page.evaluate(() => window.centreCourt.snapshot())).camera !== camera)
    await page.locator('#camera-button').click();
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${dir}/gameplay-${camera}.png` });
  audit.push(await page.evaluate(() => window.centreCourt.snapshot()));
}
for (const iteration of [0, 1]) {
  const seen = audit.filter((x) => x.contact).map((x) => x.contact.stroke);
  const wanted = seen.includes('Forehand') ? 'Backhand' : 'Forehand';
  console.log('Playing for', wanted);
  const result = await page.evaluate(
    async ({ wanted, seen }) => {
      const keyState = new Set();
      const key = (code, on) => {
        if (on === keyState.has(code)) return;
        on ? keyState.add(code) : keyState.delete(code);
        window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, bubbles: true }));
      };
      let target = { x: 0, z: 10 },
        lastContact = -1,
        previousContacts = -1,
        lastVy = 0,
        hasBounced = false,
        frames = 0,
        serving = false;
      return new Promise((resolve) => {
        const play = () => {
          const s = window.centreCourt.snapshot(),
            p = s.players[0],
            b = s.ball,
            v = s.velocity;
          const c = s.contact;
          if (
            c &&
            ['Forehand', 'Backhand'].includes(c.stroke) &&
            !seen.includes(c.stroke) &&
            c.age < 0.3
          ) {
            for (const code of [...keyState]) key(code, false);
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape' }));
            resolve(s);
            return;
          }
          if (frames % 30 === 0)
            window.report({
              frames,
              phase: s.phase,
              contacts: s.contacts,
              ball: b,
              player: p,
              target,
              stroke: s.contact?.stroke,
              velocity: v,
              input: s.input,
            });
          if (++frames > 1500) {
            for (const code of [...keyState]) key(code, false);
            resolve({ error: 'No desired contact after 5000 rendered frames', snapshot: s });
            return;
          }
          if (s.phase === 'serve') {
            for (const code of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) key(code, false);
            if (!serving) {
              serving = true;
              window.performServe().then(() => {
                serving = false;
              });
            }
          }
          if (s.phase === 'rally') {
            const incoming = s.contacts % 2 === 0;
            if (s.contacts !== previousContacts) {
              hasBounced = false;
              previousContacts = s.contacts;
              lastVy = v.y;
            }
            if (incoming && v.y > 0 && (lastVy < 0 || b.y < 0.8)) hasBounced = true;
            lastVy = v.y;
            if (incoming) {
              let q = { ...b },
                velocity = { ...v },
                bounced = hasBounced;
              for (let t = 0; t < 3; t += 1 / 60) {
                q.x += velocity.x / 60;
                q.z += velocity.z / 60;
                q.y += velocity.y / 60 - 4.905 / 3600;
                velocity.y -= 9.81 / 60;
                if (q.y < 0.0335 && velocity.y < 0) {
                  q.y = 0.0335;
                  velocity.y *= -0.72;
                  velocity.x *= 0.86;
                  velocity.z *= 0.86;
                  if (!bounced && q.z > 0 && q.z < 12)
                    target = {
                      x: q.x + (wanted === 'Forehand' ? -0.5 : 0.5),
                      z: Math.min(14.8, q.z + 2),
                    };
                  bounced = true;
                }
                const tx = q.x + (wanted === 'Forehand' ? -0.5 : 0.5);
                if (
                  bounced &&
                  q.z > 0.65 &&
                  q.z < 15 &&
                  q.y > 0.65 &&
                  q.y < 1.5 &&
                  Math.hypot(tx - p.x, q.z - p.z) < 6.3 * t + 0.5
                ) {
                  target = { x: tx, z: q.z + 0.15 };
                  break;
                }
              }
              key('KeyA', p.x > target.x + 0.12);
              key('KeyD', p.x < target.x - 0.12);
              key('KeyW', p.z > target.z + 0.15);
              key('KeyS', p.z < target.z - 0.15);
              if (
                hasBounced &&
                b.y > 0.3 &&
                b.y < 2.4 &&
                Math.hypot(b.x - p.x, b.z - p.z) < 4 &&
                b.z > 0 &&
                b.z < p.z + 0.2
              ) {
                window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
                window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
              }
            } else {
              for (const code of [...keyState]) key(code, false);
            }
          }
          requestAnimationFrame(play);
        };
        requestAnimationFrame(play);
      });
    },
    { wanted, seen },
  );
  console.log(JSON.stringify(result));
  audit.push(result);
  if (result.error) break;
  const captured = result.contact.stroke.toLowerCase();
  await page.screenshot({
    path: `${dir}/gameplay-${captured}.png`,
    style: '#pause {visibility:hidden !important}',
  });
  const p = result.presentation.screen;
  await page.screenshot({
    path: `${dir}/gameplay-${captured}-detail.png`,
    style: '#pause {visibility:hidden !important}',
    clip: {
      x: Math.max(0, Math.min(480, p.x - 110)),
      y: Math.max(0, Math.min(300, p.y - 120)),
      width: 220,
      height: 240,
    },
  });
  await page.locator('#resume').click();
}
fs.writeFileSync(`${dir}/gameplay-evidence.json`, JSON.stringify(audit, null, 2));
await browser.close();
