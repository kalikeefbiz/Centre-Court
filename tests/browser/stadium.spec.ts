import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
const snap = (p: Page) => p.evaluate(() => (window as any).centreCourt.snapshot());
test.setTimeout(120000);

test('stadium builds locally, preserves dimensions, scales crowd and clears both cameras', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 45000 });
  expect((await snap(page)).stadium.status).toBe('not-loaded');
  await page.locator('#play').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  let s = await snap(page);
  expect(s.stadium.status).toBe('ready');
  expect(s.stadium.sections).toBe(24);
  expect(s.stadium.collisionComponents).toBe(0);
  expect(s.stadium.court).toEqual({
    halfLength: 11.885,
    halfWidth: 4.115,
    doublesWidth: 5.485,
    service: 6.4,
    netCentre: 0.914,
    netEdge: 1.07,
    radius: 0.0335,
  });
  expect(s.stadium.renderedCourt.surface).toEqual([10.97, 0.025, 23.77]);
  expect(s.stadium.renderedCourt.lines).toHaveLength(11);
  expect(s.stadium.renderedCourt.netPosts.map((p: number[]) => p[0])).toEqual([-5.03, 5.03]);
  await page.locator('#pause-button').click();
  await page.locator('#stadium-quality').selectOption('full');
  const full = (await snap(page)).stadium.spectatorCount;
  await page.locator('#stadium-quality').selectOption('reduced');
  s = await snap(page);
  expect(s.stadium.spectatorCount).toBeGreaterThan(400);
  expect(s.stadium.spectatorCount).toBeLessThan(full);
  expect(s.stadium.fullCount).toBe(full);
  expect(s.stadium.reducedTriangles).toBeLessThan(s.stadium.fullTriangles / 3);
  expect(s.stadium.triangles).toBe(s.stadium.reducedTriangles);
  await page.locator('#stadium-sound').click();
  expect((await snap(page)).stadiumAudio.enabled).toBe(false);
  await page.locator('#resume').click();
  for (const mode of ['broadcast', 'behind']) {
    if ((await snap(page)).camera !== mode) await page.locator('#camera-button').click();
    const portrait = page.viewportSize()!.width / page.viewportSize()!.height < 0.85;
    const expectedY = mode === 'broadcast' ? (portrait ? 7.27 : 17) : portrait ? 8.7 : 9.5;
    await expect
      .poll(async () => Math.abs((await snap(page)).presentation.cameraPosition[1] - expectedY), {
        timeout: 20000,
      })
      .toBeLessThan(0.1);
    s = await snap(page);
    expect(s.activeCameras).toBe(1);
    expect(s.kira.bodyVisible).toBe(true);
    expect(s.royalBall.visible).toBe(true);
    expect(s.drawCalls).toBeLessThan(80);
    for (const p of s.stadium.players) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(1);
    }
    // Portrait fits the singles playing court; doubles alley edges may crop for athlete readability.
    if (mode === 'broadcast')
      for (const p of portrait ? s.stadium.singlesCourtCorners : s.stadium.courtCorners) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(1);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(1);
      }
  }
  expect(errors).toEqual([]);
});

test('native serve, AI return, point score, live display update and next serve', async ({
  page,
}, info) => {
  // Three natural points include slow software-WebGL loading and full ball flights.
  test.setTimeout(180000);
  await page.goto('/?debug');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 45000 });
  await page.locator('#difficulty').selectOption('hard');
  await page.locator('#play').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  const initial = await snap(page),
    flow: any[] = [];
  if (info.project.name === 'mobile-webkit') {
    await page
      .locator('#shot-button')
      .dispatchEvent('pointerdown', { pointerId: 71, pointerType: 'touch' });
    await page.waitForTimeout(550);
    await page
      .locator('#shot-button')
      .dispatchEvent('pointerup', { pointerId: 71, pointerType: 'touch' });
  } else {
    await page.keyboard.down('Space');
    await page.waitForTimeout(550);
    await page.keyboard.up('Space');
  }
  await expect
    .poll(
      async () => {
        const s = await snap(page);
        flow.push(s);
        return s.contacts;
      },
      { timeout: 30000, intervals: [100, 200, 300] },
    )
    .toBeGreaterThanOrEqual(2);
  expect(flow.some((s) => s.serveFlight || s.contacts >= 2)).toBe(true);
  // Deliberately leave the returned ball: normal bounce/point rules end the rally.
  await expect
    .poll(async () => (await snap(page)).totalPoints, { timeout: 30000 })
    .toBeGreaterThan(0);
  const scored = await snap(page);
  flow.push(scored);
  await expect.poll(async () => (await snap(page)).phase, { timeout: 15000 }).toBe('serve');
  const continued = await snap(page);
  flow.push(continued);
  expect(continued.stadium.scoreboard.rows.map((r: any) => r.points)).toEqual([
    await page.locator('#points-you').textContent(),
    await page.locator('#points-ai').textContent(),
  ]);
  expect(continued.stadium.scoreboard.rows.map((r: any) => r.points)).not.toEqual(
    initial.stadium.scoreboard.rows.map((r: any) => r.points),
  );
  expect(continued.stadium.boardUpdates).toBeGreaterThan(initial.stadium.boardUpdates);
  expect(continued.royalBall.collisionRadius).toBe(0.0335);
  // GOAL 011: consecutive natural points must discard old interception/prep
  // before the next real serve; no fixture scoring or ball repositioning.
  for (const point of [2, 3]) {
    expect((await snap(page)).anticipation.preparation).toBeNull();
    await page.keyboard.down('Space');
    await page.waitForTimeout(650);
    await page.keyboard.up('Space');
    await expect
      .poll(async () => (await snap(page)).totalPoints, { timeout: 30000 })
      .toBeGreaterThanOrEqual(point);
    await expect.poll(async () => (await snap(page)).phase, { timeout: 15000 }).toBe('serve');
    const next = await snap(page);
    expect(next.anticipation.prediction).toBeNull();
    expect(next.actions[0]).toBeNull();
    flow.push(next);
  }

  mkdirSync('test-results/stadium', { recursive: true });
  await page.screenshot({ path: `test-results/stadium/${info.project.name}-continued.png` });
  writeFileSync(
    `test-results/stadium/${info.project.name}-match-flow.json`,
    JSON.stringify(flow, null, 2),
  );
});

test('stadium inspection restores gameplay and diagnostic exports include venue context', async ({
  page,
}) => {
  await page.goto('/?dev=1');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 45000 });
  await page.locator('#play').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await page.locator('#dev-toggle').click();
  const before = await snap(page);
  await page.locator('#dev-stadium').selectOption('overview');
  await expect.poll(async () => (await snap(page)).developer.frozen).toBe(true);
  await page.waitForTimeout(200);
  expect((await snap(page)).ball).toEqual(before.ball);
  expect((await snap(page)).points).toEqual(before.points);
  expect((await snap(page)).developer.stadium.status).toBe('ready');
  expect(
    (await snap(page)).developer.assets.some(
      (a: any) => a.path === 'procedural:Crown-Pavilion' && a.status === 'ready',
    ),
  ).toBe(true);
  await page.locator('#dev-stadium').selectOption('gameplay');
  expect((await snap(page)).developer.frozen).toBe(false);
  expect((await snap(page)).camera).toBe(before.camera);
});
