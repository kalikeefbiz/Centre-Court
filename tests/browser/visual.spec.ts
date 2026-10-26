import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const snap = (page: Page) => page.evaluate(() => (window as any).centreCourt.snapshot());
test('production pixels show textured Kira in a match through both shipped cameras', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const engine = info.project.name === 'desktop-chromium' ? 'chromium' : 'webkit';
  const directory = resolve('dist/verification/goal-002c');
  mkdirSync(directory, { recursive: true });
  await page.goto('/?debug');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 45000 });
  await expect(page.locator('#menu')).not.toContainText('GOAL 001');
  await expect(page.locator('#menu-note')).not.toContainText('Temporary');
  await expect.poll(async () => (await snap(page)).kira.bodyVisible).toBe(true);
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(directory, `${engine}-menu.png`) });
  await page.locator('#play').click();
  await expect.poll(async () => (await snap(page)).phase).toBe('serve');
  const audit = [];
  for (const mode of ['broadcast', 'behind']) {
    if ((await snap(page)).camera !== mode) await page.locator('#camera-button').click();
    const y = mode === 'broadcast' ? 19 : 9.5;
    await expect
      .poll(async () => Math.abs((await snap(page)).presentation.cameraPosition[1] - y), {
        timeout: 15000,
      })
      .toBeLessThan(0.1);
    await expect.poll(async () => (await snap(page)).kira.bodyVisible).toBe(true);
    const s = await snap(page);
    expect(s.kira.texturedSkin).toBe(true);
    expect(s.kira.racketVisible).toBe(true);
    expect(s.kira.hand).toBe('mixamorig:RightHand');
    expect(s.kira.racketAttached).toBe(true);
    expect(s.presentation.temporaryHumanCount).toBe(0);
    expect(s.phase).toBe('serve');
    expect(s.royalBall.visible).toBe(true);
    expect(s.royalBall.textured).toBe(true);
    await page.screenshot({ path: resolve(directory, `${engine}-${mode}.png`) });
    const p = s.presentation.screen;
    await page.screenshot({
      path: resolve(directory, `${engine}-${mode}-detail.png`),
      clip: { x: Math.max(0, p.x - 85), y: Math.max(0, p.y - 100), width: 170, height: 200 },
    });
    audit.push({ mode, ...s });
  }
  writeFileSync(resolve(directory, `${engine}-evidence.json`), JSON.stringify(audit, null, 2));
  if (engine === 'chromium')
    writeFileSync(
      resolve(directory, 'evidence.json'),
      JSON.stringify(
        {
          release: 'GOAL-002C',
          build: audit[0].build,
          screenshots: 'Actual production match, original gameplay cameras',
          audits: audit,
        },
        null,
        2,
      ),
    );
});
