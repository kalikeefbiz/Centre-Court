import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
});
const page = await b.newPage({ viewport: { width: 260, height: 300 } });
page.on('pageerror', console.log);
await page.goto('http://localhost:5173/inspect.html');
await page.waitForFunction(() => window.inspect);
fs.mkdirSync('artifacts/animation-inspection', { recursive: true });
const names = await page.evaluate(() => window.inspect.names);
const audit = [];
for (let i = 0; i < names.length; i++) {
  const name = names[i];
  const frames = [];
  for (const t of [0.3, 0.7, 1.1, 1.5, 1.9, 2.3, 2.7]) {
    const joints = await page.evaluate(([n, t]) => window.inspect.pose(n, t, 0.45), [name, t]);
    await page.waitForTimeout(30);
    const path = `artifacts/animation-inspection/${i}-${t}.png`;
    await page.screenshot({ path });
    frames.push({ t, joints, path });
  }
  audit.push({ i, name, frames });
}
fs.writeFileSync('artifacts/animation-inspection/audit.json', JSON.stringify(audit, null, 2));
await b.close();
