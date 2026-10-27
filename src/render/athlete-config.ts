import { ROSTER, type CharacterId } from '../core/roster';
import { ANIMATIONS, type AthleteState } from './animation-registry';
export type { AthleteState } from './animation-registry';
export const KIRA = {
  characterUrl: 'assets/characters/kira/Kira_Midres_Rigged.glb',
  rollbackUrl: 'assets/characters/kira/Meshy_AI_Pink_Valkyrie_All_Animations.glb',
  racketUrl: 'assets/equipment/rackets/Meshy_AI_Pink_and_Black_Tennis_1024095819_texture.glb',
  clips: Object.fromEntries(Object.entries(ANIMATIONS).map(([s, a]) => [s, a.clip])),
  hand: 'mixamorig:RightHand',
  hips: 'mixamorig:Hips',
  gripPosition: [0, 0.065, 0] as const,
  gripRotation: [0, 0, 90] as const,
  carryWristRotation: [0, 180, 0] as const,
  racketScale: 0.72,
  racketPosition: [0, 0.28, 0] as const,
  sweetSpot: [0, 0.22, 0] as const,
};
export function locomotionState(speed: number, x = 0, z = 0): AthleteState {
  if (speed > 0.15 && Math.abs(x) > Math.abs(z) * 1.6)
    return x < 0 ? 'ShuffleLeft' : 'ShuffleRight';
  return speed > 3 ? 'Run' : speed > 0.15 ? 'Walk' : 'Idle';
}

/** Shared animation semantics with independent, overridable athlete sockets. All uploaded
 * models use Mixamo hand names and metre units; derived rigs retain those conventions. */
export const ATHLETE_RENDER = Object.fromEntries(
  Object.entries(ROSTER)
    .filter(([, p]) => p.available)
    .map(([id, p]) => [
      id,
      {
        ...KIRA,
        characterUrl: p.asset!,
        gripPosition: [...KIRA.gripPosition] as [number, number, number],
        gripRotation: [...KIRA.gripRotation] as [number, number, number],
        carryWristRotation: [...KIRA.carryWristRotation] as [number, number, number],
        racketPosition: [...KIRA.racketPosition] as [number, number, number],
        sweetSpot: [...KIRA.sweetSpot] as [number, number, number],
      },
    ]),
) as Record<
  Exclude<CharacterId, 'jax'>,
  Omit<
    typeof KIRA,
    | 'characterUrl'
    | 'gripPosition'
    | 'gripRotation'
    | 'carryWristRotation'
    | 'racketPosition'
    | 'sweetSpot'
  > & {
    characterUrl: string;
    gripPosition: [number, number, number];
    gripRotation: [number, number, number];
    carryWristRotation: [number, number, number];
    racketPosition: [number, number, number];
    sweetSpot: [number, number, number];
  }
>;
