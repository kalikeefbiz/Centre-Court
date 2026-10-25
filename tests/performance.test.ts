import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Match, FIXED_DT, idleControls } from '../src/core/match';
import { intercept } from '../src/core/ai';
import { vec } from '../src/core/court';
it('keeps prediction and simulation within CPU budgets on a repeatable workload', () => {
  const prediction: number[] = [],
    tick: number[] = [];
  for (let repeat = 0; repeat < 6; repeat++) {
    const m = new Match();
    m.start('normal', 'short', true, 314159);
    m.tick(FIXED_DT, { ...idleControls(), release: true, power: 0.65 });
    let t = performance.now();
    for (let i = 0; i < 1000; i++) intercept(m.ball, vec(0, 0, -10), 5.4, true);
    const predictionMs = (performance.now() - t) / 1000;
    t = performance.now();
    for (let i = 0; i < 7200; i++)
      m.tick(FIXED_DT, { ...idleControls(), release: m.phase === 'serve' });
    if (repeat) {
      prediction.push(predictionMs);
      tick.push((performance.now() - t) / 7200);
    }
  }
  const summary = (a: number[]) => ({
    median: [...a].sort((a, b) => a - b)[2],
    min: Math.min(...a),
    max: Math.max(...a),
    samples: a,
  });
  const result = {
    environment:
      'Node Linux cloud; one warmup, five repetitions; milliseconds per call; same seeded idle-player Practice workload',
    prediction: summary(prediction),
    tick: summary(tick),
  };
  expect(result.prediction.median).toBeLessThan(2);
  expect(result.tick.median).toBeLessThan(0.1);
  if (process.env.CC_PERF_OUTPUT)
    writeFileSync(process.env.CC_PERF_OUTPUT, JSON.stringify(result, null, 2));
});
