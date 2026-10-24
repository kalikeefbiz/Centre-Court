import { clamp, Random, type Vec } from './court';
import { predict, type Ball, type Shot } from './ball';
export type Difficulty = 'easy' | 'normal' | 'hard';
export const PRESETS = {
  easy: { reaction: 0.42, speed: 4.4, error: 1.7, aggression: 0.3, miss: 0.12 },
  normal: { reaction: 0.23, speed: 5.4, error: 0.85, aggression: 0.58, miss: 0.065 },
  hard: { reaction: 0.13, speed: 6.2, error: 0.4, aggression: 0.85, miss: 0.025 },
} as const;
export function chooseShot(ball: Vec, opponent: Vec, rng: Random): Shot {
  if (opponent.z < 5 && rng.next() < 0.6) return 'lob';
  if (ball.z > -5 && ball.y > 1.2) return 'volley';
  return rng.next() < 0.22 ? 'slice' : 'drive';
}
export function intercept(ball: Ball, player: Vec, speed: number, serve: boolean): Vec {
  const samples = predict(ball);
  const reachable = samples.find(
    (s) =>
      s.position.z < -0.6 &&
      s.position.z > -15 &&
      s.position.y > 0.45 &&
      s.position.y < 2.4 &&
      (!serve || s.bounced) &&
      Math.hypot(s.position.x - player.x, s.position.z - player.z) < speed * s.time + 1.2,
  );
  const fallback = samples.find((s) => s.bounced && s.position.z < -0.5 && s.position.y > 0.5);
  const p = reachable?.position ?? fallback?.position;
  return p ? { x: clamp(p.x, -6.5, 6.5), y: 0, z: clamp(p.z, -15, -0.8) } : { x: 0, y: 0, z: -10 };
}
