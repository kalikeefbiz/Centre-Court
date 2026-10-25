import * as pc from 'playcanvas';
import type { Match } from '../core/match';
import { COURT, Random } from '../core/court';
import { assetTimings } from '../dev/metrics';
import {
  Geometry,
  STADIUM,
  initialQuality,
  type XYZ,
  type StadiumQuality,
} from './stadium-geometry';

const palette = {
  structure: '#202c36',
  edge: '#465762',
  concrete: '#56626a',
  tread: '#7c8588',
  seat: '#294852',
  lime: '#b4cc61',
  red: '#b14e54',
};

/** Crown Pavilion: all geometry is presentation-only, with no collision components. */
export class Stadium {
  readonly root = new pc.Entity('Centre Court · Crown Pavilion');
  quality: StadiumQuality = initialQuality(
    Math.min(innerWidth, innerHeight),
    navigator.hardwareConcurrency,
  );
  private fullCrowd: pc.Entity;
  private crowdCount = [0, 0];
  private boardCanvas = document.createElement('canvas');
  private boardTexture: pc.Texture;
  private boardKey = '';
  private boardState: ReturnType<typeof scoreboardState> | null = null;
  private boardUpdates = 0;
  private reaction = 0;
  private lastPoints = 0;
  private lastPhase = 'menu';
  private clock = 0;
  private sections = 0;
  private triangles = 0;
  private crowdGroups: pc.Entity[] = [];
  private status = 'building';
  constructor(private app: pc.Application) {
    const timing = {
      path: 'procedural:Crown-Pavilion',
      status: 'loading' as 'loading' | 'ready',
      startMs: performance.now(),
      durationMs: 0,
    };
    assetTimings.push(timing);
    app.root.addChild(this.root);
    const arch = new Geometry(),
      seats = new Geometry(),
      crowd = [new Geometry(), new Geometry()];
    const b = (p: XYZ, s: XYZ, color = palette.structure, yaw = 0) => arch.box(p, s, color, yaw);
    b([0, -0.34, 0], [64, 0.32, 76]);
    // Continuous concourse, segmented retaining walls, open portals, never a sealed box.
    for (const sign of [-1, 1]) {
      b([sign * 10.6, 0.42, 0], [0.26, 0.84, 37.4]);
      b([sign * 10.6, 0.87, 0], [0.3, 0.06, 37.4], palette.edge);
      for (const x of [-10, 10]) b([x, 0.45, sign * 18.7], [17, 0.9, 0.3]);
      b([0, -0.03, sign * 20], [4, 0.1, 4], palette.concrete);
      for (const x of [-2, 2]) b([x, 1.5, sign * 22.6], [0.5, 3, 2]);
      b([0, 3.1, sign * 22.6], [4.5, 0.4, 2]);
      b([0, 1.5, sign * 23.65], [3.5, 3, 0.12], '#0e1922');
      // Two tapered cantilever wings. Open end sightlines clear both accepted cameras.
      b([sign * 23.3, 9.7, 0], [5.8, 0.28, 41], palette.edge);
      b([sign * 23.3, 9.88, 0], [5.8, 0.1, 41]);
      b([sign * 20.45, 9.64, 0], [0.1, 0.12, 41], palette.lime);
      for (const z of [-19, -9.5, 0, 9.5, 19]) {
        b([sign * 25.5, 4.9, z], [0.32, 9.8, 0.38]);
        b([sign * 22.8, 9.4, z], [5.5, 0.35, 0.25]);
        b([sign * 21.5, 9.4, z], [1.8, 0.08, 0.8], '#d4dfd8');
      }
      for (const z of [-17, 17]) {
        b([sign * 10.95, 5.8, z], [0.13, 11.6, 0.13], palette.edge);
        b([sign * 10.95, 11.6, z], [2.7, 0.22, 0.7]);
        for (let j = 0; j < 5; j++)
          b([sign * 10.95 - 1.03 + j * 0.51, 11.52, z + 0.38], [0.38, 0.16, 0.05], '#f0f2d9');
      }
    }
    const rng = new Random(STADIUM.seed);
    const shirts = [
      '#a3b7b3',
      '#657782',
      '#b9a789',
      '#824f56',
      '#465c6c',
      '#a9b47b',
      '#ddd4bc',
      '#3b4c63',
    ];
    const skin = ['#b88661', '#d2ab89', '#795a46', '#9e7355'];
    // Local u runs along the row, local v points away from court.
    const section = (
      cx: number,
      cz: number,
      yaw: number,
      width: number,
      rows: number,
      tier = 0,
    ) => {
      this.sections++;
      const c = Math.cos(yaw),
        s = Math.sin(yaw);
      const pos = (u: number, y: number, v: number): XYZ => [
        cx + u * c + v * s,
        y,
        cz - u * s + v * c,
      ];
      for (let row = 0; row < rows; row++) {
        const v = row * 0.94,
          y = 0.25 + tier + row * 0.47;
        b(pos(0, y / 2, v), [width, y, 0.95], row % 2 ? '#46535e' : '#4c5963', yaw);
        for (let u = -width / 2 + 0.45; u < width / 2 - 0.2; u += 0.68) {
          seats.box(pos(u, y + 0.21, v), [0.5, 0.13, 0.48], palette.seat, yaw);
          seats.box(
            pos(u, y + 0.46, v + 0.23),
            [0.5, 0.45, 0.1],
            row < 2 ? '#3a5861' : palette.seat,
            yaw,
          );
          if (rng.next() < 0.13) continue;
          const group = rng.next() < 0.54 ? 0 : 1;
          const g = crowd[group],
            jitter = rng.range(-0.05, 0.05),
            h = rng.range(0.39, 0.56);
          g.box(
            pos(u + jitter, y + 0.32 + h / 2, v - 0.06),
            [0.34, h, 0.25],
            shirts[Math.floor(rng.next() * shirts.length)],
            yaw,
          );
          g.head(
            pos(u + jitter, y + 0.38 + h + 0.11, v - 0.07),
            [0.23, 0.27, 0.23],
            skin[Math.floor(rng.next() * skin.length)],
            2,
          );
          g.box(pos(u, y + 0.24, v - 0.28), [0.3, 0.17, 0.38], '#273846', yaw);
          this.crowdCount[group]++;
        }
      }
      // Stepped access aisle to the right, with contrasting nosings and handrails.
      for (let n = 0; n < rows * 2; n++) {
        const y = tier + 0.25 + n * 0.235;
        b(pos(width / 2 + 0.55, y / 2, n * 0.47 - 0.22), [0.95, y, 0.48], palette.concrete, yaw);
        b(
          pos(width / 2 + 0.55, y + 0.015, n * 0.47 - 0.43),
          [0.92, 0.025, 0.05],
          palette.tread,
          yaw,
        );
      }
      for (let n = 0; n < rows; n++)
        b(
          pos(width / 2 + 1.05, tier + 1.35 + n * 0.47, n * 0.94 + 0.4),
          [0.05, 0.05, 0.94],
          palette.edge,
          yaw,
        );
      for (let n = 0; n <= rows; n += 2)
        b(
          pos(width / 2 + 1.05, tier + 0.85 + n * 0.47, n * 0.94),
          [0.05, 1.1, 0.05],
          palette.edge,
          yaw,
        );
      b(
        pos(0, tier + rows * 0.47 + 0.7, rows * 0.94),
        [width + 1.7, 0.06, 0.06],
        palette.edge,
        yaw,
      );
      b(
        pos(0, tier + rows * 0.47 + 0.25, rows * 0.94),
        [width + 1.7, 0.85, 0.1],
        palette.structure,
        yaw,
      );
    };
    for (const side of [-1, 1]) {
      for (const z of [-14.4, -4.8, 4.8, 14.4]) {
        section(side * 12.25, z, (side * Math.PI) / 2, 7.9, 6);
        section(side * 19.3, z, (side * Math.PI) / 2, 7.9, 4, 3.7);
      }
      for (const x of [-7.4, 7.4]) section(x, side * 20.2, side < 0 ? Math.PI : 0, 8.4, 7);
      for (const x of [-1, 1]) section(x * 15.2, side * 20.5, Math.atan2(x, side), 5.1, 5);
    }
    // Courtside furniture stays outside the player envelope.
    for (const z of [-7, 7]) {
      b([8.8, 0.42, z], [1.1, 0.15, 2.7], palette.tread);
      b([9.25, 0.76, z], [0.12, 0.65, 2.7]);
      for (const dz of [-1, 1]) b([8.8, 0.2, z + dz], [0.85, 0.4, 0.15]);
      b([8.5, 0.32, z + 2.1], [0.72, 0.64, 0.75], '#37434c');
      b([8.5, 0.66, z + 2.1], [0.76, 0.06, 0.79], palette.red);
      b([8.4, 0.43, z - 2.1], [0.4, 0.86, 0.4], '#b6c394');
    }
    // Elevated umpire station and access ladder, left of the post.
    for (const x of [-7.5, -6.4])
      for (const z of [-0.45, 0.45]) b([x, 1.0, z], [0.09, 2, 0.09], palette.edge);
    b([-6.95, 2.05, 0], [1.3, 0.15, 1.1]);
    b([-7.25, 2.48, 0], [0.18, 0.75, 0.8], palette.red);
    b([-6.95, 2.22, 0], [0.65, 0.16, 0.7], palette.red);
    b([-6.6, 2.75, 0], [0.55, 0.08, 0.8], palette.edge);
    for (let n = 0; n < 7; n++) b([-7.65, 0.22 + n * 0.28, 0.1], [0.35, 0.05, 0.65], palette.tread);
    for (const x of [-3.7, 3.7]) b([x, 3.5, -23.65], [0.18, 7, 0.18], palette.edge);
    this.bake('Architecture and courtside equipment', arch);
    this.bake('Baked seating', seats);
    this.crowdGroups.push(this.bake('Crowd · primary scattered occupancy', crowd[0]));
    this.fullCrowd = this.bake('Crowd · additional scattered occupancy', crowd[1]);
    this.crowdGroups.push(this.fullCrowd);
    this.setQuality(this.quality);
    this.buildSigns();
    this.boardCanvas.width = 1024;
    this.boardCanvas.height = 512;
    this.boardTexture = this.texture(this.boardCanvas);
    // Main end-board plus smaller side repeater share the same live texture.
    const boardMaterial = this.screenMaterial(this.boardTexture);
    this.panel('Live match scoreboard', [0, 5.3, -23.5], [7.2, 3.6, 1], 0, boardMaterial);
    this.panel('Live score repeater', [-23.1, 7.4, -4.8], [4.8, 2.4, 1], 90, boardMaterial);
    timing.status = 'ready';
    timing.durationMs = performance.now() - timing.startMs;
    this.status = 'ready';
  }
  private bake(name: string, g: Geometry) {
    const mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(g.positions);
    mesh.setNormals(g.normals);
    mesh.setColors(g.colors);
    mesh.setIndices(g.indices);
    mesh.update();
    const m = new pc.StandardMaterial();
    m.diffuse.set(1, 1, 1);
    m.diffuseVertexColor = true;
    m.gloss = 4;
    m.update();
    const e = new pc.Entity(name);
    e.addComponent('render', {
      meshInstances: [new pc.MeshInstance(mesh, m)],
      castShadows: false,
      receiveShadows: false,
    });
    this.root.addChild(e);
    this.triangles += g.indices.length / 3;
    return e;
  }
  private texture(canvas: HTMLCanvasElement) {
    const t = new pc.Texture(this.app.graphicsDevice, {
      width: canvas.width,
      height: canvas.height,
      mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
      magFilter: pc.FILTER_LINEAR,
    });
    t.setSource(canvas);
    return t;
  }
  private screenMaterial(t: pc.Texture) {
    const m = new pc.StandardMaterial();
    m.useLighting = false;
    m.diffuse.set(0, 0, 0);
    m.emissive.set(1, 1, 1);
    m.emissiveMap = t;
    m.cull = pc.CULLFACE_NONE;
    m.update();
    return m;
  }
  private panel(
    name: string,
    p: XYZ,
    s: XYZ,
    yaw: number,
    material: pc.StandardMaterial,
    flat = false,
  ) {
    const e = new pc.Entity(name);
    e.addComponent('render', {
      type: 'plane',
      material,
      castShadows: false,
      receiveShadows: false,
    });
    e.setLocalPosition(...p);
    e.setLocalScale(s[0], 1, s[1]);
    e.setLocalEulerAngles(flat ? 0 : 90, yaw, 0);
    this.root.addChild(e);
    return e;
  }
  private buildSigns() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#15232e';
    ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#c1d674';
    ctx.beginPath();
    ctx.moveTo(37, 86);
    ctx.lineTo(24, 33);
    ctx.lineTo(55, 55);
    ctx.lineTo(76, 22);
    ctx.lineTo(97, 55);
    ctx.lineTo(128, 33);
    ctx.lineTo(115, 86);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(39, 93, 74, 6);
    ctx.font = '600 52px sans-serif';
    ctx.fillStyle = '#e3e9e6';
    ctx.fillText('CENTRE COURT', 170, 68);
    ctx.font = '19px sans-serif';
    ctx.fillStyle = '#91a7ad';
    ctx.fillText('C R O W N   P A V I L I O N     /     R O Y A L   R A L L Y', 173, 101);
    ctx.fillStyle = '#b6505a';
    ctx.fillRect(944, 25, 5, 78);
    const m = this.screenMaterial(this.texture(canvas));
    for (const side of [-1, 1]) {
      for (const x of [-9.5, 9.5])
        this.panel(
          'Centre Court end ribbon',
          [x, 0.57, side * 18.51],
          [12, 1.0, 1],
          side < 0 ? 0 : 180,
          m,
        );
      for (const z of [-11, 11])
        this.panel(
          'Centre Court side ribbon',
          [side * 10.44, 0.51, z],
          [9, 0.85, 1],
          side < 0 ? 90 : -90,
          m,
        );
      this.panel(
        'Entry portal identity',
        [0, 3.15, side * 21.55],
        [4.3, 0.54, 1],
        side < 0 ? 0 : 180,
        m,
      );
      this.panel(
        'Runoff wordmark',
        [0, 0.005, side * 15.3],
        [5, 0.625, 1],
        side < 0 ? 0 : 180,
        m,
        true,
      );
    }
  }
  setQuality(q: StadiumQuality) {
    this.quality = q;
    this.fullCrowd.enabled = q === 'full';
  }
  update(match: Match, dt: number) {
    this.clock += dt;
    if (match.totalPoints > this.lastPoints) this.reaction = match.bestRally >= 8 ? 2.2 : 1.3;
    if (match.totalPoints < this.lastPoints || match.phase === 'menu') this.reaction = 0;
    this.lastPoints = match.totalPoints;
    this.reaction = Math.max(0, this.reaction - dt);
    // Two baked groups move by millimetres at separate frequencies; no spectator updates.
    this.crowdGroups.forEach((g, i) =>
      g.setLocalPosition(
        0,
        this.quality === 'full' && this.reaction > 0
          ? Math.sin(this.clock * (8 + i * 1.7) + i) * 0.025 * Math.min(1, this.reaction)
          : 0,
        0,
      ),
    );
    const state = scoreboardState(match),
      key = JSON.stringify(state);
    if (key !== this.boardKey) {
      this.boardKey = key;
      this.boardState = state;
      this.boardUpdates++;
      const c = this.boardCanvas.getContext('2d')!;
      c.fillStyle = '#101d27';
      c.fillRect(0, 0, 1024, 512);
      c.fillStyle = '#bdd575';
      c.fillRect(0, 0, 1024, 8);
      c.font = '600 42px sans-serif';
      c.fillText('CENTRE COURT', 48, 78);
      c.font = '21px sans-serif';
      c.fillStyle = '#90a5ae';
      c.fillText('CROWN PAVILION  /  SINGLES', 48, 116);
      c.fillText('SETS     GAMES     PTS', 637, 161);
      state.rows.forEach((r, i) => {
        const y = 214 + i * 113;
        c.fillStyle = i === 0 ? '#1c3340' : '#192b38';
        c.fillRect(30, y - 33, 964, 92);
        c.fillStyle = state.server === i ? '#bdd575' : '#60757c';
        c.beginPath();
        c.arc(60, y + 5, 7, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#edf2ed';
        c.font = '600 34px sans-serif';
        c.fillText(r.name, 88, y + 18);
        c.font = '600 48px monospace';
        [r.sets, r.games, r.points].forEach((v, j) => c.fillText(String(v), 663 + j * 111, y + 21));
      });
      c.fillStyle = '#bdd575';
      c.font = '24px sans-serif';
      c.fillText(state.caption, 48, 462);
      c.fillStyle = '#b14e54';
      c.fillRect(956, 422, 12, 50);
      this.boardTexture.upload();
    }
    this.lastPhase = match.phase;
  }
  snapshot() {
    return {
      name: 'Crown Pavilion',
      status: this.status,
      quality: this.quality,
      sections: this.sections,
      spectatorCount: this.crowdCount[0] + (this.quality === 'full' ? this.crowdCount[1] : 0),
      fullCount: this.crowdCount.reduce((a, b) => a + b),
      triangles: this.triangles,
      collisionComponents: this.root.findComponents('collision').length,
      court: { ...COURT },
      runoff: STADIUM.runoff,
      scoreboard: this.boardState,
      boardUpdates: this.boardUpdates,
      reaction: this.reaction,
      phase: this.lastPhase,
    };
  }
}
export function scoreboardState(match: Match) {
  return {
    server: match.server,
    rows: [0, 1].map((i) => ({
      name: i === 0 ? 'KIRA' : 'OPPONENT',
      sets: match.score.sets[i],
      games: match.score.games[i],
      points: match.practice ? '—' : match.score.label(i as 0 | 1),
    })),
    caption:
      match.phase === 'menu'
        ? 'WELCOME TO CROWN PAVILION'
        : match.phase === 'result'
          ? match.score.winner === 0
            ? 'KIRA WINS'
            : 'OPPONENT WINS'
          : match.practice
            ? 'PRACTICE  /  ENDLESS RALLIES'
            : match.phase === 'rally'
              ? 'LIVE  /  RALLY IN PLAY'
              : match.phase === 'paused'
                ? 'PLAY PAUSED'
                : match.notice,
  };
}
