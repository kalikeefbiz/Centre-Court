import * as pc from 'playcanvas';
import { Match } from '../core/match';
import { COURT, type Vec } from '../core/court';
import { CameraRig } from '../core/camera';
import { predict } from '../core/ball';
import { RoyalBall } from './royal-ball';
import { Kira } from './kira';

export class Scene {
  app: pc.Application;
  camera: pc.Entity;
  rig: CameraRig;
  kira: Kira;
  private ball: pc.Entity;
  royalBall: RoyalBall;
  private playerShadow: pc.Entity;
  private ballShadow: pc.Entity;
  private landing: pc.Entity;
  private athletes: { root: pc.Entity; arm: pc.Entity; legs: pc.Entity[]; shadow: pc.Entity }[] =
    [];
  private trail: pc.Entity[] = [];
  private history: Vec[] = [];
  private trailClock = 0;
  private predictionClock = 0;
  private courtBatch: number;
  private athleteBatch: number;
  private materials = new Map<string, pc.StandardMaterial>();
  constructor(public canvas: HTMLCanvasElement) {
    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: {
        alpha: false,
        antialias: devicePixelRatio < 2,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      },
    });
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio, 1.75);
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.scene.ambientLight = new pc.Color(0.65, 0.72, 0.74);
    this.app.scene.fog.type = 'linear';
    this.app.scene.fog.color = new pc.Color(0.055, 0.105, 0.12);
    this.app.scene.fog.start = 48;
    this.app.scene.fog.end = 105;
    this.courtBatch = this.app.batcher!.addGroup('Arena static', false, 100)!.id;
    this.athleteBatch = this.app.batcher!.addGroup('Athletes dynamic', true, 50)!.id;
    this.camera = new pc.Entity('Single active rendering camera');
    this.camera.addComponent('camera', {
      clearColor: new pc.Color(0.055, 0.105, 0.12),
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
      intensity: 1.5,
      castShadows: false,
    });
    sun.setEulerAngles(48, -30, 0);
    this.app.root.addChild(sun);
    this.buildArena();
    // Only the AI uses a temporary model. Never create a placeholder human.
    this.athletes = [this.buildAthlete('#f17b4c', '#1c363d')];
    this.athletes[0].root.enabled = false;
    this.playerShadow = this.shadow('Kira ground shadow', 1.05);
    this.kira = new Kira(this.app);
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
    this.app.batcher!.generate();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.app.start();
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
    this.shape('box', 'Arena floor', '#172e32', [0, -0.22, 0], [65, 0.3, 75]);
    this.shape('box', 'Runoff surface', '#356e70', [0, -0.105, 0], [19, 0.12, 35]);
    this.shape('box', 'Playing surface', '#397c80', [0, -0.042, 0], [10.97, 0.025, 23.77]);
    this.shape('box', 'Singles interior', '#438b8d', [0, -0.027, 0], [8.23, 0.012, 23.77]);
    const line = (x: number, z: number, w: number, d: number) =>
      this.shape('box', 'Court line', '#eaf1e5', [x, -0.009, z], [w, 0.018, d]);
    for (const x of [-5.485, -4.115, 4.115, 5.485]) line(x, 0, 0.05, 23.82);
    for (const z of [-11.885, 11.885]) {
      line(0, z, 11.02, 0.05);
      line(0, z + Math.sign(z) * 0.1, 0.05, 0.2);
    }
    for (const z of [-6.4, 6.4]) line(0, z, 8.23, 0.05);
    line(0, 0, 0.05, 12.8);
    // A fine, batched net mesh and sloped tape, with regulation centre/edge heights.
    this.shape('box', 'Net fabric', '#172b31', [0, 0.47, 0], [10.1, 0.9, 0.025]);
    for (let x = -5; x <= 5; x += 0.2)
      this.shape('box', 'Net vertical cord', '#68858a', [x, 0.47, 0.025], [0.012, 0.9, 0.012]);
    for (let y = 0.12; y < 0.95; y += 0.14)
      this.shape('box', 'Net horizontal cord', '#68858a', [0, y, 0.025], [10, 0.012, 0.012]);
    for (const x of [-2.515, 2.515]) {
      const e = this.shape('box', 'Net tape', '#f3f0de', [x, 0.99, 0], [5.04, 0.065, 0.07]);
      e.setEulerAngles(0, 0, Math.sign(x) * 1.77);
    }
    this.shape('box', 'Net centre strap', '#f3f0de', [0, 0.47, 0.04], [0.045, 0.94, 0.025]);
    for (const x of [-5.03, 5.03]) {
      this.shape('cylinder', 'Net post', '#dbe5dc', [x, 0.54, 0], [0.1, 1.08, 0.1]);
      this.shape('sphere', 'Post cap', '#f07845', [x, 1.1, 0], [0.15, 0.15, 0.15]);
    }
    // Low arena architecture keeps the court readable without detailed crowd assets.
    for (const side of [-1, 1]) {
      this.shape('box', 'Back wall', '#182e33', [0, 1.0, side * 19], [34, 2, 1]);
      this.shape('box', 'Sponsor ribbon', '#ed7d50', [0, 1.2, side * 18.43], [13, 0.4, 0.06]);
      this.shape('box', 'Side wall', '#182e33', [side * 12, 1, 0], [0.7, 2, 38]);
      for (let row = 0; row < 5; row++) {
        this.shape(
          'box',
          'Grandstand riser',
          row % 2 ? '#213e44' : '#29484d',
          [side * (14 + row * 1.3), row * 0.65 + 0.5, 0],
          [1.2, 0.65, 38],
        );
        for (let z = -17; z < 18; z += 2.4)
          this.shape(
            'box',
            'Bench',
            '#36545a',
            [side * (14 + row * 1.3), row * 0.65 + 0.92, z],
            [0.8, 0.12, 1.65],
          );
      }
      for (const z of [-16, 16]) {
        this.shape('cylinder', 'Light mast', '#52676c', [side * 11, 6, z], [0.16, 12, 0.16]);
        this.shape(
          'box',
          'Stadium luminaire',
          '#e7edcd',
          [side * 11, 12, z],
          [1.9, 0.32, 0.5],
          true,
          true,
        );
      }
    }
  }
  private buildAthlete(shirt: string, shorts: string) {
    const root = new pc.Entity('AI opponent');
    this.app.root.addChild(root);
    this.shape('sphere', 'Torso', shirt, [0, 1.04, 0], [0.58, 0.69, 0.33], false, false, root);
    this.shape('box', 'Shorts', shorts, [0, 0.67, 0], [0.47, 0.3, 0.34], false, false, root);
    this.shape('sphere', 'Head', '#be8a65', [0, 1.6, 0], [0.31, 0.36, 0.32], false, false, root);
    this.shape(
      'sphere',
      'Hair',
      '#232b2b',
      [0, 1.73, -0.015],
      [0.32, 0.16, 0.32],
      false,
      false,
      root,
    );
    const legs = [-0.16, 0.16].map((x) => {
      const leg = new pc.Entity('Leg pivot');
      root.addChild(leg);
      leg.setLocalPosition(x, 0.65, 0);
      this.shape('capsule', 'Leg', '#be8a65', [0, -0.25, 0], [0.14, 0.52, 0.14], false, false, leg);
      this.shape('box', 'Shoe', '#f2f0de', [0, -0.55, 0.07], [0.18, 0.14, 0.33], false, false, leg);
      return leg;
    });
    this.shape(
      'capsule',
      'Off arm',
      '#be8a65',
      [-0.34, 1.03, 0],
      [0.13, 0.54, 0.13],
      false,
      false,
      root,
    ).setLocalEulerAngles(0, 0, -20);
    const arm = new pc.Entity('Racket arm');
    root.addChild(arm);
    arm.setLocalPosition(0.32, 1.25, 0);
    this.shape(
      'capsule',
      'Forearm',
      '#be8a65',
      [0.13, -0.2, 0],
      [0.14, 0.5, 0.14],
      false,
      false,
      arm,
    ).setLocalEulerAngles(0, 0, 34);
    this.shape(
      'box',
      'Racket handle',
      '#e9e8d5',
      [0.3, -0.45, 0],
      [0.05, 0.4, 0.05],
      false,
      false,
      arm,
    );
    const racket = this.ring('Temporary racket frame', '#e5b672', 0.26, 0.025, arm);
    racket.setLocalEulerAngles(90, 0, 0);
    racket.setLocalPosition(0.3, -0.89, 0);
    racket.setLocalScale(0.85, 1, 1.2);
    for (let i = -2; i <= 2; i++) {
      this.shape(
        'box',
        'Racket string',
        '#aeb8a6',
        [0.3 + i * 0.067, -0.89, 0],
        [0.009, 0.43, 0.009],
        false,
        false,
        arm,
      );
      this.shape(
        'box',
        'Racket string',
        '#aeb8a6',
        [0.3, -0.89 + i * 0.08, 0],
        [0.36, 0.009, 0.009],
        false,
        false,
        arm,
      );
    }
    return { root, arm, legs, shadow: this.shadow('Athlete shadow', 1.05) };
  }
  playerPresentation() {
    const p = this.kira.root.getPosition();
    const screen = this.camera.camera!.worldToScreen(new pc.Vec3(p.x, p.y + 0.9, p.z));
    return {
      screen: { x: screen.x, y: screen.y },
      cameraPosition: this.camera.getPosition().toArray(),
      human: 'Kira',
      temporaryHumanCount: this.app.root.find((n) => n.name === 'Temporary humanoid athlete')
        .length,
      opponentCount: this.athletes.length,
    };
  }
  ballPresentation() {
    return this.ball.getPosition().toArray();
  }
  resize() {
    this.app.resizeCanvas();
  }
  render(match: Match, dt: number, charging = false, intent: 'drive' | 'slice' | 'lob' = 'drive') {
    this.kira.update(match, dt, charging, intent);
    const menu = match.phase === 'menu';
    const p = match.ball.position;
    if (menu) {
      const t = 1 - Math.exp(-dt * 3);
      this.rig.position.x += (4.4 - this.rig.position.x) * t;
      this.rig.position.y += (2.8 - this.rig.position.y) * t;
      this.rig.position.z += (17.8 - this.rig.position.z) * t;
      this.rig.target = { x: -1.1, y: 0.9, z: 11 };
    } else this.rig.update(dt, match.players[0].position, p, innerWidth / innerHeight);
    const c = this.rig;
    this.camera.setPosition(c.position.x, c.position.y, c.position.z);
    this.camera.lookAt(c.target.x, c.target.y, c.target.z);
    const offset = this.kira.ballOffset(p);
    this.ball.setPosition(p.x + offset.x, p.y + offset.y, p.z + offset.z);
    this.ball.enabled = !menu && this.royalBall.status === 'ready';
    if (match.ball.active && match.phase === 'rally') this.ball.rotate(dt * 200, dt * 130, 0);
    this.ballShadow.setPosition(p.x, 0.006, p.z);
    this.ballShadow.setLocalScale(0.075 + p.y * 0.012, 0.004, 0.075 + p.y * 0.012);
    this.ballShadow.enabled = !menu;
    this.playerShadow.setPosition(match.players[0].position.x, 0.06, match.players[0].position.z);
    this.playerShadow.enabled = this.kira.status === 'ready';
    this.athletes.forEach((a, i) => {
      a.root.enabled = !menu;
      a.shadow.enabled = !menu;
      const athlete = match.players[i + 1],
        pos = athlete.position;
      a.root.setPosition(pos.x, 0, pos.z);
      a.root.setEulerAngles(0, 0, 0);
      a.shadow.setPosition(pos.x, 0.06, pos.z);
      a.legs.forEach((leg, j) =>
        leg.setLocalEulerAngles(Math.sin(athlete.distance * 4 + j * Math.PI) * 24, 0, 0),
      );
      a.arm.setLocalEulerAngles(
        athlete.swing > 0 ? -70 + Math.sin(athlete.swing * 13) * 95 : 0,
        athlete.swing > 0 ? Math.sin(athlete.swing * 10) * 60 : 0,
        -12,
      );
    });
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
    this.trail.forEach((e, i) => {
      const h = this.history[i];
      e.enabled = !!h && match.phase === 'rally';
      if (h) e.setPosition(h.x, h.y, h.z);
    });
  }
}
