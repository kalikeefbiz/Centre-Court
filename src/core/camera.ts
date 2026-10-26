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
    const wide = portrait ? Math.max(0, Math.abs(player.x) - 2) : 0;
    const deep = portrait ? Math.max(0, player.z - 12) : 0;
    const next = behind
      ? {
          x: player.x * 0.32,
          y: portrait ? 10 + wide * 0.4 : 9.5,
          z: player.z + (portrait ? 16 + wide * 0.8 : 12),
        }
      : {
          x: portrait
            ? clamp(player.x * 0.2 + ball.x * 0.03, -1.4, 1.4)
            : clamp(ball.x * 0.12, -0.7, 0.7),
          y: portrait ? 12 + wide * 0.6 + deep * 0.2 : 19,
          z: portrait ? 28 + wide * 1.1 + deep * 0.7 : 22,
        };
    const target = behind
      ? { x: ball.x * 0.18, y: 0.7, z: portrait ? player.z - 7.5 : -2 }
      : { x: 0, y: 0, z: portrait ? 4 + deep * 0.7 : 0 };
    const blend = 1 - Math.exp(-dt * 4);
    for (const key of ['x', 'y', 'z'] as const) {
      this.position[key] += (next[key] - this.position[key]) * blend;
      this.target[key] += (target[key] - this.target[key]) * blend;
    }
  }
}
