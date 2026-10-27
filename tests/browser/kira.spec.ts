import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
test.setTimeout(120000);
const snap = (page: Page) => page.evaluate(() => (window as any).centreCourt.snapshot());

test('Valkyrie and Royal Rally render, prepare, contact, move in place and freeze safely', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug');
  await expect(page.locator('#practice')).toBeEnabled({ timeout: 45000 });
  await page.locator('#practice').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  let s = await snap(page);
  expect(s.kira.clips).toHaveLength(13);
  expect(s.kira.texturedSkin).toBe(true);
  expect(s.kira.hand).toBe('mixamorig:RightHand');
  expect(s.kira.racketAttached).toBe(true);
  await expect.poll(async () => (await snap(page)).royalBall.visible).toBe(true);
  expect(s.royalBall.diameter).toBe(0.067);
  expect(s.royalBall.collisionRadius).toBe(0.0335);
  await page.keyboard.down('Space');
  await expect.poll(async () => (await snap(page)).kira.state).toBe('Serve');
  await page.waitForTimeout(400);
  expect((await snap(page)).kira.strokeTime).toBeCloseTo(0, 2);
  expect((await snap(page)).ball.y).toBeLessThan(1.3);
  await page.keyboard.up('Space');
  await expect.poll(async () => (await snap(page)).contacts, { timeout: 30000 }).toBe(1);
  s = await snap(page);
  expect(s.contact.stroke).toBe('Serve');
  expect(s.kira.contactPose.state).toBe('Serve');
  expect(s.kira.contactPose.id).toBe(s.contact.id);
  await page.locator('#pause-button').click();
  const frozen = (await snap(page)).kira.time;
  await page.waitForTimeout(200);
  expect((await snap(page)).kira.time).toBe(frozen);
  await page.locator('#resume').click();
  await page.keyboard.down('KeyA');
  await expect.poll(async () => (await snap(page)).kira.state).toBe('ShuffleLeft');
  s = await snap(page);
  expect(Math.hypot(s.kira.hips[0] - s.kira.root[0], s.kira.hips[2] - s.kira.root[2])).toBeLessThan(
    0.001,
  );
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await snap(page)).kira.state).toBe('Run');
  await page.keyboard.up('KeyW');
  await page.locator('#pause-button').click();
  await page.locator('#restart-pause').click();
  await expect.poll(async () => (await snap(page)).kira.contactId).toBe(-1);
  expect((await snap(page)).totalPoints).toBe(0);
  expect(errors).toEqual([]);
});

for (const asset of ['characters/kira', 'equipment/rackets', 'balls/royal-rally']) {
  test(`failed ${asset} loading blocks placeholder gameplay and offers retry`, async ({ page }) => {
    await page.route(`**/assets/${asset}/**`, (route) =>
      route.fulfill({ status: 404, body: 'Asset unavailable' }),
    );
    await page.goto('/?debug');
    await expect
      .poll(
        async () =>
          asset.startsWith('balls')
            ? (await snap(page)).royalBall.status
            : (await snap(page)).kira.status,
        { timeout: 45000 },
      )
      .toBe('error');
    await expect(page.locator('#athlete-status')).toContainText('could not load');
    await expect(page.locator('#asset-retry')).toBeVisible();
    await expect(page.locator('#play')).toBeDisabled();
    await expect(page.locator('#practice')).toBeDisabled();
    expect((await snap(page)).phase).toBe('menu');
    expect((await snap(page)).presentation.temporaryHumanCount).toBe(0);
    await page.unroute(`**/assets/${asset}/**`);
    await page.locator('#asset-retry').click();
    await expect(page.locator('#play')).toBeEnabled({ timeout: 45000 });
    await page.locator('#play').click();
    await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
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
  await expect.poll(() => blocked).toBe(3);
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
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await expect.poll(async () => (await snap(page)).kira.bodyVisible).toBe(true);
  expect((await snap(page)).presentation.temporaryHumanCount).toBe(0);
});
