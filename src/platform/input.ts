import { clamp } from '../core/court';
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
  charging = false;
  held = 0;
  enabled = false;
  private keys = new Set<string>();
  private joy = { x: 0, z: 0 };
  private joyPointer: number | null = null;
  private shotPointer: number | null = null;
  private mouseAim = 0;
  constructor(
    canvas: HTMLCanvasElement,
    private onPause: () => void,
    private onCamera: () => void,
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
      if (e.code === 'Space') this.begin();
      if (e.code === 'Digit1') this.controls.shot = 'drive';
      if (e.code === 'Digit2') this.controls.shot = 'slice';
      if (e.code === 'Digit3') this.controls.shot = 'lob';
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.release();
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
      if (this.joyPointer !== null) return;
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
      this.shotPointer = e.pointerId;
      capture(button, e);
      this.begin();
      e.preventDefault();
    });
    button.addEventListener('pointerup', (e) => {
      if (e.pointerId === this.shotPointer) {
        this.shotPointer = null;
        this.release();
      }
    });
    const cancelShot = () => {
      this.shotPointer = null;
      this.charging = false;
    };
    button.addEventListener('pointercancel', cancelShot);
    button.addEventListener('lostpointercapture', () => {
      if (this.shotPointer !== null) cancelShot();
    });
    for (const shot of ['slice', 'lob'] as const)
      document.querySelector('#' + shot)!.addEventListener('click', () => {
        this.controls.shot = this.controls.shot === shot ? 'drive' : shot;
      });
    for (const [id, aim] of [
      ['aim-left', -0.9],
      ['aim-right', 0.9],
    ] as const)
      document.querySelector('#' + id)!.addEventListener('click', () => {
        this.mouseAim = this.mouseAim === aim ? 0 : aim;
      });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && this.enabled)
        this.mouseAim = clamp((e.clientX / innerWidth - 0.5) * 2.8, -1, 1);
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0 && this.enabled) {
        capture(canvas, e);
        this.begin();
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') this.release();
    });
    canvas.addEventListener('pointercancel', cancelShot);
    window.addEventListener('blur', () => this.clear());
    window.addEventListener('contextmenu', (e) => {
      if (this.enabled) e.preventDefault();
    });
  }
  private begin() {
    if (!this.enabled || this.charging) return;
    this.charging = true;
    this.held = 0;
  }
  private release() {
    if (!this.charging || !this.enabled) return;
    this.charging = false;
    this.controls.power = clamp(this.held / 1.05, 0.12, 1);
    this.controls.release = true;
  }
  sample(dt: number) {
    if (this.charging) this.held += dt;
    const key = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
    this.controls.x = clamp(
      this.joy.x + key('KeyD', 'ArrowRight') - key('KeyA', 'ArrowLeft'),
      -1,
      1,
    );
    this.controls.z = clamp(this.joy.z + key('KeyS', 'ArrowDown') - key('KeyW', 'ArrowUp'), -1, 1);
    this.controls.aim = this.keys.has('KeyJ') ? -0.9 : this.keys.has('KeyL') ? 0.9 : this.mouseAim;
    this.controls.depth = key('KeyI') - key('KeyK');
    document.querySelector('#shot-button')!.classList.toggle('charging', this.charging);
    document.querySelector<HTMLElement>('#power-fill')!.style.width =
      `${clamp(this.held / 1.05, 0, 1) * 100}%`;
    document.querySelector('#shot-name')!.textContent =
      this.controls.shot === 'drive' ? 'SHOT' : this.controls.shot.toUpperCase();
    for (const shot of ['slice', 'lob'])
      document.querySelector('#' + shot)!.classList.toggle('selected', this.controls.shot === shot);
    document.querySelector('#aim-left')!.classList.toggle('selected', this.controls.aim < -0.1);
    document.querySelector('#aim-right')!.classList.toggle('selected', this.controls.aim > 0.1);
  }
  clear() {
    this.keys.clear();
    this.joy = { x: 0, z: 0 };
    this.charging = false;
    this.held = 0;
    this.shotPointer = null;
    this.joyPointer = null;
    this.controls.release = false;
    this.controls.x = 0;
    this.controls.z = 0;
    document.querySelector<HTMLElement>('#stick')!.style.transform = '';
  }
}
