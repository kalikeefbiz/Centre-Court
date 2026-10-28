import { clamp } from '../core/court';
import { ShotGesture, type ShotIntent } from '../core/shot-gesture';
import { idleControls, type Controls } from '../core/match';
export const TOUCH_INPUT = Object.freeze({
  joystickRadius: 0.38,
  stickTravel: 0.28,
  aimWidth: 0.7,
  depthHeight: 0.85,
});
// Capture may fail if the OS cancels a gesture before its handler runs.
function capture(element: HTMLElement, event: PointerEvent) {
  try {
    element.setPointerCapture(event.pointerId);
  } catch {
    /* cancelled pointer: release/cancel handlers still clear input */
  }
}
export class Input {
  private handlers: (() => void)[] = [];
  get handlerCount() {
    return this.handlers.length;
  }
  private listen<K extends keyof (WindowEventMap & DocumentEventMap)>(
    target: EventTarget,
    type: K,
    callback: (event: (WindowEventMap & DocumentEventMap)[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ) {
    target.addEventListener(type, callback as EventListener, options);
    this.handlers.push(() => target.removeEventListener(type, callback as EventListener, options));
  }
  dispose() {
    this.enabled = false;
    this.clear();
    this.handlers.splice(0).forEach((remove) => remove());
  }
  controls: Controls = idleControls();
  readonly gesture = new ShotGesture();
  get pointers() {
    return { movement: this.joyPointer, shot: this.chargeOwner };
  }
  get charging() {
    return this.gesture.pressed;
  }
  get held() {
    return this.gesture.held;
  }
  private active = false;
  get enabled() {
    return this.active;
  }
  set enabled(value: boolean) {
    if (this.active && !value) this.clear();
    this.active = value;
  }
  serving = false;
  private epoch = -1;
  private override: ShotIntent | null = null;
  private lastSpaceUp = -Infinity;
  private feedbackUntil = 0;
  private keys = new Set<string>();
  private joy = { x: 0, z: 0 };
  private joyPointer: number | null = null;
  private shotPointer: number | null = null;
  private mouseAim = 0;
  private dragStart = { x: 0, y: 0 };
  private dragDepth = 0;
  private joyGeometry = { x: 0, y: 0, radius: 1, travel: 1 };
  private aimGeometry = { x: 1, y: 1 };
  private chargeOwner: number | 'keyboard' | null = null;
  constructor(
    canvas: HTMLCanvasElement,
    private onPause: () => void,
    private onCamera: () => void,
    private now: () => number = () => performance.now() / 1000,
  ) {
    this.listen(window, 'keydown', (e) => {
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Escape') onPause();
      if (e.code === 'KeyC') onCamera();
      if (!this.enabled) return;
      if (e.code === 'Space') this.begin('keyboard', 0, 0, 'keyboard', this.eventTime(e));
      if (e.code === 'Digit1') this.override = 'drive';
      if (e.code === 'Digit2') this.override = 'slice';
      if (e.code === 'Digit3') this.override = 'lob';
    });
    this.listen(window, 'keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') {
        this.release('keyboard', this.eventTime(e));
        this.lastSpaceUp = this.now();
      }
    });
    const joystick = document.querySelector<HTMLElement>('#joystick')!;
    const updateJoy = (e: PointerEvent) => {
      const g = this.joyGeometry,
        x = e.clientX - g.x,
        z = e.clientY - g.y;
      const n = Math.max(g.radius, Math.hypot(x, z));
      this.joy.x = x / n;
      this.joy.z = z / n;
      document.querySelector<HTMLElement>('#stick')!.style.transform =
        `translate(${this.joy.x * g.travel}px,${this.joy.z * g.travel}px)`;
    };
    this.listen(joystick, 'pointerdown', (e) => {
      if (
        this.joyPointer !== null ||
        !this.enabled ||
        (e.pointerType === 'mouse' && e.button !== 0)
      )
        return;
      const r = joystick.getBoundingClientRect();
      Object.assign(this.joyGeometry, {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        radius: r.width * TOUCH_INPUT.joystickRadius,
        travel: r.width * TOUCH_INPUT.stickTravel,
      });
      this.joyPointer = e.pointerId;
      capture(joystick, e);
      updateJoy(e);
      joystick.classList.toggle('engaged', true);
      e.preventDefault();
    });
    const moveJoy = (e: PointerEvent) => {
      if (e.pointerId !== this.joyPointer) return;
      updateJoy(e);
      e.preventDefault();
      e.stopPropagation();
    };
    const stopJoy = (e: PointerEvent) => {
      if (
        e.pointerId !== this.joyPointer ||
        (e.type === 'lostpointercapture' && e.target !== joystick)
      )
        return;
      this.joyPointer = null;
      this.joy.x = this.joy.z = 0;
      joystick.classList.toggle('engaged', false);
      document.querySelector<HTMLElement>('#stick')!.style.transform = '';
      e.stopPropagation();
    };
    this.listen(joystick, 'pointermove', moveJoy);
    this.listen(joystick, 'pointerup', stopJoy);
    this.listen(joystick, 'pointercancel', stopJoy);
    this.listen(joystick, 'lostpointercapture', stopJoy);
    const button = document.querySelector<HTMLElement>('#shot-button')!;
    this.listen(button, 'pointerdown', (e) => {
      if (
        this.shotPointer !== null ||
        this.charging ||
        !this.enabled ||
        (e.pointerType === 'mouse' && e.button !== 0)
      )
        return;
      const r = button.getBoundingClientRect();
      this.aimGeometry.x = r.width * TOUCH_INPUT.aimWidth;
      this.aimGeometry.y = r.height * TOUCH_INPUT.depthHeight;
      this.shotPointer = e.pointerId;
      this.dragStart.x = e.clientX;
      this.dragStart.y = e.clientY;
      this.mouseAim = this.dragDepth = 0;
      capture(button, e);
      this.begin(e.pointerId, e.clientX, e.clientY, 'hit', this.eventTime(e));
      e.preventDefault();
    });
    const moveShot = (e: PointerEvent) => {
      if (e.pointerId !== this.shotPointer || e.pointerId !== this.chargeOwner) return;
      this.mouseAim = clamp((e.clientX - this.dragStart.x) / this.aimGeometry.x, -1, 1);
      this.dragDepth = clamp((this.dragStart.y - e.clientY) / this.aimGeometry.y, -1, 1);
      this.gesture.move(e.clientX, e.clientY);
      this.flushGesture();
      e.preventDefault();
      e.stopPropagation();
    };
    const endShot = (e: PointerEvent) => {
      if (e.pointerId !== this.shotPointer) return;
      this.shotPointer = null;
      this.release(e.pointerId, this.eventTime(e));
      e.stopPropagation();
    };
    this.listen(button, 'pointermove', moveShot);
    this.listen(button, 'pointerup', endShot);
    this.listen(button, 'click', (e) => {
      if (e.detail === 0 && !this.charging && this.now() - this.lastSpaceUp > 0.04) {
        this.begin('keyboard', 0, 0, 'keyboard', this.eventTime(e));
        this.release('keyboard', this.eventTime(e));
      }
    });
    const cancelShot = (e: PointerEvent) => {
      if (e.type === 'lostpointercapture' && e.target !== button && e.target !== canvas) return;
      if (e.pointerId === this.shotPointer) this.shotPointer = null;
      if (e.pointerId === this.chargeOwner) {
        this.chargeOwner = null;
        this.gesture.cancel();
        this.flushGesture();
        e.stopPropagation();
      }
    };
    this.listen(button, 'pointercancel', cancelShot);
    this.listen(button, 'lostpointercapture', cancelShot);
    this.listen(canvas, 'pointermove', (e) => {
      if (e.pointerType === 'mouse' && this.enabled && this.shotPointer === null) {
        this.mouseAim = clamp((e.clientX / innerWidth - 0.5) * 2.8, -1, 1);
        if (this.chargeOwner === e.pointerId) this.gesture.move(e.clientX, e.clientY);
      }
    });
    this.listen(canvas, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0 && this.enabled) {
        capture(canvas, e);
        this.begin(e.pointerId, e.clientX, e.clientY, 'canvas', this.eventTime(e));
      }
    });
    this.listen(canvas, 'pointerup', (e) => {
      if (e.pointerType === 'mouse') this.release(e.pointerId, this.eventTime(e));
    });
    this.listen(canvas, 'pointercancel', cancelShot);
    this.listen(canvas, 'lostpointercapture', cancelShot);
    // Pointer capture is primary. Owned-ID routing also survives an unavailable
    // initial capture: leaving the element is neither a release nor a cancel.
    // Element handlers stop propagation, so each event is processed once.
    this.listen(
      window,
      'pointermove',
      (e) => {
        moveJoy(e);
        moveShot(e);
      },
      { passive: false },
    );
    this.listen(window, 'pointerup', (e) => {
      stopJoy(e);
      endShot(e);
      if (e.pointerId === this.chargeOwner) this.release(e.pointerId, this.eventTime(e));
    });
    this.listen(window, 'pointercancel', (e) => {
      stopJoy(e);
      cancelShot(e);
    });
    this.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.clear();
    });
    this.listen(window, 'pagehide', () => this.clear());
    this.listen(window, 'blur', () => this.clear());
    this.listen(window, 'contextmenu', (e) => {
      if (this.enabled) e.preventDefault();
    });
  }
  setContext(phase: string, epoch: number) {
    if (this.epoch !== epoch) {
      this.clear();
      this.epoch = epoch;
    }
    this.serving = phase === 'serve';
  }
  private flushGesture() {
    const events = this.gesture.drain();
    if (events.length) {
      (this.controls.gestures ??= []).push(...events);
      this.feedbackUntil = this.now() + 0.45;
      this.controls.power = events[events.length - 1].power;
    }
    this.controls.shot = this.serving ? 'drive' : this.gesture.preview;
  }
  // Native event times preserve press duration when the main thread delivers a
  // queued release after a slow render. Older WebKit used epoch milliseconds.
  private eventTime(event: Event) {
    const stamp = event.timeStamp;
    const time = (stamp > 1e12 ? stamp - performance.timeOrigin : stamp) / 1000;
    return Number.isFinite(time) && time >= 0 ? time : this.now();
  }
  private begin(owner: number | 'keyboard', x = 0, y = 0, source = 'hit', time = this.now()) {
    if (!this.enabled || this.charging) return;
    this.chargeOwner = owner;
    this.gesture.down(time, x, y, source, this.override);
    this.override = null;
    this.flushGesture();
  }
  private release(owner: number | 'keyboard', time = this.now()) {
    if (owner !== this.chargeOwner || !this.charging) return;
    this.chargeOwner = null;
    if (!this.enabled) {
      this.gesture.cancel();
      this.flushGesture();
      return;
    }
    this.gesture.up(
      time,
      this.keys.has('KeyJ') ? -0.9 : this.keys.has('KeyL') ? 0.9 : this.mouseAim,
      clamp(this.dragDepth + Number(this.keys.has('KeyI')) - Number(this.keys.has('KeyK')), -1, 1),
      this.serving,
    );
    this.flushGesture();
  }
  sample(_dt: number) {
    this.gesture.update(this.now());
    this.flushGesture();
    if (this.charging) this.controls.power = this.gesture.power;
    const key = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
    this.controls.x = clamp(
      this.joy.x + key('KeyD', 'ArrowRight') - key('KeyA', 'ArrowLeft'),
      -1,
      1,
    );
    this.controls.z = clamp(this.joy.z + key('KeyS', 'ArrowDown') - key('KeyW', 'ArrowUp'), -1, 1);
    this.controls.aim = this.keys.has('KeyJ') ? -0.9 : this.keys.has('KeyL') ? 0.9 : this.mouseAim;
    this.controls.depth = clamp(this.dragDepth + key('KeyI') - key('KeyK'), -1, 1);
    document.querySelector('#shot-button')!.classList.toggle('charging', this.charging);
    document.querySelector<HTMLElement>('#power-fill')!.style.width =
      `${clamp(this.held / 1.05, 0, 1) * 100}%`;
    document.querySelector('#shot-name')!.textContent =
      this.charging || this.gesture.provisional || this.now() < this.feedbackUntil
        ? this.serving
          ? 'SERVE'
          : this.controls.shot === 'drive'
            ? 'POWER'
            : this.controls.shot.toUpperCase()
        : 'HIT';
    document.querySelector('#aim-feedback')!.textContent = this.charging
      ? `${this.controls.aim < -0.15 ? '←' : this.controls.aim > 0.15 ? '→' : '↑'} ${this.controls.depth > 0.2 ? 'DEEP' : this.controls.depth < -0.2 ? 'SHORT' : 'AIM'} · ${Math.round(this.gesture.power * 100)}%`
      : this.serving
        ? 'TAP OR HOLD · SERVE'
        : 'TAP SLICE · HOLD POWER · 2× LOB';
  }
  clear() {
    this.keys.clear();
    this.joy.x = this.joy.z = 0;
    document.querySelector('#joystick')!.classList.toggle('engaged', false);
    this.gesture.cancel();
    this.controls.gestures = this.gesture.drain();
    this.chargeOwner = null;
    this.shotPointer = null;
    this.joyPointer = null;
    this.override = null;
    this.controls.release = false;
    this.controls.x = 0;
    this.controls.z = 0;
    this.mouseAim = 0;
    this.dragDepth = 0;
    this.controls.aim = 0;
    this.controls.depth = 0;
    document.querySelector<HTMLElement>('#stick')!.style.transform = '';
  }
}
