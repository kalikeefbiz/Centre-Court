import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-800.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './style.css';
import { Match, FixedClock } from './core/match';
import { Scene } from './render/scene';
import { Input } from './platform/input';
import { StadiumAudio } from './platform/stadium-audio';
import type { StadiumQuality } from './render/stadium-geometry';
const stadiumAudio = new StadiumAudio();
import type { Difficulty } from './core/ai';
import type { DeveloperTools } from './dev/tools';
import type { MatchLength } from './core/scoring';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const match = new Match(),
  clock = new FixedClock();
let scene: Scene;
let developer: DeveloperTools | undefined;
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
  if (developer?.frozen) return;
  if (!$('help').hidden) return;
  match.phase === 'paused' ? match.resume() : match.pause();
  input.clear();
  clock.reset();
};
const switchCamera = () => {
  if (developer?.inspecting) return;
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
  stadiumAudio.unlock();
  if (scene.kira.status !== 'ready' || scene.royalBall.status !== 'ready') return;
  $('help').hidden = true;
  input.clear();
  clock.reset();
  match.start(
    $<HTMLSelectElement>('difficulty').value as Difficulty,
    $<HTMLSelectElement>('length').value as MatchLength,
    practice,
  );
  input.setContext(match.phase, match.inputEpoch);
  input.enabled = true;
  document.activeElement instanceof HTMLElement && document.activeElement.blur();
};
const menu = () => {
  match.menu();
  input.clear();
  input.enabled = false;
};
$<HTMLSelectElement>('stadium-quality').value = scene.stadium.quality;
$('stadium-quality').onchange = () =>
  scene.stadium.setQuality($<HTMLSelectElement>('stadium-quality').value as StadiumQuality);
$('stadium-sound').onclick = () => {
  stadiumAudio.enabled = !stadiumAudio.enabled;
  $('stadium-sound').textContent = `STADIUM SOUND · ${stadiumAudio.enabled ? 'ON' : 'OFF'}`;
  $('stadium-sound').setAttribute('aria-pressed', String(stadiumAudio.enabled));
  stadiumAudio.unlock();
};
$('asset-retry').onclick = () => location.reload();
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
  stadiumAudio.update(match);
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
  const ready = scene.kira.status === 'ready' && scene.royalBall.status === 'ready';
  const failed = scene.kira.status === 'error' || scene.royalBall.status === 'error';
  $<HTMLButtonElement>('play').disabled = !ready;
  $<HTMLButtonElement>('practice').disabled = !ready;
  $('athlete-status').hidden = ready;
  $('asset-retry').hidden = !failed;
  setText(
    'athlete-status',
    failed
      ? 'Kira or Royal Rally ball could not load. Check your connection and retry.'
      : 'Loading Kira, racket and Royal Rally ball…',
  );
  $('menu').hidden = match.phase !== 'menu';
  $('menu-note').hidden = match.phase !== 'menu';
  $('footer').hidden = match.phase !== 'menu';
  $('hud').hidden = match.phase === 'menu' || match.phase === 'result';
  $('pause').hidden = match.phase !== 'paused';
  $('results').hidden = match.phase !== 'result';
  $('pause-button').hidden = match.phase === 'menu' || match.phase === 'result';
  input.enabled = !developer?.frozen && (match.phase === 'serve' || match.phase === 'rally');
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
  input.setContext(match.phase, match.inputEpoch);
  input.sample(Math.min(dt, 0.1));
  if (!developer?.frozen)
    clock.advance(dt, (step) => {
      match.tick(step, input.controls);
      input.controls.release = false;
      input.controls.gestures = undefined;
    });
  if (!developer?.frozen)
    scene.render(match, Math.min(dt, 0.1), input.charging, input.controls.shot);
  else if (!developer.inspecting) scene.renderComparison(match, Math.min(dt, 0.1));
  developer?.update(Math.min(dt, 0.1));
  stadiumAudio.update(match);
  renderUI();
});
$('loading').remove();
renderUI();
if (new URLSearchParams(location.search).get('dev') === '1') {
  void import('./dev/tools').then(({ DeveloperTools }) => {
    developer = new DeveloperTools(
      scene,
      match,
      () => {
        input.clear();
        input.enabled = false;
        clock.reset();
      },
      updateCamera,
    );
  });
}
// Read-only, opt-in diagnostics for browser QA; no shipped gameplay mutation API.
if (
  new URLSearchParams(location.search).has('debug') ||
  new URLSearchParams(location.search).get('dev') === '1'
)
  Object.defineProperty(window, 'centreCourt', {
    value: {
      snapshot: () => ({
        build: __BUILD_ID__,
        release: 'GOAL-006',
        developer: developer?.snapshot(),
        presentation: scene.playerPresentation(),
        stadium: scene.stadiumPresentation(),
        stadiumAudio: stadiumAudio.snapshot(),
        phase: match.phase,
        kira: scene.kira.snapshot(),
        royalBall: scene.royalBall.snapshot(),
        contact: match.players[0].contact
          ? { ...match.players[0].contact, position: { ...match.players[0].contact.position } }
          : null,
        renderedBall: scene.ballPresentation(),
        input: {
          ...input.controls,
          charging: input.charging,
          held: input.held,
          provisional: input.gesture.provisional,
        },
        ai: match.ai.snapshot(match.difficulty, match.initialSeed),
        lastHitter: match.lastHitter,
        bounces: match.bounces,
        serveFlight: match.serveFlight,
        ball: { ...match.ball.position },
        velocity: { ...match.ball.velocity },
        players: match.players.map((p) => ({ ...p.position })),
        actions: match.players.map((p) =>
          p.action
            ? {
                ...p.action,
                warp: { ...p.action.warp },
                target: { ...p.action.target },
                racket: { ...p.action.racket },
                previousRacket: { ...p.action.previousRacket },
              }
            : null,
        ),
        spin: { ...match.ball.spin },
        locomotion: match.players.map(({ locomotion: m }) => ({
          ...m,
          velocity: { ...m.velocity },
          desiredVelocity: { ...m.desiredVelocity },
          acceleration: { ...m.acceleration },
          travelDirection: { ...m.travelDirection },
        })),
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
