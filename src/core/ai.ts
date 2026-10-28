import { ROSTER, type CharacterId } from './roster';
import { clamp, COURT, Random, vec, type Vec } from './court';
import { Ball, type Shot, type BallEvent } from './ball';
import {
  createLocomotion,
  resetLocomotion,
  requestMovement,
  directionalSpeed,
  movementTravelDistance,
  HUMAN_LOCOMOTION,
  type LocomotionState,
  type LocomotionConfig,
} from './locomotion';
import { CONTACT, inContactZone } from './hitting';

export type Difficulty = 'easy' | 'normal' | 'hard';
// Speed remains below the human's 6.3 m/s. Difficulty changes decisions and consistency too.
export const PRESETS = {
  easy: {
    reaction: 0.36,
    speed: 4.4,
    acceleration: 13,
    confidence: 0.68,
    commitment: 0.24,
    precision: 0.85,
    errorChance: 0.14,
    aggression: 0.24,
    recovery: 0.6,
    variety: 0.16,
  },
  normal: {
    reaction: 0.23,
    speed: 5.4,
    acceleration: 16,
    confidence: 0.84,
    commitment: 0.18,
    precision: 0.42,
    errorChance: 0.065,
    aggression: 0.55,
    recovery: 0.82,
    variety: 0.23,
  },
  hard: {
    reaction: 0.14,
    speed: 6.2,
    acceleration: 19,
    confidence: 0.95,
    commitment: 0.14,
    precision: 0.19,
    errorChance: 0.025,
    aggression: 0.8,
    recovery: 0.96,
    variety: 0.27,
  },
} as const;
export type AIState =
  | 'serve preparation'
  | 'serve execution'
  | 'return anticipation'
  | 'ball interception'
  | 'shot preparation'
  | 'shot execution'
  | 'defensive recovery'
  | 'neutral court recovery'
  | 'net approach'
  | 'point conclusion and reset';
export interface Interception {
  target: Vec;
  contact: Vec | null;
  contactVelocity?: Vec | null;
  time: number;
  bounce: Vec | null;
  bounceTime: number | null;
  reachable: boolean;
  confidence: number;
}
const legal = (p: Vec) => Math.abs(p.x) <= 6.7 && p.z <= -0.65 && p.z >= -15.3;
export const travelDistance = movementTravelDistance;
/** Keep existing difficulty pace/agility, with the shared directional proportions. */
export const AI_LOCOMOTION = Object.fromEntries(
  Object.entries(PRESETS).map(([difficulty, p]) => [
    difficulty,
    {
      ...HUMAN_LOCOMOTION,
      forwardSpeed: p.speed,
      lateralSpeed: (p.speed * HUMAN_LOCOMOTION.lateralSpeed) / HUMAN_LOCOMOTION.forwardSpeed,
      backwardSpeed: (p.speed * HUMAN_LOCOMOTION.backwardSpeed) / HUMAN_LOCOMOTION.forwardSpeed,
      acceleration: p.acceleration,
      lateralAcceleration: p.acceleration,
      lateralBraking: (p.acceleration * HUMAN_LOCOMOTION.braking) / HUMAN_LOCOMOTION.acceleration,
      lateralReversalBraking:
        (p.acceleration * HUMAN_LOCOMOTION.reversalBraking) / HUMAN_LOCOMOTION.acceleration,
      lateralResponse: HUMAN_LOCOMOTION.response,
      braking: (p.acceleration * HUMAN_LOCOMOTION.braking) / HUMAN_LOCOMOTION.acceleration,
      reversalBraking:
        (p.acceleration * HUMAN_LOCOMOTION.reversalBraking) / HUMAN_LOCOMOTION.acceleration,
    },
  ]),
) as Record<Difficulty, Readonly<LocomotionConfig>>;
/** Uses Ball.step at the authoritative 120 Hz; stops at a second bounce or dead net.
 * One scratch ball per controller, no per-frame prediction or array of trajectory samples. */
export function planInterception(
  ball: Ball,
  player: Vec,
  speed: number,
  serve: boolean,
  bounces = 0,
  reaction = 0,
  acceleration = 16,
  confidence = 1,
  scratch = new Ball(),
  velocity = vec(),
  events: BallEvent[] = [],
  movement: Readonly<LocomotionConfig> = {
    ...HUMAN_LOCOMOTION,
    forwardSpeed: speed,
    lateralSpeed: (speed * HUMAN_LOCOMOTION.lateralSpeed) / HUMAN_LOCOMOTION.forwardSpeed,
    backwardSpeed: (speed * HUMAN_LOCOMOTION.backwardSpeed) / HUMAN_LOCOMOTION.forwardSpeed,
    acceleration,
  },
  lateralStance = 0,
): Interception {
  scratch.copyFrom(ball);
  let count = bounces,
    bounce: Vec | null = null,
    bounceTime: number | null = null;
  let best: Vec | null = null,
    contact: Vec | null = null,
    contactVelocity: Vec | null = null,
    contactTime = 0,
    bestCost = Infinity;
  let fallback: Vec | null = null,
    fallbackDistance = Infinity;
  const dt = 1 / 120;
  const target = vec();
  const hitContext = {
    player: target,
    ball: scratch.position,
    velocity: scratch.velocity,
    side: 1 as const,
    bounces: count,
    intent: 'drive' as const,
  };
  for (let i = 1; i <= 420 && scratch.active; i++) {
    const time = i * dt;
    let dead = false;
    for (const event of scratch.step(dt, events)) {
      if (event.type === 'net' && !event.grazing) dead = true;
      if (event.type === 'bounce') {
        count++;
        if (!bounce) {
          bounce = { ...event.position };
          bounceTime = time;
        }
        if (count > 1) dead = true;
      }
    }
    if (dead) break;
    const p = scratch.position;
    if (p.z >= -0.15 || (serve && count === 0) || (count === 0 && player.z < -7 && p.y < 1.9))
      continue;
    // Stand behind the contact, leaving the same forward racket window as the human.
    target.x = p.x - Math.sign(p.x - player.x) * lateralStance;
    target.z = p.z - 0.55;
    hitContext.bounces = count;
    if (!legal(target) || !inContactZone(hitContext)) continue;
    const distance = Math.hypot(target.x - player.x, target.z - player.z);
    if (distance < fallbackDistance) {
      fallback ??= vec();
      Object.assign(fallback, target);
      fallbackDistance = distance;
    }
    const available = Math.max(0, time - reaction);
    // Project authoritative momentum, retaining negative velocity on reversals.
    const ux = distance > 0 ? (target.x - player.x) / distance : 0;
    const uz = distance > 0 ? (target.z - player.z) / distance : 0;
    const initial = ux * velocity.x + uz * velocity.z;
    // Conservative time to shed transverse momentum before settling at contact.
    const turnTime = Math.abs(ux * velocity.z - uz * velocity.x) / movement.braking;
    const pace = distance > 0 ? directionalSpeed(ux, uz, 1, movement) : speed;
    const reach = travelDistance(
      Math.max(0, available - 0.08 - turnTime),
      pace,
      acceleration,
      initial,
      movement.reversalBraking,
      movement.response,
      movement.braking,
    );
    if (distance > reach + 0.65) continue;
    const cost =
      distance * 0.12 +
      Math.abs(p.y - 1.15) * 0.4 +
      time * 0.16 +
      (count === 0 && player.z < -7 ? 0.8 : 0);
    if (cost < bestCost) {
      bestCost = cost;
      best ??= vec();
      Object.assign(best, target);
      contact ??= vec();
      Object.assign(contact, p);
      contactVelocity ??= vec();
      Object.assign(contactVelocity, scratch.velocity);
      contactTime = time;
    }
  }
  return {
    target: best ?? fallback ?? vec(clamp(ball.position.x, -4, 4), 0, -11),
    contact,
    contactVelocity,
    time: contactTime,
    bounce,
    bounceTime,
    reachable: !!best,
    confidence: best ? confidence : 0,
  };
}
// Compatibility entry points for existing consumers/tests.
export function intercept(ball: Ball, player: Vec, speed: number, serve: boolean): Vec {
  return planInterception(ball, player, speed, serve).target;
}
export function chooseShot(ball: Vec, opponent: Vec, rng: Random): Shot {
  if (opponent.z < 5 && rng.next() < 0.6) return 'lob';
  if (ball.z > -5 && ball.y > 1.2) return 'volley';
  return rng.next() < 0.22 ? 'slice' : 'drive';
}
export interface Tactic {
  name: string;
  shot: 'drive' | 'slice' | 'lob';
  aim: number;
  depth: number;
  power: number;
  utility: number;
  defensive: boolean;
  approach: boolean;
  errorProbability: number;
}
export interface TacticalContext {
  ball: Vec;
  velocity: Vec;
  player: Vec;
  opponent: Vec;
  bounces: number;
  quality: number;
  difficulty: Difficulty;
  previous?: string;
  character?: CharacterId;
}
export function shotErrorProbability(difficulty: Difficulty, quality: number, risk: number) {
  return clamp(PRESETS[difficulty].errorChance + (1 - quality) * 0.16 + risk * 0.065, 0, 0.5);
}
/** Normalized considerations, weighted sums, small repeat penalty and bounded tie variation.
 * Lob/slice/drive and automatic volley/Smash all go through the existing Match.hit. */
export function selectTactic(c: TacticalContext, rng: Random): Tactic {
  const profile = c.character ? ROSTER[c.character] : undefined;
  const p = PRESETS[c.difficulty],
    quality = clamp(c.quality, 0, 1);
  const pressure = clamp(
    (1 - quality) * 0.65 +
      (Math.abs(c.player.x) / 6.7) * 0.35 +
      Math.max(0, Math.hypot(c.velocity.x, c.velocity.z) - 18) / 50,
    0,
    1,
  );
  const weak = clamp((13 - Math.abs(c.ball.z)) / 8, 0, 1) * quality;
  const netOpponent = clamp((7 - c.opponent.z) / 5, 0, 1);
  const cross = c.ball.x >= 0 ? -1 : 1,
    open = c.opponent.x >= 0 ? -1 : 1;
  const space = clamp(Math.abs(c.opponent.x) / 3.5, 0, 1);
  const volley = c.bounces === 0 && Math.abs(c.player.z) < 7;
  const smash = c.bounces === 0 && c.ball.y > 1.9 && c.velocity.y < 0 && Math.abs(c.player.z) < 10;
  const candidates = [
    {
      name: 'crosscourt',
      shot: 'drive',
      aim: cross * 0.83,
      depth: 0.05,
      risk: 0.35,
      score: 0.44 + quality * 0.18 + (cross === open ? space * p.aggression * 0.3 : 0),
    },
    {
      name: 'down the line',
      shot: 'drive',
      aim: -cross * 0.9,
      depth: 0.18,
      risk: 0.7,
      score:
        0.3 +
        quality * p.aggression * 0.45 +
        (-cross === open ? space * p.aggression * 0.65 : 0) -
        pressure * 0.3,
    },
    {
      name: 'deep neutral',
      shot: 'drive',
      aim: open * 0.28,
      depth: 0.2,
      risk: 0.05,
      score: 0.48 + pressure * 0.3 + (1 - p.aggression) * 0.14,
    },
    {
      name: 'short angle',
      shot: 'drive',
      aim: open * 0.95,
      depth: -1,
      risk: 0.8,
      score: weak > 0.4 ? 0.4 + weak * p.aggression * 0.6 + space * 0.15 : -2,
    },
    {
      name: 'defensive lob',
      shot: 'lob',
      aim: open * 0.38,
      depth: 0,
      risk: 0.08,
      score: 0.15 + pressure * 0.55 + netOpponent * 0.85,
    },
    {
      name: 'slice recovery',
      shot: 'slice',
      aim: cross * 0.58,
      depth: 0.3,
      risk: 0.1,
      score: 0.27 + pressure * 0.46 + (c.ball.y < 0.8 ? 0.26 : 0),
    },
    {
      name: 'volley',
      shot: 'drive',
      aim: open * 0.82,
      depth: -0.5,
      risk: 0.45,
      score: volley && !smash ? 1.02 + quality * 0.25 + space * 0.15 : -2,
    },
    {
      name: 'overhead smash',
      shot: 'drive',
      aim: open * 0.8,
      depth: 0,
      risk: 0.5,
      score: smash ? 1.15 : -2,
    },
  ] as const;
  let best = candidates[0] as (typeof candidates)[number],
    utility = -Infinity;
  for (const option of candidates) {
    // Drive can become an overhead. Lob/slice must not borrow its taller contact window.
    if (c.bounces === 0 && c.ball.y > CONTACT.volley.maxHeight && option.shot !== 'drive') continue;
    const score =
      option.score +
      (profile?.tactics[option.name] ?? 0) -
      (c.previous === option.name ? 0.08 : 0) +
      rng.range(0, p.variety);
    if (score > utility) {
      best = option;
      utility = score;
    }
  }
  return {
    name: best.name,
    shot: best.shot,
    aim: best.aim,
    depth: best.depth,
    power: clamp(
      0.38 + quality * p.aggression * 0.4 - pressure * 0.12 + (profile?.power ?? 0),
      0.3,
      0.9,
    ),
    utility,
    defensive: pressure > 0.42 || best.shot === 'lob' || best.shot === 'slice',
    approach:
      weak > 0.32 &&
      pressure < 0.45 &&
      best.shot === 'drive' &&
      rng.next() < clamp(p.aggression * 0.65 + (profile?.approach ?? 0), 0, 0.85),
    errorProbability: clamp(
      shotErrorProbability(c.difficulty, quality, best.risk) + (profile?.risk ?? 0),
      0.01,
      0.5,
    ),
  };
}
export function recoveryTarget(
  player: Vec,
  opponent: Vec,
  landingX: number,
  defensive: boolean,
  approach: boolean,
  discipline = 1,
): Vec {
  // Bisect plausible reply angles from the outgoing landing, with a small opponent-position bias.
  const x = clamp(landingX * 0.38 - opponent.x * 0.1, -2.2, 2.2) * discipline;
  return vec(
    x,
    0,
    approach ? -3.7 : defensive ? -12.1 : player.z > -5 ? -4.2 : -10.5 - Math.abs(landingX) * 0.12,
  );
}
export interface AIContext {
  phase: string;
  server: number;
  ball: Ball;
  player: Vec;
  opponent: Vec;
  lastHitter: number;
  contacts: number;
  bounces: number;
  serveFlight: boolean;
  difficulty: Difficulty;
  character?: CharacterId;
}
export class OpponentAI {
  state: AIState = 'point conclusion and reset';
  target = vec(0, 0, -10.5);
  recovery = vec(0, 0, -10.5);
  constructor(readonly locomotion: LocomotionState = createLocomotion()) {}
  get velocity() {
    return this.locomotion.velocity;
  }
  prediction: Interception | null = null;
  tactic: Tactic | null = null;
  selectedTarget: Vec | null = null;
  reaction = 0;
  private think = 0;
  private observed = -1;
  private execution = 0;
  private scratch = new Ball();
  private events: BallEvent[] = [];
  private observationError = 0;
  time = 0;
  decisions = 0;
  decisionMs = 0;
  maxDecisionMs = 0;
  history: { time: number; state: AIState }[] = [];
  reset(server: number, position = vec(0, 0, -10.5)) {
    this.target = { ...position };
    this.recovery = { ...position };
    resetLocomotion(this.locomotion);
    this.observed = -1;
    this.reaction = this.think = this.execution = 0;
    this.prediction = null;
    this.tactic = null;
    this.selectedTarget = null;
    this.transition(server === 1 ? 'serve preparation' : 'return anticipation');
  }
  private transition(state: AIState) {
    if (state === this.state) return;
    this.state = state;
    this.history.push({ time: this.time, state });
    if (this.history.length > 32) this.history.shift();
  }
  invalidatePrediction() {
    this.think = 0;
  }
  conclude() {
    this.transition('point conclusion and reset');
    resetLocomotion(this.locomotion);
  }
  served(c: AIContext, target: Vec) {
    this.selectedTarget = { ...target };
    this.recovery = recoveryTarget(
      c.player,
      c.opponent,
      target.x,
      false,
      false,
      PRESETS[c.difficulty].recovery * (c.character ? ROSTER[c.character].recovery : 1),
    );
    this.target = { ...this.recovery };
    this.execution = 0.18;
    this.transition('serve execution');
  }
  afterHit(c: AIContext, tactic: Tactic, target: Vec) {
    this.selectedTarget = { ...target };
    this.tactic = tactic;
    this.execution = 0.12;
    this.recovery = recoveryTarget(
      c.player,
      c.opponent,
      target.x,
      tactic.defensive,
      tactic.approach,
      PRESETS[c.difficulty].recovery * (c.character ? ROSTER[c.character].recovery : 1),
    );
    this.target = { ...this.recovery };
    this.transition('shot execution');
  }
  chooseTactic(context: TacticalContext, rng: Random) {
    const start = performance.now();
    const tactic = selectTactic(context, rng);
    const elapsed = performance.now() - start;
    this.decisions++;
    this.decisionMs += elapsed;
    this.maxDecisionMs = Math.max(this.maxDecisionMs, elapsed);
    return tactic;
  }
  update(dt: number, c: AIContext, rng: Random) {
    this.time += dt;
    if (c.phase !== 'rally') return;
    const preset = PRESETS[c.difficulty];
    if (this.observed !== c.contacts) {
      this.observed = c.contacts;
      this.reaction = c.lastHitter === 0 ? preset.reaction : 0;
      this.observationError = rng.range(-1, 1) * (1 - preset.confidence) * 1.5;
      this.think = 0;
      this.prediction = null;
    }
    this.reaction = Math.max(0, this.reaction - dt);
    this.execution = Math.max(0, this.execution - dt);
    this.think -= dt;
    if (this.prediction) this.prediction.time = Math.max(0, this.prediction.time - dt);
    if (this.execution > 0) return;
    if (c.lastHitter === 0) {
      if (this.reaction > 0) {
        this.transition('return anticipation');
        return;
      }
      if (this.think <= 0) {
        const start = performance.now();
        this.prediction = planInterception(
          c.ball,
          c.player,
          preset.speed,
          c.serveFlight,
          c.bounces,
          0,
          preset.acceleration,
          preset.confidence,
          this.scratch,
          this.velocity,
          this.events,
          AI_LOCOMOTION[c.difficulty],
        );
        const next = this.prediction.target;
        // Fixed perception offset per observed shot; keep intent stable between decision steps.
        this.target = vec(clamp(next.x + this.observationError, -6.7, 6.7), 0, next.z);
        this.think = preset.commitment;
        const elapsed = performance.now() - start;
        this.decisions++;
        this.decisionMs += elapsed;
        this.maxDecisionMs = Math.max(this.maxDecisionMs, elapsed);
      }
      const close = Math.hypot(this.target.x - c.player.x, this.target.z - c.player.z) < 1;
      this.transition(
        close && this.prediction?.reachable ? 'shot preparation' : 'ball interception',
      );
    } else {
      this.target = this.recovery;
      this.transition(
        this.tactic?.approach
          ? 'net approach'
          : this.tactic?.defensive
            ? 'defensive recovery'
            : 'neutral court recovery',
      );
    }
  }
  /** Desired velocity only. Match owns the single shared physical integrator.
   * The arrival envelope leaves enough distance to brake and retains the original
   * proportional settling near the target. Never accelerate the steering twice.
   */
  steer(player: Vec, difficulty: Difficulty) {
    const config = AI_LOCOMOTION[difficulty];
    const dx = this.target.x - player.x,
      dz = this.target.z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= 0.04) {
      requestMovement(this.locomotion, 0, 0, 1, config);
    } else {
      const pace = directionalSpeed(dx / distance, dz / distance, 1, config);
      const speed = Math.min(
        pace,
        distance * 4,
        Math.sqrt(2 * config.braking * Math.max(0, distance - 0.04)),
      );
      requestMovement(this.locomotion, dx / distance, dz / distance, 1, config, speed / pace);
    }
    return this.locomotion.desiredVelocity;
  }
  snapshot(difficulty: Difficulty, seed: number) {
    return {
      state: this.state,
      difficulty,
      target: { ...this.target },
      recovery: { ...this.recovery },
      prediction: this.prediction
        ? {
            ...this.prediction,
            target: { ...this.prediction.target },
            contact: this.prediction.contact ? { ...this.prediction.contact } : null,
            bounce: this.prediction.bounce ? { ...this.prediction.bounce } : null,
          }
        : null,
      tactic: this.tactic ? { ...this.tactic } : null,
      selectedTarget: this.selectedTarget ? { ...this.selectedTarget } : null,
      reactionDelay: this.reaction,
      configuredReaction: PRESETS[difficulty].reaction,
      confidence: this.prediction?.confidence ?? 0,
      velocity: { ...this.velocity },
      seed,
      time: this.time,
      history: this.history.map((entry) => ({ ...entry })),
      decisions: this.decisions,
      averageDecisionMs: this.decisionMs / Math.max(1, this.decisions),
      maxDecisionMs: this.maxDecisionMs,
    };
  }
}

export function chooseServe(difficulty: Difficulty, deuce: boolean, second: boolean, rng: Random) {
  const preset = PRESETS[difficulty];
  // T/body/wide targets, all inside the diagonal service box before ordinary placement error.
  const lateral = rng.next();
  const targetX = lateral < 0.34 ? 0.8 : lateral < 0.67 ? 1.9 : 3.05;
  const direction = deuce ? 1 : -1;
  return {
    aim: (direction * (targetX - 2)) / 1.55,
    power: second
      ? 0.36
      : clamp(0.4 + preset.aggression * 0.32 + rng.range(-0.07, 0.07), 0.35, 0.75),
  };
}
