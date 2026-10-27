import { test, expect, type Page } from '@playwright/test';
import {
  DEFAULT_RACKET_ID,
  EQUIPMENT_SAVE_KEY,
  RACKETS,
  getRacket,
} from '../../src/render/racket-equipment';
import { SAVE_KEY } from '../../src/core/competition';

const snapshot = (page: Page) => page.evaluate(() => (window as any).centreCourt.snapshot());

test('real cosmetic equipment preview, persistence and match attachment preserve the athlete and circuit', async ({
  page,
}, info) => {
  // This flow includes two cold asset initializations and a real opponent/serve.
  // Existing assertions/timeouts in other tests are deliberately unchanged.
  test.setTimeout(240000);
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await page.addInitScript(
    ({ equipmentKey }) => {
      if (!sessionStorage.getItem('goal009-equipment-seeded')) {
        localStorage.setItem(equipmentKey, '{"version":2,"rackets":{"kira":"unshipped"}}');
        sessionStorage.setItem('goal009-equipment-seeded', 'yes');
      }
    },
    { equipmentKey: EQUIPMENT_SAVE_KEY },
  );
  await page.goto('/?debug');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 90000 });
  const progression = JSON.stringify({
    version: 1,
    player: 'kira',
    stage: 2,
    wins: 3,
    losses: 1,
    completed: false,
    results: ['preserved-1', 'preserved-2'],
  });
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: SAVE_KEY,
    value: progression,
  });
  const before = await snapshot(page);
  expect(before.kira.equipment.id).toBe(DEFAULT_RACKET_ID);
  expect(before.kira.equipment.animationInstance).not.toBeUndefined();
  const requestStart = requests.length;
  await page.locator('#racket-equipment-open').click();
  const dialog = page.locator('#racket-equipment');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#equipment-options button')).toHaveCount(RACKETS.length);
  if (RACKETS.length === 1)
    await expect(dialog).toContainText('One original racket model is currently available.');
  await expect(page.locator(`#equipment-options [data-racket="${DEFAULT_RACKET_ID}"]`)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#equipment-equip')).toBeEnabled();
  await expect.poll(async () => (await snapshot(page)).kira.state).toBe('ForehandVolley');
  await expect(page.locator('#equipment-view-grip')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#equipment-view-athlete').click();
  await expect(page.locator('#equipment-view-athlete')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#equipment-view-grip').click();
  await expect.poll(async () => (await snapshot(page)).equipment.view).toBe('grip');
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await page.screenshot({ path: info.outputPath('equipment-grip.png') });
  await page.locator('#equipment-equip').click();
  await expect(page.locator('#equipment-status')).toContainText('saved on this device');
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), EQUIPMENT_SAVE_KEY))
    .toContain(DEFAULT_RACKET_ID);
  const afterEquip = await snapshot(page);
  expect(afterEquip.kira.equipment.id).toBe(DEFAULT_RACKET_ID);
  expect(afterEquip.kira.equipment.animationInstance).toBe(before.kira.equipment.animationInstance);
  expect(afterEquip.kira.equipment.changes).toBe(before.kira.equipment.changes);
  expect(afterEquip.kira.clips).toEqual(before.kira.clips);
  expect(afterEquip.phase).toBe('menu');
  expect(afterEquip.royalBall.collisionRadius).toBe(before.royalBall.collisionRadius);
  expect(
    requests.slice(requestStart).filter((url) => /\/assets\/(characters|equipment\/rackets)\//.test(url)),
  ).toEqual([]);
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe(progression);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#racket-equipment-open')).toBeFocused();
  await page.reload();
  await expect(page.locator('#play')).toBeEnabled({ timeout: 90000 });
  const restored = await snapshot(page);
  expect(restored.kira.equipment.id).toBe(DEFAULT_RACKET_ID);
  expect(restored.kira.equipment.assetPath).toBe(getRacket(DEFAULT_RACKET_ID).assetPath);
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe(progression);
  await expect(page.locator('#circuit-status')).toContainText('3 wins · 1 losses · Circuit 2/4');
  await page.locator('#practice').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  const match = await snapshot(page);
  expect(match.kira.equipment.id).toBe(DEFAULT_RACKET_ID);
  expect(match.kira.racketAttached).toBe(true);
  expect(match.kira.racketVisible).toBe(true);
  expect(match.kira.texturedSkin).toBe(true);
  expect(match.royalBall.collisionRadius).toBe(0.0335);
  await page.keyboard.down('Space');
  await page.waitForTimeout(350);
  await page.keyboard.up('Space');
  await expect.poll(async () => (await snapshot(page)).contact?.stroke, { timeout: 30000 }).toBe('Serve');
  expect((await snapshot(page)).kira.equipment.id).toBe(DEFAULT_RACKET_ID);
  await page.screenshot({ path: info.outputPath('equipped-racket-match.png') });
  expect(errors).toEqual([]);
});

test('selecting the same athlete while loading and then returning to Kira does not strand equipment', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?debug');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 90000 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let blocked = 0;
  await page.route('**/assets/characters/dante/Dante_Tennis.glb?*', async (route) => {
    blocked++;
    await gate;
    await route.fulfill({ status: 404, body: 'Disposed loading-athlete fixture' });
  });
  try {
    await page.locator('[data-character="dante"]').click();
    await expect.poll(() => blocked).toBe(1);
    await expect.poll(async () => (await snapshot(page)).kira.character).toBe('dante');
    expect((await snapshot(page)).kira.status).toBe('loading');
    await page.locator('[data-character="dante"]').click();
    expect(blocked).toBe(1);
    await page.locator('[data-character="kira"]').click();
    release();
    await expect(page.locator('#play')).toBeEnabled({ timeout: 90000 });
    const restored = await snapshot(page);
    expect(restored.kira.character).toBe('kira');
    expect(restored.kira.status).toBe('ready');
    expect(restored.kira.equipment.id).toBe(DEFAULT_RACKET_ID);
    expect(restored.kira.racketAttached).toBe(true);
    expect(restored.kira.handGrip.ready).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});
