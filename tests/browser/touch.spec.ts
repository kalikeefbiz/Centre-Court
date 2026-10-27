import { test, expect, type Page } from '@playwright/test';
const snap = (page: Page) => page.evaluate(() => (window as any).centreCourt.snapshot());
async function ready(page: Page, dev = false) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(dev ? '/?dev=1' : '/?debug');
  await expect(page.locator('#practice')).toBeEnabled({ timeout: 45000 });
}

test('large touch surfaces fit portrait, landscape and simulated safe-area insets', async ({
  page,
}, info) => {
  await ready(page);
  await page.locator('#practice').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('#joystick')).toBeVisible();
  for (const [width, height] of [
    [320, 640],
    [390, 664],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const joystick = (await page.locator('#joystick').boundingBox())!,
      hit = (await page.locator('#shot-button').boundingBox())!;
    expect(joystick.width).toBeGreaterThanOrEqual(144);
    expect(hit.width).toBeGreaterThanOrEqual(144);
    expect(hit.height).toBeGreaterThanOrEqual(132);
    expect(joystick.x).toBeGreaterThanOrEqual(12);
    expect(hit.x + hit.width).toBeLessThanOrEqual(width - 12);
    expect(joystick.x + joystick.width).toBeLessThan(hit.x);
    expect(joystick.y + joystick.height).toBeLessThan(height);
    expect(hit.y + hit.height).toBeLessThan(height);
  }
  await page.locator('#touch-controls').evaluate((e) => {
    const s = (e as HTMLElement).style;
    s.setProperty('--safe-left', '47px');
    s.setProperty('--safe-right', '47px');
    s.setProperty('--safe-bottom', '21px');
  });
  expect((await page.locator('#joystick').boundingBox())!.x).toBeGreaterThanOrEqual(47);
  const hit = (await page.locator('#shot-button').boundingBox())!;
  expect(hit.x + hit.width).toBeLessThanOrEqual(844 - 47);
  expect(hit.y + hit.height).toBeLessThan(390 - 21);
  await page.screenshot({ path: `test-results/${info.project.name}-goal007-landscape.png` });
});

test('native captured aiming survives leaving HIT, cancellation and deliberate release', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.locator('#practice').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('#joystick')).toBeVisible();
  const joy = page.locator('#joystick'),
    hit = page.locator('#shot-button');
  const j = (await joy.boundingBox())!,
    h = (await hit.boundingBox())!;
  await joy.dispatchEvent('pointerdown', {
    pointerId: 211,
    pointerType: 'touch',
    clientX: j.x + 12,
    clientY: j.y + j.height / 2,
    width: 44,
    height: 50,
  });
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(220);
  const owner = (await snap(page)).input.pointers.shot;
  expect(await hit.evaluate((e, id) => e.hasPointerCapture(id), owner)).toBe(true);
  await page.mouse.move(65, 430, { steps: 5 });
  await expect.poll(async () => (await snap(page)).input.aim).toBe(-1);
  await expect.poll(async () => (await snap(page)).input.depth).toBe(1);
  expect((await snap(page)).input.pointers).toEqual({ movement: 211, shot: owner });
  expect((await snap(page)).contacts).toBe(0);
  await expect(page.locator('#shot-target')).toBeVisible();
  await expect(joy).toHaveClass(/engaged/);
  expect((await hit.boundingBox())!.width).toBe(h.width);
  // Actual browser capture loss cancels the right owner, never synthesizes a release.
  await hit.evaluate((e, id) => e.releasePointerCapture(id), owner);
  await page.mouse.move(64, 429);
  await expect.poll(async () => (await snap(page)).input.charging).toBe(false);
  await page.mouse.up();
  expect((await snap(page)).contacts).toBe(0);
  expect((await snap(page)).input.pointers.movement).toBe(211);
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(65, 430, { steps: 5 });
  await page.waitForTimeout(350);
  expect((await snap(page)).input.charging).toBe(true);
  await page.screenshot({ path: `test-results/${info.project.name}-goal007-aim.png` });
  await page.mouse.up();
  await expect.poll(async () => (await snap(page)).contacts).toBe(1);
  expect((await snap(page)).contact.stroke).toBe('Serve');
  await page.locator('#pause-button').click();
  expect((await snap(page)).input.pointers).toEqual({ movement: null, shot: null });
  await page.locator('#resume').click();
  await expect(page.locator('#shot-target')).toBeHidden();
});

test('thumb-sized native touches retain both owners through extended drags', async ({
  page,
  context,
}, info) => {
  test.skip(
    info.project.name !== 'desktop-chromium',
    'CDP provides native multi-contact injection only in Chromium.',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.locator('#practice').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('#joystick')).toBeVisible();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const j = (await page.locator('#joystick').boundingBox())!,
    h = (await page.locator('#shot-button').boundingBox())!;
  const a = { id: 1, x: j.x + 12, y: j.y + j.height / 2, radiusX: 22, radiusY: 25, force: 0.7 },
    b = { id: 2, x: h.x + 8, y: h.y + h.height / 2, radiusX: 22, radiusY: 25, force: 0.7 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
  const owners = (await snap(page)).input.pointers;
  const movedA = { ...a, x: j.x + j.width / 2 + 150 },
    movedB = { ...b, x: 65, y: 430 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [movedA, movedB] });
  await page.waitForTimeout(350);
  const s = await snap(page);
  expect(s.input.pointers).toEqual(owners);
  expect(s.input.charging).toBe(true);
  expect(s.input.x).toBe(1);
  expect(s.input.aim).toBe(-1);
  expect(s.input.depth).toBe(1);
  expect(s.contacts).toBe(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [movedB] });
  await expect.poll(async () => (await snap(page)).contacts).toBe(1);
  expect((await snap(page)).input.pointers.movement).toBe(owners.movement);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
});

test('double-tap lobs contact real baseline feeds with the rendered racket', async ({
  page,
}, info) => {
  await ready(page, true);
  await page.locator('#practice').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('#joystick')).toBeVisible();
  await page.locator('#dev-toggle').click();
  for (const feed of ['Human forehand return', 'Human backhand return']) {
    await page.locator('#dev-ai-feed').selectOption(feed);
    await page.locator('#dev-ai-launch').click();
    const result = await page.evaluate(
      () =>
        new Promise<any>((resolve, reject) => {
          let fired = false,
            frames = 0;
          const check = () => {
            const s = (window as any).centreCourt.snapshot();
            // Prepare early enough to exercise the real 250 ms input buffer. The
            // observer may span several 120 Hz ticks on software-rendered CI.
            if (!fired && s.lastHitter === 1 && s.ball.z >= 7.4 && s.ball.z < 10.5) {
              fired = true;
              const button = document.querySelector('#shot-button')!;
              const base = performance.now();
              for (const [type, elapsed] of [
                ['pointerdown', 0],
                ['pointerup', 30],
                ['pointerdown', 70],
                ['pointerup', 100],
              ] as const) {
                const e = new PointerEvent(type, {
                  pointerId: 71,
                  pointerType: 'touch',
                  clientX: 300,
                  clientY: 700,
                  bubbles: true,
                  width: 44,
                  height: 50,
                });
                Object.defineProperty(e, 'timeStamp', { value: base + elapsed });
                button.dispatchEvent(e);
              }
            }
            if (s.contact?.stroke === 'Lob') {
              resolve({
                contact: s.contact,
                action: s.actions[0],
                spin: s.spin,
                velocity: s.velocity,
                kira: s.kira,
                input: s.input,
              });
              return;
            }
            if (++frames > 1800 || s.phase === 'pointOver') {
              reject(
                new Error(
                  JSON.stringify({
                    fired,
                    phase: s.phase,
                    ball: s.ball,
                    action: s.actions[0],
                    input: s.input,
                  }),
                ),
              );
              return;
            }
            requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        }),
    );
    expect(result.action.intent).toBe('lob');
    expect(result.action.stroke).toBe('Lob');
    expect(result.action.contacted).toBe(true);
    expect(result.velocity.y).toBeGreaterThan(6);
    expect(Math.abs(result.contact.timing)).toBeLessThan(0.064);
    expect(result.kira.racketAttached).toBe(true);
    expect(result.kira.contactError).toBeLessThan(0.55);
    console.log(
      'RENDERED_LOB_CONTACT',
      info.project.name,
      feed,
      result.contact.position,
      result.kira.contactError,
    );
  }
  await page.screenshot({ path: `test-results/${info.project.name}-goal007-lob.png` });
});
