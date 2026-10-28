import { Ball, type BallEvent } from './ball';
import { planInterception, type Interception } from './ai';
import { vec, type Vec, clamp } from './court';
import { selectStroke, CONTACT, type Stroke } from './hitting';
import {
  HUMAN_LOCOMOTION,
  requestMovement,
  directionalSpeed,
  type LocomotionState,
} from './locomotion';
import { ANIMATIONS } from '../render/animation-registry';

export type AssistanceMode = 'off' | 'light' | 'standard';
export const ASSISTANCE = Object.freeze({
  off: { speed: 0, radius: 0, finalTime: 0, alignment: 0 },
  light: { speed: 1.8, radius: 0.85, finalTime: 0.4, alignment: 0.12 },
  standard: { speed: 3.6, radius: 1.8, finalTime: 0.65, alignment: 0.32 },
});
export function assistanceMode(value: unknown): AssistanceMode {
  return value === 'off' || value === 'light' ? value : 'standard';
}
export interface Preparation {
  id: number;
  stroke: Stroke;
  clipTime: number;
  age: number;
}
export type ReturnMiss =
  | 'too-far'
  | 'moved-away'
  | 'late-input'
  | 'incompatible-preparation'
  | 'racket-path'
  | 'contact-timing';
/** Session-owned, event/cadence driven reuse of the AI's deterministic integrator.
 * Reflect Z (and axial spin X/Y) to use its opponent-half predictor unchanged.
 * Prediction never consumes RNG, changes the live ball, or creates a StrokeAction.
 */
export class HumanAnticipation {
  prediction: Interception | null = null;
  preparation: Preparation | null = null;
  decisions = 0;
  decisionMs = 0;
  private countdown = 0;
  private observed = -1;
  private bounce = -1;
  private serial = -1;
  private mirror = new Ball();
  private scratch = new Ball();
  private events: BallEvent[] = [];
  reset() {
    this.prediction = this.preparation = null;
    this.countdown = 0;
    this.observed = this.bounce = -1;
  }
  invalidate() {
    this.countdown = 0;
  }
  update(
    dt: number,
    ball: Ball,
    position: Vec,
    velocity: Vec,
    contacts: number,
    bounces: number,
    serve: boolean,
    available: boolean,
    preparing = true,
  ) {
    if (!available || !ball.active || ball.velocity.z <= 0) {
      this.reset();
      return;
    }
    if (this.prediction) this.prediction.time = Math.max(0, this.prediction.time - dt);
    this.countdown -= dt;
    if (contacts !== this.observed || bounces !== this.bounce || this.countdown <= 0) {
      const start = performance.now();
      this.mirror.copyFrom(ball);
      this.mirror.position.z *= -1;
      this.mirror.velocity.z *= -1;
      this.mirror.spin.x *= -1;
      this.mirror.spin.y *= -1;
      const p = planInterception(
        this.mirror,
        vec(position.x, 0, -position.z),
        HUMAN_LOCOMOTION.forwardSpeed,
        serve,
        bounces,
        0,
        HUMAN_LOCOMOTION.acceleration,
        1,
        this.scratch,
        vec(velocity.x, 0, -velocity.z),
        this.events,
        HUMAN_LOCOMOTION,
        0.3,
      );
      p.target.z *= -1;
      if (p.contact) p.contact.z *= -1;
      if (p.contactVelocity) p.contactVelocity.z *= -1;
      if (p.bounce) p.bounce.z *= -1;
      this.prediction = p;
      this.observed = contacts;
      this.bounce = bounces;
      this.countdown = p.time > 0.65 ? 0.18 : 0.1;
      this.decisions++;
      this.decisionMs += performance.now() - start;
      if (!p.reachable || !p.contact) this.preparation = null;
      else if (preparing && p.time <= 1.1) {
        const count = bounces + (p.bounceTime !== null && p.bounceTime <= p.time ? 1 : 0);
        let stroke = selectStroke({
          player: position,
          ball: p.contact,
          velocity: p.contactVelocity ?? ball.velocity,
          side: 0,
          bounces: count,
          intent: 'drive',
        });
        // Commit the side inside a 45cm deadband. Family changes still use a
        // native blend; never oscillate at the athlete's centre line.
        const old = this.preparation?.stroke;
        if (
          old &&
          Math.abs(p.contact.x - position.x) < 0.45 &&
          (((old === 'Forehand' || old === 'Backhand') &&
            (stroke === 'Forehand' || stroke === 'Backhand')) ||
            ((old === 'ForehandVolley' || old === 'BackhandVolley') &&
              (stroke === 'ForehandVolley' || stroke === 'BackhandVolley')))
        )
          stroke = old;
        if (!this.preparation || stroke !== old)
          this.preparation = {
            id: --this.serial,
            stroke,
            clipTime: Math.max(0, ANIMATIONS[stroke].prepare - 0.2),
            age: 0,
          };
      }
    }
    if (!preparing) this.preparation = null;
    const prep = this.preparation;
    if (prep) {
      prep.age += dt;
      const a = ANIMATIONS[prep.stroke];
      // Settle into the early forward motion, safely before the contact marker.
      const hold = a.prepare + (a.contact - a.prepare) * 0.4;
      prep.clipTime = Math.min(hold, prep.clipTime + dt);
    }
  }
  snapshot() {
    const p = this.prediction;
    return {
      prediction: p
        ? {
            ...p,
            target: { ...p.target },
            contact: p.contact ? { ...p.contact } : null,
            contactVelocity: p.contactVelocity ? { ...p.contactVelocity } : null,
            bounce: p.bounce ? { ...p.bounce } : null,
          }
        : null,
      preparation: this.preparation ? { ...this.preparation } : null,
      decisions: this.decisions,
      averageDecisionMs: this.decisionMs / Math.max(1, this.decisions),
    };
  }
}
/** Velocity request only; Match still integrates exactly once. Opposing input
 * wins. Neutral assistance is restricted to short, reachable final steps. */
export function steerInterception(
  s: LocomotionState,
  position: Vec,
  x: number,
  z: number,
  prediction: Interception | null,
  mode: AssistanceMode,
) {
  requestMovement(s, x, z, 0, HUMAN_LOCOMOTION);
  const policy = ASSISTANCE[mode];
  if (!policy.speed || !prediction?.reachable || prediction.time <= 0) return false;
  const dx = prediction.target.x - position.x;
  const contact = prediction.contact;
  // Suppress a settling-sized retreat from a ground contact already in reach.
  // The forecast's tiny Z change must not pull the athlete away while correcting X.
  // Larger corrections and explicit manual retreat remain available.
  const alreadyInReach =
    contact &&
    contact.z < position.z &&
    contact.y <= CONTACT.ground.maxHeight &&
    Math.hypot(contact.x - position.x, contact.z - position.z) < CONTACT.ground.radius;
  const retreat = prediction.target.z - position.z;
  const dz = alreadyInReach && retreat > 0 && retreat < 0.06 ? 0 : retreat;
  const distance = Math.hypot(dx, dz),
    input = Math.hypot(x, z);
  if (distance < 0.06) return false;
  const alignment = (x * dx + z * dz) / Math.max(1e-8, input * distance);
  if (input >= 0.1 && alignment < 0.25) return false;
  const final = distance <= policy.radius && prediction.time <= policy.finalTime;
  if (input < 0.1 && !final) return false;
  const pace = directionalSpeed(dx / distance, dz / distance, 0, HUMAN_LOCOMOTION);
  const speed = Math.min(
    policy.speed,
    distance * 5,
    Math.sqrt(2 * HUMAN_LOCOMOTION.braking * Math.max(0, distance - 0.06)),
  );
  if (input < 0.1)
    requestMovement(s, dx / distance, dz / distance, 0, HUMAN_LOCOMOTION, speed / pace);
  else {
    const blend = final ? policy.alignment : policy.alignment * 0.35;
    // Blend directions at manual analog magnitude; cannot increase manual pace.
    const ux = x * (1 - blend) + (dx / distance) * input * blend,
      uz = z * (1 - blend) + (dz / distance) * input * blend;
    requestMovement(s, ux, uz, 0, HUMAN_LOCOMOTION);
  }
  return true;
}
