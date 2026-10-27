import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const snap = (page: Page) => page.evaluate(() => (window as any).centreCourt.snapshot());
test.setTimeout(120000);
async function open(page: Page) {
  await page.goto('/?dev=1');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 45000 });
  await page.locator('#dev-toggle').click();
  await expect(page.locator('#dev-inspect')).toBeEnabled();
}

test('developer tools require explicit dev=1 and scale resets on ordinary visits', async ({
  page,
}) => {
  await open(page);
  await page.locator('#dev-scale').selectOption('1.75');
  expect((await snap(page)).royalBall.visualScale).toBe(1.75);
  await page.goto('/?dev=0&debug');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 45000 });
  expect((await snap(page)).royalBall.visualScale).toBe(2.25);
  await expect(page.locator('#dev-tools')).toHaveCount(0);
  await page.goto('/');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 45000 });
  expect(await page.evaluate(() => 'centreCourt' in window)).toBe(false);
  await expect(page.locator('#dev-tools')).toHaveCount(0);
  await page.locator('#practice').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('#hud')).toBeVisible();
});

test('production rig inspection selects every registry clip and restores a frozen match', async ({
  page,
}, info) => {
  await open(page);
  await page.locator('#dev-close').click();
  await page.locator('#practice').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await page.locator('#dev-toggle').click();
  await page.locator('#dev-inspect').click();
  const before = await snap(page);
  await expect(page.locator('#dev-animation')).toBeVisible();
  const directory = resolve(`test-results/002d-${info.project.name}`);
  mkdirSync(directory, { recursive: true });
  for (const state of [
    'Idle',
    'Walk',
    'Run',
    'ShuffleLeft',
    'ShuffleRight',
    'Forehand',
    'Backhand',
    'ForehandVolley',
    'BackhandVolley',
    'Serve',
    'Smash',
    'Slice',
    'Lob',
  ]) {
    await page.locator('#dev-clip').selectOption(state);
    await expect.poll(async () => (await snap(page)).developer.timeline.state).toBe(state);
    await expect.poll(async () => (await snap(page)).developer.markers.animationState).toBe(state);
    await expect.poll(async () => (await snap(page)).kira.bodyVisible).toBe(true);
    expect((await snap(page)).kira.racketAttached).toBe(true);
    if (['Forehand', 'Backhand', 'Serve'].includes(state)) {
      await page.locator('#dev-contact-seek').click();
      const s = await snap(page);
      expect(s.developer.timeline.playing).toBe(false);
      expect(s.developer.timeline.time).toBeGreaterThan(0.8);
      await expect
        .poll(async () => {
          const s = await snap(page);
          return Math.abs(s.developer.markers.animationTime - s.developer.timeline.time);
        })
        .toBeLessThan(0.001);
      await page.screenshot({ path: resolve(directory, `${state.toLowerCase()}.png`) });
    }
  }
  await page.locator('#dev-clip').selectOption('Serve');
  await page.locator('#dev-serve-prototype').check();
  await page.locator('#dev-time').fill('0.899');
  await expect.poll(async () => (await snap(page)).developer.serveStudy?.releaseTime).toBe(0.9);
  const held = await snap(page);
  expect(held.renderedBall[1]).toBeCloseTo(held.developer.markers.palm[1], 2);
  await page.locator('#dev-time').fill('0.9');
  await page.waitForTimeout(80);
  const release = await snap(page);
  await expect
    .poll(async () => {
      const s = await snap(page);
      return Math.abs(s.renderedBall[1] - s.developer.serveStudy.release[1]);
    })
    .toBeLessThan(0.0001);
  await page.locator('#dev-contact-seek').click();
  await page.waitForTimeout(80);
  const contact = await snap(page);
  await expect
    .poll(async () => {
      const s = await snap(page);
      return Math.abs(s.renderedBall[1] - s.developer.serveStudy.contact[1]);
    })
    .toBeLessThan(0.0001);
  expect(contact.ball).toEqual(before.ball);
  await page.locator('#dev-serve-prototype').uncheck();
  await page.locator('#dev-speed').selectOption('0.25');
  await page.locator('#dev-restart').click();
  await expect.poll(async () => (await snap(page)).developer.timeline.time).toBeGreaterThan(0);
  const slow = (await snap(page)).developer.timeline.time;
  expect(slow).toBeGreaterThan(0);
  expect(slow).toBeLessThan(0.4);
  await page.locator('#dev-play').click();
  const frozen = (await snap(page)).developer.timeline.time;
  await page.waitForTimeout(250);
  expect((await snap(page)).developer.timeline.time).toBe(frozen);
  await page.locator('#dev-time').fill('1.2');
  expect((await snap(page)).developer.timeline.time).toBeCloseTo(1.2);
  await page.locator('#dev-markers').check();
  await page.locator('#dev-angle').selectOption('side');
  await expect.poll(async () => (await snap(page)).developer.camera).toBe('inspection/side');
  await page.screenshot({ path: resolve(directory, 'racket-overlay.png') });
  const after = await snap(page);
  expect(after.developer.markersVisible).toBe(true);
  expect(after.ball).toEqual(before.ball);
  expect(after.points).toEqual(before.points);
  expect(after.players).toEqual(before.players);
  await page.locator('#dev-inspect').click();
  await expect(page.locator('#dev-animation')).toBeHidden();
  expect((await snap(page)).developer.inspecting).toBe(false);
  expect((await snap(page)).phase).toBe('serve');
  expect((await snap(page)).activeCameras).toBe(1);
});

test('visual presets preserve physics and cameras, diagnostics export and touch ownership', async ({
  page,
}, info) => {
  await open(page);
  await page.locator('#dev-close').click();
  await page.locator('#practice').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await page.locator('#dev-toggle').click();
  await page.locator('#dev-comparison').selectOption('near');
  const baseline = await snap(page);
  for (const scale of [1, 1.25, 1.5, 1.75, 2.25]) {
    await page.locator('#dev-scale').selectOption(String(scale));
    await expect.poll(async () => (await snap(page)).royalBall.visualScale).toBe(scale);
    const s = await snap(page);
    expect(s.royalBall.collisionRadius).toBe(0.0335);
    expect(s.royalBall.scale).toBe(baseline.royalBall.scale);
    expect(s.royalBall.meshDiameter).toBeCloseTo(0.067 * scale, 3);
    expect(s.ball).toEqual(baseline.ball);
    expect(s.velocity).toEqual(baseline.velocity);
    expect(s.points).toEqual(baseline.points);
  }
  for (const camera of ['behind', 'broadcast']) {
    await page.locator('#dev-camera').selectOption(camera);
    await expect.poll(async () => (await snap(page)).camera).toBe(camera);
    expect((await snap(page)).activeCameras).toBe(1);
    for (const position of ['serve', 'near', 'far']) {
      await page.locator('#dev-comparison').selectOption(position);
      await expect.poll(async () => (await snap(page)).developer.ballPixels.css).toBeGreaterThan(0);
    }
  }
  await page.locator('#dev-perf').check();
  await expect(page.locator('#dev-readout')).toContainText('GPU time: unavailable');
  await page.locator('#dev-record').click();
  await expect(page.locator('#dev-record-status')).toContainText('Saved', { timeout: 15000 });
  const download = page.waitForEvent('download');
  await page.locator('#dev-export').click();
  expect((await download).suggestedFilename()).toContain('004');
  const s = await snap(page);
  // Preserve the original five GLB load records; the new selected-athlete hand
  // calibrations are separate lightweight assets, not extra character models.
  expect(s.developer.assets.filter((a: any) => a.path.endsWith('.glb'))).toHaveLength(5);
  expect(s.developer.assets.filter((a: any) => a.path.endsWith('.json')).map((a: any) => a.path).sort())
    .toEqual(['assets/characters/grips/kira.json', 'assets/characters/grips/rico.json']);
  expect(
    s.developer.assets.some(
      (a: any) => a.path === 'procedural:Crown-Pavilion' && a.status === 'ready',
    ),
  ).toBe(true);
  expect(s.developer.assets.every((a: any) => a.status === 'ready' && a.durationMs >= 0)).toBe(
    true,
  );
  await page.locator('#dev-perf').uncheck();
  await expect(page.locator('#dev-readout')).toBeHidden();
  await page.locator('#dev-comparison').selectOption('live');
  await page.locator('#dev-close').click();
  await page.setViewportSize({ width: 390, height: 844 });
  const joy = page.locator('#joystick'),
    box = (await joy.boundingBox())!;
  await joy.dispatchEvent('pointerdown', {
    pointerId: 71,
    pointerType: 'touch',
    clientX: box.x + 8,
    clientY: box.y + box.height / 2,
  });
  await page
    .locator('#shot-button')
    .dispatchEvent('pointerdown', { pointerId: 72, pointerType: 'touch' });
  await page.locator('#dev-toggle').click();
  expect((await snap(page)).input.charging).toBe(true);
  expect((await snap(page)).input.x).toBeLessThan(0);
  // Focusing and navigating a dev control must not invoke the global C camera binding.
  await page.locator('#dev-scale').focus();
  const camera = (await snap(page)).camera;
  await page.keyboard.press('KeyC');
  expect((await snap(page)).camera).toBe(camera);
  await page
    .locator('#shot-button')
    .dispatchEvent('pointercancel', { pointerId: 72, pointerType: 'touch' });
  await joy.dispatchEvent('pointercancel', { pointerId: 71, pointerType: 'touch' });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#dev-toggle')).toBeInViewport();
  expect(info.project.name).toBeTruthy();
});

for (const path of ['characters/kira', 'equipment/rackets', 'balls/royal-rally']) {
  test(`developer asset ledger reports ${path} failure`, async ({ page }) => {
    await page.route(`**/assets/${path}/**`, (r) =>
      r.fulfill({ status: 404, body: 'Missing diagnostic asset' }),
    );
    await page.goto('/?dev=1');
    await expect(page.locator('#asset-retry')).toBeVisible({ timeout: 45000 });
    await expect
      .poll(async () => (await snap(page)).developer?.assets.some((a: any) => a.status === 'error'))
      .toBe(true);
    await expect(page.locator('#play')).toBeDisabled();
  });
}
