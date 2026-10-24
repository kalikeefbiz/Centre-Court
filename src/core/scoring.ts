import { other, type Side } from './court';
export type MatchLength = 'short' | 'standard';
export class Score {
  points = [0, 0];
  games = [0, 0];
  sets = [0, 0];
  completedSets: number[][] = [];
  tiebreak = false;
  winner: Side | null = null;
  totalGames = 0;
  private tiebreakFirst: Side = 0;
  constructor(
    public length: MatchLength = 'short',
    public initialServer: Side = 0,
  ) {}
  get server(): Side {
    if (!this.tiebreak) return ((this.initialServer + this.totalGames) % 2) as Side;
    const n = this.points[0] + this.points[1];
    return n === 0
      ? this.tiebreakFirst
      : (((this.tiebreakFirst + Math.floor((n + 1) / 2)) % 2) as Side);
  }
  get deuce() {
    return (this.points[0] + this.points[1]) % 2 === 0;
  }
  label(side: Side): string {
    if (this.tiebreak) return String(this.points[side]);
    if (this.points.every((p) => p >= 3))
      return this.points[side] > this.points[other(side)] ? 'AD' : '40';
    return ['0', '15', '30', '40'][Math.min(3, this.points[side])];
  }
  get description() {
    if (this.tiebreak) return 'TIEBREAK · FIRST TO 7, WIN BY 2';
    if (this.points.every((p) => p >= 3))
      return this.points[0] === this.points[1]
        ? 'DEUCE'
        : `ADVANTAGE ${this.points[0] > this.points[1] ? 'YOU' : 'OPPONENT'}`;
    return this.deuce ? 'DEUCE COURT' : 'AD COURT';
  }
  award(side: Side): 'point' | 'game' | 'set' | 'match' {
    if (this.winner !== null) return 'match';
    this.points[side]++;
    const rival = other(side),
      target = this.tiebreak ? 7 : 4;
    if (this.points[side] < target || this.points[side] - this.points[rival] < 2) return 'point';
    const wasTie = this.tiebreak;
    this.games[side]++;
    this.totalGames++;
    this.points = [0, 0];
    const gamesTarget = this.length === 'short' ? 2 : 6;
    if (wasTie || (this.games[side] >= gamesTarget && this.games[side] - this.games[rival] >= 2)) {
      this.completedSets.push([...this.games]);
      this.sets[side]++;
      this.games = [0, 0];
      this.tiebreak = false;
      if (this.sets[side] >= (this.length === 'short' ? 1 : 2)) {
        this.winner = side;
        return 'match';
      }
      return 'set';
    }
    if (this.games.every((g) => g === gamesTarget)) {
      this.tiebreakFirst = this.server;
      this.tiebreak = true;
    }
    return 'game';
  }
}
