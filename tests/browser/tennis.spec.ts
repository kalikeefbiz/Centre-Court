import { test, expect, type Page } from '@playwright/test';
import { sampleRig } from '../../src/core/stroke';
import { ANIMATIONS } from '../../src/render/animation-registry';
import { vec } from '../../src/core/court';
import type { Stroke } from '../../src/core/hitting';
const snap = (p: Page) => p.evaluate(() => (window as any).centreCourt.snapshot());

test('sampled gameplay racket paths match the shipped rig and unchanged socket', async ({
  page,
}) => {
  await page.goto('/?dev=1');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 45000 });
  await page.locator('#dev-toggle').click();
  await page.locator('#dev-inspect').click();
  for (const state of [
    'Forehand',
    'Backhand',
    'ForehandVolley',
    'BackhandVolley',
    'Smash',
    'Serve',
    'Slice',
    'Lob',
  ] as Stroke[]) {
    await page.locator('#dev-clip').selectOption(state);
    await page.locator('#dev-contact-seek').click();
    const expected = sampleRig(state, ANIMATIONS[state].contact, vec());
    await expect
      .poll(async () => {
        const markers = (await snap(page)).developer.markers;
        return Math.hypot(
          markers.head[0] - expected.x,
          markers.head[1] - expected.y,
          markers.head[2] - (11 + expected.z),
        );
      })
      .toBeLessThan(0.005);
  }
});

test('native motion blending, readable framing and larger visual ball preserve gameplay', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug');
  await expect(page.locator('#practice')).toBeEnabled({ timeout: 45000 });
  await page.locator('#practice').click();
  const portrait = page.viewportSize()!.width / page.viewportSize()!.height < 0.85;
  await expect
    .poll(
      async () =>
        Math.abs((await snap(page)).presentation.cameraPosition[1] - (portrait ? 12.07 : 19)),
      { timeout: 20000 },
    )
    .toBeLessThan(0.12);
  let s = await snap(page);
  expect(s.presentation.rendering.samples).toBeGreaterThan(1);
  expect(s.presentation.rendering.maxPixelRatio).toBeLessThanOrEqual(1.5);
  expect(s.presentation.athletePixels).toBeGreaterThan(portrait ? 45 : 25);
  if (portrait) {
    const box = (await page.locator('.scoreboard').boundingBox())!;
    const opponent = s.stadium.players[1];
    const view = page.viewportSize()!;
    const x = opponent.x * view.width,
      y = opponent.y * view.height;
    expect(x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height).toBe(true);
  }
  expect(s.royalBall.visualDiameter).toBeCloseTo(0.067 * 2.25, 5);
  expect(s.royalBall.collisionRadius).toBe(0.0335);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snap(page)).contacts).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await snap(page)).actions[0]).toBeNull();
  const before = (await snap(page)).kira;
  await page.keyboard.down('KeyA');
  await expect.poll(async () => (await snap(page)).locomotion[0].velocity.x).toBeLessThan(-2);
  s = await snap(page);
  expect(s.kira.nativeState).toBe('Locomotion');
  expect(s.kira.blendWeights.every(Number.isFinite)).toBe(true);
  expect(s.kira.blendWeights.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(1, 5);
  expect(s.kira.blendWeights[4]).toBe(0);
  expect(s.kira.racketAttached).toBe(true);
  const relative = (k: any) => [
    k.leftFoot[0] - k.root[0],
    k.leftFoot[1],
    k.leftFoot[2] - k.root[2],
  ];
  expect(relative(s.kira)).not.toEqual(relative(before));
  await page.keyboard.up('KeyA');
  await page.screenshot({ path: `test-results/${info.project.name}-goal005-gameplay.png` });
  expect(errors).toEqual([]);
});
