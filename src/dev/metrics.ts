/** Bounded frame-interval diagnostics. Wall time includes scheduling; this is not GPU time. */
export class FrameWindow {
  private values = new Float64Array(600);
  private count = 0;
  private cursor = 0;
  add(ms: number) {
    if (!Number.isFinite(ms) || ms <= 0) return;
    this.values[this.cursor] = ms;
    this.cursor = (this.cursor + 1) % this.values.length;
    this.count = Math.min(this.count + 1, this.values.length);
  }
  reset() {
    this.count = this.cursor = 0;
  }
  summary() {
    const samples = Array.from(this.values.subarray(0, this.count)).sort((a, b) => a - b);
    const mean = samples.reduce((a, b) => a + b, 0) / (samples.length || 1);
    return {
      samples: samples.length,
      fps: mean ? 1000 / mean : 0,
      averageMs: mean,
      stddevMs: Math.sqrt(samples.reduce((n, x) => n + (x - mean) ** 2, 0) / (samples.length || 1)),
      p95Ms: samples[Math.max(0, Math.ceil(samples.length * 0.95) - 1)] ?? 0,
      maxMs: samples.at(-1) ?? 0,
      over33Ms: samples.filter((x) => x > 33.33).length,
    };
  }
}
export const BALL_SCALES = [1, 1.25, 1.5, 1.75, 2.25] as const;
export function validBallScale(value: number) {
  return BALL_SCALES.some((x) => x === value);
}
export function projectedDiameter(diameter: number, depth: number, fov: number, pixels: number) {
  return depth > 0 ? (diameter * pixels) / (2 * depth * Math.tan((fov * Math.PI) / 360)) : 0;
}
export interface AssetTiming {
  path: string;
  status: 'loading' | 'ready' | 'error';
  startMs: number;
  durationMs?: number;
  error?: string;
}
export const assetTimings: AssetTiming[] = [];
