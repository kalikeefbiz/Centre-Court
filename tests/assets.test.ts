import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  it('contains Kira’s original skeleton, all four clips and embedded PBR textures', () => {
    const { b, json: g } = glb(KIRA.characterUrl);
    expect(createHash('sha256').update(b).digest('hex')).toBe(
      '815275554eb626e45cdc0e11f9984165cc6caf18d38a67123cbd3e2b74648858',
    );
    expect(g.animations.map((a: any) => a.name).sort()).toEqual(Object.values(KIRA.clips).sort());
    expect(g.skins[0].joints).toHaveLength(44);
    const hand = g.nodes.findIndex((n: any) => n.name === KIRA.hand);
    expect(g.skins[0].joints).toContain(hand);
    for (const a of g.animations) {
      expect(a.channels.some((c: any) => c.target.node === hand)).toBe(true);
      const duration = Math.max(...a.samplers.map((s: any) => g.accessors[s.input].max[0]));
      expect(duration).toBeGreaterThan(0.6);
      if (a.name === KIRA.clips.Swing) expect(duration).toBeGreaterThan(KIRA.followThroughEnd);
    }
    expect(g.images).toHaveLength(3);
    expect(g.images.every((i: any) => i.bufferView !== undefined && !i.uri)).toBe(true);
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
    expect([0, 1.5, 6.3].map(locomotionState)).toEqual(['Idle', 'Walk', 'Run']);
  });
});
describe('presentation contact events preserve gameplay', () => {
  it('emits once at the actual serve launch, with no added delay; pauses and resets safely', () => {
    const m = new Match();
    m.start('normal', 'short');
    const origin = { ...m.ball.position };
    m.tick(FIXED_DT, { ...idleControls(), release: true, power: 0.65, aim: 0.5 });
    expect(m.phase).toBe('rally');
    const event = m.players[0].contact!;
    expect(event.position).toEqual(origin);
    expect(event.age).toBe(0);
    expect(m.ball.active).toBe(true);
    const velocity = { ...m.ball.velocity };
    m.tick(FIXED_DT, idleControls());
    expect(m.players[0].contact!.id).toBe(event.id);
    expect(event.age).toBeCloseTo(FIXED_DT);
    expect(m.ball.velocity.x).toBeCloseTo(velocity.x);
    m.pause();
    m.tick(1, idleControls());
    expect(event.age).toBeCloseTo(FIXED_DT);
    m.start('easy', 'short');
    expect(m.players[0].contact).toBeNull();
    expect(m.players[0].swing).toBe(0);
    m.tick(FIXED_DT, { ...idleControls(), release: true });
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
    expect(m.players[0].contact?.position).toEqual(contact);
    expect(m.contacts).toBe(1);
    expect(m.lastHitter).toBe(0);
    const id = m.players[0].contact!.id;
    for (let i = 0; i < 10; i++) m.tick(FIXED_DT, idleControls());
    expect(m.contacts).toBe(1);
    expect(m.players[0].contact!.id).toBe(id);
  });
});
