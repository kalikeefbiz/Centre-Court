import { describe, expect, it } from 'vitest';
import { vec, type Side } from '../src/core/court';
import { Match, FixedClock, FIXED_DT, idleControls } from '../src/core/match';
import { OpponentAI, AI_LOCOMOTION, PRESETS } from '../src/core/ai';
import {
  createLocomotion,
  requestMovement,
  stepLocomotion,
  resetLocomotion,
  HUMAN_LOCOMOTION as CONFIG,
  PLAYER_BOUNDS,
  movementTravelDistance,
  type LocomotionConfig,
} from '../src/core/locomotion';

function runner(
  side: Side = 0,
  position = vec(0, 0, 12),
  config: Readonly<LocomotionConfig> = CONFIG,
) {
  const s = createLocomotion();
  return {
    s,
    position,
    step(x: number, z: number, ticks = 1) {
      for (let i = 0; i < ticks; i++) {
        requestMovement(s, x, z, side, config);
        stepLocomotion(s, position, side, config, FIXED_DT);
      }
    },
  };
}
function rally() {
  const m = new Match();
  m.start('normal', 'short');
  m.phase = 'rally';
  m.ball.active = false;
  m.lastHitter = 0; // Disable existing footwork assistance for isolated human checks.
  return m;
}

describe('physical movement and tuning measurements at 120 Hz', () => {
  it('accelerates progressively from rest with a bounded vector acceleration', () => {
    const r = runner();
    r.step(0, -1);
    expect(r.s.speed).toBeCloseTo(CONFIG.acceleration * FIXED_DT);
    expect(r.s.state).toBe('accelerating');
    expect(r.position.z).toBeLessThan(12);
    for (let i = 0; i < 90; i++) {
      const previous = r.s.speed;
      r.step(0, -1);
      expect(r.s.speed).toBeGreaterThanOrEqual(previous);
      expect(r.s.speed - previous).toBeLessThanOrEqual(CONFIG.acceleration * FIXED_DT + 1e-9);
    }
    expect(r.s.speed).toBeCloseTo(CONFIG.forwardSpeed, 10);
  });
  it.each([
    ['forward', 0, -1, CONFIG.forwardSpeed],
    ['backward', 0, 1, CONFIG.backwardSpeed],
    ['lateral', 1, 0, CONFIG.lateralSpeed],
  ] as const)('caps %s speed and stops without residual drift', (_, x, z, speed) => {
    const r = runner(0, vec(0, 0, z > 0 ? 5 : 12));
    r.step(x, z, 120);
    expect(r.s.speed).toBeCloseTo(speed, 10);
    expect(r.s.travelDirection.x).toBeCloseTo(x);
    expect(r.s.travelDirection.z).toBeCloseTo(z);
    const before = { ...r.position };
    r.step(0, 0);
    expect(r.s.braking).toBe(true);
    expect(r.s.speed).toBeGreaterThan(0);
    expect(r.s.speed).toBeLessThan(speed);
    r.step(0, 0, 60);
    const distance = Math.hypot(r.position.x - before.x, r.position.z - before.z);
    expect(distance).toBeCloseTo(
      (speed * speed) / (2 * (x ? CONFIG.lateralBraking! : CONFIG.braking)),
      3,
    );
    expect(r.s.speed).toBe(0);
    expect(r.s.travelDirection).toEqual(vec());
    const stopped = { ...r.position };
    r.step(0, 0, 60);
    expect(r.position).toEqual(stopped);
  });
  it('passes through zero before accelerating in the opposite direction', () => {
    const r = runner();
    r.step(1, 0, 120);
    let previous = r.s.velocity.x,
      sawZero = false,
      ticks = 0;
    do {
      r.step(-1, 0);
      ticks++;
      if (r.s.velocity.x >= 0) {
        expect(r.s.reversing).toBe(true);
        expect(previous - r.s.velocity.x).toBeLessThanOrEqual(
          CONFIG.lateralReversalBraking! * FIXED_DT + 1e-9,
        );
      }
      if (r.s.velocity.x === 0) sawZero = true;
      if (r.s.velocity.x < 0) expect(sawZero).toBe(true);
      previous = r.s.velocity.x;
    } while (r.s.velocity.x > -CONFIG.lateralSpeed && ticks < 120);
    expect(r.s.velocity.x).toBe(-CONFIG.lateralSpeed);
    expect(sawZero).toBe(true);
  });
  it('preserves quarter and half-stick speeds including tiny adjustments', () => {
    for (const magnitude of [0.01, 0.25, 0.5, 1]) {
      const r = runner();
      r.step(magnitude, 0, 120);
      expect(r.s.speed).toBeCloseTo(CONFIG.lateralSpeed * magnitude, 8);
    }
  });
  it('normalizes diagonal input without a speed or acceleration bonus', () => {
    const r = runner();
    r.step(1, -1);
    expect(r.s.speed).toBeLessThanOrEqual(CONFIG.lateralAcceleration! * FIXED_DT + 1e-9);
    r.step(1, -1, 100);
    expect(r.s.speed).toBeLessThan(CONFIG.forwardSpeed);
    expect(r.s.speed).toBeGreaterThan(CONFIG.lateralSpeed);
    const unit = runner();
    unit.step(Math.SQRT1_2, -Math.SQRT1_2, 101);
    expect(unit.s.velocity).toEqual(r.s.velocity);
  });
  it('mirrors forward/backward court orientation for the far athlete', () => {
    const near = runner(0, vec(0, 0, 8)),
      far = runner(1, vec(0, 0, -8));
    near.step(0.5, -0.5, 60);
    far.step(0.5, 0.5, 60);
    expect(near.s.speed).toBe(far.s.speed);
    expect(near.position.x).toBe(far.position.x);
    expect(near.position.z).toBe(-far.position.z);
  });
  it('prints measured tuning from the implemented simulation', () => {
    const r = runner();
    let time99 = 0,
      timeFull = 0;
    for (let i = 1; i <= 120; i++) {
      r.step(0, -1);
      if (!time99 && r.s.speed >= CONFIG.forwardSpeed * 0.99) time99 = i * FIXED_DT;
      if (!timeFull && Math.abs(r.s.speed - CONFIG.forwardSpeed) < 1e-9) timeFull = i * FIXED_DT;
    }
    const fullForward = r.s.speed,
      before = r.position.z;
    let stopTicks = 0;
    while (r.s.speed > 0 && stopTicks < 120) {
      r.step(0, 0);
      stopTicks++;
    }
    const stoppingDistance = before - r.position.z;
    r.step(0, 1, 120);
    const fullBackward = r.s.speed;
    resetLocomotion(r.s);
    r.position.x = 0;
    r.step(1, 0, 120);
    const fullLateral = r.s.speed;
    let toZero = 0,
      toOpposite = 0,
      toFull = 0;
    for (let i = 1; i <= 120 && !toFull; i++) {
      r.step(-1, 0);
      if (!toZero && r.s.velocity.x === 0) toZero = i * FIXED_DT;
      if (!toOpposite && r.s.velocity.x < 0) toOpposite = i * FIXED_DT;
      if (r.s.velocity.x === -CONFIG.lateralSpeed) toFull = i * FIXED_DT;
    }
    console.log(
      'LOCOMOTION_MEASUREMENTS',
      JSON.stringify({
        acceleration: CONFIG.acceleration,
        braking: CONFIG.braking,
        reversalBraking: CONFIG.reversalBraking,
        time99,
        timeFull,
        stoppingDistance,
        stopTime: stopTicks * FIXED_DT,
        reverseToZero: toZero,
        reverseToOpposite: toOpposite,
        reverseToFull: toFull,
        fullForward,
        fullBackward,
        fullLateral,
      }),
    );
    expect(time99).toBeGreaterThan(0.2);
    expect(timeFull).toBeGreaterThan(time99);
    expect(timeFull).toBeLessThan(0.6);
    expect(toZero).toBeGreaterThan(0);
    expect(toFull).toBeLessThan(0.8);
    expect(fullBackward).toBe(CONFIG.backwardSpeed);
    expect(fullLateral).toBe(CONFIG.lateralSpeed);
  });
});

it('measures the lateral tuning against the unchanged GOAL 005 integrator', () => {
  const measure = (config: Readonly<LocomotionConfig>) => {
    const r = runner(0, vec(0, 0, 8), config);
    let time99 = 0,
      timeFull = 0;
    for (let i = 1; i <= 120; i++) {
      r.step(1, 0);
      if (!time99 && r.s.speed >= config.lateralSpeed * 0.99) time99 = i * FIXED_DT;
      if (!timeFull && r.s.speed === config.lateralSpeed) timeFull = i * FIXED_DT;
    }
    const x = r.position.x;
    let stopping = 0;
    while (r.s.speed && stopping < 120) {
      r.step(0, 0);
      stopping++;
    }
    const distance = r.position.x - x;
    resetLocomotion(r.s);
    r.position.x = 0;
    r.step(1, 0, 120);
    let zero = 0,
      opposite = 0,
      full = 0;
    for (let i = 1; i < 120 && !full; i++) {
      r.step(-1, 0);
      if (!zero && r.s.velocity.x === 0) zero = i * FIXED_DT;
      if (!opposite && r.s.velocity.x < 0) opposite = i * FIXED_DT;
      if (r.s.velocity.x === -config.lateralSpeed) full = i * FIXED_DT;
    }
    return { time99, timeFull, stopping: stopping * FIXED_DT, distance, zero, opposite, full };
  };
  const before = measure({
    ...CONFIG,
    lateralAcceleration: undefined,
    lateralBraking: undefined,
    lateralReversalBraking: undefined,
    lateralResponse: undefined,
  });
  const after = measure(CONFIG);
  console.log('LATERAL_BEFORE_AFTER', JSON.stringify({ before, after }));
  expect(after.distance).toBeLessThan(before.distance);
  expect(after.distance).toBeGreaterThan(0.4);
  expect(after.full).toBeLessThan(before.full);
  expect(after.zero).toBeGreaterThan(0.1);
  expect(after.time99).toBeGreaterThan(0.2);
});

describe('court contact', () => {
  it.each([0, 1] as const)(
    'retains every court limit and clears outward velocity on side %s',
    (side) => {
      for (const [x, z] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
      ]) {
        const r = runner(side, vec(0, 0, side === 0 ? 8 : -8));
        r.step(x, z, 600);
        expect(Math.abs(r.position.x)).toBeLessThanOrEqual(PLAYER_BOUNDS.lateral);
        expect(Math.abs(r.position.z)).toBeGreaterThanOrEqual(PLAYER_BOUNDS.net);
        expect(Math.abs(r.position.z)).toBeLessThanOrEqual(PLAYER_BOUNDS.back);
        expect(r.s.speed).toBe(0);
        const pinned = { ...r.position };
        r.step(x, z, 30);
        expect(r.position).toEqual(pinned);
        expect(r.s.desiredVelocity).toEqual(vec());
        r.step(-x, -z);
        expect(r.position).not.toEqual(pinned);
      }
    },
  );
  it('slides along a boundary without transferring blocked speed or drifting sideways', () => {
    const r = runner(0, vec(6.69, 0, 12));
    r.step(1, -1, 60);
    expect(r.position.x).toBe(6.7);
    expect(r.s.velocity.x).toBe(0);
    const tangentialSpeed = Math.abs(r.s.desiredVelocity.z);
    expect(r.s.speed).toBeCloseTo(tangentialSpeed, 2);
    expect(tangentialSpeed).toBeLessThan(CONFIG.forwardSpeed / Math.sqrt(2));
    const before = r.position.x;
    r.step(0, 0, 60);
    expect(r.position.x).toBe(before);
    const headOn = runner(0, vec(6.69, 0, 8));
    headOn.step(1, 0, 120);
    expect(headOn.position.z).toBe(8);
    expect(headOn.s.velocity).toEqual(vec());
  });
});

describe('match lifecycle, controls and shared AI integration', () => {
  it('keeps movement independent of shot preparation, release, power, aim and selection', () => {
    for (const shot of ['drive', 'slice', 'lob'] as const) {
      const a = rally(),
        b = rally();
      for (let i = 0; i < 60; i++) {
        a.tick(FIXED_DT, {
          ...idleControls(),
          x: 0.5,
          shot,
          power: 0.9,
          aim: -0.8,
          release: i === 10,
        });
        b.tick(FIXED_DT, { ...idleControls(), x: 0.5 });
      }
      expect(a.players[0].position).toEqual(b.players[0].position);
      expect(a.players[0].locomotion).toEqual(b.players[0].locomotion);
    }
  });
  it('routes the existing X-only footwork assist through the same velocity integrator', () => {
    const m = rally();
    const p = m.players[0];
    m.lastHitter = 1;
    m.ball.position = vec(p.position.x + 1, 1, p.position.z - 1);
    const z = p.position.z;
    m.tick(FIXED_DT, idleControls());
    expect(p.locomotion.speed).toBeGreaterThan(0);
    expect(p.locomotion.speed).toBeLessThanOrEqual(CONFIG.lateralAcceleration! * FIXED_DT + 1e-9);
    expect(p.locomotion.desiredVelocity.x).toBeCloseTo(1.8, 10);
    expect(p.position.z).toBe(z);
  });
  it('clears velocity, desired motion and flags on reposition, new point, restart and menu', () => {
    const m = rally();
    const move = () => {
      for (let i = 0; i < 30; i++) m.tick(FIXED_DT, { ...idleControls(), x: 1 });
    };
    move();
    expect(m.players[0].locomotion.speed).toBeGreaterThan(0);
    m.repositionPlayer(0, vec(0, 0, 10));
    expect(m.players[0].locomotion).toEqual(createLocomotion());
    move();
    // A real second bounce ends the point and must clear both athletes immediately.
    m.bounces = 1;
    m.ball.active = true;
    m.ball.position = vec(0, 0.04, -9);
    m.ball.velocity = vec(0, -3, 0);
    m.tick(FIXED_DT, idleControls());
    expect(m.phase).toBe('pointOver');
    for (const p of m.players) expect(p.locomotion).toEqual(createLocomotion());
    for (let i = 0; i < 250; i++) m.tick(FIXED_DT, { ...idleControls(), x: 1 });
    expect(m.phase).toBe('serve');
    for (const p of m.players) expect(p.locomotion).toEqual(createLocomotion());
    m.start('hard', 'short');
    for (const p of m.players) expect(p.locomotion).toEqual(createLocomotion());
    m.phase = 'rally';
    move();
    m.menu();
    for (const p of m.players) expect(p.locomotion).toEqual(createLocomotion());
  });
  it.each(['fault', 'let', 'match result'] as const)('clears movement on %s', (transition) => {
    const m = rally();
    for (let i = 0; i < 20; i++) m.tick(FIXED_DT, { ...idleControls(), x: 1 });
    if (transition === 'match result') {
      // One game and three points already won: this second bounce closes a short match.
      for (let i = 0; i < 7; i++) m.score.award(0);
      m.bounces = 1;
    } else {
      m.serveFlight = true;
      m.server = 0;
      m.ball.netTouched = transition === 'let';
    }
    m.ball.active = true;
    m.ball.position = vec(transition === 'fault' ? 6 : -2, 0.04, -4);
    m.ball.velocity = vec(0, -3, 0);
    m.tick(FIXED_DT, idleControls());
    expect(m.phase).toBe(transition === 'match result' ? 'result' : 'pointOver');
    if (transition === 'fault') expect(m.fault).toBe(1);
    if (transition === 'let') expect(m.notice).toContain('LET');
    for (const p of m.players) expect(p.locomotion).toEqual(createLocomotion());
  });
  it('freezes pause with momentum intact and resumes with one ordinary step', () => {
    const m = rally();
    for (let i = 0; i < 20; i++) m.tick(FIXED_DT, { ...idleControls(), x: 1 });
    const before = structuredClone(m.players[0]);
    m.pause();
    for (let i = 0; i < 120; i++) m.tick(FIXED_DT, { ...idleControls(), x: -1 });
    expect(m.players[0]).toEqual(before);
    m.resume();
    m.tick(FIXED_DT, idleControls());
    expect(m.players[0].position.x - before.position.x).toBeLessThan(
      CONFIG.lateralSpeed * FIXED_DT,
    );
    expect(m.players[0].locomotion.braking).toBe(true);
  });
  it.each(['easy', 'normal', 'hard'] as const)(
    'uses one authoritative AI velocity and settles at a target on %s',
    (difficulty) => {
      const ai = new OpponentAI(),
        p = vec(0, 0, -10);
      ai.target = vec(3, 0, -7);
      for (let i = 0; i < 360; i++) {
        const before = { ...ai.velocity };
        ai.steer(p, difficulty);
        expect(ai.velocity).toEqual(before); // Steering must never integrate acceleration.
        stepLocomotion(ai.locomotion, p, 1, AI_LOCOMOTION[difficulty], FIXED_DT);
        expect(ai.locomotion.speed).toBeLessThanOrEqual(PRESETS[difficulty].speed);
      }
      expect(Math.hypot(p.x - ai.target.x, p.z - ai.target.z)).toBeLessThan(0.06);
      expect(ai.locomotion.speed).toBe(0);
      const m = rally();
      expect(m.ai.velocity).toBe(m.players[1].locomotion.velocity);
      for (let i = 0; i < 20; i++) m.tick(FIXED_DT, idleControls());
      expect(m.ai.velocity).toBe(m.players[1].locomotion.velocity);
    },
  );
  it('accounts for opposing momentum and damped acceleration in reach estimates', () => {
    for (const initial of [-6, 0, 3]) {
      const r = runner();
      r.s.velocity.x = initial;
      const before = r.position.x;
      r.step(1, 0, 60);
      const estimate = movementTravelDistance(
        0.5,
        CONFIG.lateralSpeed,
        CONFIG.lateralAcceleration!,
        initial,
        CONFIG.lateralReversalBraking,
        CONFIG.lateralResponse,
        CONFIG.lateralBraking,
      );
      expect(Math.abs(estimate - (r.position.x - before))).toBeLessThan(0.06);
    }
    expect(movementTravelDistance(0.3, 6, 24, -6)).toBeLessThan(
      movementTravelDistance(0.3, 6, 24, 0),
    );
  });
  it('produces identical movement under 30, 60 and 144 Hz render schedules', () => {
    const simulate = (fps: number) => {
      const m = rally(),
        clock = new FixedClock();
      let ticks = 0;
      for (let i = 0; i < fps * 3; i++)
        clock.advance(1 / fps, (dt) => {
          const x = ticks < 50 ? 0.5 : ticks < 100 ? -0.5 : 0;
          const z = ticks >= 150 && ticks < 210 ? -0.3 : 0;
          m.tick(dt, { ...idleControls(), x, z });
          ticks++;
        });
      expect(ticks).toBe(360);
      return m.players.map((p) => ({
        position: p.position,
        locomotion: p.locomotion,
        distance: p.distance,
      }));
    };
    expect(simulate(30)).toEqual(simulate(60));
    expect(simulate(144)).toEqual(simulate(60));
  });
});
