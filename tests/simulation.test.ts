import { it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { runSimulation } from './support/scripted';
it('reproducible scripted-player comparison and decision budget', () => {
  const data = ['easy', 'normal', 'hard'].map((d) => runSimulation(d as any));
  console.table(
    data.map((x) => ({
      difficulty: x.difficulty,
      points: x.points,
      completed: x.completedMatches,
      contactRate: x.returnContactRate,
      legalRate: x.legalReturnRate,
      median: x.rally.median,
      p90: x.rally.p90,
      approaches: x.approaches,
      decisionMs: x.performance.averageDecisionMs,
    })),
  );
  expect(data[2].legalReturnRate).toBeGreaterThan(data[0].legalReturnRate);
  expect(data[2].approaches / data[2].points).toBeGreaterThan(data[0].approaches / data[0].points);
  expect(Object.keys(data[2].shots).length).toBeGreaterThan(Object.keys(data[0].shots).length);
  for (const row of data) {
    expect(row.completedMatches).toBeGreaterThanOrEqual(10);
    expect(row.points).toBeGreaterThan(200);
    expect(row.performance.averageDecisionMs).toBeLessThan(2);
    expect(row.rally.max).toBeGreaterThanOrEqual(4);
  }
  if (process.env.CC_AI_REPORT) {
    mkdirSync('public/verification/goal-003', { recursive: true });
    writeFileSync(
      'public/verification/goal-003/simulation.json',
      JSON.stringify(
        {
          environment:
            'Node Linux cloud; 30 match attempts per difficulty, seeds 700–729, 900 simulated seconds cap each; scripted neutral/mixed controls, 220ms reaction and 87% player speed. Not human enjoyment or device performance. Capped unfinished matches are reported, not counted as completed. Winner means unreturned point; pressure/unforced error split is a defensive-tactic proxy.',
          data,
        },
        null,
        2,
      ),
    );
  }
  // Two deterministic interception controllers now run in each of 90 long matches.
  // Keep the per-decision budgets above; allow the bounded aggregate workload on CI.
}, 90000);
