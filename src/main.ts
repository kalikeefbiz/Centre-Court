import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-800.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './style.css';
import { Match, FixedClock } from './core/match';
import { vec } from './core/court';
import { Scene } from './render/scene';
import { Input } from './platform/input';
import { ROSTER, CHARACTER_IDS, AVAILABLE, type CharacterId } from './core/roster';
import { Competition, ladder } from './core/competition';
import { CourtAudio } from './platform/court-audio';
import { StadiumAudio } from './platform/stadium-audio';
import type { StadiumQuality } from './render/stadium-geometry';
const stadiumAudio = new StadiumAudio();
const courtAudio = new CourtAudio();
let storage: Storage | undefined;
try {
  storage = localStorage;
} catch {
  /* unavailable */
}
const competition = new Competition(storage);
let selected: CharacterId = competition.save.player;
let rival: CharacterId = selected === 'rico' ? 'dante' : 'rico';
let circuitMatch = false;
let matchId = '';
let recorded = false;
let loadingOpponent = false;
let previewing = false;
let previewAngle = 'front';
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
const start = async (practice: boolean, rematch = false) => {
  stadiumAudio.unlock();
  courtAudio.unlock();
  if (loadingOpponent) return;
  if (scene.kira.status !== 'ready' || scene.royalBall.status !== 'ready') return;
  if (!rematch && $<HTMLSelectElement>('competition').value === 'circuit' && !practice) {
    if (competition.save.player !== selected) competition.restart(selected);
    if (competition.save.completed) competition.restart(selected);
    rival = ladder(selected)[competition.save.stage];
  } else
    rival = rematch ? match.characters[1] : ($<HTMLSelectElement>('opponent').value as CharacterId);
  loadingOpponent = true;
  await scene.selectOpponent(rival);
  loadingOpponent = false;
  if (scene.opponent?.status !== 'ready') return;
  match.characters = [selected, rival];
  circuitMatch = !practice && $<HTMLSelectElement>('competition').value === 'circuit';
  matchId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  recorded = false;
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
const roster = $('roster');
for (const id of CHARACTER_IDS) {
  const p = ROSTER[id],
    button = document.createElement('button');
  button.textContent = p.name;
  button.dataset.character = id;
  button.disabled = !p.available;
  button.title = p.available ? p.archetype : 'Awaiting character model';
  button.setAttribute(
    'aria-label',
    `${p.name} · ${p.title}${p.available ? '' : ' · Awaiting model'}`,
  );
  button.onclick = () => {
    selected = id;
    updateRoster();
    void scene.selectCharacter(id);
  };
  roster.append(button);
}
function updateRoster() {
  const p = ROSTER[selected];
  for (const button of Array.from(roster.querySelectorAll('button')))
    button.setAttribute('aria-pressed', String(button.dataset.character === selected));
  setText(
    'character-profile',
    `${p.name} · ${p.title} / ${p.archetype}. ${p.description} Signature: ${p.signature}.`,
  );
  setText('preview-name', `${p.name.toUpperCase()} · ${p.title.toUpperCase()}`);
  const select = $<HTMLSelectElement>('opponent');
  select.replaceChildren();
  for (const id of AVAILABLE.filter((id) => id !== selected)) {
    const o = new Option(`${ROSTER[id].name} · ${ROSTER[id].title}`, id);
    select.add(o);
  }
  if (rival === selected) rival = AVAILABLE.find((id) => id !== selected)!;
  select.value = rival;
}
updateRoster();
if (selected !== 'kira') void scene.selectCharacter(selected);
$('opponent').onchange = () => {
  rival = $<HTMLSelectElement>('opponent').value as CharacterId;
};
$('circuit-reset').onclick = () => competition.restart(selected);
$('next-opponent').onclick = () => {
  $<HTMLSelectElement>('competition').value = 'circuit';
  void start(false);
};
$('signature-button').onpointerdown = (e) => {
  e.preventDefault();
  e.stopPropagation();
  match.armSignature();
};
$('court-volume').oninput = () =>
  (courtAudio.volume = Number($<HTMLInputElement>('court-volume').value));
$('court-mute').onclick = () => {
  courtAudio.muted = !courtAudio.muted;
  $('court-mute').textContent = `COURT AUDIO · ${courtAudio.muted ? 'OFF' : 'ON'}`;
  $('court-mute').setAttribute('aria-pressed', String(courtAudio.muted));
  courtAudio.unlock();
};
$('preview-athlete').onclick = () => {
  if (scene.kira.status === 'ready') {
    previewing = true;
    previewAngle = 'front';
  }
};
$('preview-close').onclick = () => {
  previewing = false;
};
for (const angle of ['front', 'side', 'back'])
  $('preview-' + angle).onclick = () => {
    previewAngle = angle === 'back' ? 'rear' : angle;
  };
$('asset-retry').onclick = () => location.reload();
$('play').onclick = () => start(false);
$('practice').onclick = () => start(true);
$('pause-button').onclick = togglePause;
$('resume').onclick = togglePause;
$('camera-button').onclick = switchCamera;
$('restart').onclick = () => start(match.practice, true);
$('restart-pause').onclick = () => start(match.practice, true);
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
  const ready =
    !loadingOpponent && scene.kira.status === 'ready' && scene.royalBall.status === 'ready';
  const failed =
    scene.kira.status === 'error' ||
    scene.royalBall.status === 'error' ||
    scene.opponent?.status === 'error';
  $<HTMLButtonElement>('play').disabled = !ready;
  $<HTMLButtonElement>('practice').disabled = !ready;
  $('athlete-status').hidden = ready && !failed;
  $('asset-retry').hidden = !failed;
  setText(
    'athlete-status',
    failed
      ? 'An athlete or ball could not load. Check your connection and retry.'
      : `Loading ${loadingOpponent ? ROSTER[rival].name : ROSTER[selected].name}, racket and court…`,
  );
  for (const button of Array.from(roster.querySelectorAll('button')))
    button.disabled = loadingOpponent || !ROSTER[button.dataset.character as CharacterId].available;
  const p = ROSTER[match.characters[0]];
  const save = competition.save;
  setText(
    'circuit-status',
    `${save.wins} wins · ${save.losses} losses · Circuit ${save.completed ? 'complete' : `${save.stage}/4`}${competition.persistent ? '' : ' · Save unavailable; this session only'}`,
  );
  $<HTMLSelectElement>('opponent').disabled =
    loadingOpponent || $<HTMLSelectElement>('competition').value === 'circuit';
  setText('player-name', `${p.name.toUpperCase()} · YOU`);
  setText('opponent-name', ROSTER[match.characters[1]].name.toUpperCase());
  setText('signature-label', `${p.signature.toUpperCase()} · ${Math.floor(match.meters[0])}%`);
  $<HTMLProgressElement>('signature-meter').value = match.meters[0];
  $('signature-button').hidden = match.phase !== 'rally' || match.meters[0] < 100;
  setText('signature-button', match.armed[0] ? 'ARMED · NEXT CONTACT' : 'SIGNATURE');
  $('signature-button').style.borderColor = p.color;
  $('heat-indicator').hidden = !match.heat;
  setText('heat-indicator', match.heat === 2 ? 'RALLY HEAT · FIRE' : 'RALLY HEAT · BUILDING');
  $('menu').hidden = match.phase !== 'menu' || previewing;
  $('athlete-preview').hidden = !previewing;
  $<HTMLButtonElement>('preview-athlete').disabled = scene.kira.status !== 'ready';
  setText('preview-title', `${ROSTER[selected].name} · ${ROSTER[selected].title}`);
  setText('preview-archetype', ROSTER[selected].archetype);
  $('menu-note').hidden = match.phase !== 'menu' || previewing;
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
    if (!recorded && !match.practice && match.score.winner !== null) {
      competition.record(
        matchId,
        match.characters[0],
        match.characters[1],
        match.score.winner === 0,
        circuitMatch,
      );
      recorded = true;
    }
    $('next-opponent').hidden =
      !circuitMatch || match.score.winner !== 0 || competition.save.completed;
    setText(
      'progress-result',
      circuitMatch
        ? competition.save.completed
          ? 'CIRCUIT COMPLETE · All four rivals defeated. Return to the roster to restart.'
          : match.score.winner === 0
            ? `Next: ${ROSTER[ladder(selected)[competition.save.stage]].name}`
            : 'Your circuit position is saved. Rematch to challenge this rival again.'
        : `${competition.save.wins} wins · ${competition.save.losses} losses`,
    );
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
const aimPoint = vec(),
  aimScreen = { x: 0, y: 0 };
const shotTarget = $('shot-target');
scene.app.on('update', (dt: number) => {
  input.setContext(match.phase, match.inputEpoch);
  input.sample(Math.min(dt, 0.1));
  if (!developer?.frozen)
    clock.advance(dt, (step) => {
      match.tick(step, input.controls);
      input.controls.release = false;
      input.controls.gestures = undefined;
    });
  // A serve/point may transition during this update. Next DOM events must see
  // the resulting phase, even before another rendered frame samples controls.
  input.setContext(match.phase, match.inputEpoch);
  if (!developer?.frozen)
    scene.render(match, Math.min(dt, 0.1), input.charging, input.controls.shot);
  else if (!developer.inspecting) scene.renderComparison(match, Math.min(dt, 0.1));
  if (previewing && match.phase === 'menu') scene.inspectCamera(previewAngle);
  shotTarget.hidden =
    !input.charging || !!developer?.frozen || (match.phase !== 'serve' && match.phase !== 'rally');
  if (!shotTarget.hidden) {
    match.aimTarget(
      input.controls.shot,
      input.controls.power,
      input.controls.aim,
      input.controls.depth,
      aimPoint,
    );
    scene.courtToScreen(aimPoint, aimScreen);
    shotTarget.style.left = `${aimScreen.x}px`;
    shotTarget.style.top = `${aimScreen.y}px`;
    const intent = input.serving
      ? 'SERVE'
      : input.controls.shot === 'drive'
        ? 'POWER'
        : input.controls.shot.toUpperCase();
    shotTarget.querySelector('span')!.textContent =
      intent +
      (input.serving
        ? ''
        : input.controls.depth > 0.2
          ? ' · DEEP'
          : input.controls.depth < -0.2
            ? ' · SHORT'
            : '');
  }
  developer?.update(Math.min(dt, 0.1));
  stadiumAudio.update(match);
  courtAudio.update(match, Math.min(dt, 0.1));
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
        release: 'GOAL-008',
        roster: { selected, rival, opponent: scene.opponent?.snapshot() },
        competition: competition.save,
        signatures: { meters: [...match.meters], armed: [...match.armed] },
        heat: match.heat,
        returns: match.returns,
        courtAudio: courtAudio.snapshot(),
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
          serving: input.serving,
          pointers: input.pointers,
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
        resources: {
          assets: scene.app.assets.list().length,
          vram: { ...scene.app.stats.vram },
          animationUpdateMs: scene.kira.evaluationMs,
        },
        drawCalls: scene.app.stats.drawCalls.total,
        fps: scene.app.stats.frame.fps,
        activeCameras: scene.app.root.findComponents('camera').filter((c) => c.enabled).length,
      }),
    },
  });
