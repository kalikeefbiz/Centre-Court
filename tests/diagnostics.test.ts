import { describe, expect, it } from 'vitest';
import { FrameWindow, projectedDiameter, validBallScale } from '../src/dev/metrics';
import { InspectionTimeline } from '../src/dev/timeline';
import { ANIMATIONS } from '../src/render/animation-registry';
import { Ball } from '../src/core/ball';
import { RoyalBall } from '../src/render/royal-ball';
import { COURT } from '../src/core/court';

describe('bounded development diagnostics', () => {
  it('summarizes real frame intervals, rejects invalid samples and resets', () => {
    const frames = new FrameWindow();
    [10, 20, 30, 40, NaN, -1, 0].forEach((x) => frames.add(x));
    expect(frames.summary()).toMatchObject({
      samples: 4,
      fps: 40,
      averageMs: 25,
      p95Ms: 40,
      maxMs: 40,
      over33Ms: 1,
    });
    expect(frames.summary().stddevMs).toBeCloseTo(Math.sqrt(125));
    for (let i = 0; i < 2000; i++) frames.add(16);
    expect(frames.summary().samples).toBe(600);
    frames.reset();
    expect(frames.summary().samples).toBe(0);
  });
  it('advances registry clips at chosen speed, pauses, seeks, restarts and loops', () => {
    const t = new InspectionTimeline();
    t.select('Serve');
    t.speed = 0.5;
    t.advance(1);
    expect(t.time).toBe(0.5);
    t.playing = false;
    t.advance(1);
    expect(t.time).toBe(0.5);
    t.seek(100);
    expect(t.time).toBe(ANIMATIONS.Serve.duration);
    t.restart();
    expect(t.time).toBe(0);
    expect(t.playing).toBe(true);
    t.speed = 1;
    t.advance(4);
    expect(t.playing).toBe(false);
    t.select('Run');
    t.advance(1);
    expect(t.time).toBeCloseTo(1 % ANIMATIONS.Run.duration);
    t.select('Backhand');
    expect(t.time).toBe(0);
    expect(t.loop).toBe(false);
  });
  it('projects diameter using depth and viewport; size scales linearly and falls with distance', () => {
    const px = projectedDiameter(0.067, 10, 48, 844);
    expect(px).toBeCloseTo(6.3505, 2);
    expect(projectedDiameter(0.067 * 1.75, 10, 48, 844)).toBeCloseTo(px * 1.75);
    expect(projectedDiameter(0.067, 20, 48, 844)).toBeCloseTo(px / 2);
    expect(projectedDiameter(0.067, -1, 48, 844)).toBe(0);
    expect([1, 1.25, 1.5, 1.75].every(validBallScale)).toBe(true);
    expect(validBallScale(2)).toBe(false);
  });
  it('keeps regulation radius and deterministic ball flight independent of visual presets', () => {
    const baseline = new Ball();
    baseline.position = { x: 0, y: 2, z: 10 };
    baseline.velocity = { x: 1, y: 4, z: -15 };
    baseline.active = true;
    const applied: number[][] = [];
    const visual = {
      root: { setLocalScale: (...v: number[]) => applied.push(v) },
      visualScale: 1,
    } as unknown as RoyalBall;
    for (const scale of [1, 1.25, 1.5, 1.75]) {
      RoyalBall.prototype.setVisualScale.call(visual, scale);
      expect(applied.at(-1)).toEqual([scale, scale, scale]);
      const ball = new Ball();
      Object.assign(ball, structuredClone(baseline));
      const reference = new Ball();
      Object.assign(reference, structuredClone(baseline));
      // Scale acceptance is deliberately outside the physics API.
      expect(validBallScale(scale)).toBe(true);
      for (let frame = 0; frame < 500; frame++) {
        ball.step(1 / 120);
        reference.step(1 / 120);
      }
      expect(ball).toEqual(reference);
      expect(COURT.radius).toBe(0.0335);
    }
    RoyalBall.prototype.setVisualScale.call(visual, 1);
    expect(applied.at(-1)).toEqual([1, 1, 1]);
    const accepted = applied.length;
    RoyalBall.prototype.setVisualScale.call(visual, 2);
    expect(applied).toHaveLength(accepted);
  });
});
