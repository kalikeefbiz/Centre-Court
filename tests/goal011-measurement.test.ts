import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Match, FIXED_DT, idleControls } from '../src/core/match';
import { planInterception } from '../src/core/ai';
import { Random, vec, COURT } from '../src/core/court';
import { inContactZone } from '../src/core/hitting';
import { runSimulation } from './support/scripted';

// Identical seeded feeds and controls on baseline/revision. This is a bounded
// beginner-controller proxy, not a claim about measured human enjoyment.
export function measure(mode: string) {
  const rng = new Random(11011);
  let reachable = 0,
    returned = 0,
    reached = 0,
    prepDelay = 0,
    ticks = 0,
    elapsed = 0;
  const misses: Record<string, number> = {};
  for (let seed = 0; seed < 120; seed++) {
    const m = new Match();
    (m as any).assistanceMode = mode;
    m.start('easy', 'short', true, seed);
    m.phase = 'rally';
    m.lastHitter = 1;
    m.contacts = 1;
    const x = rng.range(-3, 3),
      z = rng.range(6.5, 10);
    m.repositionPlayer(0, vec(x + rng.range(-1.8, 1.8), 0, z + rng.range(0.6, 2.8)));
    m.ball.position = vec(rng.range(-2, 2), 1.3, -9);
    m.ball.launch(vec(x, COURT.radius, z), seed % 4 === 0 ? 'slice' : 'drive', 0.5);
    const p = m.players[0].position;
    const mirror = m.ball.clone();
    mirror.position.z *= -1;
    mirror.velocity.z *= -1;
    mirror.spin.x *= -1;
    mirror.spin.y *= -1;
    const plan = planInterception(mirror, vec(p.x, 0, -p.z), 6.3, false);
    if (!plan.reachable) continue;
    reachable++;
    let released = false,
      inReach = false,
      delayOpportunity = false;
    const target = vec(plan.target.x, 0, -plan.target.z);
    for (let frame = 0; frame < 480 && m.phase === 'rally' && m.lastHitter === 1; frame++) {
      const c = idleControls();
      const dx = target.x - p.x,
        dz = target.z - p.z,
        d = Math.hypot(dx, dz);
      // 250ms reaction, 70% joystick, neutral inside the final metre.
      if (frame > 30 && d > 1) {
        c.x = (dx / d) * 0.7;
        c.z = (dz / d) * 0.7;
      }
      const future = m.ball.clone();
      let bounces = m.bounces;
      for (let i = 0; i < 9; i++)
        for (const e of future.step(FIXED_DT)) if (e.type === 'bounce') bounces++;
      const can =
        bounces <= 1 &&
        inContactZone({
          player: p,
          ball: future.position,
          velocity: future.velocity,
          side: 0,
          bounces,
          intent: 'drive',
        });
      if (can) {
        inReach = true;
        if (!released) {
          c.release = true;
          released = true;
          c.power = 0.65;
        }
      }
      if (can) {
        for (let i = 0; i < 7; i++)
          for (const e of future.step(FIXED_DT)) if (e.type === 'bounce') bounces++;
        if (
          bounces > 1 ||
          !inContactZone({
            player: p,
            ball: future.position,
            velocity: future.velocity,
            side: 0,
            bounces,
            intent: 'drive',
          })
        )
          delayOpportunity = true;
      }
      const start = performance.now();
      m.tick(FIXED_DT, c);
      elapsed += performance.now() - start;
      ticks++;
    }
    if (inReach) reached++;
    if (Number(m.lastHitter) === 0) returned++;
    else {
      if (delayOpportunity) prepDelay++;
      const reason =
        (m as any).accessibility?.lastMiss ?? (inReach ? 'timing-or-path' : 'position');
      misses[reason] = (misses[reason] ?? 0) + 1;
    }
  }
  return {
    mode,
    scenarios: 120,
    reachable,
    returned,
    returnPercent: (returned / reachable) * 100,
    reached,
    preparationDelayProxyMisses: prepDelay,
    misses,
    averageTickMs: elapsed / ticks,
  };
}
function beginnerRallies(mode: string) {
  const m = new Match();
  (m as any).assistanceMode = mode;
  m.start('easy', 'short', true, 11011);
  let target = vec(0, 0, 11),
    observed = -1,
    reaction = 0;
  const contacts: number[] = [];
  for (let frame = 0; frame < 120 * 1200 && contacts.length < 60; frame++) {
    const c = idleControls(),
      p = m.players[0].position;
    if (m.phase === 'serve') {
      c.release = true;
      c.power = 0.65;
    }
    if (m.phase === 'rally') {
      if (observed !== m.contacts) {
        observed = m.contacts;
        reaction = m.lastHitter === 1 ? 0.25 : 0;
      }
      reaction = Math.max(0, reaction - FIXED_DT);
      if (reaction === 0) {
        if (m.lastHitter === 1 && frame % 12 === 0) {
          const mirror = m.ball.clone();
          mirror.position.z *= -1;
          mirror.velocity.z *= -1;
          mirror.spin.x *= -1;
          mirror.spin.y *= -1;
          const plan = planInterception(mirror, vec(p.x, 0, -p.z), 6.3, m.serveFlight, m.bounces);
          target = vec(plan.target.x, 0, -plan.target.z);
        } else if (m.lastHitter === 0) target = vec(0, 0, 10.8);
        const dx = target.x - p.x,
          dz = target.z - p.z,
          d = Math.hypot(dx, dz);
        if (d > 1) {
          c.x = (dx / d) * 0.7;
          c.z = (dz / d) * 0.7;
        }
        if (m.lastHitter === 1 && !m.players[0].action) {
          const future = m.ball.clone();
          let count = m.bounces;
          for (let i = 0; i < 9; i++)
            for (const e of future.step(FIXED_DT)) if (e.type === 'bounce') count++;
          if (
            count <= 1 &&
            (!m.serveFlight || count > 0) &&
            inContactZone({
              player: p,
              ball: future.position,
              velocity: future.velocity,
              side: 0,
              bounces: count,
              intent: 'drive',
            })
          ) {
            c.release = true;
            c.power = 0.65;
            c.aim = 0.12;
          }
        }
      }
    }
    const phase = m.phase;
    m.tick(FIXED_DT, c);
    if (phase === 'rally' && m.phase === 'pointOver' && m.pointWinner !== null)
      contacts.push(m.contacts);
  }
  return {
    mode,
    points: contacts.length,
    averageContacts: contacts.reduce((a, b) => a + b, 0) / contacts.length,
    earlyFailures: contacts.filter((n) => n <= 4).length,
    earlyFailurePercent: (contacts.filter((n) => n <= 4).length / contacts.length) * 100,
    contacts,
  };
}
it('records reproducible accessibility and rally measurements', () => {
  if (!process.env.CC_ACCESSIBILITY_OUTPUT) return;
  const feeds = ['off', 'light', 'standard'].map(measure);
  const rally = runSimulation('easy', 6, 1100);
  const report = {
    environment:
      'Node Linux; 120 seeded feeds (11011), fixed 120 Hz, 250ms reaction / 70% stick / neutral final metre / release at 75ms predicted reach. Preparation-delay proxy: missed return with 75ms zone available but 133ms zone unavailable. Rally: existing mixed scripted player, seeds 1100–1105, easy AI, up to 900s/match. Wall-clock timings are cloud CPU only.',
    feeds,
    rally,
    beginnerRallies: ['off', 'light', 'standard'].map(beginnerRallies),
    earlyRallyFailureRate:
      (rally.rally.distribution.one + rally.rally.distribution.twoToFour) / rally.points,
  };
  writeFileSync(process.env.CC_ACCESSIBILITY_OUTPUT, JSON.stringify(report, null, 2));
  expect(feeds.every((f) => f.reachable > 0)).toBe(true);
}, 30000);
