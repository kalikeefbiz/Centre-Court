import { test, expect, type Page } from '@playwright/test';
test.setTimeout(60000);
const snap = (page: Page) => page.evaluate(() => (window as any).centreCourt.snapshot());

test('actual GLBs load, animate, keep the racket on the hand and synchronize a live shot', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug');
  await expect.poll(async () => (await snap(page)).kira.status, { timeout: 30000 }).toBe('ready');
  await page.locator('#practice').click();
  await expect.poll(async () => (await snap(page)).phase).toBe('serve');
  let k = (await snap(page)).kira;
  expect(k.textures).toBe(6);
  expect(k.clips).toHaveLength(4);
  expect(k.hand).toBe('mixamorig:RightHand');
  expect(k.racketAttached).toBe(true);
  expect(k.state).toBe('Idle');
  await page.keyboard.down('Space');
  await expect.poll(async () => (await snap(page)).kira.state).toBe('Swing');
  await page.waitForTimeout(400);
  k = (await snap(page)).kira;
  expect(k.time).toBeLessThan(0.8); // held backswing, no cycling while charging
  const racketBefore = k.racketHead;
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
  test(`failed ${asset} loading retains a playable fallback`, async ({ page }) => {
    await page.route(`**/assets/${asset}/**`, (route) =>
      route.fulfill({ status: 404, body: 'Asset unavailable' }),
    );
    await page.goto('/?debug');
    await expect
      .poll(async () => (await snap(page)).kira.status, { timeout: 30000 })
      .toBe('fallback');
    await page.locator('#practice').click();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await snap(page)).contacts).toBe(1);
    expect((await snap(page)).drawCalls).toBeGreaterThan(0);
  });
}
