import * as pc from 'playcanvas';
import { selectStroke } from '../core/hitting';
import { ANIMATIONS } from './animation-registry';
import type { Match } from '../core/match';
import { KIRA, locomotionState, type AthleteState } from './athlete-config';

export function load(app: pc.Application, path: string): Promise<pc.ContainerResource> {
  return new Promise((resolve, reject) => {
    const url = new URL(import.meta.env.BASE_URL + path, document.baseURI);
    url.searchParams.set('v', __KIRA_ASSET_REVISION__);
    const timeout = window.setTimeout(() => reject(new Error(`Timed out loading ${path}`)), 30000);
    app.assets.loadFromUrlAndFilename(
      url.href,
      path.split('/').pop()!,
      'container',
      (error, asset) => {
        window.clearTimeout(timeout);
        if (error || !asset?.resource)
          reject(new Error(`${path}: ${String(error ?? 'empty asset')}`));
        else resolve(asset.resource as pc.ContainerResource);
      },
    );
  });
}

export class Kira {
  readonly root = new pc.Entity('Kira gameplay position');
  private model!: pc.Entity;
  private hips!: pc.GraphNode;
  private hand!: pc.GraphNode;
  private wristWeight = 1;
  private readonly carryWrist = new pc.Quat().setFromEulerAngles(...KIRA.carryWristRotation);
  private readonly wrist = new pc.Quat();
  private socket!: pc.Entity;
  private racket!: pc.Entity;
  private state: AthleteState = 'Idle';
  private lastContact = -1;
  private contactError = 0;
  private contactOrigin = new pc.Vec3();
  private contactPose: {
    id: number;
    state: string;
    time: number;
    transitioning: boolean;
    head: number[];
  } | null = null;
  private lastDistance = 0;
  private previous = { x: 0, z: 11 };
  private lastSwing = 0;
  private swingTime = 0;
  private contactOffset = new pc.Vec3();
  private contactAge = 1;
  status: 'loading' | 'ready' | 'error' = 'loading';
  private bodyMeshes: pc.MeshInstance[] = [];
  private racketMeshes: pc.MeshInstance[] = [];
  error = '';
  readonly ready: Promise<void>;
  private resources: pc.ContainerResource[] = [];
  constructor(private app: pc.Application) {
    app.root.addChild(this.root);
    this.root.setPosition(0, 0, 11);
    this.root.setEulerAngles(0, 180, 0);
    this.ready = this.initialize().catch((error: unknown) => {
      this.status = 'error';
      this.error = String(error);
      this.root.enabled = false;
      console.error('Kira could not be rendered. Match start is blocked.', error);
    });
  }
  private async initialize() {
    const [character, equipment] = await Promise.all([
      load(this.app, KIRA.characterUrl),
      load(this.app, KIRA.racketUrl),
    ]);
    this.resources = [character, equipment];
    const tracks = Object.entries(KIRA.clips).map(([state, name]) => {
      const track = character.animations.find((a) => a.resource?.name === name)?.resource;
      if (!(track instanceof pc.AnimTrack)) throw new Error(`Kira is missing ${name}`);
      return { state, track };
    });
    this.model = character.instantiateRenderEntity({ castShadows: false });
    this.root.addChild(this.model);
    this.hips = this.model.findByName(KIRA.hips)!;
    const hand = this.model.findByName(KIRA.hand);
    if (!hand || !this.hips) throw new Error('Kira skeleton is missing the hand or hips');
    this.hand = hand;
    this.socket = new pc.Entity('Right hand racket grip');
    hand.addChild(this.socket);
    this.socket.setLocalPosition(...KIRA.gripPosition);
    this.socket.setLocalEulerAngles(...KIRA.gripRotation);
    this.racket = equipment.instantiateRenderEntity({ castShadows: false });
    this.racket.name = 'Kira production racket';
    this.socket.addChild(this.racket);
    this.racket.setLocalScale(KIRA.racketScale, KIRA.racketScale, KIRA.racketScale);
    this.racket.setLocalPosition(...KIRA.racketPosition);
    this.model.addComponent('anim', { activate: true });
    for (const { state, track } of tracks)
      this.model.anim!.assignAnimation(
        state,
        track,
        undefined,
        1,
        ANIMATIONS[state as AthleteState].loop,
      );
    // Advance explicitly after fixed-step gameplay, so a contact seek is evaluated
    // in the same rendered frame and pause freezes the skeleton as well as the ball.
    this.model.anim!.playing = false;
    this.layer.transition('Idle', 0);
    this.model.anim!.update(0);
    this.clearWrist(0);
    this.inPlace();
    this.bodyMeshes = this.meshes(this.model).filter((m) => !this.meshes(this.racket).includes(m));
    this.racketMeshes = this.meshes(this.racket);
    if (
      !this.bodyMeshes.some((m) => m.skinInstance && (m.material as pc.StandardMaterial).diffuseMap)
    )
      throw new Error('Kira has no textured skinned mesh');
    if (!this.racketMeshes.length) throw new Error('Kira has no racket mesh');
    // A parsed container is not a rendered athlete. Gate play on a real camera
    // render of both meshes; no temporary human exists during loading or failure.
    await new Promise<void>((resolve, reject) => {
      const check = () => {
        if (
          !this.bodyMeshes.some((m) => m.visibleThisFrame) ||
          !this.racketMeshes.some((m) => m.visibleThisFrame)
        )
          return;
        window.clearTimeout(timeout);
        this.app.off('postrender', check);
        this.status = 'ready';
        resolve();
      };
      const timeout = window.setTimeout(() => {
        this.app.off('postrender', check);
        reject(new Error('Kira loaded but did not reach the rendering camera'));
      }, 15000);
      this.app.on('postrender', check);
    });
  }
  private meshes(entity: pc.Entity) {
    return (entity.findComponents('render') as pc.RenderComponent[]).flatMap(
      (r) => r.meshInstances,
    );
  }
  private get layer() {
    return this.model.anim!.baseLayer!;
  }
  private transition(state: AthleteState, blend = KIRA.blendTime) {
    if (state === this.state) return;
    this.state = state;
    this.layer.transition(state, blend);
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
    // Each joint can adjust at most 25 degrees from its evaluated source pose.
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
        Math.min(1, 0.4363 / angle) * weight,
      );
      joint.setRotation(bounded.mul(joint.getRotation().clone()));
    }
  }
  private head() {
    return this.racket.getWorldTransform().transformPoint(new pc.Vec3(...KIRA.sweetSpot));
  }
  update(match: Match, dt: number, charging: boolean, intent: 'drive' | 'slice' | 'lob' = 'drive') {
    if (this.status !== 'ready') return;
    const athlete = match.players[0];
    this.root.setPosition(athlete.position.x, 0, athlete.position.z);
    if (match.phase === 'paused' || match.phase === 'result') return;
    const dx = athlete.position.x - this.previous.x,
      dz = athlete.position.z - this.previous.z;
    this.previous = { ...athlete.position };
    const speed = Math.max(0, athlete.distance - this.lastDistance) / Math.max(dt, 0.001);
    this.lastDistance = athlete.distance;
    const moving = locomotionState(speed, dx, dz);
    const context = selectStroke({
      player: athlete.position,
      ball: match.ball.position,
      velocity: match.ball.velocity,
      side: 0,
      bounces: match.bounces,
      intent,
      serving: match.phase === 'serve' && match.server === 0,
    });
    const contact = athlete.contact;
    if (contact && contact.id !== this.lastContact) {
      this.lastContact = contact.id;
      // Render the contact's athlete and ball at the same fixed-step timestamp.
      // Following frames resume the live movement position; gameplay never waits.
      this.root.setPosition(contact.athletePosition.x, 0, contact.athletePosition.z);
      this.state = contact.stroke;
      const animation = ANIMATIONS[contact.stroke];
      this.layer.transition(this.state, 0);
      this.swingTime = animation.contact;
      this.layer.activeStateCurrentTime = this.swingTime;
      this.model.anim!.update(0.000001);
      this.clearWrist(0);
      this.inPlace();
      this.alignContact(new pc.Vec3(contact.position.x, contact.position.y, contact.position.z));
      this.contactError = this.head().distance(
        new pc.Vec3(contact.position.x, contact.position.y, contact.position.z),
      );
      this.contactOffset
        .copy(this.head())
        .sub(new pc.Vec3(contact.position.x, contact.position.y, contact.position.z));
      if (this.contactOffset.length() > KIRA.maxVisualCorrection)
        this.contactOffset.normalize().mulScalar(KIRA.maxVisualCorrection);
      this.contactAge = 0;
      this.contactOrigin.set(contact.position.x, contact.position.y, contact.position.z);
      this.contactPose = {
        id: contact.id,
        state: this.layer.activeState,
        time: this.layer.activeStateCurrentTime,
        transitioning: this.layer.transitioning,
        head: this.head().toArray(),
      };
    } else {
      this.contactAge += dt;
      if (!contact && this.lastContact !== -1) {
        this.lastContact = -1;
        this.contactAge = 1;
        this.contactPose = null;
        this.contactOffset.set(0, 0, 0);
        this.swingTime = 0;
        this.lastSwing = 0;
        this.transition(moving);
      }
      if (athlete.swing > this.lastSwing + 0.05 && (!contact || contact.age > 0.4)) {
        this.transition(context);
        this.swingTime = ANIMATIONS[context].prepare;
        this.layer.activeStateCurrentTime = this.swingTime;
      }
      if (charging && (!contact || contact.age > 0.4)) {
        // Lateral/full movement remains independent of stationary preparation.
        if (speed < 0.15) {
          this.transition(context);
          this.swingTime = ANIMATIONS[context].prepare;
          this.layer.activeStateCurrentTime = this.swingTime;
          this.model.anim!.update(0);
        } else {
          this.transition(moving);
          this.model.anim!.update(dt);
        }
      } else {
        const animation = ANIMATIONS[this.state];
        if ('contact' in animation) {
          this.swingTime += dt * KIRA.swingSpeed;
          this.model.anim!.update(dt * KIRA.swingSpeed);
          if (this.swingTime >= animation.end) this.transition(moving);
        } else {
          this.transition(moving);
          this.model.anim!.update(dt);
        }
      }
      this.clearWrist(dt);
      this.inPlace();
      if (contact && contact.age < 0.12)
        this.alignContact(
          new pc.Vec3(contact.position.x, contact.position.y, contact.position.z),
          Math.max(0, 1 - contact.age / 0.12),
        );
    }
    this.lastSwing = athlete.swing;
  }
  ballOffset(position: { x: number; y: number; z: number }) {
    // Short presentation correction makes the unchanged ballistic shot originate
    // at the strings, rather than moving collision geometry or delaying input.
    const t = Math.max(0, 1 - this.contactAge / KIRA.visualContactSeconds);
    return this.contactOrigin
      .clone()
      .add(this.contactOffset)
      .sub(new pc.Vec3(position.x, position.y, position.z))
      .mulScalar(t * t);
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
    };
    if (this.status !== 'ready') return { status: this.status, error: this.error, ...visibility };
    return {
      status: this.status,
      ...visibility,
      state: this.state,
      time: this.layer.activeStateCurrentTime,
      transitioning: this.layer.transitioning,
      clips: this.resources[0].animations.map((a) => ({
        name: a.resource?.name,
        duration: a.resource?.duration,
      })),
      textures: this.resources.reduce((n, r) => n + r.textures.length, 0),
      hand: this.socket.parent?.name,
      racketAttached: this.racket.parent === this.socket,
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
    };
  }
}
