import * as pc from 'playcanvas';
import type { Scene } from '../render/scene';
import { Ball, GRAVITY } from '../core/ball';
import type { Match } from '../core/match';
import { ANIMATIONS, type AthleteState } from '../render/animation-registry';
import { ROYAL_BALL } from '../render/royal-ball';
import { assetTimings, BALL_SCALES, FrameWindow, projectedDiameter } from './metrics';
import { InspectionTimeline } from './timeline';
import './tools.css';

const labels: Record<AthleteState, string> = {
  Idle: 'Idle',
  Walk: 'Walk',
  Run: 'Run',
  ShuffleLeft: 'Shuffle left',
  ShuffleRight: 'Shuffle right',
  Forehand: 'Forehand groundstroke',
  Backhand: 'Two-handed backhand',
  ForehandVolley: 'Forehand volley',
  BackhandVolley: 'Backhand volley',
  Serve: 'Tennis serve',
  Smash: 'Overhead smash',
  Slice: 'Backhand slice',
  Lob: 'Defensive lob',
};
export class DeveloperTools {
  readonly timeline = new InspectionTimeline();
  inspecting = false;
  comparison = 'live';
  private session?: ReturnType<Scene['kira']['beginInspection']>;
  private restoreScene?: () => void;
  private recent = new FrameWindow();
  private capture = new FrameWindow();
  private last = performance.now();
  private paintAt = 0;
  private instantMs = 0;
  private captureStart = 0;
  private captureScenario = '';
  private captureContext?: unknown;
  private recording = false;
  private records: unknown[] = [];
  private bootReadyMs?: number;
  private contactHead?: number[];
  private serveStudy?: {
    release: number[];
    contact: number[];
    velocity: number[];
    releaseTime: number;
    contactTime: number;
    handVelocity: number[];
  };
  private servePrototype = false;
  private scenario = 'Initial loading';
  private overlays = false;
  private angle = 'quarter';
  private interruptions = 0;
  private root = document.createElement('aside');
  private readout = document.createElement('pre');
  private v = new pc.Vec3();
  private w = new pc.Vec3();
  private view = new pc.Mat4();
  constructor(
    private scene: Scene,
    private match: Match,
    private resetInput: () => void,
    private cameraChanged: () => void,
  ) {
    this.root.id = 'dev-tools';
    this.root.setAttribute('aria-label', 'Development diagnostics');
    this.root.innerHTML = `
      <button id="dev-toggle" aria-expanded="false" aria-controls="dev-panel">DEV · Tools</button>
      <section id="dev-panel" hidden aria-label="Developer controls">
        <div class="dev-heading"><strong>GOAL 002D · Diagnostics</strong><button id="dev-close" aria-label="Close developer panel">×</button></div>
        <p>Local tests only · visual size never changes physics.</p>
        <button id="dev-inspect" disabled>Inspect Kira animations</button>
        <div id="dev-animation" hidden>
          <label>Animation<select id="dev-clip">${['Locomotion', 'Hitting']
            .map(
              (group) =>
                `<optgroup label="${group}">${Object.keys(labels)
                  .filter(
                    (key) => 'contact' in ANIMATIONS[key as AthleteState] === (group === 'Hitting'),
                  )
                  .map((key) => `<option value="${key}">${labels[key as AthleteState]}</option>`)
                  .join('')}</optgroup>`,
            )
            .join('')}</select></label>
          <div class="dev-row"><button id="dev-play">Pause</button><button id="dev-restart">Restart</button><label><input id="dev-loop" type="checkbox" checked> Loop</label></div>
          <label>Speed<select id="dev-speed"><option value="0.25">0.25×</option><option value="0.5">0.50×</option><option value="1" selected>1.00×</option><option value="1.5">1.50×</option><option value="2">2.00×</option></select></label>
          <label>Clip time<input id="dev-time" type="range" min="0" max="8.733334" step="0.001" value="0"></label>
          <output id="dev-position"></output><p id="dev-contact"></p>
          <button id="dev-contact-seek">Seek estimated contact</button>
          <label><input type="checkbox" id="dev-serve-prototype"> Serve feasibility prototype (Serve clip only)</label>
          <p id="dev-serve-note" hidden>Isolated Royal Rally ball: candidate palm socket, release at 0.900 s, ballistic toss fitted to source racket contact. No hand editing; no production ball, scoring or serve changes. Grip and release need calibration.</p>
          <label>Inspection view<select id="dev-angle"><option value="quarter">Three quarter</option><option value="front">Front</option><option value="side">Side</option><option value="rear">Rear</option></select></label>
          <label><input type="checkbox" id="dev-markers"> Root / grip / racket region / forward / left hand</label>
          <p id="dev-marker-text" hidden>Red: root · cyan: grip · lime: racket region (guide only) · yellow: forward · pink: estimated contact position · white: left hand. Source shot pose; no live contact correction.</p>
        </div>
        <div id="dev-ball-controls">
          <label>Royal Rally visual scale<select id="dev-scale">${BALL_SCALES.map((x) => `<option value="${x}">${x.toFixed(2)}×</option>`).join('')}</select></label>
          <label>Gameplay camera<select id="dev-camera"><option value="broadcast">Broadcast</option><option value="behind">Behind player</option></select></label>
          <label>Readability comparison<select id="dev-comparison"><option value="live">Live gameplay</option><option value="frozen">Freeze current rally / serve</option><option value="serve">Serve reference · 2.6 m</option><option value="near">Near court · 1 m high</option><option value="far">Far court · 1 m high</option></select></label>
          <p>References freeze simulation and move only the rendered ball. Return to Live before playing. Default resets to 1.00× on every visit.</p>
        </div>
        <label><input id="dev-perf" type="checkbox"> Performance overlay</label>
        <label>Measurement scenario<select id="dev-scenario">${['Initial loading', 'Match initialization', 'Serving', 'Sustained rally', 'Camera switching', 'Animation inspection', 'Ball visual-scale switching'].map((x) => `<option>${x}</option>`).join('')}</select></label>
        <div class="dev-row"><button id="dev-record">Record 10 seconds</button><button id="dev-export">Export JSON</button></div>
        <output id="dev-record-status">No scenario recorded</output>
        <details><summary>Asset loading</summary><pre id="dev-assets"></pre></details>
      </section>`;
    document.body.append(this.root);
    this.readout.id = 'dev-readout';
    this.readout.hidden = true;
    this.readout.setAttribute('aria-label', 'Performance diagnostics');
    document.body.append(this.readout);
    const on = (id: string, event: string, action: () => void) =>
      this.el(id).addEventListener(event, action);
    // Stop only events originating inside developer controls. Owned gameplay pointers
    // remain on the joystick/HIT elements; no window-level pointer cancellation.
    this.root.addEventListener('keydown', (e) => e.stopPropagation());
    // Let key releases reach Input so a movement key released after focus moves
    // into this panel cannot remain held. Only keydown starts gameplay actions.
    on('dev-toggle', 'click', () => this.panel(this.el('dev-panel').hidden));
    on('dev-close', 'click', () => this.panel(false));
    on('dev-inspect', 'click', () => this.inspect(!this.inspecting));
    on('dev-clip', 'change', () => {
      this.timeline.select(this.value('dev-clip') as AthleteState);
      this.contactHead = undefined;
      this.syncTimeline();
    });
    on('dev-play', 'click', () => {
      this.timeline.playing = !this.timeline.playing;
      this.syncTimeline();
    });
    on('dev-restart', 'click', () => {
      this.timeline.restart();
      this.syncTimeline();
    });
    on('dev-loop', 'change', () => (this.timeline.loop = this.checked('dev-loop')));
    on('dev-speed', 'change', () => (this.timeline.speed = Number(this.value('dev-speed'))));
    on('dev-time', 'input', () => {
      this.timeline.playing = false;
      this.timeline.seek(Number(this.value('dev-time')));
      this.syncTimeline();
    });
    on('dev-contact-seek', 'click', () => {
      const clip = ANIMATIONS[this.timeline.state];
      if ('contact' in clip) {
        this.timeline.playing = false;
        this.timeline.seek(clip.contact);
        this.syncTimeline();
      }
    });
    on('dev-serve-prototype', 'change', () => {
      this.servePrototype = this.checked('dev-serve-prototype');
      this.el('dev-serve-note').hidden = !this.servePrototype;
    });
    on('dev-angle', 'change', () => (this.angle = this.value('dev-angle')));
    on('dev-markers', 'change', () => {
      this.overlays = this.checked('dev-markers');
      this.el('dev-marker-text').hidden = !this.overlays;
    });
    on('dev-scale', 'change', () =>
      this.scene.royalBall.setVisualScale(Number(this.value('dev-scale'))),
    );
    on('dev-camera', 'change', () => {
      this.scene.rig.switch(this.value('dev-camera') as 'behind' | 'broadcast');
      this.cameraChanged();
    });
    on('dev-comparison', 'change', () => {
      this.comparison = this.value('dev-comparison');
      this.resetInput();
    });
    on('dev-perf', 'change', () => (this.readout.hidden = !this.checked('dev-perf')));
    on('dev-scenario', 'change', () => (this.scenario = this.value('dev-scenario')));
    on('dev-record', 'click', () => {
      this.capture.reset();
      this.captureStart = performance.now();
      this.recording = true;
      this.captureScenario = this.scenario;
      this.captureContext = this.context();
      this.el('dev-record-status').textContent = `Recording ${this.scenario}…`;
    });
    on('dev-export', 'click', () => {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              build: __BUILD_ID__,
              release: 'GOAL-002D',
              device: navigator.userAgent,
              capturedAt: new Date().toISOString(),
              ...this.snapshot(),
              records: this.records,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = 'centre-court-002d-diagnostics.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    document.addEventListener('visibilitychange', () => {
      this.last = 0;
      if (document.hidden) {
        this.interruptions++;
        this.timeline.playing = false;
      }
    });
  }
  private el(id: string) {
    return this.root.querySelector<HTMLElement>('#' + id)!;
  }
  private value(id: string) {
    return (this.el(id) as HTMLInputElement).value;
  }
  private checked(id: string) {
    return (this.el(id) as HTMLInputElement).checked;
  }
  private panel(open: boolean) {
    this.el('dev-panel').hidden = !open;
    this.el('dev-toggle').setAttribute('aria-expanded', String(open));
    if (open) this.el('dev-inspect').focus();
    else this.el('dev-toggle').focus();
  }
  get frozen() {
    return this.inspecting || this.comparison !== 'live';
  }
  private inspect(active: boolean) {
    if (active && this.scene.kira.status !== 'ready') return;
    this.resetInput();
    if (active) {
      this.comparison = 'live';
      (this.el('dev-comparison') as HTMLSelectElement).value = 'live';
      this.session = this.scene.kira.beginInspection();
      this.restoreScene = this.scene.beginInspection();
      this.timeline.select(this.timeline.state);
      this.contactHead = undefined;
      this.serveStudy = undefined;
    } else {
      this.session?.restore();
      this.restoreScene?.();
      this.session = undefined;
    }
    this.inspecting = active;
    document.body.classList.toggle('dev-inspecting', active);
    this.el('dev-inspect').textContent = active
      ? 'Return to normal gameplay'
      : 'Inspect Kira animations';
    this.el('dev-animation').hidden = !active;
    this.el('dev-ball-controls').hidden = active;
    this.syncTimeline();
  }
  private syncTimeline() {
    const clip = ANIMATIONS[this.timeline.state];
    (this.el('dev-time') as HTMLInputElement).max = String(clip.duration);
    (this.el('dev-loop') as HTMLInputElement).checked = this.timeline.loop;
    this.el('dev-play').textContent = this.timeline.playing ? 'Pause' : 'Play';
    this.el('dev-contact').textContent =
      'contact' in clip
        ? `Estimated contact: ${clip.contact.toFixed(3)} s · frame ${clip.contactFrame} at 30 fps · ${clip.confidence} mapping confidence. Calibration, not a GLB event.`
        : 'Locomotion loop · no racket contact marker';
    (this.el('dev-contact-seek') as HTMLButtonElement).disabled = !('contact' in clip);
  }
  private line(a: number[], b: number[], color: pc.Color) {
    this.v.set(a[0], a[1], a[2]);
    this.w.set(b[0], b[1], b[2]);
    this.scene.app.drawLine(this.v, this.w, color, false);
  }
  private cross(p: number[], color: pc.Color) {
    for (let axis = 0; axis < 3; axis++) {
      const a = [...p],
        b = [...p];
      a[axis] -= 0.08;
      b[axis] += 0.08;
      this.line(a, b, color);
    }
  }
  update(dt: number) {
    const now = performance.now();
    if (this.last && !document.hidden) {
      const interval = now - this.last;
      this.instantMs = interval;
      this.recent.add(interval);
      if (this.recording) this.capture.add(interval);
    }
    this.last = now;
    if (
      !this.bootReadyMs &&
      this.scene.kira.status === 'ready' &&
      this.scene.royalBall.status === 'ready'
    )
      this.bootReadyMs = now;
    if (this.inspecting && this.session) {
      const clip = ANIMATIONS[this.timeline.state];
      if ('contact' in clip && !this.contactHead) {
        this.session.pose(this.timeline.state, clip.contact);
        this.contactHead = this.session.markers().head;
      }
      if (this.servePrototype && this.timeline.state === 'Serve' && !this.serveStudy) {
        const releaseTime = 0.9,
          contactTime = ANIMATIONS.Serve.contact;
        this.session.pose('Serve', releaseTime - 1 / 30);
        const previous = this.session.markers().palm!;
        this.session.pose('Serve', releaseTime);
        const release = this.session.markers().palm!;
        this.session.pose('Serve', contactTime);
        const contact = this.session.markers().head;
        const flight = contactTime - releaseTime;
        this.serveStudy = {
          release,
          contact,
          releaseTime,
          contactTime,
          handVelocity: release.map((x, i) => (x - previous[i]) * 30),
          velocity: release.map(
            (x, i) => (contact[i] - x) / flight + (i === 1 ? (GRAVITY * flight) / 2 : 0),
          ),
        };
      }
      this.timeline.advance(dt);
      this.session.pose(this.timeline.state, this.timeline.time);
      this.scene.inspectCamera(this.angle);
      let prototypePosition: number[] | undefined;
      if (this.servePrototype && this.timeline.state === 'Serve' && this.serveStudy) {
        const study = this.serveStudy,
          time = this.timeline.time;
        if (time < study.releaseTime) prototypePosition = this.session.markers().palm;
        else if (time <= study.contactTime) {
          const t = time - study.releaseTime;
          prototypePosition = study.release.map(
            (x, i) => x + study.velocity[i] * t - (i === 1 ? (GRAVITY * t * t) / 2 : 0),
          );
        } else {
          // Reuse the real ballistic launch calculation on a separate, throwaway Ball.
          // Analytic display makes arbitrary seeks deterministic; this object never enters Match.
          const ball = new Ball();
          ball.position = { x: study.contact[0], y: study.contact[1], z: study.contact[2] };
          ball.launch({ x: 2, y: 0.0335, z: -8 }, 'serve', 0.5);
          const t = time - study.contactTime;
          prototypePosition = study.contact.map(
            (x, i) =>
              x +
              [ball.velocity.x, ball.velocity.y, ball.velocity.z][i] * t -
              (i === 1 ? (GRAVITY * t * t) / 2 : 0),
          );
        }
      }
      this.scene.inspectionBall(prototypePosition);
      if (this.overlays) {
        const m = this.session.markers();
        this.cross(m.root, pc.Color.RED);
        this.cross(m.grip, pc.Color.CYAN);
        this.line(m.root, [m.root[0], m.root[1], m.root[2] - 0.7], pc.Color.YELLOW);
        if (m.leftHand) this.cross(m.leftHand, pc.Color.WHITE);
        if (this.contactHead) this.cross(this.contactHead, pc.Color.MAGENTA);
        // Small world-space guide around the calibrated sweet spot, not a collider.
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2,
            b = ((i + 1) / 16) * Math.PI * 2;
          this.line(
            [m.head[0] + Math.cos(a) * 0.13, m.head[1] + Math.sin(a) * 0.13, m.head[2]],
            [m.head[0] + Math.cos(b) * 0.13, m.head[1] + Math.sin(b) * 0.13, m.head[2]],
            pc.Color.GREEN,
          );
        }
      }
    }
    if (this.comparison !== 'live' && this.comparison !== 'frozen')
      this.scene.compareBall(this.comparison as 'serve' | 'near' | 'far');
    if (this.recording && now - this.captureStart >= 10000) {
      this.recording = false;
      this.records.push({
        scenario: this.captureScenario,
        startContext: this.captureContext,
        elapsedMs: now - this.captureStart,
        interruptions: this.interruptions,
        frameIntervals: this.capture.summary(),
        context: this.context(),
      });
      if (this.records.length > 50) this.records.shift();
      this.el('dev-record-status').textContent =
        `Saved ${this.captureScenario} · ${this.records.length} record(s)`;
    }
    if (now < this.paintAt) return;
    this.paintAt = now + 250;
    (this.el('dev-inspect') as HTMLButtonElement).disabled = this.scene.kira.status !== 'ready';
    if (!this.el('dev-panel').hidden) {
      if (this.inspecting) {
        (this.el('dev-time') as HTMLInputElement).value = String(this.timeline.time);
        this.el('dev-position').textContent =
          `${this.timeline.time.toFixed(3)} / ${ANIMATIONS[this.timeline.state].duration.toFixed(3)} s`;
        this.el('dev-play').textContent = this.timeline.playing ? 'Pause' : 'Play';
      }
      this.el('dev-assets').textContent = assetTimings
        .map(
          (x) =>
            `${x.path.split('/').pop()}\n${x.status} · ${x.durationMs?.toFixed(0) ?? '…'} ms${x.error ? '\n' + x.error : ''}`,
        )
        .join('\n');
      (this.el('dev-camera') as HTMLSelectElement).value = this.scene.rig.mode;
    }
    if (!this.readout.hidden) {
      const f = this.recent.summary(),
        c = this.context();
      this.readout.textContent = `${f.fps.toFixed(1)} FPS · ${(1000 / Math.max(0.01, this.instantMs)).toFixed(1)} instant\n${f.averageMs.toFixed(2)} ms avg · σ ${f.stddevMs.toFixed(2)}\np95 ${f.p95Ms.toFixed(2)} · max ${f.maxMs.toFixed(2)} ms\n${c.renderer.join('×')} render · DPR ${devicePixelRatio}\neffective scale ${c.renderScale.toFixed(2)} · ${c.camera}\n${this.match.phase} · assets ${assetTimings.filter((a) => a.status === 'ready').length}/${assetTimings.length}\nKira ${this.scene.kira.status} · ball ${this.scene.royalBall.status}\nball ≈ ${c.ballPixels.css.toFixed(2)} CSS px / ${c.ballPixels.render.toFixed(2)} render px\n${c.ballPixels.onScreen ? 'in viewport' : 'offscreen / hidden'} · ${this.scene.royalBall.visualScale.toFixed(2)}× visual\nready ${this.bootReadyMs?.toFixed(0) ?? '…'} ms from navigation\nGPU time: unavailable`;
    }
  }
  private context() {
    const canvas = this.scene.canvas,
      camera = this.scene.camera.camera!;
    const rect = canvas.getBoundingClientRect();
    const p = this.v.fromArray(this.scene.ballPresentation());
    this.view.copy(this.scene.camera.getWorldTransform()).invert().transformPoint(p, this.w);
    const screen = camera.worldToScreen(p);
    const diameter = ROYAL_BALL.diameter * this.scene.royalBall.visualScale;
    const css = projectedDiameter(
      diameter,
      -this.w.z,
      camera.fov,
      camera.horizontalFov ? rect.width : rect.height,
    );
    return {
      renderer: [canvas.width, canvas.height],
      viewport: [rect.width, rect.height],
      dpr: devicePixelRatio,
      renderScale: canvas.height / rect.height,
      camera: this.inspecting ? `inspection/${this.angle}` : this.scene.rig.mode,
      phase: this.match.phase,
      comparison: this.comparison,
      visualScale: this.scene.royalBall.visualScale,
      ballScreen: { x: screen.x, y: screen.y },
      ballPixels: {
        css,
        render: (css * canvas.height) / rect.height,
        onScreen:
          this.scene.royalBall.root.enabled &&
          -this.w.z > camera.nearClip &&
          screen.x >= 0 &&
          screen.y >= 0 &&
          screen.x <= rect.width &&
          screen.y <= rect.height,
      },
    };
  }
  snapshot() {
    return {
      inspecting: this.inspecting,
      frozen: this.frozen,
      timeline: { ...this.timeline },
      markers: this.session?.markers(),
      serveStudy: this.serveStudy,
      servePrototype: this.servePrototype,
      overlayVisible: !this.readout.hidden,
      markersVisible: this.inspecting && this.overlays,
      recent: this.recent.summary(),
      assets: assetTimings.map((x) => ({ ...x })),
      readyMs: this.bootReadyMs,
      ...this.context(),
      records: this.records,
    };
  }
}
