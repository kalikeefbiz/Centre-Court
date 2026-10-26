import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ANIMATIONS } from '../src/render/animation-registry';
import { KIRA, locomotionState } from '../src/render/athlete-config';
import { FIXED_DT, idleControls, Match } from '../src/core/match';

function glb(path: string) {
  const b = readFileSync(`public/${path}`);
  expect(b.toString('ascii', 0, 4)).toBe('glTF');
  expect(b.readUInt32LE(4)).toBe(2);
  expect(b.readUInt32LE(8)).toBe(b.length);
  const json = JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
  return { b, json };
}
describe('authoritative production GLBs', () => {
  it('contains Kira’s updated skeleton, all thirteen clips and embedded PBR textures', () => {
    const { b, json: g } = glb(KIRA.characterUrl);
    expect(createHash('sha256').update(b).digest('hex')).toBe(
      'f55979d3991fc1a2647df1fc63be4751c91a743f7498d37726362ae3468fd2d9',
    );
    expect(g.animations.map((a: any) => a.name).sort()).toEqual(Object.values(KIRA.clips).sort());
    expect(g.skins[0].joints).toHaveLength(74);
    const hand = g.nodes.findIndex((n: any) => n.name === KIRA.hand);
    expect(g.skins[0].joints).toContain(hand);
    for (const a of g.animations) {
      expect(a.channels.some((c: any) => c.target.node === hand)).toBe(true);
      const duration = Math.max(...a.samplers.map((s: any) => g.accessors[s.input].max[0]));
      expect(duration).toBeGreaterThan(0.6);
      const semantic = Object.values(ANIMATIONS).find((x) => x.clip === a.name)!;
      if ('contact' in semantic) expect(duration).toBeGreaterThan(semantic.end);
    }
    expect(g.images).toHaveLength(3);
    expect(g.images.every((i: any) => i.bufferView !== undefined && !i.uri)).toBe(true);
  });
  it('retains the rollback rig, exact animation payloads, bind matrices and hand transforms', () => {
    const { b: oldBytes, json: original } = glb(KIRA.rollbackUrl);
    const { b: newBytes, json: candidate } = glb(KIRA.characterUrl);
    expect(createHash('sha256').update(oldBytes).digest('hex')).toBe(
      'ce2272d87a84bb08be0a765ae35354fac1e505a854b0807ed5cc8323b67a237f',
    );
    expect(candidate.nodes).toEqual(original.nodes);
    expect(candidate.skins).toEqual(original.skins);
    expect(candidate.animations).toEqual(original.animations);
    const references = new Set<number>([original.skins[0].inverseBindMatrices]);
    for (const clip of original.animations)
      for (const sampler of clip.samplers) {
        references.add(sampler.input);
        references.add(sampler.output);
      }
    for (const index of references) {
      expect(candidate.accessors[index]).toEqual(original.accessors[index]);
      const view = original.bufferViews[original.accessors[index].bufferView];
      const newView = candidate.bufferViews[candidate.accessors[index].bufferView];
      const bytes = (b: Buffer, v: any) => {
        const start = 28 + b.readUInt32LE(12) + (v.byteOffset ?? 0);
        return b.subarray(start, start + v.byteLength);
      };
      expect(Buffer.compare(bytes(oldBytes, view), bytes(newBytes, newView))).toBe(0);
    }
  });
  it('keeps the full mid-resolution topology with finite normalized four-influence weights', () => {
    const { b, json: g } = glb(KIRA.characterUrl);
    const p = g.meshes[0].primitives[0];
    expect(g.accessors[p.attributes.POSITION].count).toBe(46890);
    expect(g.accessors[p.indices].count / 3).toBe(30463);
    const a = g.accessors[p.attributes.WEIGHTS_0];
    const v = g.bufferViews[a.bufferView];
    const start = 28 + b.readUInt32LE(12) + v.byteOffset + (a.byteOffset ?? 0);
    let maxError = 0;
    for (let i = 0; i < a.count; i++) {
      let total = 0;
      for (let k = 0; k < 4; k++) {
        const w = b.readFloatLE(start + i * 16 + k * 4);
        if (!Number.isFinite(w) || w < 0) throw new Error(`Invalid skin weight at ${i}`);
        total += w;
      }
      maxError = Math.max(maxError, Math.abs(total - 1));
    }
    expect(maxError).toBeLessThan(0.000001);
  });
  it('ships the unchanged, separately textured racket', () => {
    const { b, json: g } = glb(KIRA.racketUrl);
    expect(createHash('sha256').update(b).digest('hex')).toBe(
      'f1249b32cb61c60e64f4495011326769b5ff87b9a6936b045be6036e14588e88',
    );
    expect(g.meshes).toHaveLength(1);
    expect(g.images).toHaveLength(3);
    expect(g.skins).toBeUndefined();
  });
  it('maps stationary, gentle and full movement to distinct clips', () => {
    expect([0, 1.5, 6.3].map((s) => locomotionState(s))).toEqual(['Idle', 'Walk', 'Run']);
  });
});
describe('presentation contact events preserve gameplay', () => {
  it('emits once after the toss reaches racket height; pauses and resets safely', () => {
    const m = new Match();
    m.start('normal', 'short');
    const origin = { ...m.ball.position };
    m.tick(FIXED_DT, { ...idleControls(), release: true, power: 0.65, aim: 0.5 });
    expect(m.phase).toBe('serve');
    expect(m.players[0].contact).toBeNull();
    for (let i = 0; i < 120 && m.phase === 'serve'; i++) m.tick(FIXED_DT, idleControls());
    expect(m.phase).toBe('rally');
    const event = m.players[0].contact!;
    expect(event.position.y).toBeGreaterThan(origin.y + 1);
    expect(event.position.y).toBeCloseTo(2.17472, 4);
    expect(event.age).toBe(0);
    expect(m.ball.active).toBe(true);
    const velocity = { ...m.ball.velocity };
    m.tick(FIXED_DT, idleControls());
    expect(m.players[0].contact!.id).toBe(event.id);
    expect(event.age).toBeCloseTo(FIXED_DT);
    expect(Math.abs(m.ball.velocity.x)).toBeLessThan(Math.abs(velocity.x));
    m.pause();
    m.tick(1, idleControls());
    expect(event.age).toBeCloseTo(FIXED_DT);
    m.start('easy', 'short');
    expect(m.players[0].contact).toBeNull();
    expect(m.players[0].swing).toBe(0);
    m.tick(FIXED_DT, { ...idleControls(), release: true });
    for (let i = 0; i < 120 && m.phase === 'serve'; i++) m.tick(FIXED_DT, idleControls());
    expect(m.players[0].contact!.id).toBeGreaterThan(event.id);
  });
  it('records a rally return at the ball, without duplicating contacts for a held window', () => {
    const m = new Match();
    m.start('easy', 'short');
    m.phase = 'rally';
    m.lastHitter = 1;
    const p = m.players[0].position;
    m.ball.position = { x: p.x + 0.5, y: 1.15, z: p.z - 0.4 };
    m.ball.active = true;
    const contact = { ...m.ball.position };
    m.tick(FIXED_DT, { ...idleControls(), release: true, shot: 'slice', aim: -0.8, power: 0.7 });
    expect(m.players[0].contact).toBeNull();
    for (let i = 0; i < 30 && !m.players[0].contact; i++) m.tick(FIXED_DT, idleControls());
    expect(m.players[0].contact?.position.x).toBeCloseTo(contact.x, 4);
    expect(m.players[0].contact?.position.z).toBeCloseTo(contact.z, 4);
    expect(m.players[0].contact!.age).toBe(0);
    expect(m.contacts).toBe(1);
    expect(m.lastHitter).toBe(0);
    const id = m.players[0].contact!.id;
    for (let i = 0; i < 10; i++) m.tick(FIXED_DT, idleControls());
    expect(m.contacts).toBe(1);
    expect(m.players[0].contact!.id).toBe(id);
  });
});

describe('GOAL 002C optimized source integrity', () => {
  for (const path of [
    'assets/characters/kira/Meshy_AI_Pink_Valkyrie_All_Animations.glb',
    'assets/balls/royal-rally/Meshy_AI_Royal_Rally_1024220842_texture.glb',
  ])
    it(`preserves nonimage buffers and PBR material design: ${path}`, () => {
      const source = readFileSync(path);
      const { b: runtime, json: g } = glb(path);
      const n = source.readUInt32LE(12),
        original = JSON.parse(source.toString('utf8', 20, 20 + n));
      const raw = source.subarray(28 + n),
        optimized = runtime.subarray(28 + runtime.readUInt32LE(12));
      const images = new Set(original.images.map((i: any) => i.bufferView));
      original.bufferViews.forEach((v: any, i: number) => {
        if (images.has(i)) return;
        const w = g.bufferViews[i];
        expect(
          Buffer.compare(
            raw.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength),
            optimized.subarray(w.byteOffset, w.byteOffset + w.byteLength),
          ),
        ).toBe(0);
      });
      expect(g.materials).toEqual(original.materials);
      expect(g.animations).toEqual(original.animations);
      expect(runtime.length).toBeLessThan(source.length);
    });
});
