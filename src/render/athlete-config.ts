// Values are in the original GLB's metre units and the right hand's local space.
// Each future athlete can supply its own profile without changing gameplay.
export const KIRA = {
  characterUrl: 'assets/characters/kira/Meshy_AI_Pink_Rebel_Arena_All_Animations.glb',
  racketUrl: 'assets/equipment/rackets/Meshy_AI_Pink_and_Black_Tennis_1024095819_texture.glb',
  clips: {
    Idle: 'Idle_5',
    Walk: 'Walking',
    Run: 'Running',
    Swing: '_01a16d42_9295_73c7_8a05_a5b744b94d9d',
  },
  hand: 'mixamorig:RightHand',
  hips: 'mixamorig:Hips',
  gripPosition: [0, 0.08, 0] as const,
  gripRotation: [0, 0, 90] as const,
  // The generic locomotion clips carry no racket. Add wrist roll to clear the legs.
  carryWristRotation: [0, 180, 0] as const,
  followThroughWristTime: 1.35,
  racketScale: 0.72,
  // The asset origin is at its centre. Bring the handle, not the mesh origin, into the palm.
  racketPosition: [0, 0.28, 0] as const,
  sweetSpot: [0, 0.22, 0] as const,
  windupTime: 0.5,
  contactTime: 1.3,
  serveContactTime: 1.4,
  followThroughEnd: 1.85,
  swingSpeed: 2.2,
  blendTime: 0.12,
  visualContactSeconds: 0.08,
};

export type AthleteState = keyof typeof KIRA.clips;
export function locomotionState(speed: number): AthleteState {
  return speed > 3 ? 'Run' : speed > 0.15 ? 'Walk' : 'Idle';
}
