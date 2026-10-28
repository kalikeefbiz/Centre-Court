import { test, expect, type Page } from '@playwright/test';
const snap = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { centreCourt: { snapshot: () => Record<string, any> } }
    ).centreCourt.snapshot(),
  );
test.beforeEach(async ({ page }) => {
  await page.goto('/?debug');
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect.poll(async () => (await snap(page)).kira.status, { timeout: 30000 }).toBe('ready');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
});
test('renders a playable court, serves, pauses, switches camera, restarts and returns to menu', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.locator('h1')).toContainText('THE COURT.');
  await page.screenshot({ path: `test-results/${info.project.name}-menu.png` });
  await page.locator('#play').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('#hud')).toBeVisible();
  expect((await snap(page)).activeCameras).toBe(1);
  await expect.poll(async () => (await snap(page)).drawCalls).toBeGreaterThan(0);
  expect((await snap(page)).drawCalls).toBeLessThan(80);
  if (info.project.name === 'mobile-webkit') {
    await page
      .locator('#shot-button')
      .dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch' });
    await page.waitForTimeout(650);
    await page
      .locator('#shot-button')
      .dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch' });
  } else {
    await page.keyboard.down('Space');
    await page.waitForTimeout(650);
    await page.keyboard.up('Space');
  }
  await expect.poll(async () => Number((await snap(page)).contacts)).toBeGreaterThanOrEqual(1);
  await page.locator('#pause-button').click();
  await expect(page.locator('#pause')).toBeVisible();
  const paused = await snap(page);
  await page.waitForTimeout(300);
  expect((await snap(page)).ball).toEqual(paused.ball);
  await page.locator('#resume').click();
  await expect(page.locator('#pause')).toBeHidden();
  await page.locator('#camera-button').click();
  expect((await snap(page)).camera).toBe('behind');
  expect((await snap(page)).activeCameras).toBe(1);
  await page.screenshot({ path: `test-results/${info.project.name}-game.png` });
  await page.locator('#pause-button').click();
  await page.locator('#restart-pause').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  expect((await snap(page)).phase).toBe('serve');
  expect((await snap(page)).totalPoints).toBe(0);
  await page.locator('#pause-button').click();
  await page.locator('#menu-pause').click();
  await expect(page.locator('#menu')).toBeVisible();
  await page.reload();
  await expect(page.locator('#loading')).toHaveCount(0);
  expect((await snap(page)).camera).toBe('behind');
  expect(errors).toEqual([]);
});
test('practice, shot selection, movement and resize remain usable', async ({ page }, info) => {
  await page.locator('#practice').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('#score-description')).toContainText('PRACTICE');
  await expect(page.locator('#shot-intent')).toHaveCount(0);
  await page.keyboard.press('KeyJ');
  if (info.project.name === 'desktop-chromium') {
    await page.keyboard.down('Space');
    await page.waitForTimeout(600);
    await page.keyboard.up('Space');
    // Movement is enabled after serve contact. Software GL can take several
    // seconds to evaluate/render the first animated frame after model upload.
    await expect
      .poll(async () => (await snap(page)).contacts, { timeout: 30000 })
      .toBeGreaterThan(0);
    await page.keyboard.down('KeyA');
    await expect.poll(async () => (await snap(page)).players[0].x).toBeLessThan(1.2);
    await page.keyboard.up('KeyA');
  } else {
    const shot = page.locator('#shot-button');
    await shot.dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch' });
    await page.waitForTimeout(600);
    await shot.dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch' });
    await expect
      .poll(async () => (await snap(page)).contacts, { timeout: 30000 })
      .toBeGreaterThan(0);
    const joystick = page.locator('#joystick'),
      box = (await joystick.boundingBox())!;
    await joystick.dispatchEvent('pointerdown', {
      pointerId: 3,
      pointerType: 'touch',
      clientX: box.x + 10,
      clientY: box.y + box.height / 2,
    });
    await expect.poll(async () => (await snap(page)).players[0].x).toBeLessThan(1.2);
    await joystick.dispatchEvent('pointerup', { pointerId: 3, pointerType: 'touch' });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  await expect(page.locator('#shot-button')).toBeInViewport();
  await expect(page.locator('#joystick')).toBeInViewport();
  await page.screenshot({ path: `test-results/${info.project.name}-landscape.png` });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#pause')).toBeVisible();
});

test('independent trusted touch pointers move and charge together', async ({
  page,
  context,
}, info) => {
  test.skip(
    info.project.name !== 'desktop-chromium',
    'CDP touch injection is Chromium-only; WebKit uses pointer-event coverage.',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#practice').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await page.keyboard.down('Space');
  await page.waitForTimeout(600);
  await page.keyboard.up('Space');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await expect(page.locator('#joystick')).toBeVisible();
  await expect(page.locator('#shot-button')).toBeVisible();
  const j = (await page.locator('#joystick').boundingBox())!,
    s = (await page.locator('#shot-button').boundingBox())!;
  const a = { x: j.x + 12, y: j.y + j.height / 2, id: 1 },
    b = { x: s.x + s.width / 2, y: s.y + s.height / 2, id: 2 };
  const before = (await snap(page)).players[0].x;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
  await page.waitForTimeout(350);
  await expect(page.locator('#shot-button')).toHaveClass(/charging/);
  await expect.poll(async () => (await snap(page)).players[0].x).toBeLessThan(before - 0.4);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [b] });
  await expect(page.locator('#shot-button')).not.toHaveClass(/charging/);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
});

for (const mode of ['broadcast', 'behind']) {
  test(`unified HIT selects and aims while moving in ${mode}`, async ({ page, context }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'Trusted multitouch requires CDP.');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#practice').click();
    await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
    if (mode === 'behind') await page.locator('#camera-button').click();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 3 });
    await expect(page.locator('#joystick')).toBeVisible();
    const box = (await page.locator('#joystick').boundingBox())!;
    const left = { x: box.x + 12, y: box.y + box.height / 2, id: 11 };
    const touch = async (
      type: 'touchStart' | 'touchEnd' | 'touchMove' | 'touchCancel',
      touchPoints: { x: number; y: number; id: number }[],
    ) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    await touch('touchStart', [left]);

    const r = (await page.locator('#shot-button').boundingBox())!;
    const right = { x: r.x + r.width / 2, y: r.y + r.height / 2, id: 22 };
    await touch('touchStart', [left, right]);
    await expect.poll(async () => (await snap(page)).input.charging).toBe(true);
    // Captured touches retain ownership even when dragged over another control.
    const dragged = { ...right, x: right.x - 70, y: right.y - 40 };
    await touch('touchMove', [left, dragged]);
    await expect.poll(async () => (await snap(page)).input.aim).toBeLessThan(-0.5);
    expect((await snap(page)).input.x).toBeLessThan(-0.5);
    await touch('touchEnd', [left]);
    await expect.poll(async () => (await snap(page)).input.x).toBe(0);
    expect((await snap(page)).input.charging).toBe(true);
    await touch('touchEnd', []);
    await expect.poll(async () => (await snap(page)).contacts).toBeGreaterThanOrEqual(1);
    expect((await snap(page)).input.charging).toBe(false);
    await touch('touchStart', [left]);
    // Keep the native movement pointer captured. Inject the short right-thumb pair
    // in one browser task: sequential CDP round trips exceed 180 ms on software GL.
    await page.evaluate(() => {
      const button = document.querySelector('#shot-button')!;
      for (let i = 0; i < 2; i++)
        for (const type of ['pointerdown', 'pointerup'])
          button.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 71,
              pointerType: 'touch',
              clientX: 300,
              clientY: 700,
              bubbles: true,
            }),
          );
    });
    await expect.poll(async () => (await snap(page)).input.shot).toBe('lob');
    await expect.poll(async () => (await snap(page)).input.x).toBeLessThan(-0.5);
    await touch('touchEnd', []);
    expect((await snap(page)).camera).toBe(mode);
  });
}

test('pointer cancellation and interruptions clear only the owned inputs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#practice').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('#joystick')).toBeVisible();
  const j = page.locator('#joystick'),
    s = page.locator('#shot-button');
  const box = (await j.boundingBox())!;
  await j.dispatchEvent('pointerdown', {
    pointerId: 31,
    pointerType: 'touch',
    clientX: box.x + 10,
    clientY: box.y + box.height / 2,
  });
  await s.dispatchEvent('pointerdown', { pointerId: 32, pointerType: 'touch' });
  await s.dispatchEvent('pointercancel', { pointerId: 99, pointerType: 'touch' });
  await expect.poll(async () => (await snap(page)).input.charging).toBe(true);
  await s.dispatchEvent('pointercancel', { pointerId: 32, pointerType: 'touch' });
  await expect.poll(async () => (await snap(page)).input.charging).toBe(false);
  await expect.poll(async () => (await snap(page)).input.x).toBeLessThan(-0.5);
  expect((await snap(page)).contacts).toBe(0);
  await s.dispatchEvent('pointerdown', { pointerId: 33, pointerType: 'touch' });
  await j.dispatchEvent('lostpointercapture', { pointerId: 31, pointerType: 'touch' });
  await expect.poll(async () => (await snap(page)).input.x).toBe(0);
  expect((await snap(page)).input.charging).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#pause')).toBeVisible();
  expect((await snap(page)).input.charging).toBe(false);
  await page.locator('#resume').click();
  await s.dispatchEvent('pointerup', { pointerId: 33, pointerType: 'touch' });
  expect((await snap(page)).contacts).toBe(0);
});

test('HIT maps slice, double-tap lob and charged power during an actual rally', async ({
  page,
}, info) => {
  await page.locator('#practice').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await page.keyboard.press('Space');
  // Observe the first rally frame, not a later polling interval: serve semantics
  // must already be cleared before the next native pointer event can arrive.
  const servingAtRally = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const check = () => {
          const s = (window as any).centreCourt.snapshot();
          if (s.phase === 'rally') resolve(s.input.serving);
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
  );
  expect(servingAtRally).toBe(false);
  const gesture = async (kind: 'slice' | 'lob' | 'drive') =>
    page.evaluate(async (kind) => {
      const button = document.querySelector('#shot-button')!;
      // Explicit native-style timestamps describe the intended human gesture;
      // software-GL/GC stalls must not stretch a synthetic tap into a hold.
      const base = performance.now();
      const event = (type: string, elapsed: number) => {
        const e = new PointerEvent(type, {
          pointerId: 71,
          pointerType: 'touch',
          bubbles: true,
          clientX: 30,
          clientY: 30,
        });
        Object.defineProperty(e, 'timeStamp', { value: base + elapsed });
        button.dispatchEvent(e);
      };
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      event('pointerdown', 0);
      if (kind === 'drive') await delay(350);
      event('pointerup', kind === 'drive' ? 350 : 30);
      if (kind === 'lob') {
        event('pointerdown', 70);
        event('pointerup', 100);
      }
    }, kind);
  await gesture('slice');
  await expect.poll(async () => (await snap(page)).input.shot).toBe('slice');
  await page.waitForTimeout(180);
  await gesture('lob');
  await expect.poll(async () => (await snap(page)).input.shot).toBe('lob');
  expect((await snap(page)).input.provisional).toBe(false);
  await gesture('drive');
  await expect.poll(async () => (await snap(page)).input.shot).toBe('drive');
  expect((await snap(page)).input.power).toBeGreaterThan(0.5);
  await expect(page.locator('#shot-intent')).toHaveCount(0);
  await page.screenshot({ path: `test-results/${info.project.name}-goal006-controls.png` });
});
