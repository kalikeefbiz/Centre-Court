import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Match, FIXED_DT, idleControls } from '../src/core/match';
import { ShotGesture, type ShotIntent } from '../src/core/shot-gesture';
import { vec } from '../src/core/court';
import { Ball } from '../src/core/ball';
import {
  STRIKE,
  sweptContact,
  sampleRig,
  racketPosition,
  type StrokeAction,
} from '../src/core/stroke';
import { inContactZone } from '../src/core/hitting';
import { ANIMATIONS } from '../src/render/animation-registry';

// Identical post-bounce incoming states, player positions and release times.
// Flight, predicted target, assistance, swept contact and launch use real Match/Ball.
function attempt(x: number, height: number, speed: number, intent: ShotIntent, incoming?: Ball) {
  const m = new Match();
  m.start('normal', 'short');
  m.phase = 'rally';
  m.lastHitter = 1;
  m.bounces = 1;
  m.repositionPlayer(0, vec(0, 0, 10.5));
  m.ball.active = true;
  m.ball.velocity = vec(0.8, -1, speed);
  m.ball.spin = vec(120, 0, 0);
  m.ball.position = vec(
    x - 0.8 * STRIKE.lead,
    height + STRIKE.lead + 4.905 * STRIKE.lead ** 2,
    9.95 - speed * STRIKE.lead,
  );
  if (incoming) {
    m.ball.copyFrom(incoming);
    const future = incoming.clone();
    for (let i = 0; i < Math.ceil(STRIKE.lead * 120); i++) future.step(FIXED_DT);
    m.repositionPlayer(0, vec(future.position.x - x, 0, future.position.z + 0.55));
  }
  const g = new ShotGesture();
  if (intent === 'lob') {
    g.down(1);
    g.up(1.03);
    g.down(1.07);
    g.up(1.1);
  } else {
    g.down(1, 0, 0, 'keyboard', intent);
    g.up(1.1);
  }
  const commands = g.drain();
  m.tick(FIXED_DT, { ...idleControls(), gestures: commands });
  const a = m.players[0].action;
  let selected = a?.stroke,
    target = a?.target,
    warp = a?.warp;
  let accepted = !!a;
  let start = accepted ? FIXED_DT : 0;
  const plan = (a: StrokeAction) => {
    const p = { ...m.players[0].position },
      v = m.players[0].locomotion.velocity;
    p.x += v.x * a.contactAt;
    p.z += v.z * a.contactAt;
    return {
      racket: racketPosition(
        { ...a, age: a.contactAt, clipTime: ANIMATIONS[a.stroke].contact },
        p,
        0,
        vec(),
      ),
      ball: { ...a.target },
    };
  };
  let expectedContact = a ? plan(a) : null;
  let min = Infinity,
    nearest = Infinity,
    atMarker: unknown = null,
    allowed = false;
  for (let tick = 1; tick < 65 && !m.contacts; tick++) {
    const old = { ...m.ball.position };
    m.tick(FIXED_DT, idleControls());
    const a = m.players[0].action;
    if (!a) continue;
    if (!accepted) {
      accepted = true;
      start = (tick + 1) * FIXED_DT;
      selected = a.stroke;
      target = a.target;
      warp = a.warp;
      expectedContact = plan(a);
    }
    if (Math.abs(a.age - a.contactAt) < nearest) {
      nearest = Math.abs(a.age - a.contactAt);
      atMarker = { age: a.age, racket: { ...a.racket }, ball: { ...m.ball.position } };
    }
    if (a.phase === 'contact') {
      min = Math.min(min, sweptContact(a, old, m.ball.position));
      allowed ||= inContactZone(
        {
          player: m.players[0].position,
          ball: m.ball.position,
          velocity: m.ball.velocity,
          side: 0,
          bounces: m.bounces,
          intent,
        },
        a.stroke,
      );
    }
    if (a.missed) break;
  }
  return {
    x,
    height,
    speed,
    intent,
    recognized: commands.at(-1)?.shot === intent,
    accepted,
    selected,
    start,
    marker: ANIMATIONS[selected ?? 'Lob'].contactFrame,
    target,
    warp,
    expectedContact,
    observedApproach: atMarker,
    min: Number.isFinite(min) ? min : null,
    allowed,
    reason: m.contacts
      ? 'contact'
      : !accepted
        ? 'outside predicted contact zone'
        : !allowed
          ? 'outside live contact zone'
          : min > STRIKE.forgiveness
            ? 'racket sweep beyond forgiveness'
            : 'timing',
    hit: m.contacts === 1,
    miss: m.timing,
    launch: m.ball.shot,
    vy: m.ball.velocity.y,
  };
}
it('compares lob, slice and drive against the same baseline incoming trajectories', () => {
  const rows: ReturnType<typeof attempt>[] = [];
  for (const x of [-0.8, -0.5, -0.25, 0.25, 0.5, 0.8])
    for (const h of [0.45, 0.75, 1.1, 1.5, 1.85])
      for (const speed of [9, 14, 20])
        for (const intent of ['drive', 'slice', 'lob'] as const)
          rows.push(attempt(x, h, speed, intent));
  const totals = Object.fromEntries(
    ['drive', 'slice', 'lob'].map((intent) => [
      intent,
      {
        recognized: rows.filter((r) => r.intent === intent && r.recognized).length,
        accepted: rows.filter((r) => r.intent === intent && r.accepted).length,
        hit: rows.filter((r) => r.intent === intent && r.hit).length,
        total: 90,
      },
    ]),
  );
  const groups = Object.fromEntries(
    ['low', 'waist', 'high', 'forehand', 'backhand'].map((group) => [
      group,
      Object.fromEntries(
        ['drive', 'slice', 'lob'].map((intent) => [
          intent,
          rows.filter(
            (r) =>
              r.intent === intent &&
              (group === 'low'
                ? r.height <= 0.75
                : group === 'waist'
                  ? r.height === 1.1
                  : group === 'high'
                    ? r.height >= 1.5
                    : group === 'forehand'
                      ? r.x > 0
                      : r.x < 0) &&
              r.hit,
          ).length,
        ]),
      ),
    ]),
  );
  console.log(
    'MATCHED_CONTACTS',
    JSON.stringify({
      totals,
      groups,
      lobMarker: sampleRig('Lob', ANIMATIONS.Lob.contact, vec()),
      miss: rows.find((r) => r.intent === 'lob' && r.height === 0.75 && !r.hit),
    }),
  );
  if (process.env.CC_LOB_OUTPUT)
    writeFileSync(process.env.CC_LOB_OUTPUT, JSON.stringify({ totals, groups, rows }, null, 2));
  expect(totals.drive.hit).toBeGreaterThan(50);
  expect(rows.filter((r) => r.intent === 'lob').every((r) => r.recognized)).toBe(true);
  expect(totals.lob.accepted).toBe(totals.drive.accepted);
  const comparable = rows.filter(
    (r) =>
      r.intent === 'lob' &&
      rows.some(
        (c) =>
          c.intent !== 'lob' &&
          c.x === r.x &&
          c.height === r.height &&
          c.speed === r.speed &&
          c.hit,
      ),
  );
  expect(comparable.every((r) => r.hit)).toBe(true);
});

it('uses the original first upward lob scoop and excludes the later overhead action', () => {
  const marker = sampleRig('Lob', ANIMATIONS.Lob.contact, vec());
  expect(marker.y).toBeGreaterThan(0.9);
  expect(marker.y).toBeLessThan(1.3);
  expect(marker.z).toBeLessThan(-0.5);
  expect(sampleRig('Lob', ANIMATIONS.Lob.contact - 0.02, vec()).y).toBeLessThan(marker.y);
  expect(ANIMATIONS.Lob.end).toBeLessThan(33 / 30);
  expect(sampleRig('Lob', 37 / 30, vec()).y).toBeGreaterThan(2);
  expect(STRIKE.forgiveness).toBe(0.46);
  expect(STRIKE.maxWarp).toBe(0.95);
});

it('returns full-court drive, slice and lob feeds with the same contact rules', () => {
  let compared = 0;
  for (const incoming of ['drive', 'slice', 'lob'] as const) {
    const ball = new Ball();
    ball.position = vec(0, 1.3, -9);
    ball.launch(vec(0, 0.0335, 8.8), incoming, 0.6);
    let bounces = 0;
    const selected = new Set<string>();
    for (let i = 0; i < 600 && bounces < 2; i++) {
      const events = ball.step(FIXED_DT);
      bounces += events.filter((e) => e.type === 'bounce').length;
      if (events.some((e) => e.type === 'net' && !e.grazing)) break;
      if (bounces !== 1) continue;
      const future = ball.clone();
      for (let j = 0; j < 16; j++) future.step(FIXED_DT);
      if (
        future.position.y < 0.7 ||
        future.position.y > 1.7 ||
        future.position.z < 9 ||
        future.position.z > 14
      )
        continue;
      const branch = future.velocity.y > 0 ? 'rising' : 'falling';
      if (selected.has(branch)) continue;
      selected.add(branch);
      for (const x of [-0.5, 0.5]) {
        const rows = (['drive', 'slice', 'lob'] as const).map((intent) =>
          attempt(x, future.position.y, ball.velocity.z, intent, ball),
        );
        expect(
          rows.every((r) => r.recognized && r.accepted && r.hit),
          JSON.stringify(rows),
        ).toBe(true);
        compared++;
      }
    }
    expect(selected.size).toBeGreaterThan(0);
  }
  console.log('FULL_COURT_MATCHED_SCENARIOS', compared);
  expect(compared).toBeGreaterThanOrEqual(6);
});

it('recognizes live double taps, cancels provisional slice and launches a distinct lob arc', () => {
  for (const x of [-0.5, 0.5])
    for (const height of [0.45, 1.1, 1.8]) {
      const m = new Match();
      m.start('normal', 'short');
      m.phase = 'rally';
      m.lastHitter = 1;
      m.bounces = 1;
      m.repositionPlayer(0, vec(0, 0, 10.5));
      const lead = 0.1 + STRIKE.lead;
      m.ball.active = true;
      m.ball.position = vec(x, height + lead + 4.905 * lead ** 2, 9.95 - 12 * lead);
      m.ball.velocity = vec(0, -1, 12);
      const g = new ShotGesture();
      const kinds: string[] = [];
      let prepared = false;
      for (let i = 0; i < 70 && !m.contacts; i++) {
        const time = 1 + i * FIXED_DT;
        if (i === 0 || i === 8) g.down(time, 300, 600);
        if (i === 4 || i === 12) g.up(time);
        g.update(time);
        const commands = g.drain();
        kinds.push(...commands.map((c) => c.kind));
        m.tick(FIXED_DT, { ...idleControls(), gestures: commands });
        if (i < 12) expect(m.contacts).toBe(0);
        if (i >= 12 && m.players[0].action) {
          expect(m.players[0].action?.stroke).toBe('Lob');
          prepared = true;
        }
      }
      expect(kinds).toEqual(['provisional', 'cancel', 'commit']);
      expect(prepared).toBe(true);
      expect(m.contacts).toBe(1);
      expect(m.players[0].contact?.stroke).toBe('Lob');
      expect(Math.abs(m.players[0].contact!.timing)).toBeLessThanOrEqual(STRIKE.window + FIXED_DT);
      expect(m.ball.shot).toBe('lob');
      expect(m.ball.velocity.y).toBeGreaterThan(6);
      const flight = m.ball.clone();
      let peak = flight.position.y,
        landed = false;
      for (let i = 0; i < 500 && !landed; i++) {
        const events = flight.step(FIXED_DT);
        peak = Math.max(peak, flight.position.y);
        if (events.some((e) => e.type === 'bounce')) {
          landed = true;
          expect(flight.position.z).toBeLessThan(0);
        }
        expect(events.some((e) => e.type === 'net' && !e.grazing)).toBe(false);
      }
      expect(landed).toBe(true);
      expect(peak).toBeGreaterThan(4);
    }
});

it('retains genuine misses for unreachable, low and late lobs', () => {
  expect(attempt(3, 1.1, 14, 'lob').hit).toBe(false);
  expect(attempt(0, 3, 14, 'lob').hit).toBe(false);
  expect(attempt(0, 0.1, 14, 'lob').hit).toBe(false);
  const late = new Ball();
  late.active = true;
  late.position = vec(0, 1.1, 11.4);
  late.velocity = vec(0, -1, 14);
  // This ball is already behind the fixed baseline athlete; do not reposition to it.
  const m = new Match();
  m.start('normal', 'short');
  m.phase = 'rally';
  m.lastHitter = 1;
  m.bounces = 1;
  m.repositionPlayer(0, vec(0, 0, 10.5));
  m.ball.copyFrom(late);
  for (let i = 0; i < 60; i++)
    m.tick(FIXED_DT, { ...idleControls(), release: i === 0, shot: 'lob' });
  expect(m.contacts).toBe(0);
});
