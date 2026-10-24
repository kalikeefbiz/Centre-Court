import { ANIMATIONS, type AthleteState } from './animation-registry';
export type { AthleteState } from './animation-registry';
export const KIRA = {
  characterUrl: 'assets/characters/kira/Meshy_AI_Pink_Valkyrie_All_Animations.glb',
  rollbackUrl: 'assets/characters/kira/Meshy_AI_Pink_Rebel_Arena_All_Animations.glb',
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
  swingSpeed: 1.65,
  blendTime: 0.1,
  visualContactSeconds: 0.065,
  maxVisualCorrection: 0.18,
};
export function locomotionState(speed: number, x = 0, z = 0): AthleteState {
  if (speed > 0.15 && Math.abs(x) > Math.abs(z) * 1.6)
    return x < 0 ? 'ShuffleLeft' : 'ShuffleRight';
  return speed > 3 ? 'Run' : speed > 0.15 ? 'Walk' : 'Idle';
}
