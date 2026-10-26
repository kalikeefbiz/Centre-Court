import { describe, it, expect } from 'vitest';
import { Ball } from '../src/core/ball';
import { feedAI } from '../src/dev/ai-feeds';
import { COURT, Random, validServe, vec } from '../src/core/court';
import { inContactZone } from '../src/core/hitting';
import {
  OpponentAI,
  planInterception,
  PRESETS,
  AI_LOCOMOTION,
  recoveryTarget,
  selectTactic,
  shotErrorProbability,
  chooseServe,
  type TacticalContext,
} from '../src/core/ai';
import { stepLocomotion } from '../src/core/locomotion';
import { Match, FIXED_DT, idleControls } from '../src/core/match';
const incoming = (x = 0, z = -9, shot: 'drive' | 'slice' | 'lob' = 'drive') => {
  const b = new Ball();
  b.position = vec(0, 1.2, 9);
  b.launch(vec(x, COURT.radius, z), shot, 0.65);
  return b;
};
const context = (changes: Partial<TacticalContext> = {}): TacticalContext => ({
  ball: vec(2, 1.3, -8),
  velocity: vec(0, -2, -17),
  player: vec(2, 0, -9),
  opponent: vec(3, 0, 11),
  bounces: 1,
  quality: 0.95,
  difficulty: 'hard',
  ...changes,
});
describe('authoritative trajectory and interception', () => {
  it.each(['drive', 'slice', 'lob'] as const)(
    'predicts %s bounce position and time without touching the live ball',
    (shot) => {
      const b = incoming(2, -9, shot),
        before = JSON.stringify(b),
        p = planInterception(b, vec(0, 0, -10), 5.4, false);
      expect(JSON.stringify(b)).toBe(before);
      const copy = b.clone();
      let bounce: any,
        t = 0;
      while (!bounce && t < 4) {
        t += FIXED_DT;
        bounce = copy.step(FIXED_DT).find((e) => e.type === 'bounce');
      }
      expect(p.bounce!.x).toBeCloseTo(bounce.position.x, 6);
      expect(p.bounce!.z).toBeCloseTo(bounce.position.z, 6);
      expect(p.bounceTime).toBeCloseTo(t, 6);
    },
  );
  it('recognizes reachable neutral balls and unreachable wide fast balls', () => {
    expect(planInterception(incoming(), vec(0, 0, -10), 5.4, false).reachable).toBe(true);
    const b = incoming();
    b.position = vec(-4, 0.9, -10);
    b.velocity = vec(-7, -2, -23);
    expect(planInterception(b, vec(5, 0, -10), 6.2, false, 1).reachable).toBe(false);
  });
  it('never proposes a contact through a dead net or after the second bounce', () => {
    const b = incoming();
    b.position = vec(0, 0.4, 0.1);
    b.velocity = vec(0, 0, -30);
    expect(planInterception(b, vec(0, 0, -2), 6.2, false).reachable).toBe(false);
    const bounced = incoming();
    bounced.position = vec(0, 0.05, -8);
    bounced.velocity = vec(0, -3, -2);
    expect(planInterception(bounced, vec(0, 0, -9), 6.2, false, 1).reachable).toBe(false);
  });
  it('bounds legal movement targets over seeded wide/deep trajectories', () => {
    const r = new Random(77);
    for (let i = 0; i < 200; i++) {
      const p = planInterception(
        incoming(r.range(-9, 9), r.range(-15, -3)),
        vec(r.range(-6, 6), 0, -11),
        5.4,
        false,
      );
      expect(Math.abs(p.target.x)).toBeLessThanOrEqual(6.7);
      expect(p.target.z).toBeLessThanOrEqual(-0.65);
      expect(p.target.z).toBeGreaterThanOrEqual(-15.3);
      if (p.contact)
        expect(
          inContactZone({
            player: p.target,
            ball: p.contact,
            velocity: vec(0, -1, 0),
            side: 1,
            bounces: 1,
            intent: 'drive',
          }),
        ).toBe(true);
    }
  });
  it('requires a serve bounce before the contact window', () => {
    const b = new Ball();
    b.launch(vec(-2, COURT.radius, -4), 'serve', 0.65);
    const p = planInterception(b, vec(-1, 0, -10.4), 5.4, true);
    expect(p.reachable).toBe(true);
    expect(p.time).toBeGreaterThan(p.bounceTime!);
  });
});
describe('tennis tactics and recovery', () => {
  it('uses open court instead of blindly repeating crosscourt', () => {
    const totals = [-3.5, 3.5].map((x) => {
      const r = new Random(99);
      return Array.from({ length: 200 }, () =>
        selectTactic(context({ opponent: vec(x, 0, 11) }), r),
      );
    });
    expect(totals[0].filter((t) => t.aim > 0).length).toBeGreaterThan(130);
    expect(totals[1].filter((t) => t.aim < 0).length).toBeGreaterThan(130);
  });
  it('changes from attacking a short ball to protecting a stretched contact', () => {
    const attack = selectTactic(
      context({ ball: vec(0, 1.3, -4), player: vec(0, 0, -5) }),
      new Random(18),
    );
    const defense = selectTactic(
      context({ ball: vec(6, 0.6, -13), player: vec(6, 0, -14), quality: 0.25 }),
      new Random(18),
    );
    expect(attack.defensive).toBe(false);
    expect(defense.defensive).toBe(true);
    expect(defense.power).toBeLessThan(attack.power);
  });
  it('selects supported lobs against a net opponent and automatic overhead/volley intents', () => {
    expect(selectTactic(context({ opponent: vec(0, 0, 2) }), new Random(4)).shot).toBe('lob');
    expect(
      selectTactic(
        context({ ball: vec(0, 2.3, -3), player: vec(0, 0, -4), bounces: 0 }),
        new Random(4),
      ).name,
    ).toBe('overhead smash');
    expect(
      selectTactic(
        context({ ball: vec(0, 1.4, -3), player: vec(0, 0, -4), bounces: 0 }),
        new Random(4),
      ).name,
    ).toBe('volley');
  });
  it('varies choices reproducibly and never requests unsupported physics', () => {
    const run = () => {
      const r = new Random(42);
      return Array.from({ length: 100 }, () => selectTactic(context(), r));
    };
    expect(run()).toEqual(run());
    expect(new Set(run().map((t) => t.name)).size).toBeGreaterThan(1);
    for (const t of run()) {
      expect(['drive', 'slice', 'lob']).toContain(t.shot);
      expect(t.power).toBeLessThanOrEqual(1);
    }
  });
  it('recovers differently across outgoing angles, defensive play and approaches', () => {
    const p = vec(3, 0, -9),
      o = vec(-2, 0, 10);
    const left = recoveryTarget(p, o, -3, false, false),
      right = recoveryTarget(p, o, 3, false, false);
    expect(left.x).toBeLessThan(right.x);
    expect(left.x).not.toBe(0);
    expect(recoveryTarget(p, o, 3, true, false).z).toBeLessThan(right.z);
    expect(recoveryTarget(p, o, 3, false, true).z).toBeGreaterThan(-5);
  });
  it('makes net approaches contextual and less frequent on Easy', () => {
    const count = (difficulty: 'easy' | 'hard') => {
      const r = new Random(7);
      return Array.from({ length: 500 }, () =>
        selectTactic(context({ difficulty, ball: vec(0, 1.2, -4), player: vec(0, 0, -5) }), r),
      ).filter((t) => t.approach).length;
    };
    expect(count('hard')).toBeGreaterThan(count('easy'));
    expect(count('hard')).toBeLessThan(400);
    expect(
      selectTactic(context({ quality: 0.2, player: vec(6, 0, -14) }), new Random()).approach,
    ).toBe(false);
  });
});
describe('difficulty, serve and fair execution', () => {
  it('separates reaction, perception, commitment, accuracy, errors, aggression and recovery', () => {
    for (const key of [
      'speed',
      'acceleration',
      'confidence',
      'aggression',
      'recovery',
      'variety',
    ] as const)
      expect(PRESETS.easy[key]).toBeLessThan(PRESETS.hard[key]);
    for (const key of ['reaction', 'commitment', 'precision', 'errorChance'] as const)
      expect(PRESETS.easy[key]).toBeGreaterThan(PRESETS.normal[key]);
    expect(PRESETS.hard.speed).toBeLessThan(6.3);
    expect(PRESETS.hard.reaction).toBeGreaterThan(0.1);
  });
  it('increases execution-error probability under pressure without guaranteed misses', () => {
    expect(shotErrorProbability('easy', 0.9, 0.3)).toBeGreaterThan(
      shotErrorProbability('hard', 0.9, 0.3),
    );
    expect(shotErrorProbability('hard', 0.2, 0.8)).toBeGreaterThan(
      shotErrorProbability('hard', 0.9, 0.1),
    );
    const r = new Random(8),
      p = shotErrorProbability('normal', 0.65, 0.4);
    let n = 0;
    for (let i = 0; i < 20000; i++) if (r.next() < p) n++;
    expect(n / 20000).toBeCloseTo(p, 2);
  });
  it('varies legal service targets in both courts using the production serve launch', () => {
    for (const d of ['easy', 'normal', 'hard'] as const)
      for (const deuce of [true, false]) {
        const r = new Random(77),
          targets = new Set<number>();
        let legal = 0;
        for (let i = 0; i < 120; i++) {
          const s = chooseServe(d, deuce, i % 2 === 0, r),
            x = (deuce ? 2 : -2) + s.aim * 1.55;
          const b = new Ball();
          b.position = vec(deuce ? -1.6 : 1.6, 2.6, -12.1);
          b.launch(vec(x, COURT.radius, 4 + s.power * 1.2), 'serve', s.power);
          targets.add(Math.round(x * 10));
          for (let t = 0; t < 300; t++) {
            const bounce = b.step(FIXED_DT).find((e) => e.type === 'bounce');
            if (bounce) {
              if (validServe(bounce.position, 1, deuce)) legal++;
              break;
            }
          }
        }
        expect(legal).toBe(120);
        expect(targets.size).toBe(3);
      }
  });
  it('bounds acceleration and speed through a direction reversal', () => {
    const ai = new OpponentAI(),
      p = vec(0, 0, -10);
    ai.target = vec(6, 0, -10);
    for (let i = 0; i < 300; i++) {
      if (i === 150) ai.target.x = -6;
      const before = { ...ai.velocity };
      ai.steer(p, 'hard');
      stepLocomotion(ai.locomotion, p, 1, AI_LOCOMOTION.hard, FIXED_DT);
      const v = ai.velocity;
      expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(PRESETS.hard.speed + 1e-9);
      expect(Math.hypot(v.x - before.x, v.z - before.z)).toBeLessThanOrEqual(
        AI_LOCOMOTION.hard.reversalBraking * FIXED_DT + 1e-9,
      );
    }
  });
  it('reacts only after ball release, returns a legal serve, recovers, concludes and resets', () => {
    const m = new Match();
    m.start('normal', 'short');
    expect(m.ai.state).toBe('return anticipation');
    const p = { ...m.players[1].position };
    for (let i = 0; i < 30; i++) m.tick(FIXED_DT, idleControls());
    expect(m.players[1].position).toEqual(p);
    m.tick(FIXED_DT, { ...idleControls(), release: true, power: 0.65 });
    const seen = new Set<string>();
    for (let i = 0; i < 700; i++) {
      m.tick(FIXED_DT, idleControls());
      seen.add(m.ai.state);
    }
    expect(seen.has('ball interception')).toBe(true);
    expect(seen.has('shot execution')).toBe(true);
    expect(seen.has('neutral court recovery') || seen.has('defensive recovery')).toBe(true);
    expect(seen.has('point conclusion and reset')).toBe(true);
    expect(m.totalPoints).toBe(1);
    m.start('hard', 'short');
    expect(m.ai.prediction).toBeNull();
    expect(m.ai.velocity.x).toBe(0);
  });
  it('bounds prediction frequency, preserves pause and keeps diagnostic history finite', () => {
    const m = new Match();
    m.start('normal', 'short');
    m.tick(FIXED_DT, { ...idleControls(), release: true });
    for (let i = 0; i < 120; i++) m.tick(FIXED_DT, idleControls());
    expect(m.ai.decisions).toBeLessThanOrEqual(7);
    m.pause();
    const before = m.ai.snapshot('normal', m.initialSeed);
    for (let i = 0; i < 120; i++) m.tick(FIXED_DT, idleControls());
    expect(m.ai.snapshot('normal', m.initialSeed)).toEqual(before);
    expect(m.ai.history.length).toBeLessThanOrEqual(32);
  });
});

describe('developer reproduction and serving lifecycle', () => {
  it('reaches a net approach through a seeded short-ball feed without forcing the action', () => {
    const m = new Match();
    m.start('hard', 'short');
    feedAI(m, 'Short ball', 8);
    const seen = new Set<string>();
    for (let i = 0; i < 360; i++) {
      m.tick(FIXED_DT, idleControls());
      seen.add(m.ai.state);
    }
    expect(seen.has('net approach')).toBe(true);
  });
  it('exposes copied diagnostic values that cannot mutate the opponent', () => {
    const m = new Match();
    m.start('hard', 'short');
    feedAI(m, 'Open court', 1);
    for (let i = 0; i < 60; i++) m.tick(FIXED_DT, idleControls());
    const before = m.ai.snapshot('hard', 1),
      snapshot = m.ai.snapshot('hard', 1);
    snapshot.target.x = 999;
    if (snapshot.prediction) snapshot.prediction.target.x = 999;
    if (snapshot.history.length) snapshot.history[0].state = 'serve execution';
    expect(m.ai.snapshot('hard', 1)).toEqual(before);
  });
  it('prepares and executes an AI serve then recovers while leaving fault handling authoritative', () => {
    const m = new Match();
    m.start('normal', 'short');
    m.score.initialServer = 1;
    m.phase = 'pointOver';
    m.timer = 0;
    m.tick(FIXED_DT, idleControls());
    expect(m.ai.state).toBe('serve preparation');
    for (let i = 0; i < 164; i++) m.tick(FIXED_DT, idleControls());
    expect(m.ai.state).toBe('serve execution');
    expect(m.serveFlight).toBe(true);
    expect(m.contacts).toBe(1);
    for (let i = 0; i < 70; i++) m.tick(FIXED_DT, idleControls());
    expect(m.players[1].position.z).toBeGreaterThan(-12.35);
    expect(m.fault).toBe(0);
  });
});

it('does not let a lob or slice borrow the drive overhead contact window', () => {
  const c = context({
    ball: vec(0, 2.4, -3),
    player: vec(0, 0, -4),
    opponent: vec(0, 0, 1),
    velocity: vec(0, -3, 0),
    bounces: 0,
    quality: 0.2,
  });
  const rng = new Random(77);
  for (let i = 0; i < 500; i++) {
    const tactic = selectTactic(c, rng);
    expect(tactic.shot).toBe('drive');
    expect(
      inContactZone({
        player: c.player,
        ball: c.ball,
        velocity: c.velocity,
        side: 1,
        bounces: 0,
        intent: tactic.shot,
      }),
    ).toBe(true);
  }
});
