/** Flat-court, velocity-authoritative locomotion (m, m/s, m/s², seconds).
 * Adapted from PlayCanvas third-person-controller's damp/velocity feedback and
 * Centre Court's acceleration-limited AI steering. Tennis state separation is
 * informed by OpenTennis player.rs/motion.rs. See public/THIRD_PARTY_NOTICES.txt.
 */
import { clamp, sign, vec, type Side, type Vec } from './court';

export interface LocomotionConfig {
  forwardSpeed: number;
  backwardSpeed: number;
  lateralSpeed: number;
  acceleration: number;
  braking: number;
  reversalBraking: number;
  /** Exponential convergence rate near requested velocity, per second. */
  response: number;
}
export const HUMAN_LOCOMOTION: Readonly<LocomotionConfig> = {
  forwardSpeed: 6.3,
  backwardSpeed: 4.6,
  lateralSpeed: 6,
  acceleration: 24,
  braking: 32,
  reversalBraking: 36,
  response: 20,
};
export const PLAYER_BOUNDS = { lateral: 6.7, net: 0.65, back: 15.3 } as const;
export const FOOTWORK_ASSIST = { inputThreshold: 0.1, speed: 1.8, gain: 1.5 } as const;
const SETTLE_SPEED = 0.01;
export type MovementState = 'idle' | 'accelerating' | 'cruising' | 'braking' | 'reversing';
export interface LocomotionState {
  velocity: Vec;
  desiredVelocity: Vec;
  acceleration: Vec;
  speed: number;
  /** Unit direction of physical travel, zero at rest (world coordinates). */
  travelDirection: Vec;
  state: MovementState;
  braking: boolean;
  reversing: boolean;
}
export function createLocomotion(): LocomotionState {
  return {
    velocity: vec(),
    desiredVelocity: vec(),
    acceleration: vec(),
    travelDirection: vec(),
    speed: 0,
    state: 'idle',
    braking: false,
    reversing: false,
  };
}
export function resetLocomotion(s: LocomotionState) {
  for (const v of [s.velocity, s.desiredVelocity, s.acceleration, s.travelDirection])
    v.x = v.y = v.z = 0;
  s.speed = 0;
  s.state = 'idle';
  s.braking = s.reversing = false;
}
/** Elliptical directional envelope. Forward is toward the net on either half.
 * OpenTennis distinguishes forward/side/back motion, but uses one run pace;
 * these directional speed differences are Centre Court tuning, not extracted stats.
 */
export function directionalSpeed(x: number, z: number, side: Side, c: Readonly<LocomotionConfig>) {
  const longitudinal = z * sign(side) < 0 ? c.forwardSpeed : c.backwardSpeed;
  return 1 / Math.hypot(x / c.lateralSpeed, z / longitudinal);
}
/** Clamp only lengths above one: preserve analog magnitude and normalize diagonals. */
export function requestMovement(
  s: LocomotionState,
  x: number,
  z: number,
  side: Side,
  c: Readonly<LocomotionConfig>,
  speedScale = 1,
) {
  const length = Math.hypot(x, z);
  if (length === 0) {
    s.desiredVelocity.x = s.desiredVelocity.z = 0;
    return;
  }
  const ux = x / length,
    uz = z / length;
  const speed = directionalSpeed(ux, uz, side, c) * Math.min(1, length) * speedScale;
  s.desiredVelocity.x = ux * speed;
  s.desiredVelocity.z = uz * speed;
}
/** PlayCanvas damp(damping, dt), expressed as a rate: damping = exp(-rate/1000). */
const damp = (rate: number, dt: number) => -Math.expm1(-rate * dt);

/** Exactly one call per athlete per match tick. No rendering objects or allocations.
 * Opposing intent first brakes the entire old travel vector to zero; acceleration
 * in the new direction starts on the following tick. Court contact removes only
 * the outward velocity component and never redistributes it along the boundary.
 * Returns actual distance travelled for existing animation/diagnostic consumers.
 */
export function stepLocomotion(
  s: LocomotionState,
  position: Vec,
  side: Side,
  c: Readonly<LocomotionConfig>,
  dt: number,
) {
  if (dt <= 0) return 0;
  const minZ = side === 0 ? PLAYER_BOUNDS.net : -PLAYER_BOUNDS.back;
  const maxZ = side === 0 ? PLAYER_BOUNDS.back : -PLAYER_BOUNDS.net;
  const desired = s.desiredVelocity,
    v = s.velocity;
  if (
    (position.x >= PLAYER_BOUNDS.lateral && desired.x > 0) ||
    (position.x <= -PLAYER_BOUNDS.lateral && desired.x < 0)
  )
    desired.x = 0;
  if ((position.z >= maxZ && desired.z > 0) || (position.z <= minZ && desired.z < 0)) desired.z = 0;
  const oldVX = v.x,
    oldVZ = v.z,
    oldSpeed = Math.hypot(v.x, v.z);
  const desiredSpeed = Math.hypot(desired.x, desired.z);
  s.reversing = oldSpeed > 0 && v.x * desired.x + v.z * desired.z < 0;
  s.braking = s.reversing || desiredSpeed < oldSpeed - 1e-8;
  const targetX = s.reversing ? 0 : desired.x;
  const targetZ = s.reversing ? 0 : desired.z;
  const dx = targetX - v.x,
    dz = targetZ - v.z,
    delta = Math.hypot(dx, dz);
  const rate = s.reversing ? c.reversalBraking : s.braking ? c.braking : c.acceleration;
  // Bound the vector delta, not each axis independently (no diagonal acceleration bonus).
  const fraction =
    delta === 0
      ? 0
      : Math.min(
          1,
          (rate * dt) / delta,
          s.braking || delta <= SETTLE_SPEED ? 1 : damp(c.response, dt),
        );
  v.x += dx * fraction;
  v.z += dz * fraction;
  const oldX = position.x,
    oldZ = position.z;
  // Trapezoidal integration accounts for velocity gained/lost during this tick.
  position.x = clamp(
    oldX + (oldVX + v.x) * 0.5 * dt,
    -PLAYER_BOUNDS.lateral,
    PLAYER_BOUNDS.lateral,
  );
  position.z = clamp(oldZ + (oldVZ + v.z) * 0.5 * dt, minZ, maxZ);
  if (
    (position.x === PLAYER_BOUNDS.lateral && v.x > 0) ||
    (position.x === -PLAYER_BOUNDS.lateral && v.x < 0)
  )
    v.x = 0;
  if ((position.z === maxZ && v.z > 0) || (position.z === minZ && v.z < 0)) v.z = 0;
  s.acceleration.x = (v.x - oldVX) / dt;
  s.acceleration.z = (v.z - oldVZ) / dt;
  s.speed = Math.hypot(v.x, v.z);
  s.travelDirection.x = s.speed > 0 ? v.x / s.speed : 0;
  s.travelDirection.z = s.speed > 0 ? v.z / s.speed : 0;
  s.state = s.reversing
    ? 'reversing'
    : s.braking
      ? 'braking'
      : s.speed === 0
        ? 'idle'
        : Math.hypot(desired.x - v.x, desired.z - v.z) > SETTLE_SPEED
          ? 'accelerating'
          : 'cruising';
  return Math.hypot(position.x - oldX, position.z - oldZ);
}

/** Continuous reach estimate for the same capped-acceleration / damped response.
 * Signed initial projection retains the cost and lost distance of reversal.
 * The fixed-step controller can take one extra tick to leave zero on reversal.
 */
export function movementTravelDistance(
  time: number,
  speed: number,
  acceleration: number,
  initial = 0,
  reversalBraking = HUMAN_LOCOMOTION.reversalBraking,
  response = HUMAN_LOCOMOTION.response,
  braking = HUMAN_LOCOMOTION.braking,
) {
  time = Math.max(0, time);
  let distance = 0;
  if (initial < 0) {
    const stop = Math.min(time, -initial / reversalBraking);
    distance = initial * stop + 0.5 * reversalBraking * stop * stop;
    time -= stop;
    initial += reversalBraking * stop;
    if (time <= 0) return distance;
    initial = 0;
  }
  if (initial > speed) {
    const slow = Math.min(time, (initial - speed) / braking);
    distance += initial * slow - 0.5 * braking * slow * slow;
    time -= slow;
    initial -= braking * slow;
  }
  const ramp = Math.min(
    time,
    Math.max(0, (speed - initial - acceleration / response) / acceleration),
  );
  distance += initial * ramp + 0.5 * acceleration * ramp * ramp;
  initial += acceleration * ramp;
  time -= ramp;
  return distance + speed * time - ((speed - initial) * damp(response, time)) / response;
}
