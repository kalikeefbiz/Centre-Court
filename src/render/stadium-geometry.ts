/** Offline-style geometry baking: no per-seat entities or live scene traversal. */
export type XYZ = [number, number, number];
export class Geometry {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  boxes = 0;
  box(p: XYZ, s: XYZ, hex: string, yaw = 0) {
    const c = Math.cos(yaw),
      t = Math.sin(yaw);
    const rgb = [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255) ** 2.2);
    const faces = [
      [
        [1, 0, 0],
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
        [1, -1, 1],
      ],
      [
        [-1, 0, 0],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
        [-1, -1, -1],
      ],
      [
        [0, 1, 0],
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
        [-1, 1, -1],
      ],
      [
        [0, -1, 0],
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1],
      ],
      [
        [0, 0, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
        [-1, -1, 1],
      ],
      [
        [0, 0, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
        [1, -1, -1],
      ],
    ];
    for (const [n, ...corners] of faces) {
      const start = this.positions.length / 3;
      for (const v of corners) {
        const x = (v[0] * s[0]) / 2,
          z = (v[2] * s[2]) / 2;
        this.positions.push(p[0] + x * c + z * t, p[1] + (v[1] * s[1]) / 2, p[2] - x * t + z * c);
        this.normals.push(n[0] * c + n[2] * t, n[1], -n[0] * t + n[2] * c);
        this.colors.push(...rgb, 1);
      }
      this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    this.boxes++;
  }
  /** Faceted ellipsoid; stadium heads use 24 triangles, with no degenerate pole faces. */
  head(p: XYZ, s: XYZ, hex: string, bands = 4) {
    const rgb = [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255) ** 2.2);
    const start = this.positions.length / 3;
    for (let y = 0; y <= bands; y++)
      for (let x = 0; x <= 6; x++) {
        const a = (y * Math.PI) / bands,
          b = (x * Math.PI) / 3;
        const n = [Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b)];
        this.positions.push(...n.map((v, i) => p[i] + (v * s[i]) / 2));
        this.normals.push(...n);
        this.colors.push(...rgb, 1);
        if (y < bands && x < 6) {
          const i = start + y * 7 + x;
          if (y > 0) this.indices.push(i, i + 1, i + 7);
          if (y < bands - 1) this.indices.push(i + 1, i + 8, i + 7);
        }
      }
  }
}
export const STADIUM = Object.freeze({
  runoff: [20, 36],
  barrierX: 10.6,
  barrierZ: 18.7,
  seed: 4004,
});
export type StadiumQuality = 'full' | 'reduced';
export function initialQuality(width: number, cores = 8): StadiumQuality {
  return width < 600 || cores <= 4 ? 'reduced' : 'full';
}
