import {
  HumanAnticipation,
  steerInterception,
  type AssistanceMode,
  type ReturnMiss,
} from './anticipation';
import { ANIMATIONS } from '../render/animation-registry';
import { ROSTER, type CharacterId } from './roster';
import { METER, heatLevel, signatureShot } from './signature';
import { selectStroke, inContactZone, shotTarget, CONTACT, type Stroke } from './hitting';
import { Ball, GRAVITY, type Shot, type BallEvent } from './ball';
import {
  OpponentAI,
  chooseServe,
  PRESETS,
  AI_LOCOMOTION,
  type Difficulty,
  type Tactic,
} from './ai';
import {
  COURT,
  clamp,
  inCourt,
  other,
  Random,
  sign,
  validServe,
  vec,
  type Side,
  type Vec,
} from './court';
import {
  STRIKE,
  createStroke,
  sampleRig,
  racketPosition,
  advanceStroke,
  sweptContact,
  type StrokeAction,
} from './stroke';
import type { GestureCommand } from './shot-gesture';
import { Score, type MatchLength } from './scoring';
import {
  createLocomotion,
  resetLocomotion,
  requestMovement,
  stepLocomotion,
  HUMAN_LOCOMOTION,
  PLAYER_BOUNDS,
  type LocomotionState,
  type LocomotionConfig,
} from './locomotion';
const ATHLETE_SIDES = [0, 1] as const;
export type Phase = 'menu' | 'serve' | 'rally' | 'pointOver' | 'paused' | 'result';
export interface ShotContact {
  id: number;
  stroke: Stroke;
  athletePosition: Vec;
  position: Vec;
  age: number;
  quality: number;
  timing: number;
}
export interface Athlete {
  contact: ShotContact | null;
  action: StrokeAction | null;
  position: Vec;
  locomotion: LocomotionState;
  swing: number;
  stroke: string;
  distance: number;
}
export interface Controls {
  x: number;
  z: number;
  aim: number;
  depth: number;
  power: number;
  shot: 'drive' | 'slice' | 'lob';
  release: boolean;
  gestures?: GestureCommand[];
}
export const idleControls = (): Controls => ({
  x: 0,
  z: 0,
  aim: 0,
  depth: 0,
  power: 0.5,
  shot: 'drive',
  release: false,
});
export interface MatchEvent {
  id: number;
  type: 'impact' | 'bounce' | 'net' | 'point' | 'signature' | 'heat';
  side: Side;
  strength: number;
  stroke?: string;
}
export class Match {
  assistanceMode: AssistanceMode = 'standard';
  anticipation = new HumanAnticipation();
  accessibility = {
    lastMiss: null as ReturnMiss | null,
    misses: {} as Partial<Record<ReturnMiss, number>>,
    assistedTicks: 0,
    movedAway: false,
    input: false,
    reached: false,
  };
  private miss(reason: ReturnMiss) {
    if (this.accessibility.lastMiss) return;
    this.accessibility.lastMiss = reason;
    this.accessibility.misses[reason] = (this.accessibility.misses[reason] ?? 0) + 1;
  }
  characters: [CharacterId, CharacterId] = ['kira', 'rico'];
  meters = [0, 0];
  armed = [false, false];
  returns = 0;
  events: MatchEvent[] = [];
  private eventSequence = 0;
  get heat() {
    return this.phase === 'rally' ? heatLevel(this.returns) : 0;
  }
  private emit(type: MatchEvent['type'], side: Side, strength = 1, stroke?: string) {
    this.events.push({ id: ++this.eventSequence, type, side, strength, stroke });
    if (this.events.length > 64) this.events.shift();
  }
  armSignature(side: Side = 0) {
    if (this.phase !== 'rally' || this.meters[side] < METER.full) return false;
    this.armed[side] = true;
    return true;
  }
  private credit(side: Side, amount: number) {
    this.meters[side] = Math.min(METER.full, this.meters[side] + amount);
  }

  phase: Phase = 'menu';
  private beforePause: Phase = 'serve';
  score = new Score();
  ball = new Ball();
  players: Athlete[] = [0, 1].map((i) => ({
    contact: null,
    action: null,
    locomotion: createLocomotion(),
    position: vec(0, 0, i === 0 ? 11 : -11),
    swing: 0,
    stroke: 'READY',
    distance: 0,
  }));
  difficulty: Difficulty = 'normal';
  practice = false;
  random = new Random();
  server: Side = 0;
  lastHitter: Side = 0;
  bounces = 0;
  fault = 0;
  serveFlight = false;
  timer = 0;
  rallyTime = 0;
  contacts = 0;
  bestRally = 0;
  totalPoints = 0;
  notice = 'WELCOME TO CENTRE COURT';
  noticeId = 0;
  timing = '';
  feedbackTime = 0;
  pointWinner: Side | null = null;
  private contactSequence = 0;
  private actionSequence = 0;
  private predictionBall = new Ball();
  private predictionEvents: BallEvent[] = [];
  private ballEvents: BallEvent[] = [];
  private previousBall = vec();
  private tossVelocity = vec();
  private tossStarted = false;
  private aiPendingTactic: Tactic | null = null;
  inputEpoch = 0;
  private lastGestureSequence = 0;
  private droppedGestureId = 0;
  private swingGestureId = 0;
  private swingCommitted = true;
  private swingDelay: number = STRIKE.lead;
  private swingWindow = 0;
  private swingPower = 0.5;
  private swingAim = 0;
  private swingDepth = 0;
  private swingShot: Shot = 'drive';
  ai = new OpponentAI(this.players[1].locomotion);
  initialSeed = 314159;
  private aiContext() {
    return {
      phase: this.phase,
      server: this.server,
      ball: this.ball,
      player: this.players[1].position,
      opponent: this.players[0].position,
      lastHitter: this.lastHitter,
      contacts: this.contacts,
      bounces: this.bounces,
      serveFlight: this.serveFlight,
      difficulty: this.difficulty,
      character: this.characters[1],
    };
  }
  start(difficulty: Difficulty, length: MatchLength, practice = false, seed = 314159) {
    this.anticipation.reset();
    this.accessibility = {
      lastMiss: null,
      misses: {},
      assistedTicks: 0,
      movedAway: false,
      input: false,
      reached: false,
    };
    this.meters = [0, 0];
    this.armed = [false, false];
    this.events = [];
    this.returns = 0;
    this.difficulty = difficulty;
    this.practice = practice;
    this.random = new Random(seed);
    this.initialSeed = seed;
    this.ai = new OpponentAI(this.players[1].locomotion);
    this.score = new Score(length);
    this.fault = 0;
    this.contacts = 0;
    this.bestRally = 0;
    this.totalPoints = 0;
    this.pointWinner = null;
    this.feedbackTime = 0;
    this.prepareServe();
  }
  private announce(message: string) {
    this.notice = message;
    this.noticeId++;
  }
  private prepareServe() {
    this.anticipation.reset();
    this.accessibility.lastMiss = null;
    this.accessibility.movedAway = this.accessibility.input = this.accessibility.reached = false;
    this.resetGestureInput();
    this.phase = 'serve';
    this.returns = 0;
    this.armed = [false, false];
    this.pointWinner = null;
    for (const p of this.players) {
      resetLocomotion(p.locomotion);
      p.action = null;
      p.contact = null;
      p.swing = 0;
    }
    this.server = this.practice ? 0 : this.score.server;
    this.lastHitter = this.server;
    this.bounces = 0;
    this.contacts = 0;
    this.serveFlight = false;
    this.rallyTime = 0;
    this.timer = 0;
    this.swingWindow = 0;
    const sx = (this.score.deuce ? 1 : -1) * sign(this.server) * 1.6;
    this.repositionPlayer(this.server, vec(sx, 0, sign(this.server) * 12.35));
    this.repositionPlayer(other(this.server), vec(-sx * 0.8, 0, -sign(this.server) * 10.4));
    this.ball.active = false;
    this.placeServeBall(0);
    this.tossStarted = false;
    this.aiPendingTactic = null;
    this.ball.velocity = vec();
    this.ball.spin.x = this.ball.spin.y = this.ball.spin.z = 0;
    this.ai.reset(this.server, this.players[1].position);
    this.announce(
      this.server === 0
        ? `${this.fault ? 'SECOND' : 'FIRST'} SERVE · TAP OR HOLD HIT`
        : `OPPONENT · ${this.fault ? 'SECOND' : 'FIRST'} SERVE`,
    );
  }
  pause() {
    if (this.phase === 'rally' || this.phase === 'serve' || this.phase === 'pointOver') {
      this.anticipation.reset();
      this.resetGestureInput();
      this.beforePause = this.phase;
      this.phase = 'paused';
      this.swingWindow = 0;
    }
  }
  resume() {
    if (this.phase === 'paused') this.phase = this.beforePause;
  }
  menu() {
    this.anticipation.reset();
    this.resetGestureInput();
    this.phase = 'menu';
    this.repositionPlayer(0, vec(0, 0, 11));
    this.repositionPlayer(1, vec(0, 0, -11));
    this.clearMovement();
    this.ball.active = false;
    this.swingWindow = 0;
  }
  /** Intentional placement (serve setup/developer fixtures), never gameplay travel. */
  repositionPlayer(side: Side, position: Vec) {
    if (side === 0) this.anticipation.reset();
    this.players[side].action = null;
    this.players[side].contact = null;
    this.players[side].swing = 0;
    Object.assign(this.players[side].position, position);
    resetLocomotion(this.players[side].locomotion);
  }
  private clearMovement() {
    this.anticipation.reset();
    this.resetGestureInput();
    for (const p of this.players) resetLocomotion(p.locomotion);
  }
  private cancelGesture(id?: number) {
    const action = this.players[0].action;
    if (action && !action.committed && (id === undefined || action.gestureId === id))
      this.players[0].action = null;
    if (id === undefined || this.swingGestureId === id) {
      this.swingWindow = 0;
      this.swingGestureId = 0;
      this.swingCommitted = true;
      this.swingDelay = STRIKE.lead;
    }
  }
  private resetGestureInput() {
    this.inputEpoch++;
    this.cancelGesture();
  }
  private gestureCommand(command: GestureCommand) {
    if (command.sequence <= this.lastGestureSequence) return;
    this.lastGestureSequence = command.sequence;
    if (command.kind === 'cancel') {
      this.cancelGesture(command.id);
      return;
    }
    if (command.id <= this.droppedGestureId) return;
    if (this.phase === 'serve') {
      if (command.kind === 'commit' && this.server === 0)
        this.beginServe(command.power, command.aim);
      return;
    }
    if (this.phase !== 'rally') return;
    const action = this.players[0].action;
    if (command.kind === 'commit') {
      if (action?.gestureId === command.id && !action.committed) {
        action.committed = true;
        return;
      }
      if (this.swingGestureId === command.id && this.swingWindow > 0) {
        this.swingCommitted = true;
        return;
      }
      // A resolved first tap may be followed by a distinct committed hold/lob.
      // Never queue a second strike behind a swing already committed or in recovery.
      if (action || this.swingWindow > 0) {
        this.droppedGestureId = command.id;
        return;
      }
    } else if (action || this.swingWindow > 0) {
      this.droppedGestureId = command.id;
      return;
    }
    this.swingGestureId = command.id;
    this.swingCommitted = command.kind === 'commit';
    this.swingDelay = Math.max(STRIKE.lead, command.delay);
    this.swingWindow = CONTACT.inputWindow;
    this.swingPower = command.power;
    this.swingAim = command.aim;
    this.swingDepth = command.depth;
    this.swingShot = command.shot;
  }
  private move(side: Side, config: Readonly<LocomotionConfig>, dt: number) {
    const p = this.players[side];
    p.distance += stepLocomotion(p.locomotion, p.position, side, config, dt);
  }
  private recordContact(side: Side, stroke: Stroke) {
    this.emit('impact', side, this.players[side].action?.power ?? 0.5, stroke);
    this.players[side].contact = {
      id: ++this.contactSequence,
      stroke,
      athletePosition: { ...this.players[side].position },
      position: { ...this.ball.position },
      age: 0,
      quality: this.players[side].action?.timingQuality ?? 1,
      timing: (this.players[side].action?.age ?? 0) - (this.players[side].action?.contactAt ?? 0),
    };
  }
  private placeServeBall(clipTime: number) {
    sampleRig('Serve', clipTime, this.ball.position, true);
    const p = this.players[this.server].position,
      direction = sign(this.server);
    this.ball.position.x = p.x + this.ball.position.x * direction;
    this.ball.position.z = p.z + this.ball.position.z * direction;
  }
  private beginServe(power: number, aim: number) {
    const athlete = this.players[this.server];
    if (athlete.action) return;
    const target = sampleRig('Serve', 46 / 30, vec());
    target.x = athlete.position.x + target.x * sign(this.server);
    target.z = athlete.position.z + target.z * sign(this.server);
    athlete.action = createStroke(
      ++this.actionSequence,
      'Serve',
      athlete.position,
      this.server,
      target,
      power,
      aim,
      0,
      'drive',
    );
    racketPosition(athlete.action, athlete.position, this.server, athlete.action.racket);
    this.tossStarted = false;
  }
  private tickServe(dt: number) {
    const athlete = this.players[this.server],
      action = athlete.action;
    if (!action) {
      this.placeServeBall(0);
      return;
    }
    const previousAge = action.age;
    advanceStroke(action, dt, athlete.position, this.server);
    if (action.age < STRIKE.tossRelease) {
      this.placeServeBall(action.clipTime);
    } else {
      if (!this.tossStarted) {
        this.placeServeBall(STRIKE.tossRelease * action.rate);
        const flight = action.contactAt - STRIKE.tossRelease;
        this.tossVelocity.x = (action.target.x - this.ball.position.x) / flight;
        this.tossVelocity.z = (action.target.z - this.ball.position.z) / flight;
        this.tossVelocity.y =
          (action.target.y - this.ball.position.y + 0.5 * GRAVITY * flight * flight) / flight;
        this.tossStarted = true;
      }
      const elapsed = Math.max(
        0,
        Math.min(action.age, action.contactAt) - Math.max(previousAge, STRIKE.tossRelease),
      );
      this.ball.position.x += this.tossVelocity.x * elapsed;
      this.ball.position.z += this.tossVelocity.z * elapsed;
      this.ball.position.y += this.tossVelocity.y * elapsed - 0.5 * GRAVITY * elapsed * elapsed;
      this.tossVelocity.y -= GRAVITY * elapsed;
    }
    if (action.age + 1e-8 >= action.contactAt) {
      action.contacted = true;
      action.timingQuality = 1;
      this.serve(action.power, action.aim);
    }
  }
  private beginStroke(
    side: Side,
    intent: Controls['shot'],
    power: number,
    aim: number,
    depth: number,
    lead: number = STRIKE.lead,
  ) {
    const athlete = this.players[side];
    if (athlete.action || this.lastHitter === side || this.phase !== 'rally') return false;
    const prep = side === 0 ? this.anticipation.preparation : null;
    const candidate = intent === 'drive' ? prep : null;
    const originalLead = lead;
    if (candidate && this.swingCommitted) {
      const a = ANIMATIONS[candidate.stroke];
      const progress = clamp((candidate.clipTime - a.prepare) / (a.contact - a.prepare), 0, 0.4);
      lead = Math.max(0.075, lead * (1 - progress));
    }
    if (
      Math.hypot(
        this.ball.position.x - athlete.position.x,
        this.ball.position.z - athlete.position.z,
      ) > 4
    )
      return false;
    const future = this.predictionBall.copyFrom(this.ball);
    let bounces = this.bounces;
    for (let i = 0; i < Math.ceil(lead * 120); i++) {
      for (const event of future.step(1 / 120, this.predictionEvents)) {
        if (event.type === 'net' && !event.grazing) return false;
        if (event.type === 'bounce') bounces++;
      }
    }
    if (bounces > 1 || (this.serveFlight && bounces === 0)) return false;
    const projected = vec(
      clamp(
        athlete.position.x + athlete.locomotion.velocity.x * lead,
        -PLAYER_BOUNDS.lateral,
        PLAYER_BOUNDS.lateral,
      ),
      0,
      sign(side) *
        clamp(
          sign(side) * (athlete.position.z + athlete.locomotion.velocity.z * lead),
          PLAYER_BOUNDS.net,
          PLAYER_BOUNDS.back,
        ),
    );
    const c = {
      player: projected,
      ball: future.position,
      velocity: future.velocity,
      side,
      bounces,
      intent,
    };
    if (!inContactZone(c)) return false;
    const selectedStroke = selectStroke(c);
    const compatible =
      candidate &&
      (candidate.stroke === selectedStroke ||
        (Math.abs(future.position.x - projected.x) < 0.45 &&
          (((candidate.stroke === 'Forehand' || candidate.stroke === 'Backhand') &&
            (selectedStroke === 'Forehand' || selectedStroke === 'Backhand')) ||
            ((candidate.stroke === 'ForehandVolley' || candidate.stroke === 'BackhandVolley') &&
              (selectedStroke === 'ForehandVolley' || selectedStroke === 'BackhandVolley')))));
    if (candidate && !compatible && lead !== originalLead)
      return this.beginStrokeWithoutPreparation(side, intent, power, aim, depth, originalLead);
    const stroke = compatible ? candidate.stroke : selectedStroke;
    const action = createStroke(
      compatible ? candidate.id : ++this.actionSequence,
      stroke,
      athlete.position,
      side,
      future.position,
      power,
      aim,
      depth,
      intent,
      athlete.locomotion.velocity,
      lead,
      compatible ? candidate.clipTime : undefined,
    );
    if (side === 0) this.anticipation.preparation = null;
    racketPosition(action, athlete.position, side, action.racket);
    Object.assign(action.previousRacket, action.racket);
    athlete.action = action;
    athlete.stroke = stroke.toUpperCase();
    return true;
  }
  private beginStrokeWithoutPreparation(
    side: Side,
    intent: Controls['shot'],
    power: number,
    aim: number,
    depth: number,
    lead: number,
  ): boolean {
    this.anticipation.preparation = null;
    return this.beginStroke(side, intent, power, aim, depth, lead);
  }
  private tickStrokes(dt: number) {
    for (const side of ATHLETE_SIDES) {
      const athlete = this.players[side],
        action = athlete.action;
      if (!action) continue;
      advanceStroke(action, dt, athlete.position, side);
      if (
        action.committed &&
        action.age + 1e-9 >= action.impactAfter &&
        !action.contacted &&
        !action.missed &&
        action.stroke !== 'Serve' &&
        action.phase === 'contact' &&
        this.canHit(side, action.intent)
      ) {
        const distance = sweptContact(action, this.previousBall, this.ball.position);
        if (distance <= STRIKE.forgiveness) {
          const timing = Math.abs(action.age - action.contactAt) / STRIKE.window;
          action.timingQuality = clamp(
            1 - timing * 0.3 - (distance / STRIKE.forgiveness) * 0.4,
            0.25,
            1,
          );
          action.contacted = true;
          this.hit(
            side,
            action.intent,
            action.power,
            action.aim,
            action.depth,
            side === 1 ? (this.aiPendingTactic ?? undefined) : undefined,
            action.timingQuality,
          );
        }
      }
      if (
        action.committed &&
        !action.contacted &&
        !action.missed &&
        action.age > action.contactAt + STRIKE.window
      ) {
        action.missed = true;
        if (side === 0 && this.phase === 'rally') {
          const p = athlete.position,
            b = this.ball.position;
          const current = selectStroke({
            player: p,
            ball: b,
            velocity: this.ball.velocity,
            side: 0,
            bounces: this.bounces,
            intent: action.intent,
          });
          const wrongFamily =
            action.prepared && (current === 'Smash') !== (action.stroke === 'Smash');
          this.miss(
            wrongFamily
              ? 'incompatible-preparation'
              : this.canHit(0, action.intent)
                ? 'racket-path'
                : Math.hypot(p.x - b.x, p.z - b.z) > CONTACT.ground.radius
                  ? 'too-far'
                  : 'contact-timing',
          );
          this.timing = 'MISSED · CHECK TIMING AND REACH';
          this.feedbackTime = 1.3;
        }
      }
      if (action.age > action.contactAt + STRIKE.followThrough + STRIKE.recovery)
        athlete.action = null;
    }
  }
  private serve(power: number, aim: number) {
    const error =
      this.server === 1 ? PRESETS[this.difficulty].precision * 0.7 : Math.abs(power - 0.65) * 0.8;
    const target = shotTarget(this.server, 'serve', power, aim, 0, vec(), this.score.deuce);
    target.x += this.server === 0 ? (power - 0.65) * 0.7 : this.random.range(-error, error);
    // A real launch from the held ball at the server's racket, followed by continuous integration.
    this.recordContact(this.server, 'Serve');
    this.ball.launch(target, 'serve', power);
    this.phase = 'rally';
    this.serveFlight = true;
    this.lastHitter = this.server;
    this.players[this.server].swing = 0.45;
    this.players[this.server].stroke = 'SERVE';
    this.contacts = 1;
    if (this.server === 1) this.ai.served(this.aiContext(), target);
    this.announce('SERVE');
  }
  private endPoint(winner: Side, reason: string) {
    if (this.phase !== 'rally') return; // Point resolution is idempotent.
    if (winner === 1 && this.lastHitter === 1)
      this.miss(
        this.accessibility.movedAway
          ? 'moved-away'
          : this.accessibility.input
            ? 'late-input'
            : this.accessibility.reached
              ? 'late-input'
              : 'too-far',
      );
    this.clearMovement();
    this.ai.conclude();
    this.pointWinner = winner;
    this.totalPoints++;
    this.credit(winner, METER.point);
    this.armed = [false, false];
    this.emit('point', winner);
    this.bestRally = Math.max(this.bestRally, this.contacts);
    this.ball.active = false;
    this.swingWindow = 0;
    this.fault = 0;
    if (this.practice) {
      this.phase = 'pointOver';
      this.timer = 1.7;
      this.announce(`${reason} · RALLY ${this.contacts}`);
      return;
    }
    const result = this.score.award(winner);
    this.announce(`${reason} · ${winner === 0 ? 'YOUR' : 'OPPONENT’S'} ${result.toUpperCase()}`);
    this.phase = result === 'match' ? 'result' : 'pointOver';
    this.timer = 2;
  }
  private serveFault(reason: string) {
    if (this.phase !== 'rally') return;
    if (this.fault === 1) {
      this.endPoint(other(this.server), 'DOUBLE FAULT');
      return;
    }
    this.fault = 1;
    this.clearMovement();
    this.ai.conclude();
    this.phase = 'pointOver';
    this.timer = 1.65;
    this.ball.active = false;
    this.swingWindow = 0;
    this.announce(`${reason} · SECOND SERVE`);
  }
  private handleBounce(at: Vec) {
    if (this.serveFlight) {
      if (!validServe(at, this.server, this.score.deuce)) {
        this.serveFault('FAULT');
        return;
      }
      if (this.ball.netTouched) {
        this.clearMovement();
        this.ai.conclude();
        this.phase = 'pointOver';
        this.timer = 1.5;
        this.ball.active = false;
        this.announce('LET · REPLAY SERVE');
        return;
      }
      this.serveFlight = false;
      this.bounces = 1;
      this.announce('IN · PLAY');
      return;
    }
    if (this.bounces === 0) {
      if (!inCourt(at) || at.z * sign(this.lastHitter) > 0) {
        this.endPoint(other(this.lastHitter), 'OUT');
        return;
      }
      this.bounces = 1;
    } else {
      this.endPoint(this.lastHitter, 'DOUBLE BOUNCE');
    }
  }
  private canHit(side: Side, intent: Controls['shot'] = 'drive') {
    if (
      this.phase !== 'rally' ||
      this.lastHitter === side ||
      this.serveFlight ||
      this.ball.position.z * sign(side) <= 0.15
    )
      return false;
    const p = this.players[side].position,
      b = this.ball.position;
    return inContactZone(
      {
        player: p,
        ball: b,
        velocity: this.ball.velocity,
        side,
        bounces: this.bounces,
        intent,
      },
      this.players[side].action?.stroke,
    );
  }
  private hit(
    side: Side,
    shot: Shot,
    power: number,
    aim: number,
    depth: number,
    tactic?: Tactic,
    execution = 1,
  ) {
    const p = this.players[side],
      b = this.ball.position;
    const distance = Math.hypot(p.position.x - b.x, p.position.z - b.z);
    const quality = clamp(
      (1 - Math.abs(b.y - 1.15) * 0.2 - Math.max(0, distance - 0.8) * 0.3) * execution,
      0,
      1,
    );
    let error =
      side === 0
        ? (1 - quality) * 1.5 + Math.abs(power - 0.7) * 0.35
        : (1 - quality) * 1.5 + Math.abs(power - 0.7) * 0.35 + PRESETS[this.difficulty].precision;
    // Execution errors affect placement through the same launch, net and in/out rules.
    if (side === 1 && tactic && this.random.next() < tactic.errorProbability) {
      error += this.random.range(3, 5);
    }
    const target = shotTarget(side, shot, power, aim, depth, vec());
    target.x +=
      side === 0
        ? (1 - quality) * Math.sign(b.x - p.position.x || 1) * 0.8
        : this.random.range(-error, error);
    target.z += side === 0 ? (power - 0.5) * (1 - quality) * 1.4 : this.random.range(-error, error);
    let signature = false;
    if (this.armed[side] && this.meters[side] >= METER.full) {
      const modified = signatureShot(
        this.characters[side],
        side,
        target,
        power,
        shot,
        this.players[other(side)].position,
        p.locomotion.speed > 2.5 || Math.abs(p.position.x) > 2.5,
        this.random.next(),
      );
      power = modified.power;
      shot = modified.shot;
      this.meters[side] = 0;
      this.armed[side] = false;
      signature = true;
      this.emit('signature', side);
    }
    const targetX = target.x,
      targetZ = target.z;
    const volley = this.bounces === 0 && shot === 'drive';
    const stroke =
      p.action?.stroke ??
      selectStroke({
        player: p.position,
        ball: b,
        velocity: this.ball.velocity,
        side,
        bounces: this.bounces,
        intent: shot as Controls['shot'],
      });
    this.recordContact(side, stroke);
    this.ball.launch(
      target,
      stroke === 'Smash' && shot === 'drive' ? 'drive' : volley ? 'volley' : shot,
      power,
      quality,
      Math.hypot(this.ball.velocity.x, this.ball.velocity.y, this.ball.velocity.z),
    );
    this.bounces = 0;
    this.lastHitter = side;
    this.anticipation.reset();
    if (side === 1) {
      this.accessibility.lastMiss = null;
      this.accessibility.movedAway = this.accessibility.input = this.accessibility.reached = false;
    }
    this.rallyTime = 0;
    this.contacts++;
    const previousHeat = heatLevel(this.returns);
    this.returns++;
    if (!signature)
      this.credit(
        side,
        METER.return +
          (this.returns >= 8 ? METER.sustained : 0) +
          (quality >= 0.78 ? METER.clean : 0),
      );
    if (heatLevel(this.returns) > previousHeat) this.emit('heat', side, heatLevel(this.returns));
    if (side === 1 && tactic)
      this.ai.afterHit(this.aiContext(), tactic, vec(targetX, COURT.radius, targetZ));
    p.swing = 0.38;
    p.stroke = stroke.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
    if (side === 0) {
      const timing = (p.action?.age ?? 0) - (p.action?.contactAt ?? 0);
      this.timing =
        quality < 0.5
          ? 'STRETCHED · WEAK CONTACT'
          : timing < -0.02
            ? 'EARLY · LESS PACE'
            : timing > 0.025
              ? 'LATE · LESS CONTROL'
              : quality > 0.78
                ? 'CLEAN CONTACT'
                : 'GOOD CONTACT';
      this.feedbackTime = 1.2;
      this.announce(p.stroke);
    }
    if (signature) {
      const profile = ROSTER[this.characters[side]];
      this.announce(`${profile.name} · ${profile.signature}`.toUpperCase());
    }
  }
  aimTarget(shot: Controls['shot'], power: number, aim: number, depth: number, out: Vec) {
    return shotTarget(
      0,
      this.phase === 'serve' && this.server === 0 ? 'serve' : shot,
      power,
      aim,
      depth,
      out,
      this.score.deuce,
    );
  }
  tick(dt: number, c: Controls) {
    if (c.gestures) for (const command of c.gestures) this.gestureCommand(command);
    if (this.phase === 'menu' || this.phase === 'paused' || this.phase === 'result') return;
    this.timer += this.phase === 'serve' ? dt : 0;
    this.feedbackTime = Math.max(0, this.feedbackTime - dt);
    for (const p of this.players) {
      p.swing = Math.max(0, p.swing - dt);
      if (p.contact) p.contact.age += dt;
    }
    if (this.phase === 'pointOver') {
      this.tickStrokes(dt);
      this.timer -= dt;
      if (this.timer <= 0) this.prepareServe();
      return;
    }
    if (this.phase === 'serve') {
      if (this.server === 0 && c.release) this.beginServe(c.power, c.aim);
      if (this.server === 1 && this.timer > 1.35 && !this.players[1].action) {
        const serve = chooseServe(this.difficulty, this.score.deuce, this.fault > 0, this.random);
        this.beginServe(serve.power, serve.aim);
      }
      this.tickServe(dt);
      return;
    }
    this.rallyTime += dt;

    const b = this.ball.position,
      user = this.players[0].position;
    this.anticipation.update(
      dt,
      this.ball,
      user,
      this.players[0].locomotion.velocity,
      this.contacts,
      this.bounces,
      this.serveFlight,
      this.lastHitter === 1,
      !this.players[0].action,
    );
    if (this.lastHitter === 1 && this.canHit(0)) this.accessibility.reached = true;
    const prediction = this.anticipation.prediction;
    if (
      prediction &&
      Math.hypot(c.x, c.z) >= 0.1 &&
      c.x * (prediction.target.x - user.x) + c.z * (prediction.target.z - user.z) < -0.1
    )
      this.accessibility.movedAway = true;
    if (
      steerInterception(this.players[0].locomotion, user, c.x, c.z, prediction, this.assistanceMode)
    )
      this.accessibility.assistedTicks++;
    this.move(0, HUMAN_LOCOMOTION, dt);
    if (c.release) {
      this.swingGestureId = 0;
      this.swingCommitted = true;
      this.swingDelay = STRIKE.lead;
      this.swingWindow = CONTACT.inputWindow;
      this.swingPower = c.power;
      this.swingAim = c.aim;
      this.swingDepth = c.depth;
      this.swingShot = c.shot;
      this.players[0].swing = 0.3;
    }
    if (this.swingWindow > 0) {
      this.accessibility.input = true;
      if (
        this.beginStroke(
          0,
          this.swingShot as Controls['shot'],
          this.swingPower,
          this.swingAim,
          this.swingDepth,
          this.swingDelay,
        )
      ) {
        const action = this.players[0].action!;
        action.gestureId = this.swingGestureId;
        action.committed = this.swingCommitted;
        action.impactAfter = this.swingCommitted ? 0 : action.contactAt;
        this.swingWindow = 0;
      } else {
        this.swingWindow -= dt;
        this.swingDelay = Math.max(STRIKE.lead, this.swingDelay - dt);
        if (this.swingWindow <= 0) {
          this.miss(
            this.accessibility.movedAway
              ? 'moved-away'
              : this.accessibility.reached
                ? 'late-input'
                : 'too-far',
          );
          this.timing = 'MISSED · CHECK TIMING AND REACH';
          this.feedbackTime = 1.2;
        }
      }
    }
    this.ai.update(dt, this.aiContext(), this.random);
    this.ai.steer(this.players[1].position, this.difficulty);
    this.move(1, AI_LOCOMOTION[this.difficulty], dt);
    if (
      this.ai.reaction <= 0 &&
      this.lastHitter === 0 &&
      !this.players[1].action &&
      (this.ai.prediction?.time ?? 1) < STRIKE.lead + 0.12
    ) {
      if (this.beginStroke(1, 'drive', 0.65, 0, 0)) {
        const athlete = this.players[1],
          prepared = athlete.action!;
        const position = athlete.position,
          contact = prepared.target;
        const distance = Math.hypot(position.x - contact.x, position.z - contact.z);
        const quality = clamp(
          1 - Math.abs(contact.y - 1.15) * 0.25 - Math.max(0, distance - 0.8) * 0.3,
          0,
          1,
        );
        const bounces = prepared.stroke.includes('Volley') || prepared.stroke === 'Smash' ? 0 : 1;
        const tactic = this.ai.chooseTactic(
          {
            ball: contact,
            velocity: this.predictionBall.velocity,
            player: position,
            opponent: user,
            bounces,
            quality,
            difficulty: this.difficulty,
            previous: this.ai.tactic?.name,
            character: this.characters[1],
          },
          this.random,
        );
        const stroke = selectStroke({
          player: position,
          ball: contact,
          velocity: this.predictionBall.velocity,
          side: 1,
          bounces,
          intent: tactic.shot,
        });
        athlete.action = createStroke(
          prepared.id,
          stroke,
          position,
          1,
          contact,
          tactic.power,
          tactic.aim,
          tactic.depth,
          tactic.shot,
          athlete.locomotion.velocity,
        );
        racketPosition(athlete.action, position, 1, athlete.action.racket);
        Object.assign(athlete.action.previousRacket, athlete.action.racket);
        this.aiPendingTactic = tactic;
        if (quality > 0.55 && (tactic.defensive || Math.abs(user.x) > 1.5 || this.returns >= 8))
          this.armSignature(1);
      }
    }
    Object.assign(this.previousBall, this.ball.position);
    for (const event of this.ball.step(dt, this.ballEvents)) {
      if (this.phase !== 'rally') break;
      this.emit(
        event.type,
        this.lastHitter,
        event.type === 'bounce' ? Math.min(1, Math.abs(this.ball.velocity.y) / 7) : 0.5,
      );
      if (this.lastHitter === 0) this.ai.invalidatePrediction();
      else this.anticipation.invalidate();
      if (event.type === 'net' && !event.grazing) {
        if (this.serveFlight) this.serveFault('NET FAULT');
        else this.endPoint(other(this.lastHitter), 'NET');
      } else if (event.type === 'bounce') this.handleBounce(event.position);
    }
    if (this.phase === 'rally') this.tickStrokes(dt);
    if (
      this.phase === 'rally' &&
      (this.rallyTime > 14 || Math.abs(b.x) > 22 || Math.abs(b.z) > 32)
    ) {
      if (this.serveFlight) this.serveFault('FAULT');
      else
        this.endPoint(
          this.bounces > 0 ? this.lastHitter : other(this.lastHitter),
          this.bounces > 0 ? 'UNRETURNED' : 'OUT',
        );
    }
  }
}
export const FIXED_DT = 1 / 120;
export class FixedClock {
  remainder = 0;
  advance(elapsed: number, tick: (dt: number) => void) {
    this.remainder += Math.min(Math.max(elapsed, 0), 0.1);
    while (this.remainder + 1e-10 >= FIXED_DT) {
      tick(FIXED_DT);
      this.remainder = Math.max(0, this.remainder - FIXED_DT);
    }
  }
  reset() {
    this.remainder = 0;
  }
}
