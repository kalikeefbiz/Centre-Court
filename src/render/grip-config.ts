import type { CharacterId } from '../core/roster';

export type GripVector = readonly [number, number, number];
export type GripQuaternion = readonly [number, number, number, number];
export interface GripBone {
  name: string;
  position: GripVector;
  rotation: GripQuaternion;
  restRotation: GripQuaternion;
}
export interface GripPatch {
  version: 1;
  character: CharacterId;
  vertexCount: number;
  sourceSha256: string;
  fit: { translation: GripVector; fingerScale: GripVector };
  handFrame: GripQuaternion;
  bones: GripBone[];
  bindings: { name: string; matrix: number[] }[];
  /** Vertex index, four original-skin joint indices, four normalized weights. */
  vertices: number[][];
  /** Optional localized shoulder smoothing, independently measured for Nova. */
  shoulderVertices?: number[][];
}

/** Hand corrections are anatomical calibration, never equipment statistics.
 * The three native skins retain their supplied weights; only the demonstrated
 * Kira/Nova hand-bind failures receive sparse weight corrections.
 */
export const GRIP_PATCH_PATHS: Record<Exclude<CharacterId, 'jax'>, string> = {
  kira: 'assets/characters/grips/kira.json',
  dante: 'assets/characters/grips/dante.json',
  rico: 'assets/characters/grips/rico.json',
  zuri: 'assets/characters/grips/zuri.json',
  nova: 'assets/characters/grips/nova.json',
};

/** Validate data before mutating GPU buffers. An unavailable grip must surface
 * as an asset error rather than silently showing a detached/open hand.
 */
export function validateGripPatch(value: GripPatch, character: CharacterId): void {
  if (value.version !== 1 || value.character !== character || value.vertexCount < 1)
    throw new Error(`Invalid ${character} hand calibration`);
  if (!value.handFrame.every(Number.isFinite) || Math.abs(Math.hypot(...value.handFrame) - 1) > .001)
    throw new Error('Invalid hand grip frame');
  const seen = new Set<number>();
  if (value.shoulderVertices?.length && character !== 'nova')
    throw new Error('Shoulder correction has not been calibrated for this athlete');
  for (const row of [...value.vertices, ...(value.shoulderVertices ?? [])]) {
    const [index, ...values] = row;
    if (row.length !== 9 || !Number.isInteger(index) || index < 0 || index >= value.vertexCount || seen.has(index))
      throw new Error('Invalid grip vertex index');
    seen.add(index);
    if (!values.every(Number.isFinite) || values.slice(0, 4).some((j) => !Number.isInteger(j) || j < 0))
      throw new Error('Invalid grip influences');
    const weights = values.slice(4);
    if (weights.some((w) => w < 0 || w > 1) || Math.abs(weights.reduce((a, b) => a + b, 0) - 1) > .00001)
      throw new Error('Grip weights must be normalized');
  }
  for (const bone of value.bones)
    if (!bone.name.includes('Hand') || [...bone.position, ...bone.rotation].some((v) => !Number.isFinite(v)))
      throw new Error('Grip calibration may only target existing hand joints');
  for (const binding of value.bindings)
    if (!binding.name.includes('Hand') || binding.matrix.length !== 16 || !binding.matrix.every(Number.isFinite))
      throw new Error('Invalid hand inverse bind');
}
