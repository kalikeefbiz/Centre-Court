import { CHARACTER_IDS, type CharacterId } from '../core/roster';

export type EquipmentVector = readonly [number, number, number];
export type EquipmentRotation = readonly [number, number, number, number];

/** Character-local fit adjustments belong to the socket, never the contact solver. */
export interface RacketSocketCorrection {
  position?: EquipmentVector;
  rotation?: EquipmentRotation;
}

export interface RacketDefinition {
  id: string;
  name: string;
  description: string;
  assetPath: string;
  /** All points below are in the supplied GLB's coordinates before attachment. */
  gripOrigin: EquipmentVector;
  handleAxis: EquipmentVector;
  faceNormal: EquipmentVector;
  sweetSpot: EquipmentVector;
  /** Source-to-metre conversion; attachment normalizes grip-to-head distance. */
  visualScale: number;
  material: { preserveSource: true; textureAnisotropy: number };
  characterCorrections?: Partial<Record<CharacterId, RacketSocketCorrection>>;
}

export const DEFAULT_RACKET_ID = 'pink-black';
export const EQUIPMENT_SAVE_KEY = 'centre-court-equipment-v1';

/** The established Kira socket is the reference for every cosmetic racket.
 * .28 + .72 * .22 = .4384 metres. This never changes Match's swept envelope,
 * rig-motion.json, stroke markers, ball physics, signature effects or save data.
 */
export const CANONICAL_RACKET_SWEET_SPOT: EquipmentVector = [0, 0.4384, 0];

/** One distinct model is supplied. Add verified source models as data here;
 * a texture recolour must not be presented as another supplied racket model.
 */
export const RACKETS: readonly RacketDefinition[] = [
  {
    id: DEFAULT_RACKET_ID,
    name: 'Pink / Black',
    description: 'The original Centre Court racket. Cosmetic equipment; gameplay stays the same.',
    assetPath: 'assets/equipment/rackets/Meshy_AI_Pink_and_Black_Tennis_1024095819_texture.glb',
    // Existing production attachment reference, preserved from translation/scale.
    gripOrigin: [0, -0.28 / 0.72, 0],
    handleAxis: [0, 1, 0],
    faceNormal: [0, 0, 1],
    sweetSpot: [0, 0.22, 0],
    visualScale: 0.72,
    material: { preserveSource: true, textureAnisotropy: 4 },
  },
];

export function isRacketId(value: unknown): value is string {
  return typeof value === 'string' && RACKETS.some((racket) => racket.id === value);
}

export function getRacket(value: unknown = DEFAULT_RACKET_ID): RacketDefinition {
  return RACKETS.find((racket) => racket.id === value) ?? RACKETS[0];
}

const dot = (a: EquipmentVector, b: EquipmentVector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: EquipmentVector, b: EquipmentVector): EquipmentVector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function unit(v: EquipmentVector): EquipmentVector {
  const length = Math.hypot(...v);
  if (!Number.isFinite(length) || length < 1e-8)
    throw new Error('Racket attachment needs finite, nonzero grip axes.');
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** Convert an orthonormal source basis to the standard +Y handle / +Z face.
 * The rows of this source-to-standard rotation are the source basis vectors.
 */
function basisRotation(x: EquipmentVector, y: EquipmentVector, z: EquipmentVector) {
  const m00 = x[0],
    m01 = x[1],
    m02 = x[2];
  const m10 = y[0],
    m11 = y[1],
    m12 = y[2];
  const m20 = z[0],
    m21 = z[1],
    m22 = z[2];
  let qx: number, qy: number, qz: number, qw: number;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    qw = s / 4;
    qx = (m21 - m12) / s;
    qy = (m02 - m20) / s;
    qz = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    qw = (m21 - m12) / s;
    qx = s / 4;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = s / 4;
    qz = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = s / 4;
  }
  return [qx, qy, qz, qw] as const;
}

export interface RacketAttachment {
  position: EquipmentVector;
  rotation: EquipmentRotation;
  scale: number;
  gripOrigin: EquipmentVector;
  sweetSpot: EquipmentVector;
  canonicalSweetSpot: EquipmentVector;
  normalization: number;
  socketCorrection?: RacketSocketCorrection;
}

/** Geometry → canonical grip → character socket → skeleton. No engine objects,
 * skin/animation reloads or gameplay state are involved. Uniform normalization
 * keeps a future model's visual sweet spot on the established reference point.
 */
export function racketAttachment(
  racket: RacketDefinition = getRacket(),
  character?: CharacterId,
): RacketAttachment {
  if (!Number.isFinite(racket.visualScale) || racket.visualScale <= 0)
    throw new Error('Racket visual scale must be positive and finite.');
  if (![...racket.gripOrigin, ...racket.sweetSpot].every(Number.isFinite))
    throw new Error('Racket grip and sweet spot must be finite.');
  const y = unit(racket.handleAxis);
  const x = unit(cross(y, racket.faceNormal));
  const z = unit(cross(x, y));
  const relative: EquipmentVector = [
    racket.sweetSpot[0] - racket.gripOrigin[0],
    racket.sweetSpot[1] - racket.gripOrigin[1],
    racket.sweetSpot[2] - racket.gripOrigin[2],
  ];
  const along = dot(relative, y);
  if (along <= 1e-8 || Math.hypot(dot(relative, x), dot(relative, z)) > 1e-5)
    throw new Error('Racket sweet spot must lie forward along its declared handle axis.');
  const normalization = CANONICAL_RACKET_SWEET_SPOT[1] / (along * racket.visualScale);
  const scale = racket.visualScale * normalization;
  const rotate = (v: EquipmentVector): EquipmentVector => [dot(x, v), dot(y, v), dot(z, v)];
  const grip = rotate(racket.gripOrigin);
  return {
    position: [-grip[0] * scale, -grip[1] * scale, -grip[2] * scale],
    rotation: basisRotation(x, y, z),
    scale,
    gripOrigin: racket.gripOrigin,
    sweetSpot: racket.sweetSpot,
    canonicalSweetSpot: CANONICAL_RACKET_SWEET_SPOT,
    normalization,
    socketCorrection: character ? racket.characterCorrections?.[character] : undefined,
  };
}

interface EquipmentSave {
  version: 1;
  rackets: Partial<Record<CharacterId, string>>;
}
type EquipmentStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Equipment has its own small save so choosing cosmetics cannot reset or
 * migrate the established Court Circuit/progression save. Storage may be denied.
 */
export class EquipmentSelection {
  private save: EquipmentSave = { version: 1, rackets: {} };
  persistent: boolean;
  constructor(private storage?: EquipmentStorage) {
    this.persistent = !!storage;
    try {
      const raw = storage?.getItem(EQUIPMENT_SAVE_KEY);
      if (!raw) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== 'object') return;
      const candidate = parsed as Partial<EquipmentSave>;
      if (candidate.version !== 1 || !candidate.rackets || typeof candidate.rackets !== 'object')
        return;
      for (const character of CHARACTER_IDS) {
        const choice = candidate.rackets[character];
        if (isRacketId(choice)) this.save.rackets[character] = choice;
      }
    } catch {
      this.persistent = false;
    }
  }
  selected(character: CharacterId) {
    return getRacket(this.save.rackets[character]).id;
  }
  choose(character: CharacterId, racket: string): boolean {
    if (!CHARACTER_IDS.includes(character) || !isRacketId(racket)) return false;
    this.save.rackets[character] = racket;
    try {
      this.storage?.setItem(EQUIPMENT_SAVE_KEY, JSON.stringify(this.save));
    } catch {
      this.persistent = false;
    }
    return true;
  }
  snapshot(): EquipmentSave {
    return { version: 1, rackets: { ...this.save.rackets } };
  }
}
