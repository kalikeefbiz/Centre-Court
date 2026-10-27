import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as pc from 'playcanvas';
import {
  CANONICAL_RACKET_SWEET_SPOT,
  DEFAULT_RACKET_ID,
  EQUIPMENT_SAVE_KEY,
  EquipmentSelection,
  RACKETS,
  getRacket,
  isRacketId,
  racketAttachment,
  type RacketDefinition,
} from '../src/render/racket-equipment';
import { AVAILABLE } from '../src/core/roster';
import { SAVE_KEY } from '../src/core/competition';

function memoryStorage() {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
  return { storage, values };
}

describe('GOAL 009 cosmetic equipment persistence', () => {
  it('uses a separate save and round-trips the available athletes without changing progression', () => {
    const { storage, values } = memoryStorage();
    const progression = JSON.stringify({ version: 1, player: 'nova', wins: 4, stage: 2 });
    storage.setItem(SAVE_KEY, progression);
    const equipment = new EquipmentSelection(storage);
    for (const character of AVAILABLE) {
      expect(equipment.selected(character)).toBe(DEFAULT_RACKET_ID);
      expect(equipment.choose(character, DEFAULT_RACKET_ID)).toBe(true);
    }
    const restored = new EquipmentSelection(storage);
    for (const character of AVAILABLE)
      expect(restored.selected(character)).toBe(DEFAULT_RACKET_ID);
    expect(EQUIPMENT_SAVE_KEY).not.toBe(SAVE_KEY);
    expect(values.get(SAVE_KEY)).toBe(progression);
    const saved = JSON.parse(values.get(EQUIPMENT_SAVE_KEY)!);
    expect(saved.version).toBe(1);
    for (const character of AVAILABLE) expect(saved.rackets[character]).toBe(DEFAULT_RACKET_ID);
  });

  it('rejects unavailable cosmetics without mutating the accepted choice or save', () => {
    const { storage, values } = memoryStorage();
    const equipment = new EquipmentSelection(storage);
    equipment.choose('kira', DEFAULT_RACKET_ID);
    const before = values.get(EQUIPMENT_SAVE_KEY);
    expect(equipment.choose('kira', 'unshipped-cosmetic')).toBe(false);
    expect(equipment.selected('kira')).toBe(DEFAULT_RACKET_ID);
    expect(values.get(EQUIPMENT_SAVE_KEY)).toBe(before);
    for (const input of [null, undefined, '', '__proto__', 'unshipped-cosmetic', 3, {}]) {
      expect(isRacketId(input)).toBe(false);
      expect(getRacket(input).id).toBe(DEFAULT_RACKET_ID);
    }
  });

  it('recovers corrupt, future and stale cosmetic data to real shipped equipment', () => {
    for (const value of [
      'malformed',
      'null',
      '[]',
      '{"version":2,"rackets":{"kira":"future-model"}}',
      '{"version":1,"rackets":{"kira":"removed-model","nova":123}}',
      '{"version":1,"rackets":null}',
    ]) {
      const { storage } = memoryStorage();
      storage.setItem(EQUIPMENT_SAVE_KEY, value);
      const equipment = new EquipmentSelection(storage);
      for (const character of AVAILABLE)
        expect(equipment.selected(character)).toBe(DEFAULT_RACKET_ID);
    }
  });

  it('keeps selection usable when local persistence is missing or inaccessible', () => {
    const unavailable = new EquipmentSelection();
    expect(unavailable.persistent).toBe(false);
    expect(unavailable.choose('kira', DEFAULT_RACKET_ID)).toBe(true);
    const { storage } = memoryStorage();
    storage.getItem = () => {
      throw new Error('Storage blocked');
    };
    storage.setItem = () => {
      throw new Error('Storage blocked');
    };
    const blocked = new EquipmentSelection(storage);
    expect(blocked.persistent).toBe(false);
    expect(blocked.choose('nova', DEFAULT_RACKET_ID)).toBe(true);
    expect(blocked.selected('nova')).toBe(DEFAULT_RACKET_ID);
  });
});

describe('GOAL 009 shipped racket catalog', () => {
  it('has unique supported IDs and a real default without invented variants', () => {
    expect(RACKETS.length).toBeGreaterThan(0);
    expect(new Set(RACKETS.map((racket) => racket.id)).size).toBe(RACKETS.length);
    expect(isRacketId(DEFAULT_RACKET_ID)).toBe(true);
    expect(getRacket(DEFAULT_RACKET_ID).id).toBe(DEFAULT_RACKET_ID);
  });

  it('references actual standalone GLB equipment and preserves supplied PBR materials', () => {
    const distinctAssets = new Set<string>();
    for (const racket of RACKETS) {
      expect(existsSync(`public/${racket.assetPath}`), racket.assetPath).toBe(true);
      const bytes = readFileSync(`public/${racket.assetPath}`);
      expect(bytes.toString('ascii', 0, 4)).toBe('glTF');
      const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
      expect(gltf.skins).toBeUndefined();
      expect(gltf.meshes.length).toBeGreaterThan(0);
      expect(gltf.materials.length).toBeGreaterThan(0);
      expect(racket.material.preserveSource).toBe(true);
      expect(racket.material.textureAnisotropy).toBeGreaterThan(0);
      distinctAssets.add(racket.assetPath);
    }
    // Recolours of one source file are not represented as extra supplied models.
    expect(distinctAssets.size).toBe(RACKETS.length);
  });
});

describe('GOAL 009 competitive cosmetic attachment contract', () => {
  const point = (definition: RacketDefinition, source: readonly [number, number, number]) => {
    const fit = racketAttachment(definition);
    const p = new pc.Quat(...fit.rotation).transformVector(new pc.Vec3(...source).mulScalar(fit.scale));
    return p.add(new pc.Vec3(...fit.position));
  };

  it('keeps the production racket geometry transform and canonical sweet spot unchanged', () => {
    const original = getRacket(DEFAULT_RACKET_ID);
    const fit = racketAttachment(original);
    expect(fit.position[0]).toBeCloseTo(0, 12);
    expect(fit.position[1]).toBeCloseTo(0.28, 12);
    expect(fit.position[2]).toBeCloseTo(0, 12);
    expect(fit.scale).toBeCloseTo(0.72, 12);
    expect(fit.rotation).toEqual([0, 0, 0, 1]);
    expect(point(original, original.gripOrigin).length()).toBeLessThan(1e-10);
    expect(
      point(original, original.sweetSpot).distance(new pc.Vec3(...CANONICAL_RACKET_SWEET_SPOT)),
    ).toBeLessThan(1e-10);
  });

  it('normalizes a differently oriented/translated future source without changing competitive reach', () => {
    const future: RacketDefinition = {
      ...getRacket(),
      id: 'test-only-source-frame',
      gripOrigin: [1.3, -0.2, 0.4],
      handleAxis: [1, 0, 0],
      faceNormal: [0, 0, -1],
      sweetSpot: [2.3, -0.2, 0.4],
      visualScale: 0.5,
    };
    const fit = racketAttachment(future);
    expect(point(future, future.gripOrigin).length()).toBeLessThan(1e-10);
    expect(
      point(future, future.sweetSpot).distance(new pc.Vec3(...CANONICAL_RACKET_SWEET_SPOT)),
    ).toBeLessThan(1e-10);
    const axis = new pc.Quat(...fit.rotation).transformVector(new pc.Vec3(...future.handleAxis));
    expect(axis.distance(pc.Vec3.UP)).toBeLessThan(1e-10);
    expect(isRacketId(future.id)).toBe(false); // A test fixture is never a shipped cosmetic.
  });

  it('rejects invalid source frames instead of silently changing the visual contact point', () => {
    for (const patch of [
      { visualScale: 0 },
      { visualScale: NaN },
      { handleAxis: [0, 0, 0] as const },
      { faceNormal: [0, 1, 0] as const },
      { sweetSpot: [0.1, 0.22, 0] as const },
      { gripOrigin: [Infinity, 0, 0] as const },
    ])
      expect(() => racketAttachment({ ...getRacket(), ...patch })).toThrow();
  });
});
