import { describe, it, expect } from 'vitest';
import { FixedClock, Match, FIXED_DT, idleControls } from '../src/core/match';
import {
  HumanAnticipation,
  steerInterception,
  type AssistanceMode,
} from '../src/core/anticipation';
import { vec } from '../src/core/court';
import { createLocomotion, HUMAN_LOCOMOTION, stepLocomotion } from '../src/core/locomotion';
import { ANIMATIONS } from '../src/render/animation-registry';
import { MatchSession, type MatchConfig } from '../src/app/match-session';

function incoming() {
  const m = new Match();
  m.start('easy', 'short', true);
  m.assistanceMode = 'off';
  m.phase = 'rally';
  m.lastHitter = 1;
  m.bounces = 1;
  m.repositionPlayer(0, vec(-0.3, 0, 10.5));
  m.ball.active = true;
  m.ball.position = vec(0, 1.4, 7);
  m.ball.velocity = vec(0, 0, 9);
  return m;
}
function prepared() {
  const m = incoming();
  for (let i = 0; i < 22; i++) m.tick(FIXED_DT, idleControls());
  expect(m.anticipation.preparation).not.toBeNull();
  return m;
}
describe('human anticipation has no contact authority', () => {
  it('predicts using real flight without mutating the ball and prepares before input', () => {
    const m = incoming(),
      ball = m.ball.clone();
    m.anticipation.update(FIXED_DT, m.ball, m.players[0].position, vec(), 1, 1, false, true);
    expect(m.ball).toEqual(ball);
    expect(m.anticipation.prediction?.reachable).toBe(true);
    expect(m.anticipation.prediction?.contact?.z).toBeGreaterThan(7);
    expect(m.anticipation.preparation?.stroke).toBe('Forehand');
    for (let i = 0; i < 100; i++) m.tick(FIXED_DT, idleControls());
    expect(m.contacts).toBe(0);
    expect(m.events.some((e) => e.type === 'impact' || e.type === 'signature')).toBe(false);
    expect(m.players[0].action).toBeNull();
  });
  it('retains side selection in the deadband', () => {
    const m = incoming(),
      a = new HumanAnticipation();
    a.update(0.1, m.ball, vec(-0.2, 0, 10.5), vec(), 1, 1, false, true);
    const id = a.preparation?.id;
    for (const x of [0.02, -0.03, 0.1, -0.1]) {
      a.update(0.1, m.ball, vec(x, 0, 10.5), vec(), 1, 1, false, true);
      expect(a.preparation?.stroke).toBe('Forehand');
      expect(a.preparation?.id).toBe(id);
    }
    a.update(0.1, m.ball, vec(0.8, 0, 10.5), vec(), 1, 1, false, true);
    expect(a.preparation?.stroke).toBe('Backhand');
  });
  it('cancels unreachable, outgoing, stopped and unavailable predictions', () => {
    for (const cause of ['unreachable', 'outgoing', 'inactive', 'phase']) {
      const m = prepared();
      if (cause === 'unreachable') m.repositionPlayer(0, vec(6.7, 0, 15));
      if (cause === 'outgoing') m.ball.velocity.z = -9;
      if (cause === 'inactive') m.ball.active = false;
      m.anticipation.invalidate();
      m.anticipation.update(
        0.1,
        m.ball,
        m.players[0].position,
        vec(),
        1,
        1,
        false,
        cause !== 'phase',
      );
      expect(m.anticipation.preparation).toBeNull();
    }
  });
  it('clears pause, point, restart, menu and disposed sessions', () => {
    for (const reset of [
      (m: Match) => m.pause(),
      (m: Match) => m.menu(),
      (m: Match) => m.start('easy', 'short'),
    ]) {
      const m = prepared();
      reset(m);
      expect(m.anticipation.preparation).toBeNull();
      expect(m.anticipation.prediction).toBeNull();
    }
    const m = prepared();
    m.bounces = 1;
    m.ball.position = vec(0, 0.034, 10);
    m.ball.velocity = vec(0, -3, 9);
    m.tick(FIXED_DT, idleControls());
    expect(m.phase).toBe('pointOver');
    expect(m.anticipation.preparation).toBeNull();
    const config = {
      player: 'kira',
      rival: 'rico',
      difficulty: 'easy',
      length: 'short',
      practice: true,
      assistance: 'off',
    } as MatchConfig;
    const session = new MatchSession(config, () => {});
    session.match.anticipation.preparation = {
      id: -2,
      stroke: 'Forehand',
      clipTime: 0.7,
      age: 0.3,
    };
    session.dispose();
    expect(session.match.anticipation.preparation).toBeNull();
    session.advance(1, idleControls());
    expect(session.steps).toBe(0);
  });
  it('continues the prepared source time, marker and racket curve after input', () => {
    const m = prepared();
    for (let i = 0; i < 8; i++) m.tick(FIXED_DT, idleControls());
    let prep = m.anticipation.preparation!;
    let committed = false;
    for (let i = 0; i < 25 && !m.players[0].action; i++) {
      prep = { ...m.anticipation.preparation! };
      m.tick(FIXED_DT, { ...idleControls(), release: true });
    }
    const action = m.players[0].action!;
    expect(action).not.toBeNull();
    expect(action.prepared).toBe(true);
    expect(action.id).toBe(prep.id);
    expect(action.clipStart).toBeGreaterThanOrEqual(prep.clipTime);
    expect(action.contactAt).toBeLessThan(0.13);
    expect(action.rate * action.contactAt + action.clipStart).toBeCloseTo(
      ANIMATIONS[action.stroke].contact,
      8,
    );
    for (let i = 0; i < 80; i++) {
      m.tick(FIXED_DT, idleControls());
      committed ||= m.lastHitter === 0;
    }
    expect(committed).toBe(true);
  });
  it('keeps deliberate slice/lob trajectories and provisional gesture authority', () => {
    for (const shot of ['slice', 'lob'] as const) {
      const m = prepared();
      for (let i = 0; i < 30 && !m.players[0].action; i++)
        m.tick(FIXED_DT, { ...idleControls(), release: true, shot });
      expect(m.players[0].action?.stroke).toBe(shot === 'lob' ? 'Lob' : 'Slice');
      expect(m.players[0].action?.prepared).toBe(false);
    }
    const m = prepared();
    m.tick(FIXED_DT, {
      ...idleControls(),
      gestures: [
        {
          id: 1,
          sequence: 1,
          kind: 'provisional',
          shot: 'slice',
          delay: 0.16,
          power: 0.45,
          aim: 0,
          depth: 0,
        },
      ],
    });
    for (let i = 0; i < 10; i++) m.tick(FIXED_DT, idleControls());
    expect(m.contacts).toBe(0);
    m.tick(FIXED_DT, {
      ...idleControls(),
      gestures: [
        {
          id: 1,
          sequence: 2,
          kind: 'cancel',
          shot: 'slice',
          delay: 0,
          power: 0.45,
          aim: 0,
          depth: 0,
        },
      ],
    });
    expect(m.players[0].action).toBeNull();
    expect(m.contacts).toBe(0);
  });
  it('does not queue very early input or rescue genuinely late or far balls', () => {
    for (const mode of ['off', 'standard'] as const)
      for (const z of [2, 12]) {
        const m = incoming();
        m.assistanceMode = mode;
        m.ball.position.z = z;
        for (let i = 0; i < 70; i++) m.tick(FIXED_DT, { ...idleControls(), release: i === 0 });
        expect(m.contacts).toBe(0);
      }
  });
});
describe('bounded manual-first interception steering', () => {
  const plan = {
    target: vec(0.8, 0, 9.6),
    contact: vec(0.8, 1, 9),
    time: 0.3,
    bounce: null,
    bounceTime: null,
    reachable: true,
    confidence: 1,
  };
  it('distinguishes all modes and corrects both court dimensions', () => {
    const speeds = [];
    for (const mode of ['off', 'light', 'standard'] as AssistanceMode[]) {
      const s = createLocomotion();
      steerInterception(s, vec(0, 0, 10), 0, 0, plan, mode);
      speeds.push(Math.hypot(s.desiredVelocity.x, s.desiredVelocity.z));
      if (mode === 'standard') {
        expect(s.desiredVelocity.x).toBeGreaterThan(0);
        expect(s.desiredVelocity.z).toBeLessThan(0);
      }
    }
    expect(speeds[0]).toBe(0);
    expect(speeds[2]).toBeGreaterThan(speeds[1]);
  });
  it('preserves opposing/orthogonal input exactly and never chases unreachable shots', () => {
    for (const [x, z] of [
      [-1, 0],
      [0, 1],
      [-0.4, 0.8],
    ]) {
      const s = createLocomotion();
      steerInterception(s, vec(0, 0, 10), x, z, plan, 'standard');
      const manual = createLocomotion();
      steerInterception(manual, vec(0, 0, 10), x, z, plan, 'off');
      expect(s.desiredVelocity).toEqual(manual.desiredVelocity);
    }
    const s = createLocomotion();
    steerInterception(s, vec(), 0, 0, { ...plan, reachable: false }, 'standard');
    expect(s.desiredVelocity).toEqual(vec());
  });
  it('leaves neutral early approach alone, aligns pursuit and respects acceleration/speed', () => {
    const s = createLocomotion(),
      p = vec(0, 0, 10);
    steerInterception(s, p, 0, 0, { ...plan, time: 1 }, 'standard');
    expect(s.desiredVelocity).toEqual(vec());
    steerInterception(s, p, 1, 0, { ...plan, time: 1 }, 'standard');
    expect(s.desiredVelocity.z).toBeLessThan(0);
    for (let i = 0; i < 100; i++) {
      steerInterception(s, p, 0, 0, plan, 'standard');
      const v = { ...s.velocity };
      stepLocomotion(s, p, 0, HUMAN_LOCOMOTION, FIXED_DT);
      expect(Math.hypot(s.velocity.x - v.x, s.velocity.z - v.z)).toBeLessThanOrEqual(
        42 * FIXED_DT + 1e-8,
      );
      expect(s.speed).toBeLessThanOrEqual(3.6 + 1e-8);
    }
  });
});

it('keeps anticipation and assistance deterministic across render schedules', () => {
  const run = (hz: number) => {
    const m = incoming(),
      clock = new FixedClock();
    m.assistanceMode = 'standard';
    let ticks = 0;
    for (let frame = 0; frame < hz; frame++)
      clock.advance(1 / hz, (dt) => {
        m.tick(dt, { ...idleControls(), x: 0.2, release: ticks++ === 32 });
      });
    return {
      ball: m.ball,
      position: m.players[0].position,
      action: m.players[0].action,
      prediction: m.anticipation.prediction,
      preparation: m.anticipation.preparation,
      contacts: m.contacts,
    };
  };
  expect(run(30)).toEqual(run(60));
  expect(run(144)).toEqual(run(60));
});
it('records bounded diagnostic miss reasons without emitting contact events', () => {
  const away = incoming();
  away.assistanceMode = 'standard';
  for (let i = 0; i < 120 && away.phase === 'rally'; i++)
    away.tick(FIXED_DT, { ...idleControls(), x: -1 });
  expect(away.accessibility.lastMiss).toBe('moved-away');
  const far = incoming();
  far.repositionPlayer(0, vec(-6, 0, 15));
  for (let i = 0; i < 120 && far.phase === 'rally'; i++) far.tick(FIXED_DT, idleControls());
  expect(far.accessibility.lastMiss).toBe('too-far');
  expect(far.events.some((e) => e.type === 'impact')).toBe(false);
});

it('keeps a reachable ground contact and preserves manual or necessary retreat', () => {
  const s = createLocomotion(), p = vec(0, 0, 10);
  const plan = {target:vec(0,0,10.05),contact:vec(0,1,9.5),time:0.3,
    bounce:null,bounceTime:null,reachable:true,confidence:1};
  steerInterception(s,p,0,0,plan,'standard');
  expect(s.desiredVelocity).toEqual(vec());
  steerInterception(s,p,0,1,plan,'standard');
  expect(s.desiredVelocity.z).toBeCloseTo(HUMAN_LOCOMOTION.backwardSpeed,8);
  steerInterception(s,p,0,0,{...plan,contact:vec(0,1,10.5),target:vec(0,0,11.05)},'standard');
  expect(s.desiredVelocity.z).toBeGreaterThan(0);
  steerInterception(s,p,0,0,{...plan,contact:vec(0,1,9.75),target:vec(0,0,10.3)},'standard');
  expect(s.desiredVelocity.z).toBeGreaterThan(0);
});
