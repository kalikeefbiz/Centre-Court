import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = process.env.CC_OUTPUT ?? '/tmp/cc-idle-ab';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
});
const p = await b.newPage({ viewport: { width: 480, height: 640 } });
await p.goto('http://127.0.0.1:4174/tools/goal009/idle-harness.html');
await p.waitForFunction(() => window.idleHarness);
const report = [];
for (const mode of ['integrated', 'without-grip', 'without-forced-stroke']) {
  const data = await p.evaluate(async (mode) => {
    const h = window.idleHarness;
    await h.load('nova', 1);
    h.ab(mode !== 'without-grip', mode !== 'without-forced-stroke');
    const frames = [];
    for (let i = 0; i < 240; i++) {
      h.movement(i >= 120 && i < 150 ? 0.16 : 0);
      frames.push(h.step());
    }
    h.render();
    return frames;
  }, mode);
  writeFileSync(`${out}/${mode}.json`, JSON.stringify(data));
  await p.screenshot({ path: `${out}/${mode}.png` });
  const max = Math.max(
    ...data
      .slice(60, 120)
      .map((f, i) =>
        Math.hypot(
          ...f.joints.RightHand.p.map((x, j) => x - data[60 + i - 1].joints.RightHand.p[j]),
        ),
      ),
  );
  report.push({
    mode,
    maxIdleHandStep: max,
    weight: data.at(-1).strokeLayerWeight,
    transitions: data.at(-1).transitions,
  });
}
writeFileSync(`${out}/summary.json`, JSON.stringify(report, null, 2));
console.log(report);
await b.close();
