import { Ball } from '../../src/core/ball';
import { planInterception, type Difficulty } from '../../src/core/ai';
import { Match, FIXED_DT, idleControls } from '../../src/core/match';
import { inContactZone } from '../../src/core/hitting';
import { Random, vec } from '../../src/core/court';
/** Scripted human uses only normal Controls. Mirroring lets it reuse the predictor, not hit cheats. */
export function scriptedPlayer(
  m: Match,
  frame: number,
  memory: { target: { x: number; y: number; z: number }; observed?: number; reaction?: number },
  style = 'mixed',
) {
  const c = idleControls(),
    p = m.players[0].position;
  if (m.phase === 'serve' && m.server === 0) {
    c.release = true;
    c.power = 0.65;
    return c;
  }
  if (m.phase !== 'rally') return c;
  if (memory.observed !== m.contacts) {
    memory.observed = m.contacts;
    memory.reaction = m.lastHitter === 1 ? 0.22 : 0;
  }
  memory.reaction = Math.max(0, (memory.reaction ?? 0) - FIXED_DT);
  if (memory.reaction > 0) return c;
  if (m.lastHitter === 1 && frame % 12 === 0) {
    const mirror = m.ball.clone();
    mirror.position.z *= -1;
    mirror.velocity.z *= -1;
    const plan = planInterception(mirror, vec(p.x, 0, -p.z), 6.3, m.serveFlight, m.bounces);
    memory.target = vec(plan.target.x, 0, -plan.target.z);
  } else if (m.lastHitter === 0) memory.target = vec(0, 0, 10.8);
  const dx = memory.target.x - p.x,
    dz = memory.target.z - p.z,
    n = Math.max(1, Math.hypot(dx, dz));
  c.x = (dx / n) * 0.87;
  c.z = (dz / n) * 0.87;
  if (
    m.lastHitter === 1 &&
    !m.serveFlight &&
    inContactZone({
      player: p,
      ball: m.ball.position,
      velocity: m.ball.velocity,
      side: 0,
      bounces: m.bounces,
      intent: 'drive',
    })
  ) {
    c.release = true;
    c.power = style === 'neutral' ? 0.55 : 0.7;
    c.aim = style === 'neutral' ? 0.12 : m.players[1].position.x > 0 ? -0.85 : 0.85;
    // Predictable mix for testing defensive/attacking opportunities, not a claimed human skill model.
    if (style === 'mixed' && m.contacts % 5 === 0) {
      c.power = 0.1;
      c.depth = -1;
    }
    if (style === 'mixed' && m.contacts % 7 === 0) c.shot = 'lob';
  }
  return c;
}
export function runSimulation(difficulty: Difficulty, games = 30, seedBase = 700) {
  let aiReturns = 0,
    aiLegalReturns = 0,
    incoming = 0,
    approaches = 0,
    defensive = 0,
    aiWinners = 0,
    playerWinners = 0,
    aiErrors = 0,
    aiUnforcedErrors = 0,
    aiPressureErrors = 0,
    playerErrors = 0,
    completedMatches = 0,
    ticks = 0,
    ms = 0,
    decisions = 0,
    decisionMs = 0,
    maxDecisionMs = 0;
  const rallies: number[] = [],
    shots: Record<string, number> = {},
    directions = { left: 0, right: 0, centre: 0 };
  let minX = 0,
    maxX = 0,
    minZ = 0,
    maxZ = -16;
  for (let seed = seedBase; seed < seedBase + games; seed++) {
    const m = new Match();
    m.start(difficulty, 'short', false, seed);
    const memory = { target: vec(0, 0, 11) };
    let lastApproach = false;
    for (let i = 0; i < 120 * 900 && m.phase !== 'result'; i++) {
      const before = m.contacts,
        phase = m.phase,
        last = m.lastHitter,
        beforeBounces = m.bounces;
      const c = scriptedPlayer(m, i, memory, seed % 2 ? 'neutral' : 'mixed');
      const t = performance.now();
      m.tick(FIXED_DT, c);
      ms += performance.now() - t;
      ticks++;
      const p = m.players[1].position;
      if (m.phase === 'rally') {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
      if (m.contacts > before) {
        if (m.lastHitter === 0) incoming++;
        else if (m.contacts > 1) {
          aiReturns++;
          const tactic = m.ai.tactic!;
          shots[tactic.name] = (shots[tactic.name] ?? 0) + 1;
          directions[tactic.aim < -0.3 ? 'left' : tactic.aim > 0.3 ? 'right' : 'centre']++;
          if (tactic.defensive) defensive++;
        }
      }
      if (
        phase === 'rally' &&
        last === 1 &&
        beforeBounces === 0 &&
        ((m.bounces === 1 && m.phase === 'rally') || (m.contacts > before && m.lastHitter === 0))
      )
        aiLegalReturns++;
      const approach = m.ai.state === 'net approach';
      if (approach && !lastApproach) approaches++;
      lastApproach = approach;
      if (
        phase === 'rally' &&
        (m.phase === 'pointOver' || (m.phase as string) === 'result') &&
        m.pointWinner !== null
      ) {
        rallies.push(m.contacts);
        const error = /OUT|NET|DOUBLE FAULT/.test(m.notice);
        if (error) {
          if (last === 1) {
            aiErrors++;
            if (m.ai.tactic?.defensive) aiPressureErrors++;
            else aiUnforcedErrors++;
          } else playerErrors++;
        } else if (m.pointWinner === 1) aiWinners++;
        else playerWinners++;
      }
    }
    if (m.phase === 'result') completedMatches++;
    decisions += m.ai.decisions;
    decisionMs += m.ai.decisionMs;
    maxDecisionMs = Math.max(maxDecisionMs, m.ai.maxDecisionMs);
  }
  const sorted = [...rallies].sort((a, b) => a - b);
  return {
    difficulty,
    games,
    seeds: [seedBase, seedBase + games - 1],
    points: rallies.length,
    completedMatches,
    aiReturns,
    aiLegalReturns,
    incoming,
    returnContactRate: aiReturns / Math.max(1, incoming),
    legalReturnRate: aiLegalReturns / Math.max(1, incoming),
    rally: {
      mean: rallies.reduce((a, b) => a + b, 0) / rallies.length,
      median: sorted[Math.floor(sorted.length * 0.5)],
      p90: sorted[Math.floor(sorted.length * 0.9)],
      max: Math.max(...rallies),
      distribution: {
        one: rallies.filter((x) => x === 1).length,
        twoToFour: rallies.filter((x) => x >= 2 && x <= 4).length,
        fiveToEight: rallies.filter((x) => x >= 5 && x <= 8).length,
        ninePlus: rallies.filter((x) => x >= 9).length,
      },
    },
    outcomes: {
      aiWinners,
      playerWinners,
      aiErrors,
      aiUnforcedErrors,
      aiPressureErrors,
      playerErrors,
    },
    approaches,
    defensive,
    shots,
    directions,
    coverage: { minX, maxX, minZ, maxZ },
    performance: {
      ticks,
      averageTickMs: ms / ticks,
      decisions,
      averageDecisionMs: decisionMs / decisions,
      maxDecisionMs,
    },
  };
}
