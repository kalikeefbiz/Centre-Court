import { COURT, netHeight, vec, type Vec } from './court';
export const GRAVITY = 9.81;
export type Shot = 'drive' | 'slice' | 'lob' | 'volley' | 'serve';
export type BallEvent = { type: 'bounce' | 'net'; position: Vec; grazing?: boolean };
export class Ball {
  position = vec(1.5, 2.6, 12.3);
  velocity = vec();
  active = false;
  shot: Shot = 'drive';
  netTouched = false;
  launch(target: Vec, shot: Shot, power = 0.5) {
    this.shot = shot;
    this.active = true;
    this.netTouched = false;
    const d = Math.hypot(target.x - this.position.x, target.z - this.position.z);
    const speed =
      shot === 'serve'
        ? 19 + power * 5
        : shot === 'volley'
          ? 19
          : shot === 'slice'
            ? 15 + power * 4
            : shot === 'lob'
              ? 10
              : 17 + power * 6;
    const t = Math.max(0.42, d / speed) + (shot === 'lob' ? 0.9 : 0);
    this.velocity = vec(
      (target.x - this.position.x) / t,
      (COURT.radius - this.position.y + 0.5 * GRAVITY * t * t) / t,
      (target.z - this.position.z) / t,
    );
  }
  step(dt: number): BallEvent[] {
    if (!this.active) return [];
    const events: BallEvent[] = [];
    const p = this.position,
      v = this.velocity;
    const old = { ...p };
    p.x += v.x * dt;
    p.z += v.z * dt;
    p.y += v.y * dt - 0.5 * GRAVITY * dt * dt;
    v.y -= GRAVITY * dt;
    if (old.z * p.z <= 0 && old.z !== p.z && Math.abs(p.x) <= 5.7 && !this.netTouched) {
      const f = old.z / (old.z - p.z),
        y = old.y + (p.y - old.y) * f,
        x = old.x + (p.x - old.x) * f;
      if (y - COURT.radius < netHeight(x)) {
        const grazing = y > netHeight(x) - 0.04;
        this.netTouched = true;
        events.push({ type: 'net', position: vec(x, y, 0), grazing });
        if (grazing) {
          v.x *= 0.75;
          v.z *= 0.8;
          v.y *= 0.7;
        } else {
          p.z = Math.sign(old.z) * 0.13;
          v.z *= -0.15;
          v.x *= 0.4;
          v.y = Math.min(v.y, 0);
        }
      }
    }
    if (p.y <= COURT.radius && v.y < 0) {
      // Interpolate the actual floor crossing; don't judge a later frame's X/Z.
      const f = (old.y - COURT.radius) / Math.max(0.00001, old.y - p.y);
      const at = vec(old.x + (p.x - old.x) * f, COURT.radius, old.z + (p.z - old.z) * f);
      p.x = at.x;
      p.y = COURT.radius;
      p.z = at.z;
      v.y = -v.y * (this.shot === 'slice' ? 0.58 : this.shot === 'lob' ? 0.78 : 0.72);
      v.x *= 0.86;
      v.z *= 0.86;
      events.push({ type: 'bounce', position: at });
    }
    return events;
  }
  clone() {
    const b = new Ball();
    b.position = { ...this.position };
    b.velocity = { ...this.velocity };
    b.active = this.active;
    b.shot = this.shot;
    b.netTouched = this.netTouched;
    return b;
  }
}
// The AI and landing marker use the actual integrator, never a scripted rally.
export function predict(
  ball: Ball,
  horizon = 3.5,
): { position: Vec; time: number; bounced: boolean }[] {
  const b = ball.clone(),
    samples = [];
  let bounced = false;
  for (let t = 0; t < horizon; t += 1 / 60) {
    const events = b.step(1 / 60);
    if (events.some((e) => e.type === 'bounce')) bounced = true;
    samples.push({ position: { ...b.position }, time: t, bounced });
  }
  return samples;
}
