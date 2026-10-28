import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
let server: ChildProcess, origin: string;
test.beforeAll(async ({}, info) => {
  origin = 'http://127.0.0.1:' + String(4185 + info.workerIndex);
  server = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      '--port',
      String(4185 + info.workerIndex),
      '--strictPort',
    ],
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
    const closed = new Promise((r) => server.once('exit', r));
    server.kill();
    await closed;
  }
});
for (const character of ['kira', 'zuri', 'dante', 'rico', 'nova']) {
  test(`${character}: native anticipation, committed return, points and ready recovery in standard/manual`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    const evidence: unknown[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin + '/tools/goal009/idle-harness.html');
    await page.waitForFunction(() => (window as any).idleHarness);
    await page.evaluate(async (c) => (window as any).idleHarness.load(c, 0), character);
    for (const mode of ['standard', 'off']) {
      const prepared = await page.evaluate((mode) => {
        const h = (window as any).idleHarness;
        h.incoming(mode);
        for (let i = 0; i < 360; i++) {
          const s = h.rallyStep(false);
          if (s.anticipation.preparation?.clipTime > 0.76) return s;
        }
      }, mode);
      expect(prepared).toBeTruthy();
      const renderedBefore = await page.evaluate(() => (window as any).idleHarness.render());
      await page.waitForFunction(
        (before) => (window as any).idleHarness.renderedFrames() > before,
        renderedBefore,
      );
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await page.screenshot({
        path: `test-results/${info.project.name}-${character}-${mode}-anticipation.png`,
      });
      const result = await page.evaluate(() => {
        const h = (window as any).idleHarness;
        let prepared: any, committed: any, contact: any;
        for (let i = 0; i < 360; i++) {
          const s = h.rallyStep(true);
          if (s.anticipation.preparation && !s.action) prepared = s;
          if (s.action?.prepared && !committed) committed = s;
          if (s.lastHitter === 0 && s.contacts > 1) {
            contact = s;
            break;
          }
        }
        return { prepared, committed, contact };
      });
      expect(result.prepared).toBeTruthy();
      expect(result.committed).toBeTruthy();
      expect(result.contact).toBeTruthy();
      const p = result.prepared,
        c = result.committed;
      expect(p.layers.find((l: any) => l.name === 'Stroke').weight).toBeGreaterThan(0.8);
      expect(p.layers.find((l: any) => l.name === 'FullBody').weight).toBe(0);
      expect(c.action.id).toBe(p.anticipation.preparation.id);
      expect(c.action.clipStart).toBeGreaterThanOrEqual(p.anticipation.preparation.clipTime);
      expect(c.layers.find((l: any) => l.name === 'Stroke').time).toBeCloseTo(c.action.clipTime, 5);
      expect(c.handGrip.ready).toBe(true);
      expect(c.racketAttached).toBe(true);
      expect(Math.abs(c.handGrip.equipmentFrameError)).toBeLessThan(0.000001);
      expect(result.contact.contactError).toBeLessThan(0.5);
      const contactFrameBefore = await page.evaluate(() => (window as any).idleHarness.render());
      await page.waitForFunction(
        (before) => (window as any).idleHarness.renderedFrames() > before,
        contactFrameBefore,
      );
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await page.screenshot({
        path: `test-results/${info.project.name}-${character}-${mode}-prepared-return.png`,
      });
      const recovery = await page.evaluate(() => {
        const h = (window as any).idleHarness;
        // Let real ball/AI/rules conclude this point; next serve must cancel anticipation.
        let s = h.rallyStep(false, 1800);
        h.menu();
        s = h.step(120);
        return s;
      });
      expect(recovery.phase).toBe('menu');
      expect(recovery.totalPoints).toBeGreaterThan(0);
      expect(recovery.anticipation.preparation).toBeNull();
      expect(recovery.anticipation.prediction).toBeNull();
      expect(recovery.layers.find((l: any) => l.name === 'Stroke').weight).toBe(0);
      expect(recovery.layers.find((l: any) => l.name === 'FullBody').weight).toBe(0);
      expect(recovery.racketAttached).toBe(true);
      evidence.push({
        mode,
        prepared: {
          stroke: p.anticipation.preparation.stroke,
          clipTime: p.anticipation.preparation.clipTime,
          layers: p.layers,
        },
        committed: {
          stroke: c.action.stroke,
          clipStart: c.action.clipStart,
          lead: c.action.contactAt,
          layers: c.layers,
        },
        contactError: result.contact.contactError,
        grip: c.handGrip,
        recovery: {
          phase: recovery.phase,
          layers: recovery.layers,
          totalPoints: recovery.totalPoints,
        },
      });
    }
    const lobCadences = await page.evaluate(() => {
      const h = (window as any).idleHarness;
      return [-0.4, 0.4].flatMap((x) =>
        [1, 2, 4, 6, 12].map((ticks) => {
          const s = h.lobProbe(x, ticks);
          return {
            x,
            ticks,
            stroke: s.action?.stroke,
            contacted: s.action?.contacted,
            error: s.contactError,
            correction: s.pathCorrection,
            grip: s.handGrip,
          };
        }),
      );
    });
    for (const sample of lobCadences) {
      expect(sample.stroke).toBe('Lob');
      expect(sample.contacted).toBe(true);
      expect(sample.error).toBeLessThan(0.55);
      expect(sample.correction.passes).toBeLessThanOrEqual(6);
      expect(sample.correction.maxArmDegrees).toBeLessThanOrEqual(70.01);
      expect(sample.grip.ready).toBe(true);
      expect(Math.abs(sample.grip.equipmentFrameError)).toBeLessThan(0.000001);
    }
    writeFileSync(
      info.outputPath('lob-cadences.json'),
      JSON.stringify({ character, project: info.project.name, lobCadences }, null, 2),
    );
    writeFileSync(
      info.outputPath('anticipation.json'),
      JSON.stringify({ character, project: info.project.name, evidence, errors }, null, 2),
    );
    expect(errors).toEqual([]);
  });
}
test('footwork preference persists and new sessions use the selected mode', async ({ page }) => {
  const snap = () => page.evaluate(() => (window as any).centreCourt.snapshot());
  await page.goto('/?debug');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 90000 });
  await expect(page.locator('#assistance')).toHaveValue('standard');
  await page.selectOption('#assistance', 'off');
  await page.reload();
  await expect(page.locator('#play')).toBeEnabled({ timeout: 90000 });
  await expect(page.locator('#assistance')).toHaveValue('off');
  for (const mode of ['off', 'standard']) {
    await page.selectOption('#assistance', mode);
    await page.locator('#practice').click();
    await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
    expect((await snap()).accessibility.mode).toBe(mode);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await snap()).contacts).toBeGreaterThan(0);
    await page.locator('#pause-button').click();
    expect((await snap()).anticipation.preparation).toBeNull();
    await page.locator('#menu-pause').click();
    await expect(page.locator('#play')).toBeEnabled({ timeout: 90000 });
    expect((await snap()).lifecycle.sessions).toBe(0);
    expect((await snap()).kira.state).toBe('Idle');
  }
});
