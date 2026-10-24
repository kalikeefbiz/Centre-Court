import { selectStroke, inContactZone, CONTACT, type Stroke } from './hitting';
import { Ball, type Shot } from './ball';
import { chooseShot, intercept, PRESETS, type Difficulty } from './ai';
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
import { Score, type MatchLength } from './scoring';
export type Phase = 'menu' | 'serve' | 'rally' | 'pointOver' | 'paused' | 'result';
export interface ShotContact {
  id: number;
  stroke: Stroke;
  athletePosition: Vec;
  position: Vec;
  age: number;
}
export interface Athlete {
  contact: ShotContact | null;
  position: Vec;
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
  private swingWindow = 0;
  private swingPower = 0.5;
  private swingAim = 0;
  private swingDepth = 0;
  private swingShot: Shot = 'drive';
  private aiReaction = 0;
  private aiThink = 0;
  private aiTarget = vec(0, 0, -10);
  private aiWillMiss = false;
  start(difficulty: Difficulty, length: MatchLength, practice = false, seed = 314159) {
    this.difficulty = difficulty;
    this.practice = practice;
    this.random = new Random(seed);
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
    for (const p of this.players) {
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
    this.players[this.server].position = vec(sx, 0, sign(this.server) * 12.35);
    this.players[other(this.server)].position = vec(-sx * 0.8, 0, -sign(this.server) * 10.4);
    this.ball.active = false;
    this.ball.position = vec(sx, 2.6, sign(this.server) * 12.1);
    this.ball.velocity = vec();
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
    this.ball.active = false;
    this.swingWindow = 0;
  }
  private move(side: Side, x: number, z: number, speed: number, dt: number) {
    const p = this.players[side].position,
      n = Math.max(1, Math.hypot(x, z));
    const before = { ...p };
    p.x = clamp(p.x + (x / n) * speed * dt, -6.7, 6.7);
    p.z = sign(side) * clamp(sign(side) * (p.z + (z / n) * speed * dt), 0.65, 15.3);
    this.players[side].distance += Math.hypot(p.x - before.x, p.z - before.z);
  }
  private react() {
    this.aiReaction = PRESETS[this.difficulty].reaction;
    this.aiThink = 0;
    this.aiWillMiss = this.random.next() < PRESETS[this.difficulty].miss;
  }
  private recordContact(side: Side, stroke: Stroke) {
    this.players[side].contact = {
      id: ++this.contactSequence,
      stroke,
      athletePosition: { ...this.players[side].position },
      position: { ...this.ball.position },
      age: 0,
    };
  }
  private serve(power: number, aim: number) {
    const s = sign(this.server),
      targetSign = (this.score.deuce ? -1 : 1) * s;
    const error =
      this.server === 1 ? PRESETS[this.difficulty].error * 0.7 : Math.abs(power - 0.65) * 0.8;
    const target = vec(
      targetSign * 2.0 + aim * 1.55 + this.random.range(-error, error),
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
    this.react();
    this.announce('SERVE');
  }
  private endPoint(winner: Side, reason: string) {
    if (this.phase !== 'rally') return; // Point resolution is idempotent.
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
  private canHit(side: Side) {
    if (
      this.phase !== 'rally' ||
      this.lastHitter === side ||
      this.serveFlight ||
      this.ball.position.z * sign(side) <= 0.15
    )
      return false;
    const p = this.players[side].position,
      b = this.ball.position;
    // GOAL 002C calibrates the playable athlete; preserve the existing opponent.
    if (side === 1) return b.y > 0.3 && b.y < 2.9 && Math.hypot(p.x - b.x, p.z - b.z) < 1.75;
    return inContactZone({
      player: p,
      ball: b,
      velocity: this.ball.velocity,
      side,
      bounces: this.bounces,
      intent: side === 0 ? (this.swingShot as Controls['shot']) : 'drive',
    });
  }
  private hit(side: Side, shot: Shot, power: number, aim: number, depth: number) {
    const p = this.players[side],
      b = this.ball.position,
      s = sign(side);
    const distance = Math.hypot(p.position.x - b.x, p.position.z - b.z);
    const quality = clamp(
      1 - Math.abs(b.y - 1.15) * 0.35 - Math.max(0, distance - 0.8) * 0.35,
      0,
      1,
    );
    const error =
      side === 0
        ? (1 - quality) * 1.5 + Math.abs(power - 0.7) * 0.35
        : PRESETS[this.difficulty].error;
    const targetX = clamp(aim, -1, 1) * 3.35 + this.random.range(-error, error);
    const targetZ =
      -s *
        (shot === 'lob'
          ? 10
          : shot === 'slice'
            ? 6.5 + power * 2
            : 7.3 + power * 3.5 + depth * 1.6) +
      this.random.range(-error, error);
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
    this.ball.launch(vec(targetX, COURT.radius, targetZ), volley ? 'volley' : shot, power);
    this.bounces = 0;
    this.lastHitter = side;
    this.rallyTime = 0;
    this.contacts++;
    this.react();
    p.swing = 0.38;
    p.stroke = stroke.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
    if (side === 0) {
      this.timing = quality > 0.78 ? 'CLEAN CONTACT' : quality > 0.5 ? 'GOOD CONTACT' : 'STRETCHED';
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
      this.timer -= dt;
      if (this.timer <= 0) this.prepareServe();
      return;
    }
    if (this.phase === 'serve') {
      if (this.server === 0 && c.release) this.serve(c.power, c.aim);
      if (this.server === 1 && this.timer > 1.35)
        this.serve(this.random.range(0.4, 0.8), this.random.range(-0.55, 0.55));
      return;
    }
    this.rallyTime += dt;
    this.move(0, c.x, c.z, 6.3, dt);
    // Limited X-only footwork assistance; no Z movement or automatic shots.
    const b = this.ball.position,
      user = this.players[0].position;
    if (
      Math.hypot(c.x, c.z) < 0.1 &&
      this.lastHitter === 1 &&
      b.z > 4 &&
      Math.abs(b.z - user.z) < 3 &&
      Math.abs(b.x - user.x) < 3.2
    )
      this.move(0, clamp((b.x - user.x) * 1.5, -1, 1), 0, 1.8, dt);
    if (c.release) {
      this.swingWindow = CONTACT.inputWindow;
      this.swingPower = c.power;
      this.swingAim = c.aim;
      this.swingDepth = c.depth;
      this.swingShot = c.shot;
      this.players[0].swing = 0.3;
    }
    if (this.swingWindow > 0) {
      if (this.canHit(0)) {
        this.hit(0, this.swingShot, this.swingPower, this.swingAim, this.swingDepth);
        this.swingWindow = 0;
      } else {
        this.swingWindow -= dt;
        if (this.swingWindow <= 0) {
          this.timing = 'MISSED · GET CLOSER';
          this.feedbackTime = 1.1;
        }
      }
    }
    const preset = PRESETS[this.difficulty];
    this.aiReaction -= dt;
    this.aiThink -= dt;
    if (this.aiReaction <= 0) {
      if (this.aiThink <= 0) {
        this.aiTarget =
          this.lastHitter === 0
            ? intercept(this.ball, this.players[1].position, preset.speed, this.serveFlight)
            : vec(clamp(-user.x * 0.18, -1.5, 1.5), 0, -10);
        this.aiThink = 0.12;
      }
      const ai = this.players[1].position,
        dx = this.aiTarget.x - ai.x,
        dz = this.aiTarget.z - ai.z,
        d = Math.hypot(dx, dz);
      if (d > 0.12)
        this.move(
          1,
          (dx / Math.max(d, 0.01)) * Math.min(1, d * 3),
          (dz / Math.max(d, 0.01)) * Math.min(1, d * 3),
          preset.speed,
          dt,
        );
      if (this.canHit(1) && !this.aiWillMiss) {
        const shot = chooseShot(b, user, this.random),
          aim = (user.x > 0 ? -0.7 : 0.7) * preset.aggression + this.random.range(-0.22, 0.22);
        this.hit(1, shot, this.random.range(0.42, 0.75), aim, 0);
      }
    }
    for (const event of this.ball.step(dt)) {
      if (this.phase !== 'rally') break;
      if (event.type === 'net' && !event.grazing) {
        if (this.serveFlight) this.serveFault('NET FAULT');
        else this.endPoint(other(this.lastHitter), 'NET');
      } else if (event.type === 'bounce') this.handleBounce(event.position);
    }
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
