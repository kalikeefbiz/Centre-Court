import { test, expect } from '@playwright/test';
const snap = (page: any) => page.evaluate(() => (window as any).centreCourt.snapshot());
test('production roster loads only requested athletes, animates both sides, and unlocks recorded audio', async ({
  page,
}, info) => {
  test.setTimeout(420000);
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/?debug');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 90000 });
  expect(requests.some((r) => r.includes('/nova/'))).toBe(false);
  await expect(page.locator('[data-character="jax"]')).toBeDisabled();
  for (const id of ['dante', 'rico', 'zuri', 'nova', 'kira']) {
    await page.locator(`[data-character="${id}"]`).click();
    await expect
      .poll(async () => (await snap(page)).kira.status, { timeout: 120000 })
      .toBe('ready');
    const s = await snap(page);
    expect(s.kira.character).toBe(id);
    expect(s.kira.texturedSkin).toBe(true);
    expect(s.kira.racketAttached).toBe(true);
    expect(s.kira.clips).toHaveLength(13);
    await page.screenshot({ path: `test-results/${info.project.name}-${id}-roster.png` });
    await page.locator('#preview-athlete').click();
    await expect(page.locator('#athlete-preview')).toBeVisible();
    await page.screenshot({ path: `test-results/${info.project.name}-${id}-athlete.png` });
    await page.locator('#preview-close').click();
    if (id !== 'kira') {
      await page.selectOption('#opponent', 'kira');
      await page.locator('#play').click();
      await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
      await page.keyboard.down('Space');
      await page.waitForTimeout(550);
      await page.keyboard.up('Space');
      await expect
        .poll(async () => (await snap(page)).contact?.stroke, { timeout: 30000 })
        .toBe('Serve');
      expect((await snap(page)).kira.racketAttached).toBe(true);
      await page.locator('#pause-button').click();
      await page.locator('#menu-pause').click();
    }
  }
  await page.selectOption('#opponent', 'dante');
  await page.locator('#play').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await expect.poll(async () => (await snap(page)).roster.opponent.bodyVisible).toBe(true);
  expect((await snap(page)).roster.opponent.character).toBe('dante');
  await page.keyboard.down('Space');
  await page.waitForTimeout(650);
  await page.keyboard.up('Space');
  await expect.poll(async () => (await snap(page)).contacts, { timeout: 30000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await snap(page)).courtAudio.decoded).toBe(16);
  await expect
    .poll(async () => Object.keys((await snap(page)).courtAudio.played).length)
    .toBeGreaterThan(0);
  await page.locator('#pause-button').click();
  await page.locator('#court-mute').click();
  expect((await snap(page)).courtAudio.muted).toBe(true);
  await page.locator('#court-volume').evaluate((element: HTMLInputElement) => {
    element.value = '.3';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect((await snap(page)).courtAudio.volume).toBe(0.3);
  expect(errors).toEqual([]);
});

test('heat fixture exposes a separate signature control and preserves HIT gestures', async ({
  page,
}) => {
  await page.goto('/?dev=1');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 90000 });
  await page.locator('#play').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await page.locator('#dev-toggle').click();
  await page.locator('#dev-ai-feed').selectOption('Human heat signature return');
  await page.locator('#dev-ai-launch').click();
  await page.locator('#dev-close').click();
  await expect(page.locator('#heat-indicator')).toContainText('FIRE');
  const hit = await page.locator('#shot-button').boundingBox();
  const sig = await page.locator('#signature-button').boundingBox();
  expect(sig!.height).toBeGreaterThanOrEqual(44);
  if (hit) expect(sig!.y + sig!.height).toBeLessThanOrEqual(hit.y);
  await page
    .locator('#signature-button')
    .dispatchEvent('pointerdown', { pointerId: 30, pointerType: 'touch' });
  expect((await snap(page)).signatures.armed[0]).toBe(true);
  expect((await snap(page)).input.charging).toBe(false);
  await page.locator('#pause-button').click();
  expect((await snap(page)).heat).toBe(0);
  await expect(page.locator('#signature-button')).toBeHidden();
});

test('versioned circuit status survives reload and recovers invalid data', async ({ page }) => {
  await page.goto('/?debug');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 90000 });
  await page.evaluate(() =>
    localStorage.setItem(
      'centre-court-circuit-v1',
      JSON.stringify({
        version: 1,
        player: 'kira',
        stage: 2,
        wins: 2,
        losses: 1,
        completed: false,
        results: ['a', 'b', 'c'],
      }),
    ),
  );
  await page.reload();
  await expect(page.locator('#circuit-status')).toContainText('2 wins · 1 losses · Circuit 2/4');
  await page.evaluate(() => localStorage.setItem('centre-court-circuit-v1', 'malformed'));
  await page.reload();
  await expect(page.locator('#circuit-status')).toContainText('0 wins');
});
