import { describe, it, expect } from 'vitest';
import { Competition, ladder, SAVE_KEY } from '../src/core/competition';
import { ROSTER, AVAILABLE } from '../src/core/roster';
import { heatLevel, signatureShot } from '../src/core/signature';
import { Match, idleControls, FIXED_DT } from '../src/core/match';
import { vec, Random } from '../src/core/court';
import { selectTactic, AI_LOCOMOTION } from '../src/core/ai';
import { VOICES } from '../src/platform/court-audio';
describe('roster and circuit', () => {
  it('keeps Jax unavailable and each athlete’s own voice manifest silent without clips', () => {
    expect(ROSTER.jax.available).toBe(false);
    expect(AVAILABLE).toHaveLength(5);
    expect(new Set(Object.values(ROSTER).map((p) => p.signature)).size).toBe(6);
    expect(VOICES.kira).not.toBe(VOICES.zuri);
    for (const manifest of Object.values(VOICES))
      expect(Object.values(manifest).flat()).toEqual([]);
  });
  it('records once, advances the correct rival, survives reload, and restarts', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    };
    const c = new Competition(storage),
      rivals = ladder('kira');
    c.record('loss', 'kira', rivals[0], false, true);
    expect(c.save.stage).toBe(0);
    c.record('loss', 'kira', rivals[0], false, true);
    expect(c.save.losses).toBe(1);
    rivals.forEach((r, i) => c.record(String(i), 'kira', r, true, true));
    expect(c.save.completed).toBe(true);
    expect(new Competition(storage).save).toEqual(c.save);
    c.restart();
    expect(c.save.stage).toBe(0);
    expect(c.save.wins).toBe(0);
    data.set(SAVE_KEY, '{"version":1,"player":"jax"}');
    expect(new Competition(storage).save.player).toBe('kira');
  });
  it('recovers malformed, inaccessible and future saves', () => {
    for (const raw of ['bad', 'null', '{"version":2}', '{"version":1,"player":"kira","stage":999}'])
      expect(new Competition({ getItem: () => raw, setItem: () => {} }).save.stage).toBe(0);
    const c = new Competition({
      getItem: () => {
        throw Error();
      },
      setItem: () => {
        throw Error();
      },
    });
    c.restart();
    expect(c.persistent).toBe(false);
  });
});
describe('authoritative heat and signatures', () => {
  it('uses legal return thresholds, never the serve or elapsed time', () => {
    expect([0, 1, 7, 8, 11, 12, 30].map(heatLevel)).toEqual([0, 0, 0, 1, 1, 2, 2]);
    const m = new Match();
    m.start('normal', 'short');
    m.tick(FIXED_DT, { ...idleControls(), release: true });
    for (let i = 0; i < 150 && m.phase === 'serve'; i++) m.tick(FIXED_DT, idleControls());
    expect(m.returns).toBe(0);
    expect(m.meters).toEqual([0, 0]);
    expect(m.events.filter((e) => e.type === 'impact')).toHaveLength(1);
    m.returns = 15;
    expect(m.heat).toBe(2);
    m.pause();
    expect(m.heat).toBe(0);
  });
  it('does not consume an armed meter on missed input; successful contact consumes exactly once', () => {
    const m = new Match();
    m.start('easy', 'short');
    m.phase = 'rally';
    m.lastHitter = 1;
    m.ball.active = true;
    m.ball.position = { x: 0, y: 4, z: -10 };
    m.meters[0] = 100;
    expect(m.armSignature()).toBe(true);
    m.tick(FIXED_DT, { ...idleControls(), release: true });
    expect(m.meters[0]).toBe(100);
    const p = m.players[0].position;
    m.ball.position = { x: p.x + 0.5, y: 1.15, z: p.z - 0.4 };
    m.ball.velocity = vec();
    m.bounces = 1;
    m.tick(FIXED_DT, { ...idleControls(), release: true, shot: 'slice' });
    for (let i = 0; i < 35 && !m.players[0].contact; i++) m.tick(FIXED_DT, idleControls());
    expect(m.players[0].contact).not.toBeNull();
    expect(m.meters[0]).toBe(0);
    expect(m.events.filter((e) => e.type === 'signature')).toHaveLength(1);
    expect(m.returns).toBe(1);
    m.start('normal', 'short');
    expect(m.meters).toEqual([0, 0]);
  });
  it('bounds all six variations and keeps them distinct', () => {
    const shots = Object.keys(ROSTER).map((id) => {
      const target = vec(1, 0, -9);
      const result = signatureShot(
        id as keyof typeof ROSTER,
        0,
        target,
        0.65,
        'drive',
        vec(2, 0, -10),
        true,
        0.3,
      );
      expect(Math.abs(target.x)).toBeLessThan(4);
      expect(result.power).toBeLessThanOrEqual(1);
      return JSON.stringify({ target, ...result });
    });
    expect(new Set(shots).size).toBe(6);
  });
  it('AI identities change choices without changing difficulty reaction or movement limits', () => {
    const samples = (id: keyof typeof ROSTER) =>
      Array.from({ length: 40 }, (_, i) =>
        selectTactic(
          {
            ball: vec(2, 1, -9),
            velocity: vec(0, 0, -18),
            player: vec(2, 0, -10),
            opponent: vec(3, 0, 10),
            bounces: 1,
            quality: 0.8,
            difficulty: 'normal',
            character: id,
          },
          new Random(i + 1),
        ),
      );
    expect(samples('zuri').reduce((s, t) => s + t.power, 0)).toBeGreaterThan(
      samples('dante').reduce((s, t) => s + t.power, 0),
    );
    expect(samples('nova').map((t) => t.name)).not.toEqual(samples('rico').map((t) => t.name));
    expect(AI_LOCOMOTION.hard.forwardSpeed).toBeLessThanOrEqual(6.3);
  });
});

describe('signature balance in the authoritative ballistic solver', () => {
  it('all variations land legally and allow an ordinary AI interception from a baseline position', async () => {
    const { Ball } = await import('../src/core/ball');
    const { planInterception, PRESETS } = await import('../src/core/ai');
    for (const id of AVAILABLE)
      for (const variation of [0.25, 0.75]) {
        const b = new Ball();
        b.position = vec(0.3, 1.15, 10);
        const target = vec(0, 0, -9);
        const result = signatureShot(id, 0, target, 0.6, 'drive', vec(0, 0, -10), false, variation);
        b.launch(target, result.shot, result.power, 0.85, 16);
        const p = planInterception(
          b,
          vec(0, 0, -10),
          PRESETS.normal.speed,
          false,
          0,
          PRESETS.normal.reaction,
        );
        expect(p.reachable, `${id} variation ${variation}`).toBe(true);
        let bounce: ReturnType<typeof vec> | undefined;
        for (let t = 0; t < 5 && !bounce; t += FIXED_DT)
          for (const e of b.step(FIXED_DT)) if (e.type === 'bounce') bounce = e.position;
        expect(bounce).toBeDefined();
        expect(Math.abs(bounce!.x)).toBeLessThan(4.115);
        expect(bounce!.z).toBeLessThan(0);
        expect(bounce!.z).toBeGreaterThan(-11.885);
      }
  });
});
