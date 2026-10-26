import { describe, it, expect } from 'vitest';
import { Ball, BALL_PHYSICS, bounceBall, predict } from '../src/core/ball';
import { COURT, vec } from '../src/core/court';
import { Match, FIXED_DT, idleControls, FixedClock } from '../src/core/match';
import { STRIKE, sampleRig, createStroke, sweptContact } from '../src/core/stroke';
import { movementWeights, shuffleCycle, SHUFFLE_CYCLES } from '../src/render/tennis-animation';
import { createLocomotion } from '../src/core/locomotion';
import * as pc from 'playcanvas';

const firstBounce = (b: Ball) => {
  for (let i = 0; i < 720; i++) {
    const event = b.step(FIXED_DT).find((e) => e.type === 'bounce');
    if (event) return { event, time: (i + 1) * FIXED_DT };
  }
  throw new Error('Missing bounce');
};
describe('drag, spin and court impact in SI units', () => {
  it('quadratic drag slows horizontal flight and is stronger at high speed', () => {
    const speeds = [10, 30].map((speed) => {
      const b = new Ball();
      b.active = true;
      b.position = vec(0, 20, 10);
      b.velocity = vec(speed, 0, 0);
      b.step(0.25);
      return speed - b.velocity.x;
    });
    expect(speeds[0]).toBeGreaterThan(0);
    expect(speeds[1]).toBeGreaterThan(speeds[0] * 4);
  });
  it('topspin dips below flat flight while backspin lifts it', () => {
    const rows = [-180, 0, 180].map((turns) => {
      const b = new Ball();
      b.active = true;
      b.position = vec(0, 2, 10);
      b.velocity = vec(0, 4, -20);
      b.spin.x = -turns;
      b.step(0.5);
      return b.position.y;
    });
    expect(rows[0]).toBeGreaterThan(rows[1]);
    expect(rows[1]).toBeGreaterThan(rows[2]);
    console.log('SPIN_HEIGHTS_AT_0.5S', { slice: rows[0], flat: rows[1], topspin: rows[2] });
  });
  it.each(['drive', 'slice', 'lob', 'volley', 'serve'] as const)(
    'solves and predicts a %s landing with the live integrator',
    (shot) => {
      const b = new Ball();
      b.position = vec(0.5, shot === 'serve' ? 2.175 : 1.2, shot === 'serve' ? 12.4 : 9);
      const target = vec(-1, COURT.radius, shot === 'serve' ? -4.8 : -9);
      b.launch(target, shot, 0.65);
      const before = JSON.stringify(b),
        prediction = predict(b, 4).find((p) => p.bounced);
      expect(JSON.stringify(b)).toBe(before);
      const result = firstBounce(b);
      expect(result.event.position.x).toBeCloseTo(target.x, 1);
      expect(result.event.position.z).toBeCloseTo(target.z, 1);
      expect(prediction!.position.x).toBeCloseTo(result.event.position.x, 8);
      expect(prediction!.position.z).toBeCloseTo(result.event.position.z, 8);
      expect(prediction!.time).toBeCloseTo(result.time, 8);
    },
  );
  it('lobs have a higher physical apex and longer flight than drives', () => {
    const results = ['drive', 'lob'].map((shot) => {
      const b = new Ball();
      b.position = vec(0, 1.1, 10);
      b.launch(vec(0, COURT.radius, -10), shot as 'drive' | 'lob', 0.6);
      return predict(b, 3);
    });
    expect(Math.max(...results[1].map((p) => p.position.y))).toBeGreaterThan(
      Math.max(...results[0].map((p) => p.position.y)) + 1.5,
    );
    expect(results[1].find((p) => p.bounced)!.time).toBeGreaterThan(
      results[0].find((p) => p.bounced)!.time,
    );
  });
  it('couples tangential slip and spin; harder impacts lose more normal energy', () => {
    const speeds = [-315, 0, 315].map((omega) => {
      const v = vec(0, -10, -20),
        w = vec(-omega, 0, 0);
      bounceBall(v, w);
      expect(Number.isFinite(w.x)).toBe(true);
      return -v.z;
    });
    expect(speeds[2]).toBeGreaterThan(speeds[0] + 1);
    const low = vec(0, -5, 0),
      high = vec(0, -20, 0);
    bounceBall(low, vec());
    bounceBall(high, vec());
    expect(high.y / 20).toBeLessThan(low.y / 5);
    expect(high.y).toBeLessThan(20);
    console.log('BOUNCE_HORIZONTAL_SPEEDS', {
      backspin: speeds[0],
      flat: speeds[1],
      topspin: speeds[2],
    });
  });
  it('preserves swept net/tape responses with spin and bounded finite state', () => {
    for (const [height, grazing] of [
      [0.4, false],
      [0.93, true],
    ] as const) {
      const b = new Ball();
      b.active = true;
      b.position = vec(0, height, 0.15);
      b.velocity = vec(0, 0, -45);
      b.spin.x = -180;
      const event = b.step(FIXED_DT).find((e) => e.type === 'net');
      expect(event?.grazing).toBe(grazing);
      expect(Math.abs(b.velocity.z)).toBeLessThan(45);
      expect(b.netTouched).toBe(true);
    }
  });
  it('uses the same 120 Hz integration when given 60 Hz updates', () => {
    const a = new Ball();
    a.position = vec(1, 1.3, 10);
    a.launch(vec(-2, COURT.radius, -10), 'drive', 0.7);
    const b = a.clone();
    for (let i = 0; i < 120; i++) a.step(FIXED_DT);
    for (let i = 0; i < 60; i++) b.step(1 / 60);
    expect(b.position).toEqual(a.position);
    expect(b.velocity).toEqual(a.velocity);
    expect(b.spin).toEqual(a.spin);
    expect(BALL_PHYSICS.mass).toBe(0.057);
  });
});

function feed(x = 0.45, height = 1.15, bounces = 1, intent: 'drive' | 'slice' | 'lob' = 'drive') {
  const m = new Match();
  m.start('normal', 'short');
  m.phase = 'rally';
  m.lastHitter = 1;
  m.bounces = bounces;
  m.repositionPlayer(0, vec(0, 0, 8));
  m.ball.active = true;
  m.ball.velocity = vec(0, -0.5, 12);
  m.ball.position = vec(x, height + 0.15, 7.45 - 12 * STRIKE.lead);
  m.tick(FIXED_DT, { ...idleControls(), release: true, shot: intent, power: 0.65 });
  return m;
}
describe('timed swept racket contact and complete serving', () => {
  it.each([
    ['Forehand', 0.45, 1.15, 1, 'drive'],
    ['Backhand', -0.45, 1.15, 1, 'drive'],
    ['ForehandVolley', 0.5, 1.2, 0, 'drive'],
    ['BackhandVolley', -0.5, 1.2, 0, 'drive'],
    ['Smash', 0.3, 2.25, 0, 'drive'],
    ['Slice', 0.3, 1.15, 1, 'slice'],
    ['Lob', 0.25, 1.25, 1, 'lob'],
  ] as const)(
    'coordinates %s preparation, window, impact and recovery',
    (stroke, x, y, bounces, intent) => {
      const m = feed(x, y, bounces, intent);
      expect(m.contacts).toBe(0);
      expect(m.players[0].action!.stroke).toBe(stroke);
      const id = m.players[0].action!.id;
      for (let i = 0; i < 45 && !m.players[0].contact; i++) m.tick(FIXED_DT, idleControls());
      const contact = m.players[0].contact!;
      expect(contact).not.toBeNull();
      expect(contact.stroke).toBe(stroke);
      expect(Math.abs(contact.timing)).toBeLessThanOrEqual(STRIKE.window + FIXED_DT);
      expect(contact.quality).toBeGreaterThan(0.25);
      expect(m.lastHitter).toBe(0);
      expect(m.players[0].action?.id).toBe(id);
      expect(m.players[0].action?.contacted).toBe(true);
      expect(Math.hypot(m.ball.velocity.x, m.ball.velocity.z)).toBeGreaterThan(8);
      const contacts = m.contacts;
      for (let i = 0; i < 90; i++) m.tick(FIXED_DT, idleControls());
      expect(m.players[0].action).toBeNull();
      expect(m.contacts).toBeGreaterThanOrEqual(contacts);
    },
  );
  it('keeps a shot reachable while the player continues analog movement', () => {
    const m = feed(0.45, 1.15, 1);
    for (let i = 0; i < 30 && !m.players[0].contact; i++)
      m.tick(FIXED_DT, { ...idleControls(), x: 0.4 });
    expect(m.players[0].position.x).toBeGreaterThan(0.02);
    expect(m.players[0].locomotion.velocity.x).toBeGreaterThan(0);
    expect(m.players[0].contact).not.toBeNull();
  });
  it('misses late and unreachable releases instead of granting proximity-only hits', () => {
    const m = feed(4, 1.15, 1);
    for (let i = 0; i < 60; i++) m.tick(FIXED_DT, idleControls());
    expect(m.contacts).toBe(0);
    expect(m.timing).toContain('MISSED');
    const late = feed(0.4, 1.15, 1);
    late.players[0].action = null;
    late.ball.position.z = 8.8;
    for (let i = 0; i < 40; i++) late.tick(FIXED_DT, { ...idleControls(), release: i === 0 });
    expect(late.contacts).toBe(0);
  });
  it('detects a ball/racket crossing between samples rather than mesh intersections', () => {
    const action = createStroke(1, 'Forehand', vec(), 0, vec(), 0.5, 0, 0, 'drive');
    action.previousRacket = vec(-1, 1, 0);
    action.racket = vec(1, 1, 0);
    expect(sweptContact(action, vec(1, 1, 0), vec(-1, 1, 0))).toBe(0);
  });
  it('starts at the palm, detaches into a real toss and launches at the overhead marker', () => {
    const m = new Match();
    m.start('normal', 'short');
    const p = m.players[0].position;
    expect(m.ball.position.y).toBeLessThan(1.3);
    expect(m.ball.active).toBe(false);
    m.tick(FIXED_DT, { ...idleControls(), release: true, power: 0.65 });
    expect(m.phase).toBe('serve');
    expect(m.players[0].contact).toBeNull();
    for (let i = 0; i < 30; i++) m.tick(FIXED_DT, idleControls());
    const action = m.players[0].action!,
      palm = sampleRig('Serve', action.clipTime, vec(), true);
    expect(m.ball.position.y).toBeCloseTo(palm.y, 5);
    m.pause();
    const frozen = JSON.stringify({ action, ball: m.ball });
    for (let i = 0; i < 30; i++) m.tick(FIXED_DT, idleControls());
    expect(JSON.stringify({ action, ball: m.ball })).toBe(frozen);
    m.resume();
    const heights = [];
    while (m.phase === 'serve') {
      m.tick(FIXED_DT, idleControls());
      heights.push(m.ball.position.y);
    }
    expect(Math.max(...heights)).toBeGreaterThan(2.17);
    expect(m.phase).toBe('rally');
    expect(m.serveFlight).toBe(true);
    expect(m.contacts).toBe(1);
    const nominal = sampleRig('Serve', 46 / 30, vec());
    expect(m.players[0].contact!.position).toEqual(
      expect.objectContaining({ y: expect.closeTo(nominal.y, 5) }),
    );
    expect(m.players[0].contact!.position.x).toBeCloseTo(p.x + nominal.x, 5);
  });
  it('keeps the new serve and contact timeline deterministic across rendering schedules', () => {
    const run = (fps: number) => {
      const m = new Match(),
        clock = new FixedClock();
      m.start('normal', 'short');
      let i = 0;
      for (let frame = 0; frame < fps * 3; frame++)
        clock.advance(1 / fps, (dt) =>
          m.tick(dt, { ...idleControls(), release: i++ === 0, power: 0.65 }),
        );
      return {
        ball: m.ball,
        contacts: m.contacts,
        phase: m.phase,
        actions: m.players.map((p) => p.action),
      };
    };
    expect(run(30)).toEqual(run(144));
  });
});
describe('engine-native locomotion blend and derived shuffle loops', () => {
  it('always has finite normalized weights and follows actual velocity during reversals', () => {
    const m = createLocomotion(),
      weights: number[] = [];
    for (const vx of [-6, -0.2, 0, 0.2, 6])
      for (const vz of [-6, 0, 4.6]) {
        m.velocity.x = vx;
        m.velocity.z = vz;
        m.speed = Math.hypot(vx, vz);
        m.reversing = true;
        movementWeights(m, weights, true);
        expect(weights.every(Number.isFinite)).toBe(true);
        expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8);
        if (vx > 0) expect(weights[3]).toBe(0);
        if (vx < 0) expect(weights[4]).toBe(0);
      }
  });
  it('trims only derived tracks and closes position/quaternion endpoints', () => {
    const source = new pc.AnimTrack(
      'source',
      3,
      [new pc.AnimData(1, [0, 1, 2, 3])],
      [new pc.AnimData(3, [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0])],
      [
        new pc.AnimCurve(
          [{ entityPath: ['Hips'], component: 'graph', propertyPath: ['localPosition'] }],
          0,
          0,
          pc.INTERPOLATION_LINEAR,
        ),
      ],
    );
    const cycle = shuffleCycle(source, ...SHUFFLE_CYCLES.ShuffleLeft);
    expect(source.duration).toBe(3);
    expect(cycle.duration).toBeCloseTo(0.6);
    expect(cycle.outputs[0].data.slice(-3)).toEqual(cycle.outputs[0].data.slice(0, 3));
  });
});
