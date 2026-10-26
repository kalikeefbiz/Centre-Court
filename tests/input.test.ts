import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Input, TOUCH_INPUT } from '../src/platform/input';

// EventTarget supplies dispatch/cancellation semantics; only layout is stubbed.
// Trusted browser multitouch is covered separately.
class Control extends EventTarget {
  style: Record<string, string> = {};
  classList = { toggle: () => {} };
  textContent = '';
  setPointerCapture() {}
  rect = { left: 0, top: 0, width: 100, height: 100 };
  getBoundingClientRect() {
    return this.rect;
  }
}
const send = (target: EventTarget, type: string, props: Record<string, unknown> = {}) => {
  const { timeStamp = time * 1000, ...values } = props;
  const event = Object.assign(new Event(type, { cancelable: true }), values);
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  return target.dispatchEvent(event);
};
let controls: Map<string, Control>, input: Input, canvas: Control, time: number;
beforeEach(() => {
  controls = new Map();
  time = 0;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('HTMLSelectElement', class {});
  vi.stubGlobal('HTMLInputElement', class {});
  vi.stubGlobal(
    'document',
    Object.assign(new EventTarget(), {
      hidden: false,
      querySelector: (id: string) => {
        if (!controls.has(id)) controls.set(id, new Control());
        return controls.get(id)!;
      },
    }),
  );
  canvas = new Control();
  input = new Input(
    canvas as unknown as HTMLCanvasElement,
    () => {},
    () => {},
    () => time,
  );
  input.enabled = true;
});
afterEach(() => vi.unstubAllGlobals());
const touch = (type: string, pointerId = 2, id = '#shot-button') =>
  send(controls.get(id)!, type, { pointerId, pointerType: 'touch', clientX: 0, clientY: 50 });
const advance = (seconds: number) => {
  time += seconds;
  input.sample(seconds);
};
const drain = () => {
  const events = input.controls.gestures ?? [];
  input.controls.gestures = undefined;
  return events;
};
const tap = () => {
  touch('pointerdown');
  advance(0.04);
  touch('pointerup');
};
const moveAndCharge = () => {
  touch('pointerdown', 1, '#joystick');
  touch('pointerdown');
  advance(0.3);
};
describe('independent input owners', () => {
  it('keeps movement and current drag aim/depth on release, without waiting for a render sample', () => {
    moveAndCharge();
    send(controls.get('#shot-button')!, 'pointermove', { pointerId: 2, clientX: 70, clientY: -35 });
    touch('pointerup');
    expect(drain()).toEqual([
      expect.objectContaining({ kind: 'commit', shot: 'drive', aim: 1, depth: 1 }),
    ]);
    advance(0);
    expect(input.controls.x).toBe(-1);
    expect(input.charging).toBe(false);
    touch('pointerup');
    expect(drain()).toEqual([]);
  });
  it('keeps charging when movement ends; unrelated cancellation cannot cancel it', () => {
    moveAndCharge();
    touch('pointercancel', 1, '#joystick');
    touch('pointercancel', 99);
    advance(0.2);
    expect(input.controls.x).toBe(0);
    expect(input.charging).toBe(true);
    expect(input.held).toBeCloseTo(0.5);
    touch('lostpointercapture');
    expect(input.charging).toBe(false);
    expect(drain().map((c) => c.kind)).toEqual(['cancel']);
  });
  it('clears a disabled charge and ignores its stale release after resume', () => {
    moveAndCharge();
    input.enabled = false;
    input.enabled = true;
    touch('pointerup');
    expect(drain().every((c) => c.kind === 'cancel')).toBe(true);
    touch('pointerdown', 3);
    advance(0.2);
    expect(input.charging).toBe(true);
    expect(input.held).toBeCloseTo(0.2);
  });
  it.each(['blur', 'pagehide'])('clears keyboard and movement on %s', (event) => {
    send(window, 'keydown', { code: 'Space' });
    advance(0.2);
    send(canvas, 'pointerup', { pointerType: 'mouse', pointerId: 5 });
    expect(input.charging).toBe(true);
    send(window, event);
    advance(0);
    send(window, 'keyup', { code: 'Space' });
    expect(input.charging).toBe(false);
    expect(input.controls.x).toBe(0);
    expect(drain().every((c) => c.kind === 'cancel')).toBe(true);
  });
});
describe('one HIT control', () => {
  it('starts slice immediately, ignores synthesized pointer clicks and natural capture loss, commits once', () => {
    tap();
    send(controls.get('#shot-button')!, 'click', { detail: 1 });
    touch('lostpointercapture');
    expect(drain()).toEqual([
      expect.objectContaining({ kind: 'provisional', shot: 'slice', delay: 0.16 }),
    ]);
    advance(0.16);
    expect(drain()).toEqual([expect.objectContaining({ kind: 'commit', shot: 'slice' })]);
    advance(1);
    expect(drain()).toEqual([]);
  });
  it('uses recorded release duration when a slow render delays delivery', () => {
    touch('pointerdown');
    advance(0.35);
    expect(input.gesture.preview).toBe('drive');
    send(controls.get('#shot-button')!, 'pointerup', {
      pointerId: 2,
      pointerType: 'touch',
      timeStamp: 50,
    });
    expect(drain()).toEqual([expect.objectContaining({ kind: 'provisional', shot: 'slice' })]);
    advance(0);
    expect(drain()).toEqual([expect.objectContaining({ kind: 'commit', shot: 'slice' })]);
  });
  it('pairs queued native taps by their recorded times, before the next presentation poll', () => {
    touch('pointerdown');
    advance(0.35);
    const button = controls.get('#shot-button')!;
    for (const [type, stamp] of [
      ['pointerup', 50],
      ['pointerdown', 80],
      ['pointerup', 110],
    ] as const)
      send(button, type, {
        pointerId: 2,
        pointerType: 'touch',
        timeStamp: stamp,
        clientX: 0,
        clientY: 50,
      });
    expect(drain().map((c) => [c.kind, c.shot])).toEqual([
      ['provisional', 'slice'],
      ['cancel', 'slice'],
      ['commit', 'lob'],
    ]);
  });
  it('double taps within HIT without leaving the control or issuing two slice commits', () => {
    tap();
    advance(0.07);
    tap();
    const events = drain();
    expect(events.map((c) => [c.kind, c.shot])).toEqual([
      ['provisional', 'slice'],
      ['cancel', 'slice'],
      ['commit', 'lob'],
    ]);
    expect(new Set(events.map((c) => c.id)).size).toBe(1);
    expect(input.controls.shot).toBe('lob');
    advance(0.3);
    expect(drain()).toEqual([]);
  });
  it('caps held power and preserves feedback', () => {
    touch('pointerdown');
    advance(20);
    expect(input.held).toBe(1.2);
    expect(controls.get('#shot-name')!.textContent).toBe('POWER');
    touch('pointerup');
    expect(drain()).toEqual([expect.objectContaining({ kind: 'commit', shot: 'drive', power: 1 })]);
  });
  it('uses keyboard gestures and retains explicit number-key intent overrides', () => {
    send(window, 'keydown', { code: 'Space' });
    advance(0.04);
    send(window, 'keyup', { code: 'Space' });
    send(controls.get('#shot-button')!, 'click', { detail: 0 }); // focused Space default action
    expect(drain().map((c) => c.kind)).toEqual(['provisional']);
    advance(0.16);
    drain();
    send(window, 'keydown', { code: 'Digit3' });
    send(window, 'keydown', { code: 'Space' });
    send(window, 'keydown', { code: 'Space', repeat: true });
    advance(0.3);
    send(window, 'keyup', { code: 'Space' });
    expect(drain()).toEqual([expect.objectContaining({ kind: 'commit', shot: 'lob' })]);
  });
  it('uses canvas mouse gestures with the same recognizer', () => {
    for (let i = 0; i < 2; i++) {
      send(canvas, 'pointerdown', {
        pointerType: 'mouse',
        button: 0,
        pointerId: 1,
        clientX: 50,
        clientY: 50,
      });
      advance(0.035);
      send(canvas, 'pointerup', { pointerType: 'mouse', pointerId: 1 });
      advance(0.04);
    }
    expect(drain().map((c) => c.kind)).toEqual(['provisional', 'cancel', 'commit']);
    expect(input.controls.shot).toBe('lob');
  });
  it('new-point contexts cancel a provisional tap and serve releases bypass rally ambiguity', () => {
    input.setContext('rally', 1);
    drain();
    tap();
    drain();
    input.setContext('serve', 2);
    advance(0.4);
    expect(drain().map((c) => c.kind)).toEqual(['cancel']);
    tap();
    expect(drain()).toEqual([expect.objectContaining({ kind: 'commit', shot: 'drive', delay: 0 })]);
    advance(0.2);
    expect(drain()).toEqual([]);
  });
  it('does not leave a pending slice when an active second tap is cancelled', () => {
    tap();
    drain();
    advance(0.05);
    touch('pointerdown');
    drain();
    touch('pointercancel');
    advance(0.5);
    expect(drain().map((c) => c.kind)).toEqual(['cancel']);
  });
});

describe('large mobile surfaces and owned dragging', () => {
  const setup = () => {
    controls.get('#joystick')!.rect = { left: 12, top: 450, width: 164, height: 164 };
    controls.get('#shot-button')!.rect = { left: 214, top: 466, width: 164, height: 148 };
  };
  const finger = (target: EventTarget, type: string, id: number, x: number, y: number) =>
    send(target, type, {
      pointerId: id,
      pointerType: 'touch',
      clientX: x,
      clientY: y,
      width: 44,
      height: 50,
      pressure: 0.65,
      isPrimary: id === 1,
    });
  it('uses a larger analog range, preserves diagonals and owns extended movement', () => {
    setup();
    const joy = controls.get('#joystick')!;
    finger(joy, 'pointerdown', 1, 94, 532);
    finger(window, 'pointermove', 1, 94 + 164 * TOUCH_INPUT.joystickRadius * 0.5, 532);
    advance(0.1);
    expect(input.controls.x).toBeCloseTo(0.5);
    expect(input.controls.z).toBe(0);
    finger(window, 'pointermove', 1, 350, 788);
    advance(1);
    expect(input.controls.x).toBeCloseTo(Math.SQRT1_2);
    expect(input.controls.z).toBeCloseTo(Math.SQRT1_2);
    finger(window, 'pointerup', 99, 0, 0);
    advance(0.2);
    expect(input.controls.x).toBeGreaterThan(0.7);
    finger(window, 'pointerup', 1, 350, 788);
    advance(0);
    expect(input.controls.x).toBe(0);
  });
  it('continues charging and aiming far outside HIT while an independent thumb moves', () => {
    setup();
    finger(controls.get('#joystick')!, 'pointerdown', 1, 40, 532);
    finger(controls.get('#shot-button')!, 'pointerdown', 2, 296, 540);
    finger(window, 'pointermove', 2, 100, 300);
    advance(0.8);
    expect(input.charging).toBe(true);
    expect(input.controls.x).toBeLessThan(-0.5);
    expect(input.controls.aim).toBe(-1);
    expect(input.controls.depth).toBe(1);
    expect(drain()).toEqual([]);
    finger(window, 'pointerup', 2, 100, 300);
    expect(drain()).toEqual([
      expect.objectContaining({ kind: 'commit', shot: 'drive', aim: -1, depth: 1 }),
    ]);
    advance(0);
    expect(input.controls.x).toBeLessThan(-0.5);
  });
  it('does not turn an intentional short aiming drag into a tap or pending double tap', () => {
    setup();
    finger(controls.get('#shot-button')!, 'pointerdown', 2, 296, 540);
    finger(window, 'pointermove', 2, 330, 510);
    advance(0.1);
    finger(window, 'pointerup', 2, 330, 510);
    expect(drain()).toEqual([expect.objectContaining({ kind: 'commit', shot: 'drive' })]);
    advance(0.04);
    tap();
    expect(drain().map((e) => e.kind)).toEqual(['provisional']);
  });
  it.each(['pointercancel', 'lostpointercapture'])(
    'never commits an aimed charge on %s',
    (type) => {
      setup();
      const shot = controls.get('#shot-button')!;
      finger(shot, 'pointerdown', 2, 296, 540);
      finger(window, 'pointermove', 2, 100, 300);
      advance(0.6);
      finger(type === 'pointercancel' ? window : shot, type, 2, 100, 300);
      finger(window, 'pointerup', 2, 100, 300);
      advance(0.5);
      expect(input.charging).toBe(false);
      expect(drain().map((e) => e.kind)).toEqual(['cancel']);
    },
  );
  it('latches aim geometry even if the visible surface or viewport changes mid-hold', () => {
    setup();
    const shot = controls.get('#shot-button')!;
    finger(shot, 'pointerdown', 2, 296, 540);
    shot.rect = { left: 100, top: 200, width: 100, height: 100 };
    finger(
      window,
      'pointermove',
      2,
      296 + 164 * TOUCH_INPUT.aimWidth * 0.5,
      540 - 148 * TOUCH_INPUT.depthHeight * 0.5,
    );
    advance(0.4);
    expect(input.controls.aim).toBeCloseTo(0.5);
    expect(input.controls.depth).toBeCloseTo(0.5);
  });
});
