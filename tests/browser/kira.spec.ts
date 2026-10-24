import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
test.setTimeout(120000);
const snap = (page: Page) => page.evaluate(() => (window as any).centreCourt.snapshot());

test('actual GLBs load, animate, keep the racket on the hand and synchronize a live shot', async ({
  page,
}, info) => {
  const engine = info.project.name === 'desktop-chromium' ? 'chromium' : 'webkit';
  const directory = resolve('dist/verification/kira-hotfix');
  mkdirSync(directory, { recursive: true });
  const capturePose = async (name: string) => {
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause')).toBeVisible();
    const viewport = page.viewportSize()!;
    const portrait = viewport.width / viewport.height < 0.85;
    const y = (await snap(page)).camera === 'broadcast' ? (portrait ? 32 : 25) : portrait ? 15 : 10;
    await expect
      .poll(async () => Math.abs((await snap(page)).presentation.cameraPosition[1] - y), {
        timeout: 15000,
      })
      .toBeLessThan(0.1);
    const s = await snap(page);
    expect(s.kira.state).toBe(name);
    expect(s.kira.bodyVisible).toBe(true);
    const p = s.presentation.screen;
    await page.screenshot({
      path: resolve(directory, `${engine}-${name.toLowerCase()}.png`),
      style: '#pause { visibility:hidden !important; }',
      clip: {
        x: Math.min(viewport.width - 170, Math.max(0, p.x - 85)),
        y: Math.min(viewport.height - 200, Math.max(0, p.y - 100)),
        width: 170,
        height: 200,
      },
    });
    await page.locator('#resume').click();
    await expect(page.locator('#pause')).toBeHidden();
  };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug');
  await expect.poll(async () => (await snap(page)).kira.status, { timeout: 30000 }).toBe('ready');
  await page.locator('#practice').click();
  await expect.poll(async () => (await snap(page)).phase).toBe('serve');
  let k = (await snap(page)).kira;
  expect(k.textures).toBe(6);
  expect(k.texturedSkin).toBe(true);
  expect(k.scale).toEqual([1, 1, 1]);
  await expect.poll(async () => (await snap(page)).kira.bodyVisible).toBe(true);
  await expect.poll(async () => (await snap(page)).kira.racketVisible).toBe(true);
  expect((await snap(page)).presentation.temporaryHumanCount).toBe(0);
  expect(k.clips).toHaveLength(4);
  expect(k.hand).toBe('mixamorig:RightHand');
  expect(k.racketAttached).toBe(true);
  expect(k.state).toBe('Idle');
  await capturePose('Idle');
  await page.keyboard.down('Space');
  await expect.poll(async () => (await snap(page)).kira.state).toBe('Swing');
  await page.waitForTimeout(400);
  k = (await snap(page)).kira;
  expect(k.time).toBeLessThan(0.8); // held backswing, no cycling while charging
  const racketBefore = k.racketHead;
  await capturePose('Swing');
  await page.keyboard.up('Space');
  await page.keyboard.down('Space');
  await page.waitForTimeout(250);
  await page.keyboard.up('Space');
  await expect.poll(async () => (await snap(page)).contacts).toBe(1);
  const shot = await snap(page);
  expect(shot.contact.id).toBe(shot.kira.contactId);
  expect(shot.kira.contactPose.state).toBe('Swing');
  expect(shot.kira.contactPose.time).toBeGreaterThanOrEqual(1.3);
  expect(shot.kira.contactPose.id).toBe(shot.contact.id);
  expect(shot.kira.racketHead).not.toEqual(racketBefore);
  expect(shot.kira.racketAttached).toBe(true);
  await page.locator('#pause-button').click();
  const frozen = (await snap(page)).kira;
  await page.waitForTimeout(200);
  expect((await snap(page)).kira.time).toBe(frozen.time);
  await page.locator('#resume').click();
  await page.keyboard.down('KeyA');
  await expect.poll(async () => (await snap(page)).kira.state).toBe('Run');
  await capturePose('Run');
  await page.keyboard.up('KeyA');
  await expect.poll(async () => (await snap(page)).kira.state).toBe('Idle');
  // A small analog input selects walk, with no animation-driven displacement.
  await page.setViewportSize({ width: 390, height: 844 });
  const j = page.locator('#joystick');
  await expect(j).toBeVisible();
  const box = (await j.boundingBox())!;
  await j.dispatchEvent('pointerdown', {
    pointerId: 71,
    pointerType: 'touch',
    clientX: box.x + box.width * 0.59,
    clientY: box.y + box.height / 2,
  });
  // The point may finish while the camera test runs; restart a rally if necessary.
  if ((await snap(page)).phase !== 'rally') {
    await j.dispatchEvent('pointerup', { pointerId: 71, pointerType: 'touch' });
    await page.locator('#pause-button').click();
    await page.locator('#restart-pause').click();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await snap(page)).contacts).toBe(1);
    await j.dispatchEvent('pointerdown', {
      pointerId: 71,
      pointerType: 'touch',
      clientX: box.x + box.width * 0.59,
      clientY: box.y + box.height / 2,
    });
  }
  await expect.poll(async () => (await snap(page)).kira.state).toBe('Walk');
  await capturePose('Walk');
  k = (await snap(page)).kira;
  expect(Math.hypot(k.hips[0] - k.root[0], k.hips[2] - k.root[2])).toBeLessThan(0.001);
  await j.dispatchEvent('pointerup', { pointerId: 71, pointerType: 'touch' });
  await page.locator('#camera-button').click();
  expect((await snap(page)).camera).toBe('behind');
  expect((await snap(page)).activeCameras).toBe(1);
  await page.screenshot({ path: `test-results/${info.project.name}-kira.png` });
  await page.locator('#pause-button').click();
  await page.locator('#restart-pause').click();
  await expect.poll(async () => (await snap(page)).kira.contactId).toBe(-1);
  expect((await snap(page)).totalPoints).toBe(0);
  expect(errors).toEqual([]);
});

for (const asset of ['characters/kira', 'equipment/rackets']) {
  test(`failed ${asset} loading blocks placeholder gameplay and offers retry`, async ({ page }) => {
    await page.route(`**/assets/${asset}/**`, (route) =>
      route.fulfill({ status: 404, body: 'Asset unavailable' }),
    );
    await page.goto('/?debug');
    await expect.poll(async () => (await snap(page)).kira.status, { timeout: 45000 }).toBe('error');
    await expect(page.locator('#athlete-status')).toContainText('Kira could not load');
    await expect(page.locator('#asset-retry')).toBeVisible();
    await expect(page.locator('#play')).toBeDisabled();
    await expect(page.locator('#practice')).toBeDisabled();
    expect((await snap(page)).phase).toBe('menu');
    expect((await snap(page)).presentation.temporaryHumanCount).toBe(0);
    await page.unroute(`**/assets/${asset}/**`);
    await page.locator('#asset-retry').click();
    await expect(page.locator('#play')).toBeEnabled({ timeout: 45000 });
    await page.locator('#play').click();
    await expect.poll(async () => (await snap(page)).phase).toBe('serve');
    await expect.poll(async () => (await snap(page)).kira.bodyVisible).toBe(true);
  });
}

test('delayed GLBs cannot start either mode with a temporary human', async ({ page }) => {
  let blocked = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/*.glb?*', async (route) => {
    blocked++;
    await gate;
    await route.continue();
  });
  await page.goto('/?debug');
  await expect.poll(() => blocked).toBe(2);
  await expect(page.locator('#play')).toBeDisabled();
  await expect(page.locator('#practice')).toBeDisabled();
  expect((await snap(page)).kira.status).toBe('loading');
  expect((await snap(page)).presentation.temporaryHumanCount).toBe(0);
  await page.locator('#play').dispatchEvent('click');
  await page.locator('#practice').dispatchEvent('click');
  expect((await snap(page)).phase).toBe('menu');
  release();
  await expect(page.locator('#practice')).toBeEnabled({ timeout: 45000 });
  await page.locator('#practice').click();
  await expect.poll(async () => (await snap(page)).kira.bodyVisible).toBe(true);
  expect((await snap(page)).presentation.temporaryHumanCount).toBe(0);
});
