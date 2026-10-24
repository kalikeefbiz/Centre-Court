import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Input } from '../src/platform/input';

// EventTarget supplies real dispatch/cancellation semantics; only layout and
// presentation are stubbed. Trusted browser multitouch is covered separately.
class Control extends EventTarget {
  style: Record<string, string> = {};
  classList = { toggle: () => {} };
  textContent = '';
  setPointerCapture() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
}
const send = (target: EventTarget, type: string, props: Record<string, unknown> = {}) =>
  target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), props));
let controls: Map<string, Control>;
let input: Input;
let canvas: Control;
beforeEach(() => {
  controls = new Map();
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
  );
  input.enabled = true;
});
afterEach(() => vi.unstubAllGlobals());
const touch = (id: string, type: string, pointerId: number) =>
  send(controls.get(id)!, type, { pointerId, pointerType: 'touch', clientX: 0, clientY: 50 });
const moveAndCharge = () => {
  touch('#joystick', 'pointerdown', 1);
  touch('#shot-button', 'pointerdown', 2);
  input.sample(0.3);
};
describe('independent input owners', () => {
  it('selects and aims from pointerdown while movement remains held, ignoring synthesized click', () => {
    touch('#joystick', 'pointerdown', 1);
    touch('#slice', 'pointerdown', 2);
    send(controls.get('#slice')!, 'click', { detail: 1 });
    touch('#aim-right', 'pointerdown', 2);
    input.sample(0.1);
    expect(input.controls.shot).toBe('slice');
    expect(input.controls.aim).toBe(0.9);
    expect(input.controls.x).toBe(-1);
  });
  it('keeps movement when the shot owner releases and fires exactly once', () => {
    moveAndCharge();
    touch('#shot-button', 'pointerup', 2);
    input.sample(0);
    expect(input.controls.release).toBe(true);
    expect(input.controls.x).toBe(-1);
    expect(input.charging).toBe(false);
    input.controls.release = false;
    touch('#shot-button', 'pointerup', 2);
    expect(input.controls.release).toBe(false);
  });
  it('keeps charging when movement is released; unrelated cancellation cannot cancel it', () => {
    moveAndCharge();
    touch('#joystick', 'pointercancel', 1);
    touch('#shot-button', 'pointercancel', 99);
    input.sample(0.2);
    expect(input.controls.x).toBe(0);
    expect(input.charging).toBe(true);
    expect(input.held).toBeCloseTo(0.5);
    touch('#shot-button', 'lostpointercapture', 2);
    expect(input.charging).toBe(false);
    expect(input.controls.release).toBe(false);
  });
  it('clears an owned charge released after gameplay disables input, without firing on the next point', () => {
    moveAndCharge();
    input.enabled = false;
    touch('#shot-button', 'pointerup', 2);
    expect(input.charging).toBe(false);
    expect(input.controls.release).toBe(false);
    input.enabled = true;
    touch('#shot-button', 'pointerdown', 3);
    input.sample(0.2);
    expect(input.charging).toBe(true);
    expect(input.held).toBeCloseTo(0.2);
  });
  it('does not release a keyboard-owned charge from a mouse up and clears interruption state', () => {
    send(window, 'keydown', { code: 'Space' });
    input.sample(0.2);
    send(canvas, 'pointerup', { pointerType: 'mouse', pointerId: 5 });
    expect(input.charging).toBe(true);
    send(window, 'pagehide');
    input.sample(0);
    expect(input.charging).toBe(false);
    expect(input.controls.x).toBe(0);
    send(window, 'keyup', { code: 'Space' });
    expect(input.controls.release).toBe(false);
  });
});
