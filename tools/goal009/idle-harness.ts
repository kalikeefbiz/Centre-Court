// Test-only native renderer harness. Vite serves this in source mode; it is not
// an application entry or part of the production bundle.
import * as pc from 'playcanvas';
import { AthleteRenderer } from '../../src/render/kira';
import { Match } from '../../src/core/match';
import { createStroke, advanceStroke } from '../../src/core/stroke';
import { createLocomotion } from '../../src/core/locomotion';
import { vec } from '../../src/core/court';
const app = new pc.Application(document.querySelector('canvas')!, {
  graphicsDeviceOptions: { preserveDrawingBuffer: true, antialias: true },
});
app.scene.ambientLight = new pc.Color(0.65, 0.65, 0.65);
const camera = new pc.Entity();
camera.addComponent('camera', { clearColor: new pc.Color(0.08, 0.14, 0.18), fov: 38 });
app.root.addChild(camera);
const light = new pc.Entity();
light.addComponent('light', { type: 'directional', intensity: 1.2 });
light.setEulerAngles(40, 30, 0);
app.root.addChild(light);
app.start();
app.autoRender = false;
let renderer: AthleteRenderer;
let match: Match;
let transitions: string[] = [];
let actionId = 0;
const api = {
  async load(character: any, side: any = 0) {
    renderer?.destroy();
    match = new Match();
    renderer = new AthleteRenderer(app, character, side);
    // Initialization requires a visible render; no disabled rigs/skins.
    camera.setPosition(3, 1.9, (side ? -11 : 11) + 4);
    camera.lookAt(0, 1, side ? -11 : 11);
    app.autoRender = true;
    await renderer.ready;
    app.autoRender = false;
    if (renderer.status !== 'ready') throw new Error(renderer.error);
    transitions = [];
    for (const layer of (renderer as any).model.anim.layers) {
      const transition = layer.transition.bind(layer);
      layer.transition = (state: string, ...args: any[]) => {
        transitions.push(layer.name + ':' + state);
        return transition(state, ...args);
      };
    }
    return api.sample();
  },
  step(count = 1, dt = 1 / 60, charging = false, presenting = false) {
    for (let i = 0; i < count; i++) renderer.update(match, dt, charging, 'drive', presenting);
    return api.sample();
  },
  sample() {
    const model = (renderer as any).model as pc.Entity;
    const joints = [
      'Hips',
      'Spine',
      'RightArm',
      'RightForeArm',
      'RightHand',
      'RightHandIndex1',
      'LeftHand',
      'LeftFoot',
      'RightFoot',
    ];
    return {
      ...renderer.snapshot(),
      phase: match.phase,
      transitions: [...transitions],
      layers: model.anim!.layers.map((l) => ({
        name: l.name,
        state: l.activeState,
        time: l.activeStateCurrentTime,
        weight: l.weight,
        mask: l.mask,
        transitioning: l.transitioning,
      })),
      joints: Object.fromEntries(
        joints.map((n) => {
          const node = model.findByName('mixamorig:' + n)!;
          return [n, { p: node.getPosition().toArray(), q: node.getLocalRotation().toArray() }];
        }),
      ),
    };
  },
  phase(phase: any, server = renderer.side) {
    match.phase = phase;
    match.server = server as any;
  },
  movement(speed = 0) {
    const m = (match.players[renderer.side].locomotion = createLocomotion());
    m.speed = speed;
    m.velocity.x = speed;
  },
  action(stroke: any) {
    const p = match.players[renderer.side];
    p.action = createStroke(
      ++actionId,
      stroke,
      p.position,
      renderer.side,
      vec(p.position.x, 1, p.position.z - (renderer.side ? -1 : 1)),
      0.6,
      0,
      0,
      'drive',
    );
  },
  advance(count = 1, dt = 1 / 60) {
    const p = match.players[renderer.side];
    for (let i = 0; i < count; i++) {
      if (p.action) {
        advanceStroke(p.action, dt, p.position, renderer.side);
        if (p.action.age > p.action.contactAt + 0.59) p.action = null;
      }
      renderer.update(match, dt, false);
    }
    return api.sample();
  },
  reset() {
    match.start('normal', 'short');
  },
  menu() {
    match.menu();
  },
  pause() {
    match.pause();
  },
  resume() {
    match.resume();
  },
  withoutStroke() {
    const layer = (renderer as any).model.anim.findAnimationLayer('Stroke');
    const weight = layer.weight;
    layer.weight = 0;
    renderer.update(match, 0, false);
    const sample = api.sample();
    layer.weight = weight;
    renderer.update(match, 0, false);
    return sample;
  },
  clearAction() {
    match.players[renderer.side].action = null;
  },
  async equipment() {
    await renderer.setEquipment('pink-black');
    return api.sample();
  },
  // Controlled A/B only; never called by normal production rendering.
  ab(grip: boolean, forcedIdle: boolean) {
    const r = renderer as any;
    if (!grip) {
      r.grip.alignFrame = () => {};
      r.grip.apply = () => {};
    }
    if (!forcedIdle) {
      const layer = r.model.anim.findAnimationLayer('Stroke');
      Object.defineProperty(layer, 'weight', { get: () => 0, set: () => {} });
    }
  },
  render() {
    app.renderNextFrame = true;
  },
};
(window as any).idleHarness = api;
