import { clamp, sign, type Side, type Vec } from './court';
import type { CharacterId } from './roster';
import type { Shot } from './ball';
export const METER = { return: 4, point: 10, sustained: 2, clean: 1, full: 100 } as const;
export const heatLevel = (returns: number) => (returns >= 12 ? 2 : returns >= 8 ? 1 : 0);
/** Adjust a real shot's intended landing/power before the ordinary ballistic solver.
 * No teleport, post-launch homing or altered contact window. */
export function signatureShot(
  id: CharacterId,
  side: Side,
  target: Vec,
  power: number,
  shot: Shot,
  opponent: Vec,
  recovering: boolean,
  variation: number,
) {
  const open = opponent.x >= 0 ? -1 : 1;
  switch (id) {
    case 'jax':
      target.x = open * 3.35;
      target.z = -sign(side) * (variation > 0.5 ? 7.2 : 9.6);
      break;
    case 'kira':
      target.x = target.x * 0.55 + open * 1.45;
      power += recovering ? 0.13 : 0.07;
      break;
    case 'zuri':
      power += 0.16;
      target.z = -sign(side) * 10.2;
      break;
    case 'dante':
      target.z = -sign(side) * 10.9;
      power += 0.06;
      break;
    case 'nova':
      shot = variation > 0.5 ? 'slice' : 'lob';
      target.x = open * (variation > 0.5 ? 2.8 : 1.9);
      target.z = -sign(side) * 9.8;
      break;
    case 'rico':
      target.x = open * 3;
      target.z = -sign(side) * 9.9;
      power += 0.08;
      break;
  }
  target.x = clamp(target.x, -3.6, 3.6);
  return { power: clamp(power, 0, 1), shot };
}
