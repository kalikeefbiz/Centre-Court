import { describe, it, expect } from 'vitest';
import { selectStroke, inContactZone, type HitContext } from '../src/core/hitting';
import { ANIMATIONS } from '../src/render/animation-registry';
import { locomotionState } from '../src/render/athlete-config';
import { ROYAL_BALL } from '../src/render/royal-ball';
import { COURT, vec } from '../src/core/court';
const context: HitContext = {
  player: vec(0, 0, 8),
  ball: vec(0.6, 1.1, 7.6),
  velocity: vec(0, -1, 12),
  side: 0,
  bounces: 1,
  intent: 'drive',
};
describe('contextual tennis strokes', () => {
  it('uses opposite hands on either end, with no animation-driven repositioning', () => {
    expect(selectStroke(context)).toBe('Forehand');
    expect(selectStroke({ ...context, ball: vec(-0.6, 1.1, 7.6) })).toBe('Backhand');
    expect(selectStroke({ ...context, side: 1 })).toBe('Backhand');
    expect(selectStroke({ ...context, side: 1, ball: vec(-0.6, 1.1, -7.6) })).toBe('Forehand');
  });
  it('intercepts before the bounce with compact sided volleys', () => {
    expect(selectStroke({ ...context, bounces: 0 })).toBe('ForehandVolley');
    expect(selectStroke({ ...context, bounces: 0, ball: vec(-0.6, 1, 7.6) })).toBe(
      'BackhandVolley',
    );
    expect(selectStroke({ ...context, bounces: 0, ball: vec(0.1, 2.3, 7.6) })).toBe('Smash');
    expect(
      selectStroke({ ...context, bounces: 0, velocity: vec(0, 2, 12), ball: vec(0.1, 2.3, 7.6) }),
    ).not.toBe('Smash');
    expect(
      selectStroke({ ...context, bounces: 0, player: vec(0, 0, 12), ball: vec(0.1, 2.3, 11.6) }),
    ).not.toBe('Smash');
  });
  it('reserves slice and lob for tactical intent, and serve for serving', () => {
    expect(selectStroke({ ...context, intent: 'slice', bounces: 0 })).toBe('Slice');
    expect(selectStroke({ ...context, intent: 'lob', bounces: 0 })).toBe('Lob');
    expect(selectStroke({ ...context, serving: true, intent: 'lob' })).toBe('Serve');
  });
  it('rejects out of reach and wrong height without changing the player', () => {
    const before = structuredClone(context);
    expect(inContactZone(context)).toBe(true);
    expect(inContactZone({ ...context, ball: vec(3, 1, 8) })).toBe(false);
    expect(inContactZone({ ...context, ball: vec(0.4, 0.2, 8) })).toBe(false);
    expect(inContactZone({ ...context, ball: vec(0.5, 1.1, 8.8) })).toBe(false);
    expect(inContactZone({ ...context, ball: vec(0.4, 0.4, 7.7) })).toBe(true);
    expect(inContactZone({ ...context, ball: vec(1.1, 0.4, 7.7) })).toBe(false);
    expect(context).toEqual(before);
  });
  it('uses unique clips and calibrated contacts inside nonlooping hit tracks', () => {
    expect(new Set(Object.values(ANIMATIONS).map((a) => a.clip)).size).toBe(13);
    for (const a of Object.values(ANIMATIONS))
      if ('contact' in a) {
        expect(a.loop).toBe(false);
        expect(a.prepare).toBeLessThan(a.contact);
        expect(a.contact).toBeLessThan(a.end);
        expect(a.end).toBeLessThan(a.duration);
      }
  });
  it('chooses lateral motion separately and keeps regulation visual/collision scale', () => {
    expect(locomotionState(5, -1, 0)).toBe('ShuffleLeft');
    expect(locomotionState(5, 1, 0)).toBe('ShuffleRight');
    expect(locomotionState(5, 0, -1)).toBe('Run');
    expect(locomotionState(1, 0, -1)).toBe('Walk');
    expect(ROYAL_BALL.diameter).toBeCloseTo(COURT.radius * 2);
  });
});
