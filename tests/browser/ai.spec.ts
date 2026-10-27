import { test, expect, type Page } from '@playwright/test';
const snap = (page: Page) => page.evaluate(() => (window as any).centreCourt.snapshot());
test('difficulty selection, seeded AI overlay and live predictive movement', async ({ page }) => {
  await page.goto('/?dev=1');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 45000 });
  await expect(page.locator('#difficulty')).toHaveValue('normal');
  for (const d of ['easy', 'normal', 'hard']) {
    await page.locator('#difficulty').selectOption(d);
    await page.locator('#play').click();
    await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
    expect((await snap(page)).ai.difficulty).toBe(d);
    await page.locator('#pause-button').click();
    await page.locator('#menu-pause').click();
  }
  await page.locator('#play').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await page.locator('#dev-toggle').click();
  await page.locator('#dev-ai').check();
  await page.locator('#dev-seed').fill('8');
  await page.locator('#dev-ai-feed').selectOption('Short ball');
  await page.locator('#dev-ai-launch').click();
  await page.locator('#dev-close').click();
  await expect(page.locator('#dev-ai-readout')).toBeVisible();
  await expect
    .poll(async () => (await snap(page)).ai.history.some((x: any) => x.state === 'net approach'), {
      timeout: 10000,
    })
    .toBe(true);
  const s = await snap(page);
  expect(s.ai.seed).toBe(8);
  expect(s.developer.reproduction.initialSeed).toBe(8);
  expect(s.kira.racketAttached).toBe(true);
  expect(s.royalBall.textured).toBe(true);
  await page.locator('#dev-toggle').click();
  await page.locator('#dev-ai').uncheck();
  await expect(page.locator('#dev-ai-readout')).toBeHidden();
  await page.locator('#dev-seed-restart').click();
  expect((await snap(page)).ai.prediction).toBeNull();
});
test('ordinary matches hide all AI developer controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 45000 });
  await page.locator('#play').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('#dev-ai-readout')).toHaveCount(0);
  expect(await page.evaluate(() => 'centreCourt' in window)).toBe(false);
});
