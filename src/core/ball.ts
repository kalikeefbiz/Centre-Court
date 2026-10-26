import { COURT, netHeight, vec, clamp, type Vec } from './court';
export const GRAVITY = 9.81;
/** SI units. Quadratic drag / spin-ratio lift and Coulomb contact impulse.
 * Equations: Fd=½ρCdAv², Fl=½ρClAv² along ω×v; hollow sphere I=⅔mr².
 * Original implementation; reference review and coefficient rationale in notices.
 */
export const BALL_PHYSICS = Object.freeze({
  mass: 0.057,
  airDensity: 1.21,
  dragCoefficient: 0.55,
  liftSlope: 0.6,
  maxLift: 0.28,
  spinDecay: 0.18,
  restitution: 0.77,
  restitutionSlope: 0.006,
  minRestitution: 0.62,
  friction: 0.35,
  referenceImpactSpeed: 6,
  maxStep: 1 / 120,
});
const AERO = (0.5 * BALL_PHYSICS.airDensity * Math.PI * COURT.radius ** 2) / BALL_PHYSICS.mass;
export type Shot = 'drive' | 'slice' | 'lob' | 'volley' | 'serve';
export type BallEvent = { type: 'bounce' | 'net'; position: Vec; grazing?: boolean };
/** Allocation-free midpoint integration, shared by aiming and live flight. */
function fly(p: Vec, v: Vec, w: Vec, dt: number) {
  const speed = Math.hypot(v.x, v.y, v.z),
    omega = Math.hypot(w.x, w.y, w.z);
  const ratio = (COURT.radius * omega) / Math.max(speed, 0.001);
  const lift =
    (AERO *
      Math.min(BALL_PHYSICS.maxLift, (BALL_PHYSICS.liftSlope * ratio) / (1 + ratio)) *
      speed) /
    Math.max(omega, 0.001);
  const drag = AERO * BALL_PHYSICS.dragCoefficient * speed;
  const ax = -drag * v.x + lift * (w.y * v.z - w.z * v.y);
  const ay = -GRAVITY - drag * v.y + lift * (w.z * v.x - w.x * v.z);
  const az = -drag * v.z + lift * (w.x * v.y - w.y * v.x);
  const mx = v.x + ax * dt * 0.5,
    my = v.y + ay * dt * 0.5,
    mz = v.z + az * dt * 0.5;
  const midSpeed = Math.hypot(mx, my, mz);
  const d = AERO * BALL_PHYSICS.dragCoefficient * midSpeed;
  const s = (COURT.radius * omega) / Math.max(midSpeed, 0.001);
  const l =
    (AERO * Math.min(BALL_PHYSICS.maxLift, (BALL_PHYSICS.liftSlope * s) / (1 + s)) * midSpeed) /
    Math.max(omega, 0.001);
  p.x += mx * dt;
  p.y += my * dt;
  p.z += mz * dt;
  v.x += (-d * mx + l * (w.y * mz - w.z * my)) * dt;
  v.y += (-GRAVITY - d * my + l * (w.z * mx - w.x * mz)) * dt;
  v.z += (-d * mz + l * (w.x * my - w.y * mx)) * dt;
  const decay = Math.exp(-BALL_PHYSICS.spinDecay * dt);
  w.x *= decay;
  w.y *= decay;
  w.z *= decay;
}
export function bounceBall(velocity: Vec, spin: Vec) {
  const normalSpeed = -velocity.y;
  const e = clamp(
    BALL_PHYSICS.restitution -
      BALL_PHYSICS.restitutionSlope * Math.max(0, normalSpeed - BALL_PHYSICS.referenceImpactSpeed),
    BALL_PHYSICS.minRestitution,
    BALL_PHYSICS.restitution,
  );
  velocity.y = normalSpeed * e;
  // Velocity of the bottom of the ball relative to the court; friction opposes slip.
  const ux = velocity.x + COURT.radius * spin.z,
    uz = velocity.z - COURT.radius * spin.x;
  const slip = Math.hypot(ux, uz);
  if (slip > 1e-8) {
    const impulse = Math.min(0.4 * slip, BALL_PHYSICS.friction * (1 + e) * normalSpeed);
    const jx = (-ux / slip) * impulse,
      jz = (-uz / slip) * impulse;
    velocity.x += jx;
    velocity.z += jz;
    spin.x -= (1.5 * jz) / COURT.radius;
    spin.z += (1.5 * jx) / COURT.radius;
  }
  spin.y *= 0.65;
}
export class Ball {
  position = vec(1.5, 2.6, 12.3);
  velocity = vec();
  /** World angular velocity in radians/second; right-hand rule. */
  spin = vec();
  active = false;
  shot: Shot = 'drive';
  netTouched = false;
  launch(target: Vec, shot: Shot, power = 0.5, quality = 1, incomingSpeed = 0) {
    this.shot = shot;
    this.active = true;
    this.netTouched = false;
    const dx = target.x - this.position.x,
      dz = target.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    const pace =
      (shot === 'serve'
        ? 20 + power * 7
        : shot === 'volley'
          ? 18 + power * 3
          : shot === 'slice'
            ? 15 + power * 4
            : shot === 'lob'
              ? 11
              : 17 + power * 6) *
        (0.65 + quality * 0.35) +
      Math.min(1.5, incomingSpeed * 0.035);
    const time = Math.max(0.45, distance / pace) + (shot === 'lob' ? 0.85 : 0);
    const turns =
      shot === 'slice'
        ? -150
        : shot === 'drive'
          ? 250 + power * 100
          : shot === 'serve'
            ? 70
            : shot === 'lob'
              ? 65
              : 20;
    this.spin.x = distance ? (dz / distance) * turns : 0;
    this.spin.y = 0;
    this.spin.z = distance ? (-dx / distance) * turns : 0;
    const v = this.velocity;
    v.x = dx / time;
    v.z = dz / time;
    v.y = (target.y - this.position.y + 0.5 * GRAVITY * time * time) / time;
    // Inverse shooting: solve the requested landing with this very flight integrator,
    // rather than aim with a vacuum parabola and fly with a different model.
    const p = vec(),
      trial = vec(),
      w = vec();
    for (let pass = 0; pass < 6; pass++) {
      Object.assign(p, this.position);
      Object.assign(trial, v);
      Object.assign(w, this.spin);
      for (let elapsed = 0; elapsed < time - 1e-9;) {
        const h = Math.min(BALL_PHYSICS.maxStep, time - elapsed);
        fly(p, trial, w, h);
        elapsed += h;
      }
      const gain = 1.25 / time;
      v.x += (target.x - p.x) * gain;
      v.y += (target.y - p.y) * gain;
      v.z += (target.z - p.z) * gain;
    }
  }
  step(dt: number, events: BallEvent[] = []): BallEvent[] {
    events.length = 0;
    if (!this.active) return events;
    for (let elapsed = 0; elapsed < dt - 1e-10;) {
      const h = Math.min(BALL_PHYSICS.maxStep, dt - elapsed);
      this.advance(h, events);
      elapsed += h;
    }
    return events;
  }
  private advance(dt: number, events: BallEvent[]) {
    const p = this.position,
      v = this.velocity;
    const oldX = p.x,
      oldY = p.y,
      oldZ = p.z;
    fly(p, v, this.spin, dt);
    if (oldZ * p.z <= 0 && oldZ !== p.z && !this.netTouched) {
      const f = oldZ / (oldZ - p.z),
        x = oldX + (p.x - oldX) * f,
        y = oldY + (p.y - oldY) * f;
      if (Math.abs(x) <= 5.7 && y - COURT.radius < netHeight(x)) {
        const grazing = y > netHeight(x) - 0.04;
        this.netTouched = true;
        events.push({ type: 'net', position: vec(x, y, 0), grazing });
        if (grazing) {
          v.x *= 0.75;
          v.z *= 0.65;
          v.y = Math.max(0.35, v.y * 0.5);
        } else {
          p.z = Math.sign(oldZ) * 0.13;
          v.z *= -0.15;
          v.x *= 0.4;
          v.y = Math.min(v.y, 0);
        }
        this.spin.x *= 0.35;
        this.spin.y *= 0.35;
        this.spin.z *= 0.35;
      }
    }
    if (p.y <= COURT.radius && v.y < 0) {
      const f = clamp((oldY - COURT.radius) / Math.max(0.00001, oldY - p.y), 0, 1);
      p.x = oldX + (p.x - oldX) * f;
      p.z = oldZ + (p.z - oldZ) * f;
      p.y = COURT.radius;
      bounceBall(v, this.spin);
      events.push({ type: 'bounce', position: { ...p } });
    }
  }
  copyFrom(ball: Ball) {
    Object.assign(this.position, ball.position);
    Object.assign(this.velocity, ball.velocity);
    Object.assign(this.spin, ball.spin);
    this.active = ball.active;
    this.shot = ball.shot;
    this.netTouched = ball.netTouched;
    return this;
  }
  clone() {
    return new Ball().copyFrom(this);
  }
}
export function predict(
  ball: Ball,
  horizon = 3.5,
): { position: Vec; time: number; bounced: boolean }[] {
  const b = ball.clone(),
    samples = [],
    events: BallEvent[] = [];
  let bounced = false;
  for (let i = 1; i <= Math.ceil(horizon * 120); i++) {
    b.step(1 / 120, events);
    if (events.some((e) => e.type === 'bounce')) bounced = true;
    if (i % 2 === 0 || events.length)
      samples.push({ position: { ...b.position }, time: i / 120, bounced });
  }
  return samples;
}
