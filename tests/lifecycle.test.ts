import { describe, it, expect, vi } from 'vitest';
import { Lifecycle, type Session } from '../src/app/lifecycle';
import { MatchSession, type MatchConfig } from '../src/app/match-session';
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function setup() {
  const session = () => ({ dispose: vi.fn(), suspend: vi.fn() });
  const hooks = {
    menu: vi.fn(async () => {}),
    prepare: vi.fn(async (_c: string, _s: AbortSignal): Promise<Session> => session()),
    changed: vi.fn(),
    interrupt: vi.fn(),
  };
  return { app: new Lifecycle(hooks), hooks, session };
}
describe('application lifecycle', () => {
  it('rejects invalid transitions; boot, menu, match, results, rematch and menu own one session', async () => {
    const { app, hooks } = setup();
    expect(await app.start('invalid')).toBe(false);
    expect(app.results()).toBe(false);
    await app.menu();
    expect(app.state).toBe('MENU');
    await app.start('play');
    const first = app.session!;
    expect(app.state).toBe('MATCH');
    expect(app.results()).toBe(true);
    expect(app.results()).toBe(false);
    expect(app.state).toBe('RESULTS');
    await app.start('rematch');
    expect(first.dispose).toHaveBeenCalledOnce();
    const second = app.session!;
    await app.menu();
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(app.session).toBeUndefined();
    expect(hooks.prepare).toHaveBeenCalledTimes(2);
  });
  it('deduplicates Play, cancels loading and disposes late sessions without reviving them', async () => {
    const { app, hooks, session } = setup();
    await app.menu();
    const work = deferred<Session>();
    hooks.prepare.mockReturnValueOnce(work.promise);
    const start = app.start('play');
    expect(app.state).toBe('MATCH_LOADING');
    expect(await app.start('double')).toBe(false);
    const signal = hooks.prepare.mock.calls[0][1];
    await app.menu();
    expect(signal.aborted).toBe(true);
    await app.start('new');
    const active = app.session;
    const stale = session();
    work.resolve(stale);
    await start;
    expect(stale.dispose).toHaveBeenCalledOnce();
    expect(app.session).toBe(active);
    expect(app.state).toBe('MATCH');
  });
  it('recovers failed menu and match loads and can retry', async () => {
    const { app, hooks } = setup();
    hooks.menu.mockRejectedValueOnce(new Error('menu failed'));
    await app.menu();
    expect(app.state).toBe('MENU');
    expect(app.error).toContain('menu failed');
    await app.menu();
    hooks.prepare.mockRejectedValueOnce(new Error('decode failed'));
    await app.start('fail');
    expect(app.state).toBe('MENU');
    expect(app.error).toContain('decode failed');
    expect(app.session).toBeUndefined();
    expect(await app.start('retry')).toBe(true);
  });
  it('suspends during loading and active play; restoration never auto-resumes a rally', async () => {
    const { app, hooks, session } = setup();
    await app.menu();
    const work = deferred<Session>();
    hooks.prepare.mockReturnValueOnce(work.promise);
    const start = app.start('play');
    app.suspend();
    const s = session();
    work.resolve(s);
    await start;
    expect(s.suspend).toHaveBeenCalledOnce();
    app.loseContext();
    expect(app.contextLost).toBe(true);
    expect(await app.start('blocked')).toBe(false);
    app.restoreContext();
    expect(app.suspended).toBe(false);
    expect(s.suspend).toHaveBeenCalledTimes(2);
  });
  it('survives ten rapid replacements and next-opponent configuration', async () => {
    const { app, hooks } = setup();
    await app.menu();
    for (let i = 0; i < 10; i++) {
      await app.start(`rival-${i}`);
      app.results();
      await app.menu();
    }
    expect(hooks.prepare).toHaveBeenCalledTimes(10);
    expect(app.session).toBeUndefined();
  });
});
it('fresh match sessions reset clocks, input consumption, scoring and simulation ownership', () => {
  const config: MatchConfig = {
    player: 'kira',
    rival: 'dante',
    racket: 'pink-black',
    rivalRacket: 'pink-black',
    difficulty: 'normal',
    length: 'short',
    practice: false,
    circuit: true,
  };
  const cleanup = vi.fn();
  const session = new MatchSession(config, cleanup);
  session.clock.remainder = 0.004;
  session.suspend();
  expect(session.clock.remainder).toBe(0);
  const steps = session.steps;
  session.advance(20, { x: 0, z: 0, aim: 0, depth: 0, power: 0.5, shot: 'drive', release: false });
  expect(session.steps).toBe(steps);
  session.dispose();
  session.dispose();
  expect(cleanup).toHaveBeenCalledOnce();
  expect(MatchSession.active).toBe(0);
  const next = new MatchSession({ ...config, rival: 'rico' }, cleanup);
  expect(next.match.characters[1]).toBe('rico');
  expect(next.match.totalPoints).toBe(0);
  next.dispose();
});
