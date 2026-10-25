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
  step(dt: number, events: BallEvent[] = []): BallEvent[] {
    events.length = 0;
    if (!this.active) return events;
    const p = this.position,
      v = this.velocity;
    const oldX = p.x,
      oldY = p.y,
      oldZ = p.z;
    p.x += v.x * dt;
    p.z += v.z * dt;
    p.y += v.y * dt - 0.5 * GRAVITY * dt * dt;
    v.y -= GRAVITY * dt;
    if (oldZ * p.z <= 0 && oldZ !== p.z && Math.abs(p.x) <= 5.7 && !this.netTouched) {
      const f = oldZ / (oldZ - p.z),
        y = oldY + (p.y - oldY) * f,
        x = oldX + (p.x - oldX) * f;
      if (y - COURT.radius < netHeight(x)) {
        const grazing = y > netHeight(x) - 0.04;
        this.netTouched = true;
        events.push({ type: 'net', position: vec(x, y, 0), grazing });
        if (grazing) {
          v.x *= 0.75;
          v.z *= 0.8;
          v.y *= 0.7;
        } else {
          p.z = Math.sign(oldZ) * 0.13;
          v.z *= -0.15;
          v.x *= 0.4;
          v.y = Math.min(v.y, 0);
        }
      }
    }
    if (p.y <= COURT.radius && v.y < 0) {
      // Interpolate the actual floor crossing; don't judge a later frame's X/Z.
      const f = (oldY - COURT.radius) / Math.max(0.00001, oldY - p.y);
      const at = vec(oldX + (p.x - oldX) * f, COURT.radius, oldZ + (p.z - oldZ) * f);
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
