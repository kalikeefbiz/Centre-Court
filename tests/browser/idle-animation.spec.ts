import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Exercise the real renderer/GLBs/native AnimComponent at a controlled fixed
// step. A source-only Vite fixture keeps mutation helpers out of the game API.
let server: ChildProcess;
let origin: string;
test.beforeAll(async ({}, info) => {
  const port = String(4175 + info.workerIndex);
  origin = 'http://127.0.0.1:' + port;
  server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port, '--strictPort'],
    { stdio: 'ignore' },
  );
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(origin + '/tools/goal009/idle-harness.html')).status;
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
});
test.afterAll(async () => {
  if (server?.exitCode === null) {
    const closed = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await closed;
  }
});

for (const character of ['kira', 'zuri', 'dante', 'rico', 'nova']) {
  test(`${character}: idle ownership, serve/stroke recovery and repeated grip evaluation on both sides`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin + '/tools/goal009/idle-harness.html');
    await page.waitForFunction(() => (window as any).idleHarness);
    const results: any[] = [];
    for (const side of [0, 1]) {
      const result = await page.evaluate(
        async ({ character, side }) => {
          const h = (window as any).idleHarness;
          const loaded = await h.load(character, side);
          const initial = h.step(60);
          const idle = Array.from({ length: 360 }, () => h.step());
          // Held evaluation catches procedural hand-frame accumulation. No
          // animation/correction is stubbed: each pass runs the production update.
          const held = Array.from({ length: 120 }, () => h.step(1, 0));
          const threshold = Array.from({ length: 60 }, (_, i) => {
            h.movement(i % 2 ? 0.14 : 0.16);
            return h.step();
          });
          h.movement();
          h.phase('serve');
          const serveSetup = h.step(60);
          h.action('Serve');
          const serve = Array.from({ length: 60 }, () => h.advance());
          h.phase('rally');
          const serveRecovery = h.advance(120);
          const strokes = [];
          for (const stroke of [
            'Forehand',
            'Backhand',
            'ForehandVolley',
            'BackhandVolley',
            'Lob',
            'Slice',
            'Smash',
          ]) {
            h.action(stroke);
            const active = Array.from({ length: 18 }, () => h.advance());
            const legs = h.withoutStroke();
            const recovery = h.advance(90);
            strokes.push({ stroke, active, legs, recovery });
          }
          // Miss/cancel, move-stop, pause/resume, point reset, rematch and preview.
          h.action('Backhand');
          h.advance(4);
          h.clearAction();
          const missed = h.step(90);
          h.movement(4);
          const moving = h.step(30);
          h.movement();
          const stopped = h.step(90);
          h.pause();
          const paused = h.step(30);
          h.resume();
          const resumed = h.step();
          h.phase('pointOver');
          const point = h.step(90);
          h.reset();
          const rematch = h.step(90);
          h.menu();
          const menu = h.step(90);
          const preview = h.step(60, 1 / 60, false, true);
          const previewClosed = h.step(90);
          const equipment = await h.equipment();
          return {
            loaded,
            initial,
            idle,
            held,
            threshold,
            serveSetup,
            serve,
            serveRecovery,
            strokes,
            missed,
            moving,
            stopped,
            paused,
            resumed,
            point,
            rematch,
            menu,
            preview,
            previewClosed,
            equipment,
          };
        },
        { character, side },
      );
      results.push({ side, ...result });
      const expectIdle = (s: any) => {
        expect(s.state).toBe('Idle');
        expect(s.nativeState).toBe('Locomotion');
        expect(s.strokeLayerWeight).toBe(0);
        expect(s.fullBodyLayerWeight).toBe(0);
        expect(s.racketAttached).toBe(true);
        expect(s.handGrip.skinInstancesPatched).toBeGreaterThan(0);
        expect(Math.abs(s.handGrip.equipmentFrameError)).toBeLessThan(1e-6);
        expect(s.layers[1].mask).toEqual(s.upperMask);
        expect(s.layers[2].mask).toBeNull();
      };
      [
        result.loaded,
        result.initial,
        ...result.idle,
        result.serveRecovery,
        result.missed,
        result.stopped,
        result.point,
        result.menu,
        result.previewClosed,
        result.equipment,
      ].forEach(expectIdle);
      expect(result.initial.transitions).toEqual([]);
      expect(result.threshold.at(-1).transitions).toEqual([]);
      for (let i = 1; i < result.threshold.length; i++) {
        const a = result.threshold[i - 1].joints.RightHand.p;
        const b = result.threshold[i].joints.RightHand.p;
        expect(Math.hypot(...b.map((x: number, j: number) => x - a[j]))).toBeLessThan(0.12);
        expect(result.threshold[i].strokeLayerWeight).toBe(0);
      }
      for (let i = 1; i < result.idle.length; i++) {
        const a = result.idle[i - 1],
          b = result.idle[i];
        const delta = Math.hypot(
          ...b.joints.RightHand.p.map((n: number, j: number) => n - a.joints.RightHand.p[j]),
        );
        expect(delta).toBeLessThan(0.01); // continuous source-idle breathing, no action snap
        expect(b.layers[1].time).toBe(a.layers[1].time);
      }
      for (const frame of result.held) {
        for (const name of Object.keys(frame.joints)) {
          const a = frame.joints[name].q,
            b = result.held[0].joints[name].q;
          expect(
            Math.abs(a.reduce((n: number, x: number, i: number) => n + x * b[i], 0)),
          ).toBeCloseTo(1, 6);
        }
        expect(frame.racketHead).toEqual(result.held[0].racketHead);
      }
      expect(result.serveSetup.state).toBe('Serve');
      expect(result.serveSetup.layers[2].weight).toBeGreaterThan(0.99);
      expect(result.serveSetup.strokeLayerWeight).toBe(0);
      expect(
        result.serve.at(-1).transitions.filter((s: string) => s === 'FullBody:Serve'),
      ).toHaveLength(1);
      for (const { stroke, active, legs, recovery } of result.strokes) {
        expect(active[0].state).toBe(stroke);
        for (const name of ['Hips', 'LeftFoot', 'RightFoot'])
          expect(legs.joints[name].q).toEqual(active.at(-1).joints[name].q);
        expectIdle(recovery);
        expect(recovery.transitions.filter((s: string) => s === 'Stroke:' + stroke)).toHaveLength(
          1,
        );
        expect(active.every((s: any) => s.layers[1].mask && s.layers[2].mask === null)).toBe(true);
      }
      expect(result.paused.joints).toEqual(result.stopped.joints);
      expect(result.resumed.time).toBeGreaterThan(result.paused.time);
      // Human is server 0 after restart; AI remains in ready idle.
      expect(result.rematch.state).toBe(side === 0 ? 'Serve' : 'Idle');
      expect(result.preview.state).toBe('ForehandVolley');
      expect(result.preview.strokeLayerWeight).toBe(0);
      expect(result.preview.fullBodyLayerWeight).toBeGreaterThan(0.99);
      // Render six successive half-second fixed-step samples, not one held pose.
      if (side === 0)
        for (let i = 0; i < 6; i++) {
          await page.evaluate(() => {
            const h = (window as any).idleHarness;
            h.step(30);
            h.render();
          });
          await page.evaluate(
            () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
          );
          await page.screenshot({ path: info.outputPath(`${character}-idle-${i}.png`) });
        }
    }
    writeFileSync(info.outputPath('temporal-transforms.json'), JSON.stringify(results));
    await info.attach(`${character}-temporal-transforms`, {
      body: JSON.stringify(results),
      contentType: 'application/json',
    });
    expect(errors).toEqual([]);
  });
}
