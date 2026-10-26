import type { Match } from '../core/match';
import { vec, COURT } from '../core/court';
export const AI_FEEDS = [
  'Baseline exchange',
  'Wide defence',
  'Open court',
  'Short ball',
  'Human forehand return',
  'Human backhand return',
] as const;
export type AIFeed = (typeof AI_FEEDS)[number];
/** Explicit developer-only starting fixtures. After launch all motion, contact and scoring
 * use the production Match tick. No forced hit, tactical choice or result. */
export function feedAI(match: Match, feed: AIFeed, seed: number) {
  match.start(match.difficulty, match.score.length, true, seed);
  match.phase = 'rally';
  match.serveFlight = false;
  if (feed.startsWith('Human ')) {
    match.lastHitter = 1;
    match.contacts = 0;
    match.repositionPlayer(0, vec(feed === 'Human forehand return' ? -0.4 : 0.4, 0, 12.5));
    match.repositionPlayer(1, vec(0, 0, -10));
    match.ai.reset(1, match.players[1].position);
    match.ball.position = vec(0, 1.3, -9);
    match.ball.launch(vec(0, COURT.radius, 8.8), 'drive', 0.6);
    match.notice = 'DEV FEED · HUMAN BASELINE RETURN';
    return;
  }
  match.lastHitter = 0;
  match.contacts = 1;
  const wide = feed === 'Wide defence',
    short = feed === 'Short ball';
  match.repositionPlayer(0, vec(feed === 'Open court' ? 3.5 : -1, 0, short ? 7 : 10));
  match.repositionPlayer(1, vec(wide ? 0.5 : 0, 0, short ? -7.2 : -10));
  match.ai.reset(0, match.players[1].position);
  match.ball.position = vec(wide ? 3 : 0, 1.4, short ? 7 : 9);
  match.ball.launch(
    vec(wide ? -2.9 : feed === 'Open court' ? 1.5 : 0, COURT.radius, short ? -4.8 : -8.8),
    short ? 'slice' : 'drive',
    short ? 0.15 : 0.55,
  );
  match.notice = `DEV FEED · ${feed.toUpperCase()}`;
}
