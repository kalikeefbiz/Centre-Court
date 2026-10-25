import { describe, it, expect } from 'vitest';
import { Geometry, initialQuality } from '../src/render/stadium-geometry';
import { scoreboardState } from '../src/render/stadium';
import { Match } from '../src/core/match';
import { COURT } from '../src/core/court';

describe('stadium presentation contract', () => {
  it('bakes finite, outward-wound geometry without scene objects', () => {
    const g = new Geometry();
    g.box([3, 2, -5], [2, 3, 4], '#304050', Math.PI / 3);
    g.head([0, 1, 0], [0.25, 0.3, 0.25], '#aabbcc');
    expect(g.positions.length).toBe(g.normals.length);
    expect(g.colors.length / 4).toBe(g.positions.length / 3);
    const coarse = new Geometry();
    coarse.head([0, 0, 0], [0.23, 0.27, 0.23], '#aabbcc', 3);
    expect(coarse.indices.length / 3).toBe(24);
    const flat = new Geometry();
    flat.billboard([0, 1, 0], [0.23, 0.27], '#aabbcc', Math.PI / 2, 8);
    flat.billboard([0, 0.7, 0], [0.34, 0.5], '#334455', Math.PI / 2);
    expect(flat.indices.length / 3).toBe(10);
    expect(flat.positions.every(Number.isFinite)).toBe(true);
    expect(g.positions.every(Number.isFinite)).toBe(true);
    expect(Math.max(...g.indices)).toBeLessThan(g.positions.length / 3);
    expect(g.indices.length / 3).toBe(48);
    for (let k = 0; k < g.indices.length; k += 3) {
      const [a, b, c] = g.indices.slice(k, k + 3).map((i) => g.positions.slice(i * 3, i * 3 + 3));
      const u = b.map((v, i) => v - a[i]),
        v = c.map((x, i) => x - a[i]);
      const cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const n = g.normals.slice(g.indices[k] * 3, g.indices[k] * 3 + 3);
      expect(cross.reduce((sum, x, i) => sum + x * n[i], 0)).toBeGreaterThan(0);
    }
  });
  it('selects bounded crowd density while preserving all court constants', () => {
    expect(initialQuality(390, 8)).toBe('reduced');
    expect(initialQuality(1280, 2)).toBe('reduced');
    expect(initialQuality(1280, 8)).toBe('full');
    expect(COURT).toEqual({
      halfLength: 11.885,
      halfWidth: 4.115,
      doublesWidth: 5.485,
      service: 6.4,
      netCentre: 0.914,
      netEdge: 1.07,
      radius: 0.0335,
    });
  });
  it('uses authoritative points, deuce, advantage, tiebreak, winner and practice state', () => {
    const m = new Match();
    m.start('normal', 'short');
    m.score.award(0);
    expect(scoreboardState(m).rows[0].points).toBe('15');
    m.score.points = [3, 3];
    expect(scoreboardState(m).rows.map((r) => r.points)).toEqual(['40', '40']);
    m.score.award(1);
    expect(scoreboardState(m).rows[1].points).toBe('AD');
    m.score.tiebreak = true;
    m.score.points = [6, 5];
    expect(scoreboardState(m).rows[0].points).toBe('6');
    m.score.winner = 1;
    m.phase = 'result';
    expect(scoreboardState(m).caption).toBe('OPPONENT WINS');
    m.practice = true;
    expect(scoreboardState(m).rows.map((r) => r.points)).toEqual(['—', '—']);
  });
});
