import { AVAILABLE, isCharacter, type CharacterId } from './roster';
export interface CircuitSave {
  version: 1;
  player: CharacterId;
  stage: number;
  wins: number;
  losses: number;
  completed: boolean;
  results: string[];
}
export const SAVE_KEY = 'centre-court-circuit-v1';
export const freshCircuit = (player: CharacterId = 'kira'): CircuitSave => ({
  version: 1,
  player,
  stage: 0,
  wins: 0,
  losses: 0,
  completed: false,
  results: [],
});
export const CIRCUIT_ORDER: CharacterId[] = ['dante', 'rico', 'zuri', 'nova', 'kira', 'jax'];
export const ladder = (player: CharacterId) =>
  CIRCUIT_ORDER.filter((id) => id !== player && AVAILABLE.includes(id));
export class Competition {
  save = freshCircuit();
  persistent = true;
  constructor(private storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const raw = storage?.getItem(SAVE_KEY);
      if (!raw) return;
      let s;
      try {
        s = JSON.parse(raw);
      } catch {
        return;
      }
      if (!s || typeof s !== 'object') return;
      if (
        s.version !== 1 ||
        !isCharacter(s.player) ||
        !AVAILABLE.includes(s.player) ||
        ![s.stage, s.wins, s.losses].every((v) => Number.isSafeInteger(v) && v >= 0) ||
        s.stage > ladder(s.player).length ||
        typeof s.completed !== 'boolean' ||
        s.completed !== (s.stage === ladder(s.player).length) ||
        !Array.isArray(s.results) ||
        s.results.length > 100 ||
        !s.results.every((v: unknown) => typeof v === 'string')
      )
        return;
      this.save = s;
    } catch {
      this.persistent = false;
    }
  }
  persist() {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      this.persistent = false;
    }
  }
  restart(player = this.save.player) {
    this.save = freshCircuit(player);
    this.persist();
  }
  record(id: string, player: CharacterId, opponent: CharacterId, won: boolean, circuit: boolean) {
    if (this.save.results.includes(id)) return;
    if (this.save.player !== player) this.restart(player);
    this.save.results.push(id);
    this.save.results = this.save.results.slice(-100);
    if (won) this.save.wins++;
    else this.save.losses++;
    if (circuit && won && !this.save.completed && ladder(player)[this.save.stage] === opponent) {
      this.save.stage++;
      this.save.completed = this.save.stage === ladder(player).length;
    }
    this.persist();
  }
}
