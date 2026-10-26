import { sign, type Side, type Vec } from './court';
export type Stroke =
  | 'Forehand'
  | 'Backhand'
  | 'ForehandVolley'
  | 'BackhandVolley'
  | 'Serve'
  | 'Smash'
  | 'Slice'
  | 'Lob';
export interface HitContext {
  player: Vec;
  ball: Vec;
  velocity: Vec;
  side: Side;
  bounces: number;
  intent: 'drive' | 'slice' | 'lob';
  serving?: boolean;
}
// Reach and incoming trajectory select the physical stroke; intent selects the ball outcome.
export function selectStroke(c: HitContext): Stroke {
  if (c.serving) return 'Serve';
  const forehand = (c.ball.x - c.player.x) * sign(c.side) >= 0;
  if (c.ball.y > 1.9 && c.velocity.y < 0 && c.bounces === 0 && Math.abs(c.player.z) < 10)
    return 'Smash';
  if (c.bounces === 0) return forehand ? 'ForehandVolley' : 'BackhandVolley';
  if (c.intent === 'slice') return 'Slice';
  if (c.intent === 'lob') return 'Lob';
  return forehand ? 'Forehand' : 'Backhand';
}
export const CONTACT = Object.freeze({
  inputWindow: 0.25, // buffered release, never an automatic swing
  ground: { radius: 1.25, minHeight: 0.3, maxHeight: 1.95 },
  volley: { radius: 1.3, minHeight: 0.4, maxHeight: 2.05 },
  overhead: { radius: 1.25, minHeight: 1.9, maxHeight: 2.65 },
});
export function inContactZone(c: HitContext, stroke = selectStroke(c)) {
  const zone =
    stroke === 'Smash' ? CONTACT.overhead : c.bounces === 0 ? CONTACT.volley : CONTACT.ground;
  const forward = (c.player.z - c.ball.z) * sign(c.side);
  // The string bed is in front of the athlete. A late ball behind the body is a miss.
  return (
    forward > -0.25 &&
    forward < 1.25 &&
    c.ball.y >= zone.minHeight &&
    c.ball.y <= zone.maxHeight &&
    Math.hypot(c.ball.x - c.player.x, c.ball.z - c.player.z) <
      Math.min(zone.radius, c.ball.y < 0.65 ? 0.65 : zone.radius)
  );
}
