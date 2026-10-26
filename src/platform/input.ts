import { clamp } from '../core/court';
import { ShotGesture, HIT_GESTURE, type ShotIntent } from '../core/shot-gesture';
import { idleControls, type Controls } from '../core/match';
// Capture may fail if the OS cancels a gesture before its handler runs.
function capture(element: HTMLElement, event: PointerEvent) {
  try {
    element.setPointerCapture(event.pointerId);
  } catch {
    /* cancelled pointer: release/cancel handlers still clear input */
  }
}
export class Input {
  controls: Controls = idleControls();
  readonly gesture = new ShotGesture();
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
  private chargeOwner: number | 'keyboard' | null = null;
  constructor(
    canvas: HTMLCanvasElement,
    private onPause: () => void,
    private onCamera: () => void,
    private now: () => number = () => performance.now() / 1000,
  ) {
    window.addEventListener('keydown', (e) => {
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
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') {
        this.release('keyboard', this.eventTime(e));
        this.lastSpaceUp = this.now();
      }
    });
    const joystick = document.querySelector<HTMLElement>('#joystick')!;
    const updateJoy = (e: PointerEvent) => {
      const r = joystick.getBoundingClientRect(),
        radius = r.width * 0.36;
      const x = e.clientX - r.left - r.width / 2,
        z = e.clientY - r.top - r.height / 2,
        n = Math.max(radius, Math.hypot(x, z));
      this.joy = { x: x / n, z: z / n };
      document.querySelector<HTMLElement>('#stick')!.style.transform =
        `translate(${this.joy.x * radius}px,${this.joy.z * radius}px)`;
    };
    joystick.addEventListener('pointerdown', (e) => {
      if (this.joyPointer !== null || !this.enabled) return;
      this.joyPointer = e.pointerId;
      capture(joystick, e);
      updateJoy(e);
      e.preventDefault();
    });
    joystick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joyPointer) updateJoy(e);
    });
    const stopJoy = (e: PointerEvent) => {
      if (e.pointerId === this.joyPointer) {
        this.joyPointer = null;
        this.joy = { x: 0, z: 0 };
        document.querySelector<HTMLElement>('#stick')!.style.transform = '';
      }
    };
    joystick.addEventListener('pointerup', stopJoy);
    joystick.addEventListener('pointercancel', stopJoy);
    joystick.addEventListener('lostpointercapture', stopJoy);
    const button = document.querySelector<HTMLElement>('#shot-button')!;
    button.addEventListener('pointerdown', (e) => {
      if (this.shotPointer !== null || !this.enabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.shotPointer = e.pointerId;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.mouseAim = 0;
      this.dragDepth = 0;
      capture(button, e);
      this.begin(e.pointerId, e.clientX, e.clientY, 'hit', this.eventTime(e));
      e.preventDefault();
    });
    button.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.shotPointer || e.pointerId !== this.chargeOwner) return;
      const width = button.getBoundingClientRect().width;
      this.mouseAim = clamp((e.clientX - this.dragStart.x) / (width * 0.65), -1, 1);
      this.dragDepth = clamp((this.dragStart.y - e.clientY) / (width * 0.8), -1, 1);
    });
    button.addEventListener('pointerup', (e) => {
      if (e.pointerId === this.shotPointer) {
        this.shotPointer = null;
        this.release(e.pointerId, this.eventTime(e));
      }
    });
    button.addEventListener('click', (e) => {
      if (e.detail === 0 && !this.charging && this.now() - this.lastSpaceUp > 0.04) {
        this.begin('keyboard', 0, 0, 'keyboard', this.eventTime(e));
        this.release('keyboard', this.eventTime(e));
      }
    });
    const cancelShot = (e: PointerEvent) => {
      if (e.pointerId === this.shotPointer) this.shotPointer = null;
      if (e.pointerId === this.chargeOwner) {
        this.chargeOwner = null;
        this.gesture.cancel();
        this.flushGesture();
      }
    };
    button.addEventListener('pointercancel', cancelShot);
    button.addEventListener('lostpointercapture', cancelShot);
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && this.enabled)
        this.mouseAim = clamp((e.clientX / innerWidth - 0.5) * 2.8, -1, 1);
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0 && this.enabled) {
        capture(canvas, e);
        this.begin(e.pointerId, e.clientX, e.clientY, 'canvas', this.eventTime(e));
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') this.release(e.pointerId, this.eventTime(e));
    });
    canvas.addEventListener('pointercancel', cancelShot);
    canvas.addEventListener('lostpointercapture', cancelShot);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
    window.addEventListener('pagehide', () => this.clear());
    window.addEventListener('blur', () => this.clear());
    window.addEventListener('contextmenu', (e) => {
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
      this.charging && this.held >= HIT_GESTURE.hold
        ? this.serving
          ? 'SERVE'
          : 'POWER'
        : this.gesture.provisional || this.now() < this.feedbackUntil
          ? this.serving
            ? 'SERVE'
            : this.controls.shot === 'drive'
              ? 'POWER'
              : this.controls.shot.toUpperCase()
          : 'HIT';
    document.querySelector('#aim-feedback')!.textContent = this.charging
      ? `${this.controls.aim < -0.15 ? '←' : this.controls.aim > 0.15 ? '→' : '↑'} ${this.controls.depth > 0.2 ? 'DEEP' : this.controls.depth < -0.2 ? 'SHORT' : 'AIM'} · ${Math.round((0.45 + (Math.max(0, this.held - 0.15) / 1.05) * 0.55) * 100)}%`
      : this.serving
        ? 'TAP OR HOLD · SERVE'
        : 'TAP SLICE · HOLD POWER · 2× LOB';
  }
  clear() {
    this.keys.clear();
    this.joy = { x: 0, z: 0 };
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
