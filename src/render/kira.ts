import * as pc from 'playcanvas';
import { selectStroke } from '../core/hitting';
import {
  tennisGraph,
  shuffleCycle,
  readyIdle,
  SHUFFLE_CYCLES,
  BLEND_CHANNELS,
  movementWeights,
} from './tennis-animation';
import { clamp } from '../core/court';
import { ANIMATIONS } from './animation-registry';
import { ROSTER, type CharacterId } from '../core/roster';
import type { Side } from '../core/court';
import type { Match } from '../core/match';
import { KIRA, ATHLETE_RENDER, locomotionState, type AthleteState } from './athlete-config';
import { DEFAULT_RACKET_ID, getRacket, isRacketId, racketAttachment } from './racket-equipment';
import { AthleteGrip } from './athlete-grip';

import { sharedAssets } from '../app/assets';
export function load(app: pc.Application, path: string) {
  return sharedAssets(app).acquire(path);
}

export class AthleteRenderer {
  readonly root = new pc.Entity('Kira gameplay position');
  private model!: pc.Entity;
  private hips!: pc.GraphNode;
  private hand!: pc.GraphNode;
  private wristWeight = 1;
  private readonly carryWrist = new pc.Quat();
  private readonly wrist = new pc.Quat();
  private socket!: pc.Entity;
  private racket!: pc.Entity;
  private state: AthleteState = 'Idle';
  private lastContact = -1;
  private contactError = 0;
  private contactPose: {
    id: number;
    state: string;
    time: number;
    transitioning: boolean;
    head: number[];
  } | null = null;
  private actionId = -1;
  private movementBlend = [1, 0, 0, 0, 0, 0, 0];
  private yaw = 180;
  private groundOffset = 0;
  private upperState: AthleteState = 'Serve';
  private fullBodyState: AthleteState = 'Serve';
  private upperMask: Record<string, { children: boolean }> = {};
  private headTarget = new pc.Vec3();
  private observedContactQuality = 0;
  private contactAge = 1;
  status: 'loading' | 'ready' | 'error' = 'loading';
  private bodyMeshes: pc.MeshInstance[] = [];
  private racketMeshes: pc.MeshInstance[] = [];
  error = '';
  readonly ready: Promise<void>;
  private resources: pc.ContainerResource[] = [];
  private equipmentId: string;
  private equipmentGeneration = 0;
  private equipmentChanges = 0;
  private grip?: AthleteGrip;
  private get config() {
    return ATHLETE_RENDER[this.character === 'jax' ? 'kira' : this.character];
  }
  evaluationMs = 0;
  private disposed = false;
  private cancelVisibility?: () => void;
  constructor(
    private app: pc.Application,
    readonly character: CharacterId = 'kira',
    readonly side: Side = 0,
    equipment = DEFAULT_RACKET_ID,
  ) {
    this.equipmentId = getRacket(equipment).id;
    this.root.name = ROSTER[this.character].name + ' gameplay position';
    this.carryWrist.setFromEulerAngles(...this.config.carryWristRotation);
    app.root.addChild(this.root);
    this.root.setPosition(0, 0, this.side === 0 ? 11 : -11);
    this.root.setEulerAngles(0, this.side === 0 ? 180 : 0, 0);
    this.ready = this.initialize().catch((error: unknown) => {
      if (this.disposed) return;
      this.status = 'error';
      this.error = String(error);
      this.root.children.slice().forEach((child) => (child as pc.Entity).destroy());
      this.grip?.destroy();
      this.release();
      this.root.enabled = false;
      console.error(
        `${ROSTER[this.character].name} could not be rendered. Match start is blocked.`,
        error,
      );
    });
  }
  private async initialize() {
    const acquired = await Promise.allSettled([
      load(this.app, ROSTER[this.character].asset!),
      load(this.app, getRacket(this.equipmentId).assetPath),
    ]);
    this.resources = acquired.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    const failed = acquired.find((r) => r.status === 'rejected');
    if (failed?.status === 'rejected') {
      this.release();
      throw failed.reason;
    }
    const [character, equipment] = this.resources;
    if (this.disposed) {
      this.release();
      return;
    }
    const tracks = Object.entries(this.config.clips).map(([state, name]) => {
      const track = character.animations.find((a) => a.resource?.name === name)?.resource;
      if (!(track instanceof pc.AnimTrack)) throw new Error(`Kira is missing ${name}`);
      return { state, track };
    });
    this.model = character.instantiateRenderEntity({ castShadows: false });
    this.root.addChild(this.model);
    // Disabling this entity tears down PlayCanvas SkinInstances. Keep its
    // skeleton alive while calibration loads; hide only the render meshes.
    this.meshes(this.model).forEach((mesh) => {
      mesh.visible = false;
    });
    this.hips = this.model.findByName(this.config.hips)!;
    const hand = this.model.findByName(this.config.hand);
    if (!hand || !this.hips) throw new Error('Kira skeleton is missing the hand or hips');
    this.hand = hand;
    this.socket = new pc.Entity('Right hand racket grip');
    hand.addChild(this.socket);
    this.socket.setLocalPosition(...this.config.gripPosition);
    this.socket.setLocalEulerAngles(...this.config.gripRotation);
    this.racket = equipment.instantiateRenderEntity({ castShadows: false });
    this.meshes(this.racket).forEach((mesh) => {
      mesh.visible = false;
    });
    this.racket.name = getRacket(this.equipmentId).name + ' production racket';
    this.socket.addChild(this.racket);
    this.fitEquipment(this.racket, this.equipmentId);
    this.grip = new AthleteGrip(this.model, this.character, this.socket);
    await this.grip.ready;
    if (this.disposed) return;
    this.model.addComponent('anim', { activate: true });
    const spine = this.model.findByName('mixamorig:Spine')!;
    const path: string[] = [];
    for (let node: pc.GraphNode | null = spine; node && node !== this.model; node = node.parent)
      path.unshift(node.name);
    path.unshift(this.model.name);
    this.upperMask[path.join('/')] = { children: true };
    this.model.anim!.loadStateGraph(
      tennisGraph(
        Object.entries(ANIMATIONS).map(([name, a]) => ({ name, loop: a.loop })),
        this.upperMask,
      ),
    );
    for (const { state, track } of tracks) {
      this.model.anim!.assignAnimation(
        state,
        track,
        'Base',
        1,
        ANIMATIONS[state as AthleteState].loop,
      );
      if ('contact' in ANIMATIONS[state as AthleteState])
        this.model.anim!.assignAnimation(state, track, 'Stroke', 0, false);
      if (state === 'Serve' || state === 'ForehandVolley')
        this.model.anim!.assignAnimation(state, track, 'FullBody', 0, false);
    }
    const named = Object.fromEntries(tracks.map((t) => [t.state, t.track]));
    const left = shuffleCycle(named.ShuffleLeft, ...SHUFFLE_CYCLES.ShuffleLeft);
    const right = shuffleCycle(named.ShuffleRight, ...SHUFFLE_CYCLES.ShuffleRight);
    for (const [name, track] of [
      ['Idle', readyIdle(named.Idle), 1],
      ['Walk', named.Walk, named.Walk.duration / 0.6],
      ['Run', named.Run, named.Run.duration / 0.6],
      ['Left', left, left.duration / 0.6],
      ['Right', right, right.duration / 0.6],
      ['Backward', named.Walk, -named.Walk.duration / 0.6],
      ['BackwardRun', named.Run, -named.Run.duration / 0.6],
    ] as const)
      this.model.anim!.assignAnimation('Locomotion.' + name, track, 'Base', 1, true);
    // Set once through the public API as well as graph data: PlayCanvas's
    // layer.mask getter otherwise stays null even when its binder is masked.
    this.model.anim!.findAnimationLayer('Stroke')!.mask = this.upperMask;
    this.model.anim!.playing = false;
    this.layer.transition('Locomotion', 0);
    this.model.anim!.update(0.00001);
    this.clearWrist(0);
    this.inPlace();
    this.grip.apply('Idle');
    this.meshes(this.model).forEach((mesh) => {
      mesh.visible = true;
    });
    this.bodyMeshes = this.meshes(this.model).filter((m) => !this.meshes(this.racket).includes(m));
    this.racketMeshes = this.meshes(this.racket);
    for (const texture of character.textures) {
      const map = texture.resource as pc.Texture;
      map.anisotropy = Math.min(4, this.app.graphicsDevice.maxAnisotropy);
    }
    if (
      !this.bodyMeshes.some((m) => m.skinInstance && (m.material as pc.StandardMaterial).diffuseMap)
    )
      throw new Error('Kira has no textured skinned mesh');
    if (!this.racketMeshes.length) throw new Error('Kira has no racket mesh');
    // A parsed container is not a rendered athlete. Gate play on a real camera
    // render of both meshes; no temporary human exists during loading or failure.
    if (this.side === 1) {
      this.status = 'ready';
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timeout);
        this.app.off('postrender', check);
        this.cancelVisibility = undefined;
      };
      this.cancelVisibility = () => {
        cleanup();
        resolve();
      };
      const check = () => {
        if (this.disposed) {
          cleanup();
          resolve();
          return;
        }
        if (
          !this.bodyMeshes.some((m) => m.visibleThisFrame) ||
          !this.racketMeshes.some((m) => m.visibleThisFrame)
        )
          return;
        cleanup();
        this.status = 'ready';
        resolve();
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Kira loaded but did not reach the rendering camera'));
        // Full-detail textures and the first skinned-material shaders can finish
        // after parsing on a cold browser. Keep the actual-visibility gate, with
        // a bounded warm-up rather than rejecting a still-initializing renderer.
      }, 60000);
      this.app.on('postrender', check);
    });
  }
  private release() {
    for (const resource of this.resources) this.releaseResource(resource);
    this.resources = [];
  }
  private fitEquipment(entity: pc.Entity, id: string) {
    const definition = getRacket(id);
    const fit = racketAttachment(definition, this.character);
    entity.setLocalPosition(...fit.position);
    entity.setLocalRotation(new pc.Quat(...fit.rotation));
    entity.setLocalScale(fit.scale, fit.scale, fit.scale);
    // Corrections belong to the hand's socket; they never reach Match's contact
    // envelope, source stroke data, ball solver or timing windows.
    const correction = fit.socketCorrection;
    this.socket.setLocalPosition(
      this.config.gripPosition[0] + (correction?.position?.[0] ?? 0),
      this.config.gripPosition[1] + (correction?.position?.[1] ?? 0),
      this.config.gripPosition[2] + (correction?.position?.[2] ?? 0),
    );
    const rotation = new pc.Quat().setFromEulerAngles(...this.config.gripRotation);
    if (correction?.rotation) rotation.mul(new pc.Quat(...correction.rotation));
    this.socket.setLocalRotation(rotation);
    this.grip?.setSocket(this.socket);
  }
  /** Replace only the independent equipment entity. Character, skin and native
   * animation instances remain alive. A saved/default re-equip is a true no-op.
   */
  async setEquipment(id: string) {
    if (!isRacketId(id)) throw new Error('This racket is not available.');
    await this.ready;
    if (this.disposed) return; // Superseded roster loads are cancellation, not page errors.
    if (this.status !== 'ready') throw new Error('Athlete is not ready.');
    const generation = ++this.equipmentGeneration;
    if (id === this.equipmentId) return;
    const equipment = await load(this.app, getRacket(id).assetPath);
    const release = () => this.releaseResource(equipment);
    if (this.disposed || generation !== this.equipmentGeneration) {
      release();
      return;
    }
    let entity: pc.Entity | undefined;
    let meshes: pc.MeshInstance[];
    try {
      entity = equipment.instantiateRenderEntity({ castShadows: false });
      entity.name = getRacket(id).name + ' production racket';
      meshes = this.meshes(entity);
      if (!meshes.length) throw new Error('Racket contains no renderable geometry.');
      this.fitEquipment(entity, id);
      this.socket.addChild(entity);
    } catch (error) {
      entity?.destroy();
      release();
      throw error;
    }
    const oldResource = this.resources[1];
    this.racket.destroy();
    this.racket = entity;
    this.racketMeshes = meshes;
    this.resources[1] = equipment;
    this.equipmentId = id;
    this.equipmentChanges++;
    if (oldResource) this.releaseResource(oldResource);
  }
  private releaseResource(resource: pc.ContainerResource) {
    sharedAssets(this.app).release(resource);
  }
  destroy() {
    this.disposed = true;
    this.cancelVisibility?.();
    this.equipmentGeneration++;
    this.grip?.destroy();
    this.root.destroy();
    this.release();
  }
  private meshes(entity: pc.Entity) {
    return (entity.findComponents('render') as pc.RenderComponent[]).flatMap(
      (r) => r.meshInstances,
    );
  }
  private get layer() {
    return this.model.anim!.baseLayer!;
  }
  private inPlace() {
    const p = this.hips.getLocalPosition();
    // Keep the source vertical body motion; cancel only horizontal root travel.
    this.model.setLocalPosition(-p.x, 0, -p.z);
  }
  private clearWrist(dt: number) {
    const carry = !('contact' in ANIMATIONS[this.state]);
    const target = carry ? 1 : 0;
    this.wristWeight += (target - this.wristWeight) * (dt === 0 ? 1 : 1 - Math.exp(-dt * 30));
    this.wrist.slerp(pc.Quat.IDENTITY, this.carryWrist, this.wristWeight);
    this.hand.setLocalRotation(this.hand.getLocalRotation().clone().mul(this.wrist));
  }
  private alignContact(target: pc.Vec3, weight = 1) {
    // Bounded arm-only CCD: keep gameplay feet fixed and preserve the source stroke.
    // Each joint can adjust at most 35 degrees from its evaluated source pose.
    for (const name of ['mixamorig:RightForeArm', 'mixamorig:RightArm']) {
      const joint = this.model.findByName(name)!;
      const origin = joint.getPosition();
      const from = this.head().sub(origin),
        to = target.clone().sub(origin);
      const angle = Math.acos(
        Math.max(-1, Math.min(1, from.clone().normalize().dot(to.clone().normalize()))),
      );
      if (angle < 0.001) continue;
      const delta = new pc.Quat().setFromDirections(from.normalize(), to.normalize());
      const bounded = new pc.Quat().slerp(
        pc.Quat.IDENTITY,
        delta,
        Math.min(1, 0.6109 / angle) * weight,
      );
      joint.setRotation(bounded.mul(joint.getRotation().clone()));
    }
  }
  private head() {
    return this.racket
      .getWorldTransform()
      .transformPoint(new pc.Vec3(...getRacket(this.equipmentId).sweetSpot));
  }
  equipmentFrame() {
    return {
      hand: this.hand?.getPosition().clone(),
      grip: this.socket?.getPosition().clone(),
      head: this.racket ? this.head() : undefined,
    };
  }
  materialDiagnostics() {
    return this.bodyMeshes.map(({ material }) => {
      const m = material as pc.StandardMaterial;
      const maps = [m.diffuseMap, m.normalMap, m.metalnessMap, m.glossMap]
        .filter((map, i, all) => !!map && all.indexOf(map) === i)
        .map((map) => ({
          width: map!.width,
          height: map!.height,
          mipmaps: map!.mipmaps,
          anisotropy: map!.anisotropy,
          minFilter: map!.minFilter,
          magFilter: map!.magFilter,
        }));
      return { name: m.name, useMetalness: m.useMetalness, metalness: m.metalness, maps };
    });
  }
  resetSession() {
    this.lastContact = -1;
    this.contactPose = null;
    this.actionId = -1;
    this.contactAge = 1;
    this.contactError = 0;
    this.yaw = 180;
    this.groundOffset = 0;
    this.movementBlend = [1, 0, 0, 0, 0, 0, 0];
    if (this.status !== 'ready') return;
    this.model.anim!.findAnimationLayer('Stroke')!.weight = 0;
    this.model.anim!.findAnimationLayer('FullBody')!.weight = 0;
    this.upperState = this.fullBodyState = 'Idle';
  }
  /** Cosmetic idle/inspection only: no Match, ball prediction or movement runtime. */
  updateMenu(dt: number, presenting = false) {
    if (this.status !== 'ready') return;
    this.root.setPosition(0, 0, 11);
    this.root.setEulerAngles(0, 180, 0);
    const anim = this.model.anim!;
    for (let i = 0; i < BLEND_CHANNELS.length; i++)
      anim.setFloat('weight' + BLEND_CHANNELS[i], i === 0 ? 1 : 0);
    if (this.layer.activeState !== 'Locomotion') this.layer.transition('Locomotion', 0.12);
    const upper = anim.findAnimationLayer('Stroke')!;
    const body = anim.findAnimationLayer('FullBody')!;
    upper.weight = 0;
    if (presenting) {
      if (this.fullBodyState !== 'ForehandVolley') body.transition('ForehandVolley', 0.055);
      this.fullBodyState = this.state = 'ForehandVolley';
      body.activeStateCurrentTime = ANIMATIONS.ForehandVolley.prepare;
    } else this.state = 'Idle';
    body.weight += ((presenting ? 1 : 0) - body.weight) * (1 - Math.exp(-dt * 35));
    if (!presenting && body.weight < 0.0001) body.weight = 0;
    const start = performance.now();
    anim.update(dt);
    this.evaluationMs = performance.now() - start;
    this.clearWrist(dt);
    this.inPlace();
    this.grip?.alignFrame();
    this.grip?.apply(this.state);
  }
  update(
    match: Match,
    dt: number,
    charging: boolean,
    intent: 'drive' | 'slice' | 'lob' = 'drive',
    presentationPose = false,
  ) {
    if (this.status !== 'ready') return;
    const athlete = match.players[this.side],
      m = athlete.locomotion,
      action = athlete.action;
    this.root.setPosition(athlete.position.x, 0, athlete.position.z);
    if (match.phase === 'paused' || match.phase === 'result') return;
    const serving = match.phase === 'serve' && match.server === this.side;
    // The supplied idle holds the hand beside bulky clothing on some athletes.
    // Reuse a verified volley pose for cosmetic inspection, without moving the
    // authoritative player or changing any match/animation contact timing.
    const presenting = presentationPose && match.phase === 'menu';
    const preparing = charging || serving || !!action || presenting;
    const sideSprint = movementWeights(m, this.movementBlend, preparing);
    for (let i = 0; i < BLEND_CHANNELS.length; i++)
      this.model.anim!.setFloat('weight' + BLEND_CHANNELS[i], clamp(this.movementBlend[i], 0, 1));
    if (this.layer.activeState !== 'Locomotion') this.layer.transition('Locomotion', 0.12);
    this.state = locomotionState(m.speed, m.velocity.x, m.velocity.z);
    const upper = this.model.anim!.findAnimationLayer('Stroke')!;
    const context = selectStroke({
      player: athlete.position,
      ball: match.ball.position,
      velocity: match.ball.velocity,
      side: this.side,
      bounces: match.bounces,
      intent,
      serving,
    });
    // Idle/locomotion belongs exclusively to Base. Only explicit charging,
    // serve setup, an authoritative action, or cosmetic inspection owns a shot.
    const stroke = action?.stroke ?? (presenting ? 'ForehandVolley' : preparing ? context : null);
    const fullBody = presenting || serving || action?.stroke === 'Serve';
    const body = this.model.anim!.findAnimationLayer('FullBody')!;
    const selected = fullBody ? body : upper;
    if (stroke) {
      const previous = fullBody ? this.fullBodyState : this.upperState;
      if (stroke !== previous || (action && action.id !== this.actionId)) {
        selected.transition(stroke, 0.055);
        if (fullBody) this.fullBodyState = stroke;
        else this.upperState = stroke;
      }
      this.actionId = action?.id ?? -1;
      selected.activeStateCurrentTime =
        action?.clipTime ??
        (presenting ? ANIMATIONS.ForehandVolley.prepare : serving ? 0 : ANIMATIONS[stroke].prepare);
      this.state = stroke;
    } else this.actionId = -1;
    const fade = action ? clamp((action.contactAt + 0.58 - action.age) / 0.18, 0, 1) : 1;
    for (const layer of [upper, body]) {
      const target = stroke && layer === selected ? fade : 0;
      layer.weight += (target - layer.weight) * (1 - Math.exp(-dt * (target ? 35 : 22)));
      // End recovery exactly: an invisible action must not retain influence or
      // a stale full-body mask. Both layer masks stay fixed for their lifetime.
      if (!target && layer.weight < 0.0001) layer.weight = 0;
    }
    const targetYaw =
      !preparing && m.speed > 0.2 && m.velocity.z <= 0.1 && sideSprint > 0
        ? 180 +
          ((((Math.atan2(m.velocity.x, m.velocity.z) * 180) / Math.PI - 180 + 540) % 360) - 180) *
            sideSprint
        : 180;
    const angle = ((targetYaw - this.yaw + 540) % 360) - 180;
    this.yaw += angle * (1 - Math.exp(-dt * (preparing ? 35 : m.braking || m.reversing ? 18 : 14)));
    this.root.setEulerAngles(0, this.yaw + (this.side === 1 ? -180 : 0), 0);
    // Stroke clips have speed zero and consume Match's marker time. The native
    // graph advances the cyclic base and layer blends in one evaluation pass.
    const w = this.movementBlend;
    const motionWeight = 1 - w[0];
    const nominal =
      motionWeight > 0.001
        ? (2 * w[1] + 6.3 * w[2] + 2.3 * (w[3] + w[4]) + 2 * w[5] + 4.6 * w[6]) / motionWeight
        : 1;
    const effort =
      (m.acceleration.x * m.velocity.x + m.acceleration.z * m.velocity.z) / Math.max(0.01, m.speed);
    const cadence = 1 + clamp(effort / 40, -0.12, 0.08);
    const playback = m.speed > 0.1 ? clamp((m.speed / nominal) * cadence, 0.3, 1.8) : 1;
    const evaluationStart = performance.now();
    this.model.anim!.update(dt * playback);
    this.evaluationMs = performance.now() - evaluationStart;
    this.clearWrist(dt);
    this.inPlace();
    // Install the paired hand frame/socket inverse before reading the racket
    // head for CCD, so arm correction observes the preserved physical path.
    this.grip?.alignFrame();
    // Keep the lowest planted foot near its calibrated sole height. Bounded whole-
    // model correction only: no IK, no changes to athlete collision/travel.
    const left = this.model.findByName('mixamorig:LeftFoot')!.getPosition().y;
    const right = this.model.findByName('mixamorig:RightFoot')!.getPosition().y;
    const correction = (1 - body.weight) * clamp(0.165 - Math.min(left, right), -0.055, 0.035);
    this.groundOffset += (correction - this.groundOffset) * (1 - Math.exp(-dt * 25));
    this.model.translateLocal(0, this.groundOffset, 0);
    if (action) {
      this.headTarget.set(action.racket.x, action.racket.y, action.racket.z);
      // Existing bounded arm correction now follows the physical swing path
      // throughout wind-up/contact, rather than snapping after launch.
      for (let i = 0; i < 2; i++) this.alignContact(this.headTarget, 1);
    }
    const contact = athlete.contact;
    if (!contact) {
      this.lastContact = -1;
      this.contactPose = null;
    }
    if (contact && contact.id !== this.lastContact) {
      this.lastContact = contact.id;
      this.contactError = this.head().distance(
        this.headTarget.set(contact.position.x, contact.position.y, contact.position.z),
      );
      this.observedContactQuality = contact.quality;
      this.contactPose = {
        id: contact.id,
        state: contact.stroke,
        time: action?.clipTime ?? ANIMATIONS[contact.stroke].contact,
        transitioning: selected.transitioning,
        head: this.head().toArray(),
      };
    }
    if (action)
      this.contactError = this.head().distance(
        this.headTarget.set(action.racket.x, action.racket.y, action.racket.z),
      );
    this.contactAge = contact?.age ?? 1;
    this.grip?.apply(this.state);
  }
  /** Reuse the production rig/registry; never run the match controller during this session. */
  beginInspection() {
    if (this.status !== 'ready') throw new Error('Kira is not ready');
    const upper = this.model.anim!.findAnimationLayer('Stroke')!;
    const body = this.model.anim!.findAnimationLayer('FullBody')!;
    const upperWeight = upper.weight;
    const bodyWeight = body.weight;
    upper.weight = 0;
    body.weight = 0;
    const savedState = this.layer.activeState;
    const savedTime = this.layer.activeStateCurrentTime;
    const nodes: pc.GraphNode[] = [];
    const visit = (node: pc.GraphNode) => {
      nodes.push(node);
      node.children.forEach(visit);
    };
    visit(this.root);
    const transforms = nodes.map((node) => ({
      node,
      p: node.getLocalPosition().clone(),
      q: node.getLocalRotation().clone(),
    }));
    let selected: AthleteState | undefined;
    this.root.setPosition(0, 0, 11);
    this.root.setEulerAngles(0, 180, 0);
    return {
      pose: (state: AthleteState, seconds: number, blend = 0) => {
        if (selected !== state) {
          this.layer.transition(state, blend);
          selected = state;
        }
        this.layer.activeStateCurrentTime = Math.max(
          0,
          Math.min(ANIMATIONS[state].duration - 0.00001, seconds),
        );
        this.model.anim!.update(0.000001);
        // Production carry orientation for locomotion, uncorrected source arm for shots.
        if (!('contact' in ANIMATIONS[state]))
          this.hand.setLocalRotation(this.hand.getLocalRotation().clone().mul(this.carryWrist));
        this.inPlace();
        this.grip?.apply(state);
      },
      markers: () => ({
        animationState: this.layer.activeState,
        animationTime: this.layer.activeStateCurrentTime,
        root: this.root.getPosition().toArray(),
        grip: this.socket.getPosition().toArray(),
        head: this.head().toArray(),
        leftHand: this.model.findByName('mixamorig:LeftHand')?.getPosition().toArray(),
        palm: this.model
          .findByName('mixamorig:LeftHand')
          ?.getWorldTransform()
          .transformPoint(new pc.Vec3(0, 0.04, 0.035))
          .toArray(),
        leftFoot: this.model.findByName('mixamorig:LeftFoot')?.getPosition().toArray(),
        rightFoot: this.model.findByName('mixamorig:RightFoot')?.getPosition().toArray(),
      }),
      restore: () => {
        upper.weight = upperWeight;
        body.weight = bodyWeight;
        this.layer.transition(savedState, 0);
        this.layer.activeStateCurrentTime = savedTime;
        this.model.anim!.update(0.000001);
        transforms.forEach(({ node, p, q }) => {
          node.setLocalPosition(p);
          node.setLocalRotation(q);
        });
      },
    };
  }
  snapshot() {
    const visibility = {
      rootEnabled: this.root.enabled,
      bodyMeshCount: this.bodyMeshes.length,
      bodyVisible: this.bodyMeshes.some((m) => m.visibleThisFrame),
      racketVisible: this.racketMeshes.some((m) => m.visibleThisFrame),
      texturedSkin: this.bodyMeshes.some(
        (m) => !!m.skinInstance && !!(m.material as pc.StandardMaterial).diffuseMap,
      ),
      scale: this.root.getLocalScale().toArray(),
      bodyBounds: this.bodyMeshes.map((mesh) => ({
        centre: mesh.aabb.center.toArray(),
        halfExtents: mesh.aabb.halfExtents.toArray(),
      })),
    };
    if (this.status !== 'ready')
      return { character: this.character, status: this.status, error: this.error, ...visibility };
    return {
      status: this.status,
      character: this.character,
      ...visibility,
      state: this.state,
      upperMask: this.upperMask,
      time: this.layer.activeStateCurrentTime,
      transitioning: this.layer.transitioning,
      clips: this.resources[0].animations.map((a) => ({
        name: a.resource?.name,
        duration: a.resource?.duration,
      })),
      textures: this.resources.reduce((n, r) => n + r.textures.length, 0),
      hand: this.socket.parent?.name,
      racketAttached: this.racket.parent === this.socket,
      equipment: {
        id: this.equipmentId,
        assetPath: getRacket(this.equipmentId).assetPath,
        changes: this.equipmentChanges,
        animationInstance: this.model.getGuid(),
        ...racketAttachment(getRacket(this.equipmentId), this.character),
      },
      handGrip: this.grip?.snapshot(),
      grip: this.socket.getLocalPosition().toString(),
      racketHead: this.head().toArray(),
      hips: this.hips.getPosition().toArray(),
      root: this.root.getPosition().toArray(),
      contactPose: this.contactPose
        ? { ...this.contactPose, head: [...this.contactPose.head] }
        : null,
      contactId: this.lastContact,
      contactError: this.contactError,
      contactAge: this.contactAge,
      contactQuality: this.observedContactQuality,
      blendWeights: [...this.movementBlend],
      nativeState: this.layer.activeState,
      strokeTime: this.model.anim!.findAnimationLayer(
        this.state === 'Serve' ? 'FullBody' : 'Stroke',
      )!.activeStateCurrentTime,
      strokeState: this.model.anim!.findAnimationLayer('Stroke')!.activeState,
      fullBodyState: this.model.anim!.findAnimationLayer('FullBody')!.activeState,
      fullBodyLayerWeight: this.model.anim!.findAnimationLayer('FullBody')!.weight,
      strokeLayerWeight: this.model.anim!.findAnimationLayer('Stroke')!.weight,
      shuffleCycles: SHUFFLE_CYCLES,
      yaw: this.yaw,
      groundingOffset: this.groundOffset,
      leftFoot: this.model.findByName('mixamorig:LeftFoot')!.getPosition().toArray(),
      rightFoot: this.model.findByName('mixamorig:RightFoot')!.getPosition().toArray(),
    };
  }
}

// Compatibility name for the established inspector and diagnostics.
export { AthleteRenderer as Kira };
