import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
const snap = (p: Page) => p.evaluate(() => (window as any).centreCourt.snapshot());
const ready = (p: Page) => expect(p.locator('#play')).toBeEnabled({ timeout: 90000 });
const entered = (p: Page) => expect(p.locator('#hud')).toBeVisible({ timeout: 90000 });
test('ten match cycles retain one renderer, camera, input owner and stable resources', async ({
  page,
}, info) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug');
  await ready(page);
  let s = await snap(page);
  expect(s.lifecycle.sessions).toBe(0);
  expect(s.lifecycle.actors).toBe(1);
  expect(s.stadium.status).toBe('not-loaded');
  expect(s.lifecycle.assets.requests).toBe(2); // Selected athlete and racket only.
  await page.locator('.menu-audio summary').click();
  await page.locator('#menu-court-mute').click();
  await page.locator('#menu-stadium-sound').click();
  await page.locator('#menu-court-volume').fill('0.3');
  await page.locator('.menu-audio summary').click();
  const records: any[] = [];
  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    await page.locator('#practice').click();
    await entered(page);
    const loadMs = Date.now() - start;
    s = await snap(page);
    const id = s.lifecycle.sessionId;
    expect(s.lifecycle.sessions).toBe(1);
    expect(s.lifecycle.allocatedSessions).toBe(1);
    expect(s.activeCameras).toBe(1);
    expect(s.lifecycle.applications).toBe(1);
    expect(s.lifecycle.updateLoops).toBe(1);
    expect(
      s.kira.bodyVisible &&
        s.kira.racketVisible &&
        s.roster.opponent.bodyVisible &&
        s.royalBall.visible,
    ).toBe(true);
    expect(s.contacts).toBe(0);
    expect(s.courtAudio.muted).toBe(true);
    expect(s.courtAudio.volume).toBe(0.3);
    expect(s.stadiumAudio.enabled).toBe(false);
    await page.locator('#pause-button').click();
    await page.locator('#menu-pause').click();
    await ready(page);
    s = await snap(page);
    expect(s.lifecycle.sessions).toBe(0);
    expect(s.lifecycle.allocatedSessions).toBe(0);
    expect(s.lifecycle.actors).toBe(1);
    expect(s.roster.opponent).toBeUndefined();
    expect(s.lifecycle.assets.pending).toBe(0);
    expect(s.lifecycle.steps).toBe(0);
    expect(s.lifecycle.frameHandlers).toBe(0);
    expect(s.lifecycle.loadedActors).toBe(1);
    records.push({
      i,
      id,
      loadMs,
      entities: s.lifecycle.entities,
      assets: s.resources.assets,
      vram: s.resources.vram,
      handlers: s.lifecycle.inputHandlers,
      requests: s.lifecycle.assets.requests,
      returnMs: s.lifecycle.timings.returnMs,
    });
  }
  expect(new Set(records.map((x) => x.id)).size).toBe(10);
  for (const key of ['entities', 'assets', 'handlers', 'requests'])
    expect(new Set(records.slice(2).map((x) => x[key])).size, key).toBe(1);
  expect(errors).toEqual([]);
  writeFileSync(
    info.outputPath('cycles.json'),
    JSON.stringify({ records, errors, final: s }, null, 2),
  );
});
test('delayed opponent cancellation rejects stale completion and repeated Play', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route('**/assets/characters/rico/**', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/?debug');
  await ready(page);
  await page.evaluate(() => {
    const p = document.querySelector<HTMLButtonElement>('#play')!;
    p.click();
    p.click();
  });
  await expect(page.locator('#transition')).toBeVisible();
  expect((await snap(page)).lifecycle.state).toBe('MATCH_LOADING');
  await page.locator('#load-cancel').click();
  await ready(page);
  release();
  await expect
    .poll(async () => (await snap(page)).lifecycle.assets.pending, { timeout: 90000 })
    .toBe(0);
  expect((await snap(page)).lifecycle.sessions).toBe(0);
  expect((await snap(page)).lifecycle.actors).toBe(1);
  await page.locator('#play').click();
  await entered(page);
  expect((await snap(page)).lifecycle.allocatedSessions).toBe(1);
  expect(errors).toEqual([]);
});
test('suspension clears held input and clock; context restoration preserves an explicit paused match', async ({
  page,
}) => {
  await page.goto('/?debug');
  await ready(page);
  await page.locator('#practice').click();
  await entered(page);
  await page.keyboard.down('Space');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#pause')).toBeVisible();
  const before = await snap(page);
  await page.waitForTimeout(250);
  const after = await snap(page);
  expect(after.lifecycle.steps).toBe(before.lifecycle.steps);
  expect(after.input.charging).toBe(false);
  await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    c.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  });
  await expect(page.locator('#context-reload')).toBeVisible();
  await page.evaluate(() =>
    document.querySelector('canvas')!.dispatchEvent(new Event('webglcontextrestored')),
  );
  await expect(page.locator('#transition')).toBeHidden();
  await expect(page.locator('#pause')).toBeVisible();
  await page.keyboard.up('Space');
  await page.locator('#resume').click();
  expect((await snap(page)).contacts).toBe(0);
});
let server: ChildProcess;
test('completed results record once, rematch, next circuit opponent and menu retain progression', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const port = String(4200 + info.workerIndex);
  server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port, '--strictPort'],
    { stdio: 'ignore' },
  );
  const origin = `http://127.0.0.1:${port}`;
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(origin + '/tools/goal010/session-harness.html')).status;
          } catch {
            return 0;
          }
        },
        { timeout: 30000 },
      )
      .toBe(200);
    await page.goto(origin + '/tools/goal010/session-harness.html?debug');
    await ready(page);
    await page.locator('#competition').selectOption('circuit');
    await page.locator('#play').click();
    await entered(page);
    const first = await snap(page);
    await page.evaluate(() => (window as any).sessionHarness.finish());
    await expect(page.locator('#results')).toBeVisible();
    const result = await snap(page);
    expect(result.lifecycle.state).toBe('RESULTS');
    expect(result.competition.wins).toBe(1);
    await page.waitForTimeout(150);
    expect((await snap(page)).competition.wins).toBe(1);
    expect((await snap(page)).lifecycle.steps).toBe(result.lifecycle.steps);
    await page.locator('#restart').click();
    await entered(page);
    const rematch = await snap(page);
    expect(rematch.lifecycle.sessionId).not.toBe(first.lifecycle.sessionId);
    expect(rematch.roster.opponent.character).toBe(first.roster.opponent.character);
    expect(rematch.totalPoints).toBe(0);
    await page.evaluate(() => (window as any).sessionHarness.finish());
    await expect(page.locator('#results')).toBeVisible();
    await page.locator('#next-opponent').click();
    await entered(page);
    expect((await snap(page)).roster.opponent.character).not.toBe(first.roster.opponent.character);
    await page.evaluate(() => (window as any).sessionHarness.finish(false));
    await expect(page.locator('#results')).toBeVisible();
    const saved = (await snap(page)).competition;
    await page.locator('#menu-result').click();
    await ready(page);
    expect((await snap(page)).competition).toEqual(saved);
    expect((await snap(page)).lifecycle.sessions).toBe(0);
  } finally {
    server.kill();
  }
});
test('native WebGL context loss restores to a paused session where supported', async ({ page }) => {
  await page.goto('/?debug');
  await ready(page);
  await page.locator('#practice').click();
  await entered(page);
  const supported = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const gl = canvas.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    (window as any).restoreGraphics = () => extension.restoreContext();
    extension.loseContext();
    return true;
  });
  test.skip(!supported, 'Browser does not expose native context-loss extension');
  await expect(page.locator('#context-reload')).toBeVisible();
  const before = await snap(page);
  await page.evaluate(() => (window as any).restoreGraphics());
  await expect(page.locator('#transition')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('#pause')).toBeVisible();
  expect((await snap(page)).lifecycle.steps).toBe(before.lifecycle.steps);
  await page.locator('#resume').click();
  await expect.poll(async () => (await snap(page)).kira.bodyVisible).toBe(true);
  expect((await snap(page)).activeCameras).toBe(1);
});
