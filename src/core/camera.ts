import { clamp, type Vec } from './court';
export type CameraMode = 'broadcast' | 'behind';
export class CameraRig {
  mode: CameraMode = 'broadcast';
  position: Vec = { x: 0, y: 25, z: 27 };
  target: Vec = { x: 0, y: 0, z: 0 };
  constructor(private storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      if (storage?.getItem('centre-court-camera') === 'behind') this.mode = 'behind';
    } catch {
      /* private mode */
    }
  }
  switch(mode: CameraMode) {
    this.mode = mode;
    try {
      this.storage?.setItem('centre-court-camera', mode);
    } catch {
      /* storage unavailable */
    }
  }
  update(dt: number, player: Vec, ball: Vec, aspect: number) {
    const portrait = aspect < 0.85,
      behind = this.mode === 'behind';
    const next = behind
      ? { x: player.x * 0.32, y: portrait ? 15 : 10, z: player.z + (portrait ? 17 : 13) }
      : { x: clamp(ball.x * 0.12, -0.7, 0.7), y: portrait ? 32 : 25, z: portrait ? 33 : 27 };
    const target = behind ? { x: ball.x * 0.18, y: 0.7, z: -2 } : { x: 0, y: 0, z: 0 };
    const blend = 1 - Math.exp(-dt * 4);
    for (const key of ['x', 'y', 'z'] as const) {
      this.position[key] += (next[key] - this.position[key]) * blend;
      this.target[key] += (target[key] - this.target[key]) * blend;
    }
  }
}
