import * as pc from 'playcanvas';
import { Match } from '../core/match';
import { COURT, type Vec } from '../core/court';
import { CameraRig } from '../core/camera';
import { predict } from '../core/ball';
import { RoyalBall } from './royal-ball';
import { Kira } from './kira';
import { ROSTER, type CharacterId } from '../core/roster';
import { Stadium } from './stadium';

export class Scene {
  app: pc.Application;
  stadium: Stadium;
  camera: pc.Entity;
  rig: CameraRig;
  kira: Kira;
  opponent?: Kira;
  private preparingMatch = false;
  private ball: pc.Entity;
  royalBall: RoyalBall;
  private playerShadow: pc.Entity;
  private ballShadow: pc.Entity;
  private landing: pc.Entity;
  private athletes: { root: pc.Entity; arm: pc.Entity; legs: pc.Entity[]; shadow: pc.Entity }[] =
    [];
  private trail: pc.Entity[] = [];
  private history: Vec[] = [];
  private accents: pc.Entity[] = [];
  private signatureEvent = 0;
  private signatureFlash = 0;
  private signatureColor = '#ffb85e';
  private trailClock = 0;
  private predictionClock = 0;
  private fitPoint = new pc.Vec3();
  private fitScreen = new pc.Vec3();
  private courtBatch: number;
  private athleteBatch: number;
  private materials = new Map<string, pc.StandardMaterial>();
  constructor(
    public canvas: HTMLCanvasElement,
    initialCharacter: CharacterId = 'kira',
  ) {
    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: {
        alpha: false,
        antialias: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      },
    });
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio, 1.75);
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.scene.ambientLight = new pc.Color(0.48, 0.54, 0.59);
    this.app.scene.fog.type = 'linear';
    this.app.scene.fog.color = new pc.Color(0.28, 0.36, 0.43);
    this.app.scene.fog.start = 65;
    this.app.scene.fog.end = 150;
    this.courtBatch = this.app.batcher!.addGroup('Arena static', false, 100)!.id;
    this.athleteBatch = this.app.batcher!.addGroup('Athletes dynamic', true, 50)!.id;
    this.camera = new pc.Entity('Single active rendering camera');
    this.camera.addComponent('camera', {
      clearColor: new pc.Color(0.28, 0.36, 0.43),
      fov: 48,
      nearClip: 0.1,
      farClip: 160,
    });
    this.app.root.addChild(this.camera);
    let storage: Storage | undefined;
    try {
      storage = localStorage;
    } catch {
      /* restricted storage */
    }
    this.rig = new CameraRig(storage);
    const sun = new pc.Entity('Soft stadium light');
    sun.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 0.94, 0.82),
      intensity: 1.35,
      castShadows: false,
    });
    sun.setEulerAngles(48, -30, 0);
    this.app.root.addChild(sun);
    this.buildArena();
    this.stadium = new Stadium(this.app);
    // Only the AI uses a temporary model. Never create a placeholder human.
    this.athletes = [];
    this.playerShadow = this.shadow('Kira ground shadow', 1.05);
    this.kira = new Kira(this.app, initialCharacter);
    this.royalBall = new RoyalBall(this.app);
    this.ball = this.royalBall.root;
    this.ballShadow = this.shadow('Ball ground shadow', 0.075);
    this.landing = this.ring('Predicted first bounce', '#d5ef95', 0.34, 0.018);
    this.landing.setLocalPosition(0, 0.03, 0);
    for (let i = 0; i < 6; i++)
      this.trail.push(
        this.shape(
          'sphere',
          'Ball trail',
          '#d8f19a',
          [0, 0, 0],
          [0.13 - i * 0.012, 0.13 - i * 0.012, 0.13 - i * 0.012],
          false,
          true,
        ),
      );
    for (let i = 0; i < 2; i++) {
      const accent = this.ring('Racket heat accent', '#ffb85e', 0.12, 0.012);
      accent.enabled = false;
      this.accents.push(accent);
    }
    this.app.batcher!.generate();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.app.start();
  }
  selectCharacter(id: CharacterId) {
    if (this.kira.character === id) return this.kira.ready;
    this.kira.destroy();
    this.kira = new Kira(this.app, id, 0);
    return this.kira.ready;
  }
  async selectOpponent(id: CharacterId) {
    if (this.opponent?.character === id && this.opponent.status === 'ready') return;
    this.preparingMatch = true;
    if (this.opponent?.character !== id) {
      this.opponent?.destroy();
      this.opponent = new Kira(this.app, id, 1);
    }
    await this.opponent!.ready;
    if (this.opponent!.status === 'ready')
      await new Promise<void>((resolve) => {
        let frames = 0;
        const finish = () => {
          clearTimeout(timeout);
          this.app.off('postrender', check);
          resolve();
        };
        const check = () => {
          const s = this.opponent!.snapshot();
          if (s.bodyVisible && s.racketVisible && ++frames >= 2) finish();
        };
        const timeout = setTimeout(() => {
          this.opponent!.status = 'error';
          this.opponent!.error = 'Opponent did not reach rendering camera';
          finish();
        }, 45000);
        this.app.on('postrender', check);
      });
    this.preparingMatch = false;
  }
  private material(hex: string, unlit = false) {
    const key = hex + unlit;
    if (this.materials.has(key)) return this.materials.get(key)!;
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color().fromString(hex);
    m.gloss = 12;
    if (unlit) {
      m.useLighting = false;
      m.emissive = m.diffuse.clone();
    }
    m.update();
    this.materials.set(key, m);
    return m;
  }
  private shape(
    type: 'box' | 'sphere' | 'cylinder' | 'capsule',
    name: string,
    color: string,
    p: number[],
    s: number[],
    batch = true,
    unlit = false,
    parent?: pc.Entity,
  ) {
    const e = new pc.Entity(name);
    e.addComponent('render', {
      type,
      material: this.material(color, unlit),
      castShadows: false,
      receiveShadows: false,
      batchGroupId: batch ? this.courtBatch : parent ? this.athleteBatch : -1,
    });
    e.setLocalPosition(p[0], p[1], p[2]);
    e.setLocalScale(s[0], s[1], s[2]);
    (parent ?? this.app.root).addChild(e);
    return e;
  }
  private ring(name: string, color: string, radius: number, tube: number, parent?: pc.Entity) {
    const e = new pc.Entity(name);
    const mesh = pc.createTorus(this.app.graphicsDevice, {
      ringRadius: radius,
      tubeRadius: tube,
      segments: 32,
      sides: 6,
    });
    e.addComponent('render', {
      meshInstances: [new pc.MeshInstance(mesh, this.material(color, true))],
      batchGroupId: parent ? this.athleteBatch : -1,
      castShadows: false,
    });
    (parent ?? this.app.root).addChild(e);
    return e;
  }
  private shadow(name: string, size: number) {
    return this.shape('sphere', name, '#102d32', [0, 0.022, 0], [size, 0.018, size], false, true);
  }
  private buildArena() {
    this.shape('box', 'Runoff surface', '#294f5c', [0, -0.105, 0], [20, 0.12, 36]);
    const surface = this.shape(
      'box',
      'Playing surface',
      '#285f91',
      [0, -0.042, 0],
      [COURT.doublesWidth * 2, 0.025, COURT.halfLength * 2],
    );
    // Quiet acrylic aggregate: one 256px repeating map, no normal map or texture downloads.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!,
      pixels = ctx.createImageData(256, 256);
    let seed = 4004;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const value = 245 + (seed % 11);
      pixels.data.set([value, value, value, 255], i);
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = new pc.Texture(this.app.graphicsDevice, {
      width: 256,
      height: 256,
      mipmaps: true,
    });
    texture.setSource(canvas);
    const m = this.material('#285f91');
    m.diffuseMap = texture;
    m.diffuseMapTiling.set(7, 14);
    m.gloss = 2;
    m.update();
    surface.render!.material = m;
    // Measured line centres and all gameplay dimensions remain from the shared court constants.
    const line = (x: number, z: number, w: number, d: number) =>
      this.shape('box', 'Court line', '#f1f3e9', [x, -0.009, z], [w, 0.018, d]);
    for (const x of [-COURT.doublesWidth, -COURT.halfWidth, COURT.halfWidth, COURT.doublesWidth])
      line(x, 0, 0.05, COURT.halfLength * 2 + 0.05);
    for (const z of [-COURT.halfLength, COURT.halfLength]) {
      line(0, z, COURT.doublesWidth * 2 + 0.05, 0.05);
      line(0, z + Math.sign(z) * 0.1, 0.05, 0.2);
    }
    for (const z of [-COURT.service, COURT.service]) line(0, z, COURT.halfWidth * 2, 0.05);
    line(0, 0, 0.05, COURT.service * 2);
    // Open net holes: batched opaque cords, no alpha-overdraw or solid fabric occluding feet.
    for (let x = -5.03; x <= 5.04; x += 0.14) {
      const height = COURT.netCentre + ((COURT.netEdge - COURT.netCentre) * Math.abs(x)) / 5.03;
      this.shape('box', 'Net vertical cord', '#263943', [x, height / 2, 0], [0.012, height, 0.012]);
    }
    for (let y = 0.1; y < COURT.netCentre; y += 0.12)
      this.shape('box', 'Net horizontal cord', '#263943', [0, y, 0], [10.06, 0.012, 0.012]);
    for (const side of [-1, 1]) {
      const tape = this.shape(
        'box',
        'Net tape',
        '#f3f0de',
        [side * 2.515, (COURT.netCentre + COURT.netEdge) / 2, 0],
        [5.0324, 0.045, 0.045],
      );
      tape.setEulerAngles(
        0,
        0,
        (side * Math.atan2(COURT.netEdge - COURT.netCentre, 5.03) * 180) / Math.PI,
      );
      this.shape('cylinder', 'Net post', '#273540', [side * 5.03, 0.54, 0], [0.11, 1.08, 0.11]);
      this.shape('sphere', 'Post cap', '#b6ca70', [side * 5.03, 1.09, 0], [0.13, 0.06, 0.13]);
      this.shape('box', 'Post footing', '#21303a', [side * 5.03, 0.04, 0], [0.24, 0.08, 0.24]);
    }
    this.shape(
      'box',
      'Net centre strap',
      '#f3f0de',
      [0, COURT.netCentre / 2, 0.025],
      [0.04, COURT.netCentre, 0.022],
    );
  }
  /** Presentation-only isolation; all match state and camera-rig state stay untouched. */
  beginInspection() {
    const entities = [
      this.ball,
      this.ballShadow,
      this.landing,
      ...this.trail,
      ...(this.opponent ? [this.opponent.root] : []),
    ];
    const enabled = entities.map((e) => e.enabled);
    const shadowPosition = this.playerShadow.getPosition().clone();
    this.playerShadow.setPosition(0, 0.06, 11);
    const position = this.camera.getPosition().clone(),
      rotation = this.camera.getRotation().clone();
    entities.forEach((e) => (e.enabled = false));
    return () => {
      entities.forEach((e, i) => (e.enabled = enabled[i]));
      this.camera.setPosition(position);
      this.camera.setRotation(rotation);
      this.playerShadow.setPosition(shadowPosition);
    };
  }
  /** Diagnostic views only. Neither camera-rig transforms nor saved mode are changed. */
  inspectStadium(view: string) {
    const views: Record<string, [number[], number[]]> = {
      overview: [
        [43, 35, 48],
        [0, 1, 0],
      ],
      net: [
        [7.4, 2.8, 5.5],
        [0, 0.45, 0],
      ],
      seating: [
        [8.8, 5, 7],
        [17, 3.4, -5],
      ],
      courtside: [
        [3, 4.2, 9.5],
        [8.6, 0.9, 5.5],
      ],
      scoreboard: [
        [0, 5.5, -13.5],
        [0, 5.3, -23.5],
      ],
    };
    const [p, target] = views[view] ?? views.overview;
    this.camera.setPosition(p[0], p[1], p[2]);
    this.camera.lookAt(target[0], target[1], target[2]);
  }
  inspectCamera(angle: string) {
    const views: Record<string, number[]> = {
      front: [0, 1.8, 6.6],
      side: [4.4, 1.8, 11],
      rear: [0, 1.8, 15.4],
      quarter: [3.4, 2, 7.6],
    };
    const p = views[angle] ?? views.quarter;
    this.camera.setPosition(p[0], p[1], p[2]);
    // Inspection-only framing leaves the lower phone panel clear of the athlete.
    // Gameplay CameraRig and its saved transforms are never changed here.
    const portrait = innerWidth < 600 && innerHeight > innerWidth;
    const target = new pc.Vec3(0, portrait ? 0.1 : 1.1, 11);
    this.camera.lookAt(target);
    if (innerHeight < 500) {
      target.add(this.camera.right.clone().mulScalar(0.8));
      this.camera.lookAt(target);
    }
  }
  inspectionBall(position?: number[]) {
    this.ball.enabled = !!position && this.royalBall.status === 'ready';
    if (position) this.ball.setPosition(position[0], position[1], position[2]);
  }
  renderComparison(match: Match, dt: number) {
    this.rig.update(dt, match.players[0].position, match.ball.position, innerWidth / innerHeight);
    this.camera.setPosition(this.rig.position.x, this.rig.position.y, this.rig.position.z);
    this.camera.lookAt(this.rig.target.x, this.rig.target.y, this.rig.target.z);
  }
  compareBall(position: 'serve' | 'near' | 'far') {
    const p = { serve: [1.6, 2.6, 12.1], near: [0, 1, 8], far: [0, 1, -8] }[position];
    this.ball.setPosition(p[0], p[1], p[2]);
    this.ball.enabled = this.royalBall.status === 'ready';
    this.ballShadow.setPosition(p[0], 0.006, p[2]);
  }
  courtToScreen(point: Vec, out: { x: number; y: number }) {
    this.fitPoint.set(point.x, 0.06, point.z);
    this.camera.camera!.worldToScreen(this.fitPoint, this.fitScreen);
    out.x = this.fitScreen.x;
    out.y = this.fitScreen.y;
    return out;
  }
  playerPresentation() {
    const p = this.kira.root.getPosition();
    const screen = this.camera.camera!.worldToScreen(new pc.Vec3(p.x, p.y + 0.9, p.z));
    return {
      screen: { x: screen.x, y: screen.y },
      cameraPosition: this.camera.getPosition().toArray(),
      rendering: {
        fov: this.camera.camera!.fov,
        samples: this.app.graphicsDevice.samples,
        maxPixelRatio: this.app.graphicsDevice.maxPixelRatio,
        width: this.canvas.width,
        height: this.canvas.height,
      },
      athletePixels: Math.abs(
        this.camera.camera!.worldToScreen(new pc.Vec3(p.x, 1.7, p.z)).y -
          this.camera.camera!.worldToScreen(new pc.Vec3(p.x, 0, p.z)).y,
      ),
      human: ROSTER[this.kira.character].name,
      temporaryHumanCount: this.app.root.find((n) => n.name === 'Temporary humanoid athlete')
        .length,
      opponentCount: this.opponent ? 1 : 0,
    };
  }
  stadiumPresentation() {
    const project = (x: number, y: number, z: number) => {
      const p = this.camera.camera!.worldToScreen(new pc.Vec3(x, y, z));
      return { x: p.x / this.canvas.clientWidth, y: p.y / this.canvas.clientHeight };
    };
    return {
      ...this.stadium.snapshot(),
      renderedCourt: {
        surface: this.app.root.findByName('Playing surface')?.getLocalScale().toArray(),
        lines: this.app.root
          .find((n) => n.name === 'Court line')
          .map((e) => ({
            position: e.getLocalPosition().toArray(),
            size: e.getLocalScale().toArray(),
          })),
        netPosts: this.app.root
          .find((n) => n.name === 'Net post')
          .map((e) => e.getLocalPosition().toArray()),
      },
      singlesCourtCorners: [-1, 1].flatMap((x) =>
        [-1, 1].map((z) => project(x * COURT.halfWidth, 0, z * COURT.halfLength)),
      ),
      courtCorners: [-1, 1].flatMap((x) =>
        [-1, 1].map((z) => project(x * COURT.doublesWidth, 0, z * COURT.halfLength)),
      ),
      players: [this.kira.root, this.opponent?.root ?? this.kira.root].map((e) => {
        const p = e.getPosition();
        return project(p.x, p.y + 0.9, p.z);
      }),
    };
  }
  /** Preserve the athletes and singles court even while the tracking rig eases.
   * Fit in projection space so tall mobile viewports and wide chases use the
   * same rule. Widen immediately to avoid clipping; recover the close view gently.
   */
  private fitGameplay(match: Match, dt: number) {
    const camera = this.camera.camera!,
      aspect = innerWidth / innerHeight;
    const minimum = aspect < 0.85 ? 50 : 48;
    const current = camera.fov;
    let extent = 0;
    const include = (x: number, y: number, z: number) => {
      this.fitPoint.set(x, y, z);
      camera.worldToScreen(this.fitPoint, this.fitScreen);
      extent = Math.max(extent, Math.abs((this.fitScreen.x / this.canvas.clientWidth) * 2 - 1));
    };
    include(-COURT.halfWidth, 0, COURT.halfLength);
    include(COURT.halfWidth, 0, COURT.halfLength);
    include(-COURT.halfWidth, 0, -COURT.halfLength);
    include(COURT.halfWidth, 0, -COURT.halfLength);
    for (const athlete of match.players) {
      include(athlete.position.x - 0.55, 0, athlete.position.z);
      include(athlete.position.x + 0.55, 1.7, athlete.position.z);
    }
    const required = Math.max(
      minimum,
      Math.min(
        74,
        (Math.atan((Math.tan((current * Math.PI) / 360) * extent) / 0.94) * 360) / Math.PI,
      ),
    );
    camera.fov =
      required > current ? required : current + (required - current) * (1 - Math.exp(-dt * 3));
  }
  ballPresentation() {
    return this.ball.getPosition().toArray();
  }
  resize() {
    this.app.resizeCanvas();
  }
  render(match: Match, dt: number, charging = false, intent: 'drive' | 'slice' | 'lob' = 'drive') {
    this.stadium.update(match, dt);
    this.kira.update(match, dt, charging, intent);
    this.opponent?.update(match, dt, false);
    const menu = match.phase === 'menu' && !this.preparingMatch;
    const resolutionBudget = Math.min(window.devicePixelRatio, menu ? 1.75 : 1.5);
    if (this.app.graphicsDevice.maxPixelRatio !== resolutionBudget) {
      this.app.graphicsDevice.maxPixelRatio = resolutionBudget;
      this.app.resizeCanvas();
    }
    const p = match.ball.position;
    if (menu) {
      const t = 1 - Math.exp(-dt * 3);
      this.rig.position.x += (4.4 - this.rig.position.x) * t;
      this.rig.position.y += (2.8 - this.rig.position.y) * t;
      this.rig.position.z += (17.8 - this.rig.position.z) * t;
      this.rig.target = { x: -1.1, y: 0.9, z: 11 };
    } else this.rig.update(dt, match.players[0].position, p, innerWidth / innerHeight);
    if (menu) this.camera.camera!.fov = 48;
    const c = this.rig;
    this.camera.setPosition(c.position.x, c.position.y, c.position.z);
    this.camera.lookAt(c.target.x, c.target.y, c.target.z);
    if (!menu) this.fitGameplay(match, dt);
    this.ball.setPosition(p.x, p.y, p.z);
    this.ball.enabled = !menu && this.royalBall.status === 'ready';
    if (match.ball.active && match.phase === 'rally')
      this.ball.rotate(
        (match.ball.spin.x * dt * 180) / Math.PI,
        (match.ball.spin.y * dt * 180) / Math.PI,
        (match.ball.spin.z * dt * 180) / Math.PI,
      );
    this.ballShadow.setPosition(p.x, 0.006, p.z);
    this.ballShadow.setLocalScale(0.075 + p.y * 0.012, 0.004, 0.075 + p.y * 0.012);
    this.ballShadow.enabled = !menu;
    this.playerShadow.setPosition(match.players[0].position.x, 0.06, match.players[0].position.z);
    this.playerShadow.enabled = this.kira.status === 'ready';
    if (this.opponent) this.opponent.root.enabled = true;
    this.predictionClock -= dt;
    if (this.predictionClock <= 0) {
      this.predictionClock = 0.12;
      const landing = match.ball.active ? predict(match.ball, 3).find((s) => s.bounced) : undefined;
      this.landing.enabled = !!landing && !menu && match.phase === 'rally';
      if (landing) this.landing.setPosition(landing.position.x, 0.065, landing.position.z);
    }
    this.trailClock += dt;
    if (this.trailClock > 0.035) {
      this.trailClock = 0;
      this.history.unshift({ ...p });
      this.history.length = Math.min(6, this.history.length);
    }
    if (match.phase !== 'paused') this.signatureFlash = Math.max(0, this.signatureFlash - dt);
    for (const event of match.events)
      if (event.type === 'signature' && event.id > this.signatureEvent) {
        this.signatureEvent = event.id;
        this.signatureFlash = 0.65;
        this.signatureColor = ROSTER[match.characters[event.side]].color;
      }
    if (match.phase !== 'rally' && match.phase !== 'paused') this.signatureFlash = 0;
    this.accents.forEach((e, i) => {
      const contact = match.players[i].contact;
      e.enabled =
        match.phase === 'rally' &&
        !!contact &&
        contact.age < 0.16 &&
        (match.heat > 0 || this.signatureFlash > 0);
      if (contact && e.enabled) {
        e.setPosition(contact.position.x, contact.position.y, contact.position.z);
        const size = 1 + contact.age * 5;
        e.setLocalScale(size, size, size);
        e.render!.material = this.material(
          this.signatureFlash > 0 ? this.signatureColor : '#ffb85e',
          true,
        );
      }
    });
    this.trail.forEach((e, i) => {
      const h = this.history[i];
      e.enabled = !!h && match.phase === 'rally';
      e.render!.material = this.material(
        this.signatureFlash > 0
          ? this.signatureColor
          : match.heat === 2
            ? i % 2
              ? '#ef7136'
              : '#ffbb54'
            : match.heat === 1
              ? '#eac77e'
              : '#d8f19a',
        true,
      );
      if (h) e.setPosition(h.x, h.y, h.z);
    });
  }
}
