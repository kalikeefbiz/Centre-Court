import { type AssistanceMode } from '../core/anticipation';
import { Match, FixedClock, type Controls } from '../core/match';
import type { CharacterId } from '../core/roster';
import type { Difficulty } from '../core/ai';
import type { MatchLength } from '../core/scoring';
export interface MatchConfig {
  player: CharacterId;
  rival: CharacterId;
  racket: string;
  rivalRacket: string;
  difficulty: Difficulty;
  assistance?: AssistanceMode;
  length: MatchLength;
  practice: boolean;
  circuit: boolean;
}
/** Owns authoritative simulation, never constructed for menu presentation. */
export class MatchSession {
  static active = 0;
  readonly match = new Match();
  readonly clock = new FixedClock();
  readonly id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  recorded = false;
  disposed = false;
  steps = 0;
  private skipFrame = false;
  constructor(
    readonly config: MatchConfig,
    private cleanup: () => void,
  ) {
    MatchSession.active++;
    this.match.assistanceMode = config.assistance ?? 'standard';
    this.match.characters = [config.player, config.rival];
    this.match.start(config.difficulty, config.length, config.practice);
  }
  advance(dt: number, controls: Controls) {
    if (this.disposed || this.match.phase === 'paused' || this.match.phase === 'result') {
      this.clock.reset();
      return;
    }
    if (this.skipFrame) {
      this.skipFrame = false;
      this.clock.reset();
      return;
    }
    this.clock.advance(dt, (step) => {
      this.match.tick(step, controls);
      this.steps++;
      controls.release = false;
      controls.gestures = undefined;
    });
  }
  suspend() {
    this.match.pause();
    this.clock.reset();
    this.skipFrame = true;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    MatchSession.active--;
    this.clock.reset();
    this.match.menu();
    this.cleanup();
  }
}
