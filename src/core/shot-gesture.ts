/** One input recognizer for pointer, mouse, keyboard and assistive activation.
 * Times are monotonic input-event seconds; update is polled, never timer callbacks.
 * Match alone commits impacts on its fixed clock. See docs/goal-006.md.
 */
export const HIT_GESTURE = Object.freeze({
  hold: 0.18,
  doubleTap: 0.16,
  pairSlop: 40,
  maxCharge: 1.2,
  aimSlop: 12,
});
export type ShotIntent = 'drive' | 'slice' | 'lob';
export interface GestureCommand {
  sequence: number;
  id: number;
  kind: 'provisional' | 'commit' | 'cancel';
  shot: ShotIntent;
  power: number;
  aim: number;
  depth: number;
  delay: number;
}
interface PendingTap {
  id: number;
  until: number;
  x: number;
  y: number;
  source: string;
  aim: number;
  depth: number;
}
export class ShotGesture {
  pressed = false;
  held = 0;
  preview: ShotIntent = 'slice';
  private start = 0;
  private id = 0;
  private serial = 0;
  private sequence = 0;
  private second = false;
  private aiming = false;
  private override: ShotIntent | null = null;
  private x = 0;
  private y = 0;
  private source = '';
  private pending: PendingTap | null = null;
  private events: GestureCommand[] = [];
  private now = 0;
  get power() {
    return Math.min(1, 0.45 + (Math.max(0, this.held - 0.15) / 1.05) * 0.55);
  }
  get provisional() {
    return this.pending !== null;
  }
  private emit(
    kind: GestureCommand['kind'],
    id: number,
    shot: ShotIntent,
    aim = 0,
    depth = 0,
    power = 0.45,
    delay = 0,
  ) {
    this.events.push({ sequence: ++this.sequence, id, kind, shot, aim, depth, power, delay });
  }
  down(time: number, x = 0, y = 0, source = 'hit', override: ShotIntent | null = null) {
    this.update(time);
    if (this.pressed) return false;
    const p = this.pending;
    this.second =
      !!p &&
      time < p.until &&
      p.source === source &&
      Math.hypot(x - p.x, y - p.y) <= HIT_GESTURE.pairSlop &&
      !override;
    if (p) {
      if (this.second) this.emit('cancel', p.id, 'slice');
      else this.emit('commit', p.id, 'slice', p.aim, p.depth);
      this.pending = null;
    }
    this.id = this.second ? p!.id : ++this.serial;
    this.override = override;
    this.start = time;
    this.x = x;
    this.y = y;
    this.source = source;
    this.pressed = true;
    this.held = 0;
    this.aiming = false;
    this.preview = override ?? (this.second ? 'lob' : 'slice');
    return true;
  }
  move(x: number, y: number) {
    if (!this.pressed || Math.hypot(x - this.x, y - this.y) < HIT_GESTURE.aimSlop) return;
    this.aiming = true;
    // A standalone aiming drag is intentional power input even if brief. A
    // recognized short second tap may still aim its lob; the hold threshold wins.
    if (!this.second && !this.override) this.preview = 'drive';
  }
  up(time: number, aim = 0, depth = 0, serving = false) {
    if (!this.pressed) return;
    this.update(time);
    // A queued native release can carry an earlier timestamp than the latest
    // presentation poll. Its recorded duration determines the final intent.
    this.held = Math.min(HIT_GESTURE.maxCharge, Math.max(0, time - this.start));
    this.pressed = false;
    const power = this.power;
    if (
      serving ||
      this.override ||
      this.held >= HIT_GESTURE.hold ||
      (this.aiming && !this.second)
    ) {
      this.preview = serving ? 'drive' : (this.override ?? 'drive');
      this.emit('commit', this.id, this.preview, aim, depth, power);
    } else if (this.second) {
      this.preview = 'lob';
      this.emit('commit', this.id, 'lob', aim, depth, 0.5);
    } else {
      this.preview = 'slice';
      this.pending = {
        id: this.id,
        until: time + HIT_GESTURE.doubleTap,
        x: this.x,
        y: this.y,
        source: this.source,
        aim,
        depth,
      };
      this.emit('provisional', this.id, 'slice', aim, depth, 0.45, HIT_GESTURE.doubleTap);
    }
    this.second = false;
  }
  update(time: number) {
    this.now = Math.max(this.now, time);
    if (this.pressed) {
      this.held = Math.min(HIT_GESTURE.maxCharge, Math.max(0, this.now - this.start));
      if (this.held >= HIT_GESTURE.hold) this.preview = this.override ?? 'drive';
    }
    if (this.pending && time + 1e-9 >= this.pending.until) {
      const p = this.pending;
      this.pending = null;
      this.emit('commit', p.id, 'slice', p.aim, p.depth);
    }
  }
  cancel() {
    const id = this.pending?.id ?? (this.pressed ? this.id : 0);
    this.events.length = 0;
    if (id) this.emit('cancel', id, this.preview);
    this.pending = null;
    this.pressed = false;
    this.held = 0;
    this.second = false;
    this.aiming = false;
    this.override = null;
    this.preview = 'slice';
  }
  drain() {
    const events = this.events;
    if (!events.length) return events;
    this.events = [];
    return events;
  }
}
