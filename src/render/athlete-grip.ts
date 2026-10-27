import * as pc from 'playcanvas';
import type { CharacterId } from '../core/roster';
import type { AthleteState } from './animation-registry';
import { GRIP_PATCH_PATHS, validateGripPatch, type GripPatch } from './grip-config';
import { assetTimings, type AssetTiming } from '../dev/metrics';

const appliedBuffers = new WeakSet<pc.VertexBuffer>();
const requests = new Map<CharacterId, Promise<GripPatch>>();
function fetchPatch(character: CharacterId): Promise<GripPatch> {
  let request = requests.get(character);
  if (!request) {
    if (character === 'jax') throw new Error('Jax has no supplied hand rig');
    const url = new URL(import.meta.env.BASE_URL + GRIP_PATCH_PATHS[character], document.baseURI);
    // Small calibration updates get a fresh URL without invalidating the
    // unchanged, much larger character/racket container downloads.
    url.searchParams.set('v', __BUILD_ID__);
    const controller = new AbortController();
    const timing: AssetTiming = { path: GRIP_PATCH_PATHS[character], status: 'loading', startMs: performance.now() };
    assetTimings.push(timing);
    const timeout = globalThis.setTimeout(() => controller.abort(), 30000);
    request = fetch(url, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`Hand calibration failed: ${response.status}`);
      const patch = await response.json() as GripPatch;
      validateGripPatch(patch, character);
      Object.assign(timing, { status: 'ready', durationMs: performance.now() - timing.startMs });
      return patch;
    }).catch((error: unknown) => {
      Object.assign(timing, { status: 'error', durationMs: performance.now() - timing.startMs, error: String(error) });
      throw error;
    }).finally(() => globalThis.clearTimeout(timeout));
    requests.set(character, request);
    request.catch(() => requests.delete(character));
  }
  return request;
}

/** Small post-animation hand layer. Source wrist motion is retained; a calibrated
 * axial grip frame and its exact inverse on the racket socket cancel, preserving
 * the existing world-space equipment/sweet-spot trajectory and contact fairness.
 * This never writes Match, a ball, registry markers or sampled rig-motion data.
 */
export class AthleteGrip {
  readonly ready: Promise<void>;
  private patch?: GripPatch;
  private socket: pc.Entity;
  private hand: pc.GraphNode;
  private frame = new pc.Quat();
  private inverseFrame = new pc.Quat();
  private sourceHand = new pc.Quat();
  private posedHand = new pc.Quat();
  private baselineSocket = new pc.Quat();
  private baselinePosition = new pc.Vec3();
  private posedSocket = new pc.Quat();
  private posedPosition = new pc.Vec3();
  private initialized = false;
  private jointTargets: { node: pc.GraphNode; position: pc.Vec3; grip: pc.Quat; source: pc.Quat; wasPosed: boolean; right: boolean }[] = [];
  private patchedVertices = 0;
  private frameError = 0;
  private secondaryContact = false;
  private secondaryDistance = Infinity;
  private digitCount = 0;
  private disposed = false;
  constructor(private model: pc.Entity, readonly character: CharacterId, socket: pc.Entity) {
    this.socket = socket;
    const hand = model.findByName('mixamorig:RightHand');
    if (!hand) throw new Error('Right-hand joint is required for racket grip');
    this.hand = hand;
    this.ready = fetchPatch(character).then((patch) => {
      if (this.disposed) return;
      this.patch = patch;
      this.frame.set(...patch.handFrame);
      this.inverseFrame.copy(this.frame).invert();
      this.prepareSkin(patch);
      this.jointTargets = patch.bones.map((bone) => {
        const node = model.findByName(bone.name);
        if (!node) throw new Error(`Missing calibrated finger joint ${bone.name}`);
        return { node, position: new pc.Vec3(...bone.position), grip: new pc.Quat(...bone.rotation), source: node.getLocalRotation().clone(), wasPosed: false, right: bone.name.includes('RightHand') };
      });
      this.digitCount = this.jointTargets.filter(({ right, node }) => right && /Hand(?:Thumb|Index|Middle|Ring|Pinky)1$/.test(node.name)).length;
      this.initialized = true;
      this.setSocket(socket);
    });
  }
  private prepareSkin(patch: GripPatch) {
    const components = this.model.findComponents('render') as pc.RenderComponent[];
    for (const instance of components.flatMap((component) => component.meshInstances)) {
      if (!instance.skinInstance) continue;
      const mesh = instance.mesh;
      if (!mesh) throw new Error('Athlete skin is missing its render mesh');
      const buffer = mesh.vertexBuffer;
      if (buffer.numVertices !== patch.vertexCount) throw new Error('Hand patch vertex layout differs from supplied mesh');
      const sourceSkin = instance.skinInstance.skin;
      const rows = [...patch.vertices, ...(patch.shoulderVertices ?? [])];
      if (rows.some((row) => row.slice(1, 5).some((j) => j >= sourceSkin.boneNames.length)))
        throw new Error('Hand patch joint index exceeds the supplied skin');
      for (const binding of patch.bindings)
        if (!sourceSkin.boneNames.includes(binding.name)) throw new Error(`Missing hand skin binding ${binding.name}`);
      if (!appliedBuffers.has(buffer)) {
        const iterator = new pc.VertexIterator(buffer);
        const indices = iterator.element[pc.SEMANTIC_BLENDINDICES];
        const weights = iterator.element[pc.SEMANTIC_BLENDWEIGHT];
        if (!indices || !weights) throw new Error('Athlete has no skinned vertex influences');
        for (const row of rows) {
          indices.setFromArray(row[0] * indices.stride, row, 1);
          weights.setFromArray(row[0] * weights.stride, row, 5);
        }
        iterator.end();
        appliedBuffers.add(buffer);
      }
      // Skin instances are per athlete, but the loaded Skin may be shared by
      // same-character player/opponent. Clone only binding metadata; no geometry
      // or texture duplication and no double-applied matrix transforms.
      const skin = sourceSkin;
      const corrected = new pc.Skin(skin.device, skin.inverseBindPose.map((m) => m.clone()), [...skin.boneNames]);
      for (const binding of patch.bindings) {
        const index = corrected.boneNames.indexOf(binding.name);
        if (index < 0) throw new Error(`Missing hand skin binding ${binding.name}`);
        corrected.inverseBindPose[index].set(binding.matrix);
      }
      instance.skinInstance.skin = corrected;
    }
    this.patchedVertices = patch.vertices.length;
  }
  /** Call after equipment.fit has installed its fresh uncorrected socket pose. */
  setSocket(socket: pc.Entity) {
    this.socket = socket;
    if (!this.initialized) return;
    if (socket.getLocalRotation().equals(this.posedSocket) && socket.getLocalPosition().equals(this.posedPosition)) return;
    this.baselineSocket.copy(socket.getLocalRotation());
    this.baselinePosition.copy(socket.getLocalPosition());
    this.posedSocket.mul2(this.inverseFrame, this.baselineSocket);
    this.inverseFrame.transformVector(this.baselinePosition, this.posedPosition);
    socket.setLocalRotation(this.posedSocket);
    socket.setLocalPosition(this.posedPosition);
    const restored = new pc.Quat().mul2(this.frame, this.posedSocket);
    this.frameError = 1 - Math.abs(restored.dot(this.baselineSocket));
  }
  /** Establish the racket-preserving hand frame before contact CCD. Finger and
   * secondary-hand posing must run once after CCD has finalized the socket. */
  alignFrame() {
    if (!this.initialized) return;
    const evaluated = this.hand.getLocalRotation();
    // Idempotence protects developer inspections that sample an unchanged pose.
    if (!evaluated.equals(this.posedHand)) this.sourceHand.copy(evaluated);
    this.posedHand.mul2(this.sourceHand, this.frame);
    this.hand.setLocalRotation(this.posedHand);
  }
  apply(state: AthleteState) {
    if (!this.initialized) return;
    this.alignFrame();
    const left = this.model.findByName('mixamorig:LeftHand');
    this.secondaryDistance = left ? left.getPosition().distance(this.socket.getPosition()) : Infinity;
    this.secondaryContact = (state === 'Backhand' || state === 'BackhandVolley') && this.secondaryDistance < .13;
    for (const target of this.jointTargets) {
      const evaluated = target.node.getLocalRotation();
      if (!target.wasPosed || !evaluated.equals(target.grip)) target.source.copy(evaluated);
      target.node.setLocalPosition(target.position);
      // Preserve the non-dominant hand's source posture except while the
      // existing two-hand stroke actually brings it close to the handle.
      target.wasPosed = target.right || this.secondaryContact;
      target.node.setLocalRotation(target.wasPosed ? target.grip : target.source);
    }
  }
  snapshot() {
    return {
      ready: this.initialized,
      correctedVertices: this.patchedVertices,
      correctedShoulderVertices: this.patch?.shoulderVertices?.length ?? 0,
      fingerJoints: this.jointTargets.filter((j) => j.right).length,
      digits: this.digitCount,
      handFrame: this.frame.toArray(),
      socketCompensation: this.inverseFrame.toArray(),
      equipmentFrameError: this.frameError,
      sourceSha256: this.patch?.sourceSha256,
      bindFit: this.patch?.fit,
      secondaryHandContact: this.secondaryContact,
      secondaryHandDistance: Number.isFinite(this.secondaryDistance) ? this.secondaryDistance : null,
    };
  }
  destroy() { this.disposed = true; }
}
