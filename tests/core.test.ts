import { describe, it, expect } from 'vitest';
import { Score } from '../src/core/scoring';
import { COURT, inCourt, validServe, vec, Random } from '../src/core/court';
import { Ball, predict } from '../src/core/ball';
import { Match, FixedClock, FIXED_DT, idleControls } from '../src/core/match';
import { CameraRig } from '../src/core/camera';
import { chooseShot, intercept, PRESETS } from '../src/core/ai';

const winGame = (s: Score, side: 0 | 1) => {
  for (let i = 0; i < 4; i++) s.award(side);
};
const advance = (m: Match, seconds: number) => {
  for (let i = 0; i < seconds / FIXED_DT; i++) m.tick(FIXED_DT, idleControls());
};
describe('tennis scoring', () => {
  it('scores Love, 15, 30, 40 and requires two clear points at deuce', () => {
    const s = new Score();
    expect(s.label(0)).toBe('0');
    s.award(0);
    expect(s.label(0)).toBe('15');
    s.award(0);
    expect(s.label(0)).toBe('30');
    s.award(0);
    expect(s.label(0)).toBe('40');
    for (let i = 0; i < 3; i++) s.award(1);
    expect(s.description).toBe('DEUCE');
    s.award(0);
    expect(s.label(0)).toBe('AD');
    s.award(1);
    expect(s.description).toBe('DEUCE');
    s.award(1);
    expect(s.award(1)).toBe('game');
    expect(s.games).toEqual([0, 1]);
    expect(s.points).toEqual([0, 0]);
  });
  it('alternates service courts and games; closes a quick match once', () => {
    const s = new Score();
    expect(s.deuce).toBe(true);
    s.award(0);
    expect(s.deuce).toBe(false);
    for (let i = 0; i < 3; i++) s.award(0);
    expect(s.server).toBe(1);
    winGame(s, 0);
    expect(s.winner).toBe(0);
    expect(s.completedSets).toEqual([[2, 0]]);
    s.award(1);
    expect(s.games).toEqual([0, 0]);
  });
  it('runs tiebreak rotation, win by two and next-set service', () => {
    const s = new Score('standard');
    for (let i = 0; i < 12; i++) winGame(s, (i % 2) as 0 | 1);
    expect(s.games).toEqual([6, 6]);
    expect(s.tiebreak).toBe(true);
    const servers = [];
    for (let i = 0; i < 12; i++) {
      servers.push(s.server);
      s.award((i % 2) as 0 | 1);
    }
    expect(servers.slice(0, 7)).toEqual([0, 1, 1, 0, 0, 1, 1]);
    expect(s.points).toEqual([6, 6]);
    s.award(0);
    expect(s.winner).toBeNull();
    expect(s.award(0)).toBe('set');
    expect(s.completedSets).toEqual([[7, 6]]);
    expect(s.server).toBe(1);
    for (let i = 0; i < 6; i++) winGame(s, 0);
    expect(s.winner).toBe(0);
  });
  it('starts a quick-set tiebreak at two all', () => {
    const s = new Score();
    [0, 1, 0, 1].forEach((i) => winGame(s, i as 0 | 1));
    expect(s.tiebreak).toBe(true);
    for (let i = 0; i < 7; i++) s.award(1);
    expect(s.winner).toBe(1);
    expect(s.completedSets).toEqual([[2, 3]]);
  });
});
describe('court and serve geometry', () => {
  it('uses regulation singles dimensions and includes touching lines', () => {
    expect(COURT.halfLength * 2).toBe(23.77);
    expect(COURT.halfWidth * 2).toBe(8.23);
    expect(inCourt(vec(4.115, 0, 11.885))).toBe(true);
    expect(inCourt(vec(4.24, 0, 0))).toBe(false);
    expect(inCourt(vec(0, 0, 12.02))).toBe(false);
  });
  it('validates all four diagonal service boxes and lines', () => {
    expect(validServe(vec(-2, 0, -4), 0, true)).toBe(true);
    expect(validServe(vec(2, 0, -4), 0, false)).toBe(true);
    expect(validServe(vec(2, 0, 4), 1, true)).toBe(true);
    expect(validServe(vec(-2, 0, 4), 1, false)).toBe(true);
    expect(validServe(vec(2, 0, -4), 0, true)).toBe(false);
    expect(validServe(vec(-2, 0, -7), 0, true)).toBe(false);
    expect(validServe(vec(-2, 0, 4), 0, true)).toBe(false);
    expect(validServe(vec(0, 0, -6.4), 0, true)).toBe(true);
  });
});
describe('continuous ballistic simulation', () => {
  it('lands at its requested target with bounded fixed-step integration error', () => {
    const b = new Ball();
    b.position = vec(0, 1.2, 10);
    b.launch(vec(2, 0.12, -9), 'drive', 0.7);
    let landed;
    for (let i = 0; i < 600 && !landed; i++)
      landed = b.step(FIXED_DT).find((e) => e.type === 'bounce');
    expect(landed).toBeDefined();
    expect(landed!.position.x).toBeCloseTo(2, 2);
    expect(landed!.position.z).toBeCloseTo(-9, 2);
    expect(b.velocity.y).toBeGreaterThan(0);
  });
  it('detects a swept net collision without tunneling', () => {
    const b = new Ball();
    b.position = vec(0, 0.5, 0.1);
    b.velocity = vec(0, 0, -40);
    b.active = true;
    expect(b.step(FIXED_DT)[0].type).toBe('net');
    expect(b.velocity.z).toBeGreaterThan(0);
  });
  it('separates lob, slice and drive trajectories and rebound heights', () => {
    const heights = ['drive', 'slice', 'lob'].map((shot) => {
      const b = new Ball();
      b.position = vec(0, 1.2, 10);
      b.launch(vec(0, 0.12, -9), shot as 'drive' | 'slice' | 'lob');
      return Math.max(...predict(b).map((p) => p.position.y));
    });
    expect(heights[2]).toBeGreaterThan(heights[0] * 1.6);
    expect(heights[1]).not.toBeCloseTo(heights[0], 1);
    const b = new Ball();
    b.position = vec(0, 0.13, 5);
    b.velocity = vec(2, -5, -2);
    b.active = true;
    b.step(FIXED_DT);
    expect(b.position.y).toBe(COURT.radius);
    expect(b.velocity.y).toBeGreaterThan(0);
    expect(b.velocity.y).toBeLessThan(5);
    expect(b.velocity.x).toBeLessThan(2);
  });
  it('predicts with an independent copy', () => {
    const b = new Ball();
    b.launch(vec(-2, 0.12, -4), 'serve');
    const before = JSON.stringify(b);
    expect(predict(b).length).toBeGreaterThan(100);
    expect(JSON.stringify(b)).toBe(before);
  });
});
describe('match transitions and recovery', () => {
  it('starts on serve, pauses without time advancing, resumes and restarts cleanly', () => {
    const m = new Match();
    m.start('normal', 'short');
    expect(m.phase).toBe('serve');
    m.tick(FIXED_DT, { ...idleControls(), release: true, power: 0.65 });
    expect(m.phase).toBe('rally');
    m.pause();
    const b = JSON.stringify(m.ball);
    advance(m, 3);
    expect(m.phase).toBe('paused');
    expect(JSON.stringify(m.ball)).toBe(b);
    m.resume();
    advance(m, 0.2);
    expect(JSON.stringify(m.ball)).not.toBe(b);
    m.start('easy', 'short');
    expect(m.score.points).toEqual([0, 0]);
    expect(m.ball.active).toBe(false);
    expect(m.fault).toBe(0);
  });
  it('validates a live legal serve, disallows return before its bounce', () => {
    const m = new Match();
    m.start('normal', 'short');
    m.tick(FIXED_DT, { ...idleControls(), release: true, power: 0.65 });
    expect(m.serveFlight).toBe(true);
    advance(m, 0.4);
    expect(m.contacts).toBe(1);
    advance(m, 0.4);
    expect(m.fault).toBe(0);
    expect(m.serveFlight).toBe(false);
  });
  it('first fault retries same side; double fault awards exactly one point', () => {
    const m = new Match();
    m.start('normal', 'short');
    const fault = () => {
      m.phase = 'rally';
      m.serveFlight = true;
      m.ball.active = true;
      m.ball.position = vec(3, 0.13, -4);
      m.ball.velocity = vec(0, -2, 0);
      m.tick(FIXED_DT, idleControls());
    };
    fault();
    expect(m.fault).toBe(1);
    expect(m.totalPoints).toBe(0);
    advance(m, 1.8);
    expect(m.phase).toBe('serve');
    expect(m.server).toBe(0);
    fault();
    expect(m.score.points).toEqual([0, 1]);
    expect(m.totalPoints).toBe(1);
    advance(m, 0.2);
    expect(m.totalPoints).toBe(1);
  });
  it('replays a net-cord let without consuming a serve', () => {
    const m = new Match();
    m.start('easy', 'short');
    m.phase = 'rally';
    m.serveFlight = true;
    m.ball.active = true;
    m.ball.netTouched = true;
    m.ball.position = vec(-2, 0.13, -4);
    m.ball.velocity = vec(0, -2, 0);
    m.tick(FIXED_DT, idleControls());
    expect(m.notice).toContain('LET');
    expect(m.fault).toBe(0);
    expect(m.totalPoints).toBe(0);
    advance(m, 1.6);
    expect(m.phase).toBe('serve');
  });
  it('awards out and double bounce correctly and never duplicates the call', () => {
    for (const [bounces, x, winner] of [
      [0, 5, 1],
      [1, 2, 0],
    ] as const) {
      const m = new Match();
      m.start('easy', 'short');
      m.phase = 'rally';
      m.lastHitter = 0;
      m.bounces = bounces;
      m.ball.active = true;
      m.ball.position = vec(x, 0.13, -5);
      m.ball.velocity = vec(0, -2, 0);
      m.tick(FIXED_DT, idleControls());
      expect(m.score.points[winner]).toBe(1);
      advance(m, 0.5);
      expect(m.totalPoints).toBe(1);
    }
  });
  it('practice never ends the match or mutates scoring', () => {
    const m = new Match();
    m.start('easy', 'short', true);
    m.phase = 'rally';
    m.lastHitter = 1;
    m.bounces = 1;
    m.ball.active = true;
    m.ball.position = vec(0, 0.13, 5);
    m.ball.velocity = vec(0, -2, 0);
    m.tick(FIXED_DT, idleControls());
    expect(m.score.points).toEqual([0, 0]);
    advance(m, 2);
    expect(m.phase).toBe('serve');
  });
  it('plays a whole loss without input and supports restart without reload', () => {
    const m = new Match();
    m.start('hard', 'short');
    for (let i = 0; i < 120 * 600 && m.phase !== 'result'; i++) {
      const c = idleControls();
      if (m.phase === 'serve' && m.server === 0) c.release = true;
      m.tick(FIXED_DT, c);
    }
    expect(m.phase).toBe('result');
    expect(m.score.winner).toBe(1);
    expect(m.totalPoints).toBeGreaterThanOrEqual(8);
    m.start('normal', 'short');
    expect(m.phase).toBe('serve');
    expect(m.totalPoints).toBe(0);
  });
  it('produces the same seeded match at 30, 60, 144Hz', () => {
    const run = (hz: number) => {
      const m = new Match();
      m.start('normal', 'short', false, 77);
      const clock = new FixedClock();
      for (let frame = 0; frame < hz * 40; frame++)
        clock.advance(1 / hz, (dt) =>
          m.tick(dt, { ...idleControls(), release: m.phase === 'serve' && m.server === 0 }),
        );
      return [m.phase, m.score.points, m.score.games, m.totalPoints, m.ball.position.x.toFixed(4)];
    };
    expect(run(30)).toEqual(run(60));
    expect(run(60)).toEqual(run(144));
  });
});
describe('AI and camera', () => {
  it('chooses contextual volleys and lobs', () => {
    expect(chooseShot(vec(0, 1.6, -3), vec(0, 0, 10), new Random())).toBe('volley');
    const rng = new Random(7);
    expect(
      Array.from({ length: 20 }, () => chooseShot(vec(0, 1, -10), vec(0, 0, 2), rng)),
    ).toContain('lob');
  });
  it('predicts legal interception positions and uses bounded difficulty speeds', () => {
    const b = new Ball();
    b.position = vec(0, 1.4, 9);
    b.launch(vec(-2, 0.12, -10), 'drive');
    const p = intercept(b, vec(0, 0, -10), PRESETS.normal.speed, false);
    expect(p.z).toBeLessThan(0);
    expect(Math.abs(p.x)).toBeLessThan(6.7);
    expect(PRESETS.easy.speed).toBeLessThan(PRESETS.hard.speed);
    expect(PRESETS.hard.reaction).toBeGreaterThan(0.1);
  });
  it('never moves AI faster than its speed budget', () => {
    const m = new Match();
    m.start('hard', 'short');
    m.tick(FIXED_DT, { ...idleControls(), release: true });
    for (let i = 0; i < 400; i++) {
      const old = { ...m.players[1].position };
      const phase = m.phase;
      m.tick(FIXED_DT, idleControls());
      if (phase === 'rally' && m.phase === 'rally')
        expect(
          Math.hypot(old.x - m.players[1].position.x, old.z - m.players[1].position.z),
        ).toBeLessThanOrEqual(PRESETS.hard.speed * FIXED_DT + 0.00001);
    }
  });
  it('switches, persists and smoothly updates one camera rig; tolerates denied storage', () => {
    const data = new Map<string, string>(),
      storage = {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => {
          data.set(k, v);
        },
      };
    const rig = new CameraRig(storage);
    rig.switch('behind');
    expect(new CameraRig(storage).mode).toBe('behind');
    const before = { ...rig.position };
    rig.update(0.016, vec(1, 0, 10), vec(0, 2, 0), 0.5);
    expect(rig.position.y).not.toBe(before.y);
    expect(Number.isFinite(rig.position.y)).toBe(true);
    const denied = {
      getItem: () => {
        throw Error();
      },
      setItem: () => {
        throw Error();
      },
    };
    expect(() => new CameraRig(denied).switch('behind')).not.toThrow();
  });
});

describe('full-match playability', () => {
  it('supports sustained player-controlled rallies and a complete human win using only movement and shot commands', () => {
    const m = new Match();
    m.start('easy', 'short', false, 851);
    let best = 0,
      returns = 0;
    let target = vec();
    for (let i = 0; i < 120 * 600 && m.phase !== 'result'; i++) {
      const c = idleControls(),
        p = m.players[0].position,
        b = m.ball.position;
      if (m.phase === 'serve' && m.server === 0) {
        c.release = true;
        c.power = 0.65;
      }
      if (m.phase === 'rally' && m.lastHitter === 1) {
        if (i % 12 === 0) {
          const prediction = predict(m.ball, 3);
          const hit = prediction.find(
            (s) =>
              s.position.z > 0.5 &&
              s.position.z < 15 &&
              s.position.y > 0.5 &&
              s.position.y < 2.4 &&
              (!m.serveFlight || s.bounced) &&
              Math.hypot(s.position.x - p.x, s.position.z - p.z) < 6.3 * s.time + 1.3,
          );
          target = hit?.position ?? p;
        }
        const dx = target.x - p.x,
          dz = target.z - p.z,
          d = Math.hypot(dx, dz);
        if (d > 0.2) {
          c.x = dx / Math.max(1, d);
          c.z = dz / Math.max(1, d);
        }
        if (
          !m.serveFlight &&
          b.z > 0.15 &&
          b.y > 0.45 &&
          b.y < 2.4 &&
          Math.hypot(b.x - p.x, b.z - p.z) < 1.55
        ) {
          c.release = true;
          c.power = 0.65;
          c.aim = m.players[1].position.x > 0 ? -0.85 : 0.85;
          returns++;
        }
      }
      m.tick(FIXED_DT, c);
      best = Math.max(best, m.contacts);
    }
    expect(returns).toBeGreaterThan(10);
    expect(best).toBeGreaterThanOrEqual(4);
    expect(m.phase).toBe('result');
    expect(m.score.winner).toBe(0);
  });
});

describe('serve aiming consistency', () => {
  it('maps right aim to the right in world space on the deuce court', () => {
    const launch = (aim: number) => {
      const m = new Match();
      m.start('normal', 'short');
      m.tick(FIXED_DT, { ...idleControls(), release: true, power: 0.65, aim });
      return m.ball.velocity.x;
    };
    expect(launch(1)).toBeGreaterThan(launch(-1));
  });
});
