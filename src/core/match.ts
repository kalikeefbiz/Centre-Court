import { selectStroke, inContactZone, CONTACT, type Stroke } from './hitting';
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
import { Score, type MatchLength } from './scoring';
import {
  createLocomotion,
  resetLocomotion,
  requestMovement,
  stepLocomotion,
  HUMAN_LOCOMOTION,
  FOOTWORK_ASSIST,
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
export class Match {
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
    };
  }
  start(difficulty: Difficulty, length: MatchLength, practice = false, seed = 314159) {
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
    this.phase = 'serve';
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
      this.beforePause = this.phase;
      this.phase = 'paused';
      this.swingWindow = 0;
    }
  }
  resume() {
    if (this.phase === 'paused') this.phase = this.beforePause;
  }
  menu() {
    this.phase = 'menu';
    this.repositionPlayer(0, vec(0, 0, 11));
    this.repositionPlayer(1, vec(0, 0, -11));
    this.clearMovement();
    this.ball.active = false;
    this.swingWindow = 0;
  }
  /** Intentional placement (serve setup/developer fixtures), never gameplay travel. */
  repositionPlayer(side: Side, position: Vec) {
    this.players[side].action = null;
    this.players[side].contact = null;
    this.players[side].swing = 0;
    Object.assign(this.players[side].position, position);
    resetLocomotion(this.players[side].locomotion);
  }
  private clearMovement() {
    for (const p of this.players) resetLocomotion(p.locomotion);
  }
  private move(side: Side, config: Readonly<LocomotionConfig>, dt: number) {
    const p = this.players[side];
    p.distance += stepLocomotion(p.locomotion, p.position, side, config, dt);
  }
  private recordContact(side: Side, stroke: Stroke) {
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
  ) {
    const athlete = this.players[side];
    if (athlete.action || this.lastHitter === side || this.phase !== 'rally') return false;
    if (
      Math.hypot(
        this.ball.position.x - athlete.position.x,
        this.ball.position.z - athlete.position.z,
      ) > 4
    )
      return false;
    const future = this.predictionBall.copyFrom(this.ball);
    let bounces = this.bounces;
    for (let i = 0; i < Math.ceil(STRIKE.lead * 120); i++) {
      for (const event of future.step(1 / 120, this.predictionEvents)) {
        if (event.type === 'net' && !event.grazing) return false;
        if (event.type === 'bounce') bounces++;
      }
    }
    if (bounces > 1 || (this.serveFlight && bounces === 0)) return false;
    const projected = vec(
      clamp(
        athlete.position.x + athlete.locomotion.velocity.x * STRIKE.lead,
        -PLAYER_BOUNDS.lateral,
        PLAYER_BOUNDS.lateral,
      ),
      0,
      sign(side) *
        clamp(
          sign(side) * (athlete.position.z + athlete.locomotion.velocity.z * STRIKE.lead),
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
    const stroke = selectStroke(c);
    const action = createStroke(
      ++this.actionSequence,
      stroke,
      athlete.position,
      side,
      future.position,
      power,
      aim,
      depth,
      intent,
      athlete.locomotion.velocity,
    );
    racketPosition(action, athlete.position, side, action.racket);
    Object.assign(action.previousRacket, action.racket);
    athlete.action = action;
    athlete.stroke = stroke.toUpperCase();
    return true;
  }
  private tickStrokes(dt: number) {
    for (const side of ATHLETE_SIDES) {
      const athlete = this.players[side],
        action = athlete.action;
      if (!action) continue;
      advanceStroke(action, dt, athlete.position, side);
      if (
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
      if (!action.contacted && !action.missed && action.age > action.contactAt + STRIKE.window) {
        action.missed = true;
        if (side === 0) {
          this.timing = 'MISSED · PREPARE EARLIER OR MOVE INTO REACH';
          this.feedbackTime = 1.3;
        }
      }
      if (action.age > action.contactAt + STRIKE.followThrough + STRIKE.recovery)
        athlete.action = null;
    }
  }
  private serve(power: number, aim: number) {
    const s = sign(this.server),
      targetSign = (this.score.deuce ? -1 : 1) * s;
    const error =
      this.server === 1 ? PRESETS[this.difficulty].precision * 0.7 : Math.abs(power - 0.65) * 0.8;
    const target = vec(
      targetSign * 2.0 +
        aim * 1.55 +
        (this.server === 0 ? (power - 0.65) * 0.7 : this.random.range(-error, error)),
      COURT.radius,
      -s * (4.0 + power * 1.2),
    );
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
    this.clearMovement();
    this.ai.conclude();
    this.pointWinner = winner;
    this.totalPoints++;
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
    return inContactZone({
      player: p,
      ball: b,
      velocity: this.ball.velocity,
      side,
      bounces: this.bounces,
      intent,
    });
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
      b = this.ball.position,
      s = sign(side);
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
    const targetX =
      clamp(aim, -1, 1) * 3.35 +
      (side === 0
        ? (1 - quality) * Math.sign(b.x - p.position.x || 1) * 0.8
        : this.random.range(-error, error));
    const targetZ =
      -s *
        (shot === 'lob'
          ? 10
          : shot === 'slice'
            ? 6.5 + power * 2
            : 7.3 + power * 3.5 + depth * 1.6) +
      (side === 0 ? (power - 0.5) * (1 - quality) * 1.4 : this.random.range(-error, error));
    const volley = this.bounces === 0 && shot === 'drive';
    const stroke = selectStroke({
      player: p.position,
      ball: b,
      velocity: this.ball.velocity,
      side,
      bounces: this.bounces,
      intent: shot as Controls['shot'],
    });
    this.recordContact(side, stroke);
    this.ball.launch(
      vec(targetX, COURT.radius, targetZ),
      stroke === 'Smash' ? 'drive' : volley ? 'volley' : shot,
      power,
      quality,
      Math.hypot(this.ball.velocity.x, this.ball.velocity.y, this.ball.velocity.z),
    );
    this.bounces = 0;
    this.lastHitter = side;
    this.rallyTime = 0;
    this.contacts++;
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
  }
  tick(dt: number, c: Controls) {
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

    // Limited X-only footwork assistance; no Z movement or automatic shots.
    const b = this.ball.position,
      user = this.players[0].position;
    if (
      Math.hypot(c.x, c.z) < FOOTWORK_ASSIST.inputThreshold &&
      this.lastHitter === 1 &&
      b.z > 4 &&
      Math.abs(b.z - user.z) < 3 &&
      Math.abs(b.x - user.x) < 3.2
    ) {
      requestMovement(
        this.players[0].locomotion,
        clamp((b.x - user.x) * FOOTWORK_ASSIST.gain, -1, 1),
        0,
        0,
        HUMAN_LOCOMOTION,
        FOOTWORK_ASSIST.speed / HUMAN_LOCOMOTION.lateralSpeed,
      );
    } else {
      requestMovement(this.players[0].locomotion, c.x, c.z, 0, HUMAN_LOCOMOTION);
    }
    this.move(0, HUMAN_LOCOMOTION, dt);
    if (c.release) {
      this.swingWindow = CONTACT.inputWindow;
      this.swingPower = c.power;
      this.swingAim = c.aim;
      this.swingDepth = c.depth;
      this.swingShot = c.shot;
      this.players[0].swing = 0.3;
    }
    if (this.swingWindow > 0) {
      if (
        this.beginStroke(
          0,
          this.swingShot as Controls['shot'],
          this.swingPower,
          this.swingAim,
          this.swingDepth,
        )
      )
        this.swingWindow = 0;
      else {
        this.swingWindow -= dt;
        if (this.swingWindow <= 0) {
          this.timing = 'MISSED · PREPARE EARLIER OR MOVE INTO REACH';
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
          },
          this.random,
        );
        const stroke =
          tactic.shot === 'drive' ? prepared.stroke : tactic.shot === 'slice' ? 'Slice' : 'Lob';
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
      }
    }
    Object.assign(this.previousBall, this.ball.position);
    for (const event of this.ball.step(dt, this.ballEvents)) {
      if (this.phase !== 'rally') break;
      if (this.lastHitter === 0) this.ai.invalidatePrediction();
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
