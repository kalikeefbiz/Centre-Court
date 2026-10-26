import { describe, it, expect } from 'vitest';
import { ShotGesture, HIT_GESTURE, type GestureCommand } from '../src/core/shot-gesture';
import { Match, FIXED_DT, idleControls } from '../src/core/match';
import { vec } from '../src/core/court';
import { STRIKE } from '../src/core/stroke';

describe('deterministic HIT recognition', () => {
  it('provisionally prepares on release and commits exactly once at 160 ms', () => {
    const g = new ShotGesture();
    g.down(1);
    g.up(1.05, 0.7, -0.2);
    const first = g.drain();
    expect(first).toEqual([
      expect.objectContaining({
        kind: 'provisional',
        shot: 'slice',
        delay: 0.16,
        aim: 0.7,
        depth: -0.2,
      }),
    ]);
    g.update(1.209);
    expect(g.drain()).toEqual([]);
    g.update(1.21);
    expect(g.drain()).toEqual([
      expect.objectContaining({ kind: 'commit', id: first[0].id, shot: 'slice' }),
    ]);
    g.update(10);
    expect(g.drain()).toEqual([]);
  });
  it('cancels the reversible preparation on second press and commits one lob on release', () => {
    const g = new ShotGesture();
    g.down(0, 10, 10);
    g.up(0.04);
    g.down(0.18, 20, 20);
    expect(g.preview).toBe('lob');
    g.up(0.22, -0.8, 0.5);
    const e = g.drain();
    expect(e.map((c) => c.kind)).toEqual(['provisional', 'cancel', 'commit']);
    expect(e[2]).toMatchObject({ id: e[0].id, shot: 'lob', aim: -0.8, depth: 0.5 });
    g.update(1);
    expect(g.drain()).toEqual([]);
  });
  it('treats a held second press as power, with no leftover slice or lob', () => {
    const g = new ShotGesture();
    g.down(0);
    g.up(0.03);
    g.down(0.09);
    g.up(0.69);
    const e = g.drain();
    expect(e.map((c) => c.kind)).toEqual(['provisional', 'cancel', 'commit']);
    expect(e[2].shot).toBe('drive');
    expect(e[2].power).toBeCloseTo(0.45 + (0.45 / 1.05) * 0.55);
  });
  it('does not pair remote, unrelated or expired presses', () => {
    for (const [time, x, source] of [
      [0.1, 41, 'hit'],
      [0.1, 0, 'canvas'],
      [0.2, 0, 'hit'],
    ] as const) {
      const g = new ShotGesture();
      g.down(0);
      g.up(0.04);
      g.down(time, x, 0, source);
      g.up(time + 0.03);
      expect(g.drain().map((c) => [c.kind, c.shot])).toEqual([
        ['provisional', 'slice'],
        ['commit', 'slice'],
        ['provisional', 'slice'],
      ]);
      g.update(1);
      expect(g.drain()[0].shot).toBe('slice');
    }
  });
  it('handles rapid triples, duplicate up/down and cancellation without timer callbacks', () => {
    const g = new ShotGesture();
    g.down(0);
    expect(g.down(0.01)).toBe(false);
    g.up(0.03);
    g.up(0.03);
    g.down(0.06);
    g.up(0.09);
    g.down(0.12);
    g.up(0.15);
    expect(g.drain().map((c) => c.kind)).toEqual([
      'provisional',
      'cancel',
      'commit',
      'provisional',
    ]);
    g.cancel();
    g.update(1);
    expect(g.drain().map((c) => c.kind)).toEqual(['cancel']);
  });
  it('keeps hold charge independent of update cadence', () => {
    const run = (fps: number) => {
      const g = new ShotGesture();
      g.down(0);
      for (let n = 1; n <= fps; n++) g.update(n / fps);
      g.up(1);
      return g.drain();
    };
    expect(run(30)).toEqual(run(144));
    expect(run(30)[0]).toMatchObject({ kind: 'commit', shot: 'drive' });
    expect(HIT_GESTURE.hold).toBe(0.18);
  });
});
function rally(z = 7.45 - 12 * 0.16, speed = 12) {
  const m = new Match();
  m.start('normal', 'short');
  m.phase = 'rally';
  m.lastHitter = 1;
  m.bounces = 1;
  m.repositionPlayer(0, vec(0, 0, 8));
  m.ball.active = true;
  m.ball.velocity = vec(0, -0.5, speed);
  m.ball.position = vec(0.3, 1.5, z);
  return m;
}
function step(m: Match, commands?: GestureCommand[], x = 0) {
  m.tick(FIXED_DT, { ...idleControls(), gestures: commands, x });
}
describe('gesture buffering through timed racket contact', () => {
  it('starts a slice preparation immediately, then hits once at its marker after commitment', () => {
    const m = rally(),
      g = new ShotGesture();
    g.down(0);
    g.up(0);
    const commands = g.drain();
    step(m, commands);
    expect(m.players[0].action).toMatchObject({
      intent: 'slice',
      committed: false,
      contactAt: 0.16,
    });
    const id = m.players[0].action!.id;
    for (let i = 1; i < 19; i++) step(m, commands); // duplicate delivery must be idempotent
    expect(m.contacts).toBe(0);
    expect(m.players[0].action!.id).toBe(id);
    g.update(0.16);
    step(m, g.drain());
    expect(m.contacts).toBe(1);
    expect(m.lastHitter).toBe(0);
    expect(m.players[0].contact!.stroke).toBe('Slice');
    expect(m.players[0].contact!.timing).toBeCloseTo(20 * FIXED_DT - 0.16);
    expect(m.ball.spin.x).not.toBe(0);
    for (let i = 0; i < 70; i++) step(m, commands);
    expect(m.contacts).toBe(1);
  });
  it('upgrades to one lob before any irreversible slice and retains the 130 ms lob windup', () => {
    const m = rally(6.01, 6),
      g = new ShotGesture();
    g.down(0);
    g.up(0);
    step(m, g.drain());
    for (let i = 1; i < 8; i++) step(m);
    g.down(8 * FIXED_DT);
    step(m, g.drain());
    expect(m.players[0].action).toBeNull();
    expect(m.contacts).toBe(0);
    for (let i = 9; i < 12; i++) step(m);
    g.up(0.1);
    step(m, g.drain());
    expect(m.players[0].action).toMatchObject({
      intent: 'lob',
      committed: true,
      contactAt: STRIKE.lead,
    });
    for (let i = 0; i < 40 && !m.contacts; i++) step(m);
    expect(m.contacts).toBe(1);
    expect(m.players[0].contact!.stroke).toBe('Lob');
    expect(m.ball.velocity.y).toBeGreaterThan(6);
  });
  it('executes released power while moving and drops repeated gestures during recovery', () => {
    const m = rally(7.45 - 12 * STRIKE.lead),
      g = new ShotGesture();
    g.down(0);
    g.up(0.7);
    step(m, g.drain(), 0.4);
    expect(m.players[0].action).toMatchObject({
      intent: 'drive',
      committed: true,
      contactAt: STRIKE.lead,
    });
    for (let i = 0; i < 35; i++) {
      g.down(1 + i * 0.2);
      g.up(1 + i * 0.2 + 0.19);
      step(m, g.drain(), 0.4);
    }
    expect(m.contacts).toBe(1);
    expect(m.players[0].position.x).toBeGreaterThan(0.1);
  });
  it('does not resurrect a tap rejected during recovery when its commit arrives later', () => {
    const m = rally(7.45 - 12 * STRIKE.lead),
      g = new ShotGesture();
    g.down(0);
    g.up(0.5);
    step(m, g.drain());
    for (let i = 0; i < 67; i++) step(m);
    expect(m.players[0].action).not.toBeNull();
    g.down(1);
    g.up(1.02);
    step(m, g.drain()); // rejected while the previous swing recovers
    for (let i = 0; i < 18; i++) step(m);
    expect(m.players[0].action).toBeNull();
    m.lastHitter = 1;
    m.bounces = 1;
    m.ball.active = true;
    m.ball.position = vec(0.3, 1.5, 7.45 - 12 * STRIKE.lead);
    m.ball.velocity = vec(0, -0.5, 12);
    g.update(1.18);
    step(m, g.drain());
    expect(m.players[0].action).toBeNull();
    for (let i = 0; i < 20; i++) step(m);
    expect(m.contacts).toBe(1);
  });
  it('cancels pending preparation for pause, a new point and explicit cancellation', () => {
    for (const interrupt of ['pause', 'start', 'cancel'] as const) {
      const m = rally(),
        g = new ShotGesture();
      g.down(0);
      g.up(0);
      step(m, g.drain());
      if (interrupt === 'pause') {
        m.pause();
        m.resume();
      }
      if (interrupt === 'start') m.start('normal', 'short');
      if (interrupt === 'cancel') {
        g.cancel();
        step(m, g.drain());
      }
      expect(m.players[0].action).toBeNull();
      expect(m.contacts).toBe(0);
    }
  });
  it('expires an unreachable request instead of firing when a later ball arrives', () => {
    const m = rally();
    m.ball.position.x = 5;
    const g = new ShotGesture();
    g.down(0);
    g.up(0);
    step(m, g.drain());
    for (let i = 1; i < 70; i++) {
      g.update(i * FIXED_DT);
      step(m, g.drain());
    }
    expect(m.players[0].action).toBeNull();
    expect(m.contacts).toBe(0);
    m.ball.position = vec(0.3, 1.5, 7.45 - 12 * STRIKE.lead);
    for (let i = 0; i < 25; i++) step(m);
    expect(m.contacts).toBe(0);
  });
  it('tap and hold both preserve the complete serving toss and launch', () => {
    for (const duration of [0.04, 0.65]) {
      const m = new Match();
      m.start('normal', 'short');
      const g = new ShotGesture();
      g.down(0);
      g.up(duration, 0, 0, true);
      step(m, g.drain());
      expect(m.players[0].action?.stroke).toBe('Serve');
      expect(m.ball.position.y).toBeLessThan(1.3);
      let high = 0;
      for (let i = 0; i < 120 && m.phase === 'serve'; i++) {
        step(m);
        high = Math.max(high, m.ball.position.y);
      }
      expect(high).toBeGreaterThan(2.17);
      expect(m.contacts).toBe(1);
      expect(m.phase).toBe('rally');
    }
  });
});
