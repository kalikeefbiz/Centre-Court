import { ANIMATIONS } from '../render/animation-registry';
import paths from './rig-motion.json' with { type: 'json' };
import { clamp, sign, vec, type Side, type Vec } from './court';
import { type Stroke } from './hitting';

/** Animation markers are seconds in the original clips. Gameplay time is seconds
 * in Match's fixed clock. Racket paths are sampled from the shipped rig + socket.
 */
export const STRIKE = Object.freeze({
  lead: 0.13,
  window: 0.055,
  forgiveness: 0.46,
  maxWarp: 0.95,
  recovery: 0.25,
  followThrough: 0.34,
  serveDuration: 0.9,
  tossRelease: 0.36,
});
export type StrokePhase = 'preparation' | 'swing' | 'contact' | 'follow-through' | 'recovery';
export interface StrokeAction {
  id: number;
  stroke: Stroke;
  age: number;
  clipTime: number;
  clipStart: number;
  prepared: boolean;
  contactAt: number;
  rate: number;
  phase: StrokePhase;
  contacted: boolean;
  missed: boolean;
  warp: Vec;
  target: Vec;
  previousRacket: Vec;
  racket: Vec;
  power: number;
  aim: number;
  depth: number;
  intent: 'drive' | 'slice' | 'lob';
  timingQuality: number;
  /** Logical input ID; zero for AI and scripted releases. */
  gestureId: number;
  /** Provisional tap preparation may animate but cannot change ball state. */
  committed: boolean;
  /** Earliest impact age; a provisional slice locks to its marker. */
  impactAfter: number;
}
export function sampleRig(stroke: Stroke, time: number, out: Vec, palm = false) {
  const curve = palm ? paths.Serve.palm : paths[stroke].racket;
  const frame = clamp(time * 30, 0, curve.length - 1),
    i = Math.floor(frame),
    j = Math.min(i + 1, curve.length - 1),
    f = frame - i;
  out.x = curve[i][0] + (curve[j][0] - curve[i][0]) * f;
  out.y = curve[i][1] + (curve[j][1] - curve[i][1]) * f;
  out.z = curve[i][2] + (curve[j][2] - curve[i][2]) * f;
  return out;
}
export function createStroke(
  id: number,
  stroke: Stroke,
  player: Vec,
  side: Side,
  target: Vec,
  power: number,
  aim: number,
  depth: number,
  intent: StrokeAction['intent'],
  velocity?: Vec,
  lead: number = STRIKE.lead,
  clipStart?: number,
): StrokeAction {
  const a = ANIMATIONS[stroke];
  const serve = stroke === 'Serve',
    contactAt = serve ? STRIKE.serveDuration : lead;
  const nominal = sampleRig(stroke, a.contact, vec());
  const warp = vec(
    target.x - player.x - (velocity?.x ?? 0) * contactAt - nominal.x * sign(side),
    target.y - nominal.y,
    target.z - player.z - (velocity?.z ?? 0) * contactAt - nominal.z * sign(side),
  );
  const length = Math.hypot(warp.x, warp.y, warp.z),
    scale = Math.min(1, STRIKE.maxWarp / Math.max(length, 1e-8));
  warp.x *= scale;
  warp.y *= scale;
  warp.z *= scale;
  return {
    id,
    stroke,
    age: 0,
    clipTime: clipStart ?? (serve ? 0 : a.prepare),
    clipStart: clipStart ?? (serve ? 0 : a.prepare),
    prepared: clipStart !== undefined,
    contactAt,
    rate: serve ? a.contact / contactAt : (a.contact - (clipStart ?? a.prepare)) / contactAt,
    phase: 'preparation',
    contacted: false,
    missed: false,
    warp,
    target: { ...target },
    previousRacket: vec(),
    racket: vec(),
    power,
    aim,
    depth,
    intent,
    timingQuality: 0,
    gestureId: 0,
    committed: true,
    impactAfter: 0,
  };
}
/** Warp is a bounded contact reach, not movement of the athlete or ball. */
export function racketPosition(action: StrokeAction, player: Vec, side: Side, out: Vec) {
  sampleRig(action.stroke, action.clipTime, out);
  const weight =
    clamp(1 - Math.abs(action.age - action.contactAt) / 0.32, 0, 1) *
    (action.prepared ? clamp(action.age / action.contactAt, 0, 1) : 1);
  out.x = player.x + out.x * sign(side) + action.warp.x * weight;
  out.y += action.warp.y * weight;
  out.z = player.z + out.z * sign(side) + action.warp.z * weight;
  return out;
}
export function advanceStroke(action: StrokeAction, dt: number, player: Vec, side: Side) {
  Object.assign(action.previousRacket, action.racket);
  action.age += dt;
  const a = ANIMATIONS[action.stroke];
  action.clipTime = Math.min(a.end, action.clipStart + action.age * action.rate);
  const relative = action.age - action.contactAt;
  action.phase =
    relative < -0.065
      ? 'preparation'
      : relative < -STRIKE.window
        ? 'swing'
        : relative <= STRIKE.window
          ? 'contact'
          : relative < STRIKE.followThrough
            ? 'follow-through'
            : 'recovery';
  racketPosition(action, player, side, action.racket);
}
/** Relative segment sweep: catches fast racket/ball crossings between fixed steps. */
export function sweptContact(action: StrokeAction, oldBall: Vec, ball: Vec) {
  const x = action.previousRacket.x - oldBall.x,
    y = action.previousRacket.y - oldBall.y,
    z = action.previousRacket.z - oldBall.z;
  const dx = action.racket.x - ball.x - x,
    dy = action.racket.y - ball.y - y,
    dz = action.racket.z - ball.z - z;
  const denominator = dx * dx + dy * dy + dz * dz;
  const t = denominator > 1e-10 ? clamp(-(x * dx + y * dy + z * dz) / denominator, 0, 1) : 0;
  return Math.hypot(x + dx * t, y + dy * t, z + dz * t);
}
