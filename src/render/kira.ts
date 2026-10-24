import * as pc from 'playcanvas';
import type { Match } from '../core/match';
import { KIRA, locomotionState, type AthleteState } from './athlete-config';

function load(app: pc.Application, path: string): Promise<pc.ContainerResource> {
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
  private contactPose: {
    id: number;
    state: string;
    time: number;
    transitioning: boolean;
    head: number[];
  } | null = null;
  private lastDistance = 0;
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
      this.model.anim!.assignAnimation(state, track, undefined, 1, state !== 'Swing');
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
    const carry = this.state !== 'Swing' || this.swingTime > KIRA.followThroughWristTime;
    const target = carry ? 1 : 0;
    this.wristWeight += (target - this.wristWeight) * (dt === 0 ? 1 : 1 - Math.exp(-dt * 30));
    this.wrist.slerp(pc.Quat.IDENTITY, this.carryWrist, this.wristWeight);
    this.hand.setLocalRotation(this.hand.getLocalRotation().clone().mul(this.wrist));
  }
  private head() {
    return this.racket.getWorldTransform().transformPoint(new pc.Vec3(...KIRA.sweetSpot));
  }
  update(match: Match, dt: number, charging: boolean) {
    if (this.status !== 'ready') return;
    const athlete = match.players[0];
    this.root.setPosition(athlete.position.x, 0, athlete.position.z);
    if (match.phase === 'paused' || match.phase === 'result') return;
    const speed = Math.max(0, athlete.distance - this.lastDistance) / Math.max(dt, 0.001);
    this.lastDistance = athlete.distance;
    const contact = athlete.contact;
    if (contact && contact.id !== this.lastContact) {
      this.lastContact = contact.id;
      this.state = 'Swing';
      this.layer.transition('Swing', 0);
      const contactTime = athlete.stroke === 'SERVE' ? KIRA.serveContactTime : KIRA.contactTime;
      this.swingTime = contactTime + contact.age * KIRA.swingSpeed;
      this.layer.activeStateCurrentTime = this.swingTime;
      this.model.anim!.update(0);
      this.clearWrist(0);
      this.inPlace();
      this.contactOffset
        .copy(this.head())
        .sub(new pc.Vec3(contact.position.x, contact.position.y, contact.position.z));
      this.contactAge = contact.age;
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
        this.transition(locomotionState(speed));
      }
      if (athlete.swing > this.lastSwing + 0.05 && (!contact || contact.age > 0.3)) {
        this.transition('Swing');
        this.swingTime = KIRA.windupTime;
        this.layer.activeStateCurrentTime = this.swingTime;
      }
      if (charging && (!contact || contact.age > 0.4)) {
        if (speed < 0.15) {
          this.transition('Swing');
          this.swingTime = KIRA.windupTime;
          this.layer.activeStateCurrentTime = this.swingTime;
          this.model.anim!.update(dt);
        } else {
          this.transition(locomotionState(speed));
          this.model.anim!.update(dt);
        }
      } else if (this.state === 'Swing') {
        this.swingTime += dt * KIRA.swingSpeed;
        this.model.anim!.update(dt * KIRA.swingSpeed);
        if (this.swingTime >= KIRA.followThroughEnd) this.transition(locomotionState(speed));
      } else {
        this.transition(locomotionState(speed));
        this.model.anim!.update(dt);
      }
      this.clearWrist(dt);
      this.inPlace();
    }
    this.lastSwing = athlete.swing;
  }
  ballOffset() {
    // Short presentation correction makes the unchanged ballistic shot originate
    // at the strings, rather than moving collision geometry or delaying input.
    const t = Math.max(0, 1 - this.contactAge / KIRA.visualContactSeconds);
    return this.contactOffset.clone().mulScalar(t * t);
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
      contactAge: this.contactAge,
    };
  }
}
