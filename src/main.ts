import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-800.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './style.css';
import { Match, FixedClock } from './core/match';
import { Scene } from './render/scene';
import { Input } from './platform/input';
import type { Difficulty } from './core/ai';
import type { MatchLength } from './core/scoring';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const match = new Match(),
  clock = new FixedClock();
let scene: Scene;
try {
  scene = new Scene($<HTMLCanvasElement>('court'));
} catch (error) {
  $('loading').textContent =
    'Your browser could not start 3D rendering. Enable WebGL and reload Centre Court.';
  throw error;
}
const setText = (id: string, text: string) => {
  if ($(id).textContent !== text) $(id).textContent = text;
};
const togglePause = () => {
  if (!$('help').hidden) return;
  match.phase === 'paused' ? match.resume() : match.pause();
  input.clear();
  clock.reset();
};
const switchCamera = () => {
  scene.rig.switch(scene.rig.mode === 'broadcast' ? 'behind' : 'broadcast');
  updateCamera();
};
const input = new Input($<HTMLCanvasElement>('court'), togglePause, switchCamera);
const updateCamera = () => {
  $('camera-button').querySelector('span')!.textContent =
    scene.rig.mode === 'broadcast' ? 'Broadcast' : 'Behind player';
  $('camera-button').setAttribute('aria-label', `Switch camera: currently ${scene.rig.mode}`);
};
updateCamera();
const start = (practice: boolean) => {
  $('help').hidden = true;
  input.clear();
  clock.reset();
  match.start(
    $<HTMLSelectElement>('difficulty').value as Difficulty,
    $<HTMLSelectElement>('length').value as MatchLength,
    practice,
  );
  input.enabled = true;
  document.activeElement instanceof HTMLElement && document.activeElement.blur();
};
const menu = () => {
  match.menu();
  input.clear();
  input.enabled = false;
};
$('play').onclick = () => start(false);
$('practice').onclick = () => start(true);
$('pause-button').onclick = togglePause;
$('resume').onclick = togglePause;
$('camera-button').onclick = switchCamera;
$('restart').onclick = () => start(match.practice);
$('restart-pause').onclick = () => start(match.practice);
$('menu-pause').onclick = menu;
$('menu-result').onclick = menu;
$('home-link').onclick = (e) => {
  e.preventDefault();
  if (match.phase === 'menu') return;
  match.pause();
  input.clear();
};
$('help-button').onclick = () => {
  $('help').hidden = false;
};
$('help-close').onclick = () => {
  $('help').hidden = true;
};
const interrupt = () => {
  match.pause();
  input.clear();
  clock.reset();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) interrupt();
});
window.addEventListener('blur', interrupt);
window.addEventListener('pagehide', interrupt);
$('court').addEventListener('webglcontextlost', interrupt);
const renderUI = () => {
  $('menu').hidden = match.phase !== 'menu';
  $('menu-note').hidden = match.phase !== 'menu';
  $('footer').hidden = match.phase !== 'menu';
  $('hud').hidden = match.phase === 'menu' || match.phase === 'result';
  $('pause').hidden = match.phase !== 'paused';
  $('results').hidden = match.phase !== 'result';
  $('pause-button').hidden = match.phase === 'menu' || match.phase === 'result';
  input.enabled = match.phase === 'serve' || match.phase === 'rally';
  for (const [side, name] of [
    [0, 'you'],
    [1, 'ai'],
  ] as const) {
    setText('sets-' + name, String(match.score.sets[side]));
    setText('games-' + name, String(match.score.games[side]));
    setText('points-' + name, match.practice ? '—' : match.score.label(side));
    $('serve-' + name).classList.toggle('active', match.server === side);
  }
  setText(
    'score-description',
    match.practice ? 'PRACTICE · ENDLESS RALLIES' : match.score.description,
  );
  setText('difficulty-label', match.difficulty.toUpperCase());
  setText('rally-count', String(match.contacts));
  setText('announcement', match.notice);
  setText('timing-feedback', match.feedbackTime > 0 ? match.timing : '');
  if (match.phase === 'result') {
    setText(
      'result-title',
      match.score.winner === 0 ? 'Court conquered.' : 'The next one is yours.',
    );
    setText(
      'result-score',
      `${match.score.winner === 0 ? 'YOU WIN' : 'OPPONENT WINS'} · ${match.score.completedSets.map((s) => s.join('–')).join(' / ')}`,
    );
    setText('best-rally', String(match.bestRally));
  }
};
scene.app.on('update', (dt: number) => {
  input.sample(Math.min(dt, 0.1));
  clock.advance(dt, (step) => {
    match.tick(step, input.controls);
    input.controls.release = false;
  });
  scene.render(match, Math.min(dt, 0.1));
  renderUI();
});
$('loading').remove();
renderUI();
// Read-only, opt-in diagnostics for browser QA; no shipped gameplay mutation API.
if (new URLSearchParams(location.search).has('debug'))
  Object.defineProperty(window, 'centreCourt', {
    value: {
      snapshot: () => ({
        phase: match.phase,
        ball: { ...match.ball.position },
        velocity: { ...match.ball.velocity },
        players: match.players.map((p) => ({ ...p.position })),
        server: match.server,
        fault: match.fault,
        contacts: match.contacts,
        totalPoints: match.totalPoints,
        points: [...match.score.points],
        games: [...match.score.games],
        notice: match.notice,
        camera: scene.rig.mode,
        drawCalls: scene.app.stats.drawCalls.total,
        fps: scene.app.stats.frame.fps,
        activeCameras: scene.app.root.findComponents('camera').filter((c) => c.enabled).length,
      }),
    },
  });
