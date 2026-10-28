import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-800.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './style.css';
import { Match } from './core/match';
import { vec, COURT } from './core/court';
import { Lifecycle, checkCancelled } from './app/lifecycle';
import { MatchSession, type MatchConfig } from './app/match-session';
import { sharedAssets } from './app/assets';
import { FrameWindow } from './dev/metrics';
import { Scene } from './render/scene';
import { Input } from './platform/input';
import { ROSTER, CHARACTER_IDS, AVAILABLE, type CharacterId } from './core/roster';
import { Competition, ladder } from './core/competition';
import { EquipmentSelection } from './render/racket-equipment';
import { EquipmentUI } from './platform/equipment-ui';
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
const equipment = new EquipmentSelection(storage);
let selected: CharacterId = competition.save.player;
let rival: CharacterId = selected === 'rico' ? 'dante' : 'rico';

let previewing = false;
let previewAngle = 'front';
let equipmentView: 'athlete' | 'grip' = 'grip';
import type { Difficulty } from './core/ai';
import type { DeveloperTools } from './dev/tools';
import type { MatchLength } from './core/scoring';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let match: Match;
const clock = { reset: () => lifecycle?.session?.clock.reset() };
let lifecycle: Lifecycle<MatchSession, MatchConfig>;
const menuFrames = new FrameWindow();
const matchFrames = new FrameWindow();
let updateMs = 0;
const timings = { menuReadyMs: 0, matchLoadMs: 0, returnMs: 0 };
let scene: Scene;
let developer: DeveloperTools | undefined;
try {
  scene = new Scene($<HTMLCanvasElement>('court'), selected, equipment.selected(selected));
} catch (error) {
  $('loading').textContent =
    'Your browser could not start 3D rendering. Enable WebGL and reload Centre Court.';
  throw error;
}
const setText = (id: string, text: string) => {
  if ($(id).textContent !== text) $(id).textContent = text;
};
const togglePause = () => {
  if (lifecycle.state !== 'MATCH' || lifecycle.contextLost || developer?.frozen) return;
  if (!$('help').hidden) return;
  if (match.phase === 'paused') {
    lifecycle.resume();
    courtAudio.unlock();
    stadiumAudio.unlock();
    match.resume();
  } else match.pause();
  input.clear();
  clock.reset();
};
const switchCamera = () => {
  if (lifecycle.state !== 'MATCH' || developer?.inspecting) return;
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
const equipmentUI = new EquipmentUI(document.body, equipment, {
  character: () => selected,
  preview: (id) => scene.equipRacket(id),
  equip: (id) => scene.equipRacket(id),
  open: () => {
    previewing = true;
    equipmentView = 'grip';
  },
  close: () => {
    previewing = false;
    // Restore the launcher's visible menu before the dialog restores focus.
    renderUI();
  },
  view: (mode) => {
    equipmentView = mode;
  },
});
$('racket-equipment-open').onclick = () => {
  if (scene.kira.status === 'ready') {
    // Touch WebKit does not always focus a clicked button automatically.
    $('racket-equipment-open').focus();
    equipmentUI.open();
  }
};
lifecycle = new Lifecycle<MatchSession, MatchConfig>({
  menu: async (signal) => {
    const t = performance.now();
    developer?.endSession();
    scene.endMatch();
    match = undefined!;
    previewing = false;
    await scene.selectCharacter(selected, equipment.selected(selected));
    checkCancelled(signal);
    if (scene.kira.status !== 'ready')
      throw new Error('An athlete could not load. Check your connection and retry.');
    timings.returnMs = performance.now() - t;
    if (!timings.menuReadyMs) timings.menuReadyMs = performance.now();
  },
  prepare: async (config, signal) => {
    const t = performance.now();
    let pending: MatchSession | undefined;
    const cancel = () => pending?.dispose();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      await scene.selectCharacter(config.player, config.racket);
      checkCancelled(signal);
      await scene.prepareMatch(config.rival, config.rivalRacket, signal);
      $<HTMLSelectElement>('stadium-quality').value = scene.stadium.quality;
      checkCancelled(signal);
      const session = new MatchSession(config, () => {
        developer?.endSession();
        scene.endMatch();
      });
      pending = session;
      match = session.match;
      developer?.bindMatch(match);
      courtAudio.resetSession();
      stadiumAudio.resetSession();
      $('help').hidden = true;
      input.clear();
      input.setContext(match.phase, match.inputEpoch);
      scene.render(match, 0);
      await scene.confirmFrame(signal);
      checkCancelled(signal);
      timings.matchLoadMs = performance.now() - t;
      document.activeElement instanceof HTMLElement && document.activeElement.blur();
      return session;
    } catch (error) {
      // A superseded transaction never tears down the newer scene.
      if (pending) pending.dispose();
      else if (!signal.aborted) scene.endMatch();
      throw error;
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  },
  changed: () => {
    input.clear();
    input.enabled = false;
    queueMicrotask(() => renderUI());
  },
  interrupt: () => {
    input.clear();
    input.enabled = false;
    courtAudio.stop();
    stadiumAudio.stop();
  },
});
const start = async (practice: boolean, rematch = false) => {
  if (!['MENU', 'MATCH', 'RESULTS'].includes(lifecycle.state)) return;
  if (scene.kira.status !== 'ready') return;
  stadiumAudio.unlock();
  courtAudio.unlock();
  const previous = lifecycle.session?.config;
  if (rematch && previous) {
    await lifecycle.start({ ...previous });
    return;
  }
  const circuit = !practice && $<HTMLSelectElement>('competition').value === 'circuit';
  if (circuit) {
    if (competition.save.player !== selected || competition.save.completed)
      competition.restart(selected);
    rival = ladder(selected)[competition.save.stage];
  } else rival = $<HTMLSelectElement>('opponent').value as CharacterId;
  const difficulty = $<HTMLSelectElement>('difficulty').value as Difficulty;
  const length = $<HTMLSelectElement>('length').value as MatchLength;
  if (
    !AVAILABLE.includes(selected) ||
    !AVAILABLE.includes(rival) ||
    selected === rival ||
    !['easy', 'normal', 'hard'].includes(difficulty) ||
    !['short', 'standard'].includes(length)
  )
    return;
  await lifecycle.start({
    player: selected,
    rival,
    racket: equipment.selected(selected),
    rivalRacket: equipment.selected(rival),
    difficulty,
    length,
    practice,
    circuit,
  });
};
const menu = () => lifecycle.menu();
$('stadium-quality').onchange = () =>
  scene.stadium?.setQuality($<HTMLSelectElement>('stadium-quality').value as StadiumQuality);
const toggleStadiumSound = () => {
  stadiumAudio.enabled = !stadiumAudio.enabled;
  $('stadium-sound').textContent = `STADIUM SOUND · ${stadiumAudio.enabled ? 'ON' : 'OFF'}`;
  $('stadium-sound').setAttribute('aria-pressed', String(stadiumAudio.enabled));
  stadiumAudio.unlock();
};
$('stadium-sound').onclick = toggleStadiumSound;
$('menu-stadium-sound').onclick = toggleStadiumSound;
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
    if (lifecycle.state !== 'MENU') return;
    selected = id;
    updateRoster();
    void scene.selectCharacter(id, equipment.selected(id)).catch(() => {});
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
  if (lifecycle.state === 'MATCH') match.armSignature();
};
$('court-volume').oninput = () =>
  (courtAudio.volume = Number($<HTMLInputElement>('court-volume').value));
const toggleCourtMute = () => {
  courtAudio.muted = !courtAudio.muted;
  $('court-mute').textContent = `COURT AUDIO · ${courtAudio.muted ? 'OFF' : 'ON'}`;
  $('court-mute').setAttribute('aria-pressed', String(courtAudio.muted));
  courtAudio.unlock();
};
$('court-mute').onclick = toggleCourtMute;
$('menu-court-mute').onclick = toggleCourtMute;
$('menu-court-volume').oninput = () =>
  (courtAudio.volume = Number($<HTMLInputElement>('menu-court-volume').value));
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
$('asset-retry').onclick = () => lifecycle.menu();
$('load-cancel').onclick = () => lifecycle.menu();
$('context-reload').onclick = () => location.reload();
$('play').onclick = () => start(false);
$('practice').onclick = () => start(true);
$('pause-button').onclick = togglePause;
$('resume').onclick = togglePause;
$('camera-button').onclick = switchCamera;
$('restart').onclick = () => start(false, true);
$('restart-pause').onclick = () => start(false, true);
$('menu-pause').onclick = menu;
$('menu-result').onclick = menu;
$('home-link').onclick = (e) => {
  e.preventDefault();
  if (lifecycle.state !== 'MATCH') return;
  match.pause();
  input.clear();
};
$('help-button').onclick = () => {
  $('help').hidden = false;
};
$('help-close').onclick = () => {
  $('help').hidden = true;
};
const interrupt = () => lifecycle.suspend();
document.addEventListener('visibilitychange', () =>
  document.hidden ? interrupt() : lifecycle.resume(),
);
window.addEventListener('blur', interrupt);
window.addEventListener('focus', () => lifecycle.resume());
window.addEventListener('pagehide', interrupt);
window.addEventListener('pageshow', () => {
  if (!document.hidden) lifecycle.resume();
});
$('court').addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  lifecycle.loseContext();
});
$('court').addEventListener('webglcontextrestored', () => lifecycle.restoreContext());
const renderUI = () => {
  for (const id of ['court-mute', 'menu-court-mute']) {
    setText(id, `COURT AUDIO · ${courtAudio.muted ? 'OFF' : 'ON'}`);
    $(id).setAttribute('aria-pressed', String(courtAudio.muted));
  }
  for (const id of ['stadium-sound', 'menu-stadium-sound']) {
    setText(id, `STADIUM SOUND · ${stadiumAudio.enabled ? 'ON' : 'OFF'}`);
    $(id).setAttribute('aria-pressed', String(stadiumAudio.enabled));
  }
  for (const id of ['court-volume', 'menu-court-volume']) {
    const slider = $<HTMLInputElement>(id);
    if (Number(slider.value) !== courtAudio.volume) slider.value = String(courtAudio.volume);
  }
  const loadingOpponent = lifecycle.state === 'MATCH_LOADING';
  const inMenu = lifecycle.state === 'MENU';
  const ready = inMenu && scene.kira.status === 'ready' && !lifecycle.error;
  const failed = scene.kira.status === 'error' || !!lifecycle.error;
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
  const p = ROSTER[selected];
  const save = competition.save;
  setText(
    'circuit-status',
    `${save.wins} wins · ${save.losses} losses · Circuit ${save.completed ? 'complete' : `${save.stage}/4`}${competition.persistent ? '' : ' · Save unavailable; this session only'}`,
  );
  $<HTMLSelectElement>('opponent').disabled =
    loadingOpponent || $<HTMLSelectElement>('competition').value === 'circuit';
  $('menu').hidden = !inMenu || previewing;
  $('athlete-preview').hidden = !inMenu || !previewing || equipmentUI.isOpen;
  $<HTMLButtonElement>('preview-athlete').disabled =
    loadingOpponent || scene.kira.status !== 'ready';
  $<HTMLButtonElement>('racket-equipment-open').disabled =
    loadingOpponent || scene.kira.status !== 'ready';
  setText('preview-title', `${ROSTER[selected].name} · ${ROSTER[selected].title}`);
  setText('preview-archetype', ROSTER[selected].archetype);
  $('menu-note').hidden = !inMenu || previewing;
  $('footer').hidden = !inMenu;
  const inMatch = lifecycle.state === 'MATCH';
  $('hud').hidden = !inMatch;
  $('pause').hidden = !inMatch || match?.phase !== 'paused';
  $('results').hidden = lifecycle.state !== 'RESULTS';
  $('pause-button').hidden = !inMatch;
  $('transition').hidden =
    !['BOOT', 'MENU_LOADING', 'MATCH_LOADING'].includes(lifecycle.state) && !lifecycle.contextLost;
  $('load-cancel').hidden = lifecycle.state !== 'MATCH_LOADING' || lifecycle.contextLost;
  $('context-reload').hidden = !lifecycle.contextLost;
  setText(
    'load-status',
    lifecycle.contextLost
      ? 'Graphics interrupted. Waiting for the browser to restore rendering…'
      : loadingOpponent
        ? `Preparing ${ROSTER[selected].name} and ${ROSTER[rival].name}, rackets and court…`
        : 'Preparing your athlete…',
  );
  input.enabled =
    inMatch &&
    !lifecycle.suspended &&
    !lifecycle.contextLost &&
    !developer?.frozen &&
    (match.phase === 'serve' || match.phase === 'rally');
  if (!lifecycle.session) return;
  setText('player-name', `${p.name.toUpperCase()} · YOU`);
  setText('opponent-name', ROSTER[match.characters[1]].name.toUpperCase());
  setText('signature-label', `${p.signature.toUpperCase()} · ${Math.floor(match.meters[0])}%`);
  $<HTMLProgressElement>('signature-meter').value = match.meters[0];
  $('signature-button').hidden = match.phase !== 'rally' || match.meters[0] < 100;
  setText('signature-button', match.armed[0] ? 'ARMED · NEXT CONTACT' : 'SIGNATURE');
  $('signature-button').style.borderColor = p.color;
  $('heat-indicator').hidden = !match.heat;
  setText('heat-indicator', match.heat === 2 ? 'RALLY HEAT · FIRE' : 'RALLY HEAT · BUILDING');
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
    if (!lifecycle.session.recorded && !match.practice && match.score.winner !== null) {
      competition.record(
        lifecycle.session.id,
        match.characters[0],
        match.characters[1],
        match.score.winner === 0,
        lifecycle.session.config.circuit,
      );
      lifecycle.session.recorded = true;
    }
    $('next-opponent').hidden =
      !lifecycle.session.config.circuit || match.score.winner !== 0 || competition.save.completed;
    setText(
      'progress-result',
      lifecycle.session.config.circuit
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
  const begin = performance.now();
  const elapsed = Math.min(dt, 0.1);
  if (lifecycle.state === 'MENU' || lifecycle.state === 'MENU_LOADING') {
    menuFrames.add(dt * 1000);
    if (!developer?.frozen) scene.renderMenu(elapsed, previewing);
    if (previewing) {
      if (equipmentUI.isOpen) scene.equipmentCamera(equipmentView);
      else scene.inspectCamera(previewAngle, true);
    }
  }
  const session = lifecycle.session;
  if (session && (lifecycle.state === 'MATCH' || lifecycle.state === 'RESULTS')) {
    input.setContext(match.phase, match.inputEpoch);
    if (
      lifecycle.state === 'MATCH' &&
      !lifecycle.suspended &&
      !lifecycle.contextLost &&
      !developer?.frozen
    ) {
      input.sample(elapsed);
      session.advance(dt, input.controls);
      matchFrames.add(dt * 1000);
    }
    input.setContext(match.phase, match.inputEpoch);
    if (lifecycle.state === 'MATCH' && !developer?.frozen)
      scene.render(match, elapsed, input.charging, input.controls.shot);
    else if (developer?.frozen && !developer.inspecting) scene.renderComparison(match, elapsed);
    if (match.phase === 'result') lifecycle.results();
    if (!lifecycle.suspended && !lifecycle.contextLost) {
      stadiumAudio.update(match);
      courtAudio.update(match, elapsed);
    }
  }
  shotTarget.hidden =
    !session ||
    lifecycle.state !== 'MATCH' ||
    !input.charging ||
    !!developer?.frozen ||
    (match.phase !== 'serve' && match.phase !== 'rally');
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
  renderUI();
  updateMs = performance.now() - begin;
});
$('loading').remove();
void lifecycle.menu();
renderUI();
if (new URLSearchParams(location.search).get('dev') === '1') {
  void import('./dev/tools').then(({ DeveloperTools }) => {
    scene.ensureArena();
    scene.endMatch();
    developer = new DeveloperTools(
      scene,
      new Match(), // Developer-only inspection context; never ticked by the app.
      () => {
        input.clear();
        input.enabled = false;
        clock.reset();
      },
      updateCamera,
    );
    if (lifecycle.session) developer.bindMatch(lifecycle.session.match);
  });
}
// Read-only, opt-in diagnostics for browser QA; no shipped gameplay mutation API.
if (
  new URLSearchParams(location.search).has('debug') ||
  new URLSearchParams(location.search).get('dev') === '1'
)
  Object.defineProperty(window, 'centreCourt', {
    value: {
      snapshot: () => {
        const common = {
          lifecycle: {
            state: lifecycle.state,
            suspended: lifecycle.suspended,
            contextLost: lifecycle.contextLost,
            error: lifecycle.error,
            sessions: lifecycle.session ? 1 : 0,
            sessionId: lifecycle.session?.id,
            steps: lifecycle.session?.steps ?? 0,
            updateLoops:
              (scene.app as unknown as { _callbacks: Map<string, unknown[]> })._callbacks.get(
                'update',
              )?.length ?? 0,
            applications: Scene.applications,
            allocatedSessions: MatchSession.active,
            timings: { ...timings },
            updateMs,
            menuFrames: menuFrames.summary(),
            matchFrames: matchFrames.summary(),
            entities: scene.app.root.find(() => true).length,
            actors: scene.app.root.find((n) => n.name.endsWith(' gameplay position')).length,
            loadedActors: scene.app.root.findComponents('anim').length,
            frameHandlers: scene.pendingFrameChecks,
            assets: sharedAssets(scene.app).snapshot(),
            inputHandlers: input.handlerCount,
          },
        };
        if (!lifecycle.session)
          return {
            ...common,
            build: __BUILD_ID__,
            release: 'GOAL-010',
            phase: 'menu',
            camera: scene.rig.mode,
            kira: scene.kira.snapshot(),
            equipment: { ...equipmentUI.snapshot(), saved: equipment.snapshot() },
            roster: { selected, rival, opponent: scene.opponent?.snapshot() },
            competition: competition.save,
            presentation: scene.playerPresentation(),
            stadium: scene.stadiumPresentation(),
            royalBall: scene.royalBall?.snapshot() ?? {
              status: 'not-loaded',
              visualScale: 2.25,
              collisionRadius: COURT.radius,
            },
            developer: developer?.snapshot(),
            courtAudio: courtAudio.snapshot(),
            stadiumAudio: stadiumAudio.snapshot(),
            activeCameras: scene.app.root.findComponents('camera').filter((c) => c.enabled).length,
            resources: {
              assets: scene.app.assets.list().length,
              vram: { ...scene.app.stats.vram },
              animationUpdateMs: scene.kira.evaluationMs,
            },
            drawCalls: scene.app.stats.drawCalls.total,
            fps: scene.app.stats.frame.fps,
          };
        return {
          ...common,
          build: __BUILD_ID__,
          release: 'GOAL-010',
          equipment: { ...equipmentUI.snapshot(), saved: equipment.snapshot() },
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
        };
      },
    },
  });

// Source-mode lifecycle harness imports this owner; no production mutation API.
export { lifecycle };
