import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const p = await b.newPage({ viewport: { width: 400, height: 400 } });
await p.goto('http://localhost:5173/inspect.html');
await p.waitForFunction(() => window.inspect);
await p.evaluate(async () => {
  const { pc, app } = window.inspect;
  for (const n of [...app.root.children]) if (!n.camera && !n.light) n.enabled = false;
  const res = await new Promise((resolve, reject) =>
    app.assets.loadFromUrl(
      '/assets/balls/royal-rally/Meshy_AI_Royal_Rally_1024220842_texture.glb',
      'container',
      (e, a) => (e ? reject(e) : resolve(a.resource)),
    ),
  );
  app.root.addChild(res.instantiateRenderEntity());
  const cam = app.root.children.find((n) => n.camera);
  cam.setPosition(1, 0.5, 1.4);
  cam.lookAt(0, 0, 0);
  app.renderNextFrame = true;
});
await p.waitForTimeout(500);
await p.screenshot({ path: 'public/verification/goal-002c/ball-material-preview.png' });
await b.close();
