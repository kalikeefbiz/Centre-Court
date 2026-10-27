import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createReadStream, closeSync, openSync, readFileSync, readSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as pc from 'playcanvas';
import { AVAILABLE, ROSTER } from '../src/core/roster';
import { GRIP_PATCH_PATHS, validateGripPatch, type GripPatch } from '../src/render/grip-config';
import { AthleteGrip } from '../src/render/athlete-grip';

function header(path: string) {
  const fd = openSync(path, 'r');
  try {
    const prefix = Buffer.alloc(20);
    readSync(fd, prefix, 0, prefix.length, 0);
    expect(prefix.toString('ascii', 0, 4)).toBe('glTF');
    const json = Buffer.alloc(prefix.readUInt32LE(12));
    readSync(fd, json, 0, json.length, 20);
    return JSON.parse(json.toString('utf8'));
  } finally {
    closeSync(fd);
  }
}

async function sha256(path: string) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}

const patchFor = (id: Exclude<(typeof AVAILABLE)[number], 'jax'>) =>
  JSON.parse(readFileSync(`public/${GRIP_PATCH_PATHS[id]}`, 'utf8')) as GripPatch;

describe('GOAL 009 hand calibration provenance and bounded skin data', () => {
  for (const id of AVAILABLE)
    it(`${id} targets the actual production rig and only fitted hand bindings`, async () => {
      if (id === 'jax') throw new Error('Unavailable Jax must not enter the playable roster');
      const patch = patchFor(id);
      validateGripPatch(patch, id);
      const path = `public/${ROSTER[id].asset!}`;
      // Unit checks precede prebuild in CI. Nova is versioned losslessly as gzip,
      // so inspect that authoritative payload without depending on build output.
      const nova = id === 'nova'
        ? gunzipSync(readFileSync('assets/characters/nova/Nova_Fullres_Rigged.glb.gz'))
        : null;
      expect(nova ? createHash('sha256').update(nova).digest('hex') : await sha256(path))
        .toBe(patch.sourceSha256);
      const gltf = nova
        ? JSON.parse(nova.subarray(20, 20 + nova.readUInt32LE(12)).toString('utf8'))
        : header(path);
      const primitive = gltf.meshes[0].primitives[0];
      expect(patch.vertexCount).toBe(gltf.accessors[primitive.attributes.POSITION].count);
      const jointNames: string[] = gltf.skins[0].joints.map((index: number) => gltf.nodes[index].name);
      const uniqueVertices = new Set<number>();
      for (const row of patch.vertices) {
        expect(uniqueVertices.has(row[0])).toBe(false);
        uniqueVertices.add(row[0]);
        expect(row[0]).toBeGreaterThanOrEqual(0);
        expect(row[0]).toBeLessThan(patch.vertexCount);
        expect(row.slice(5).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 5);
        row.slice(1, 5).forEach((joint, index) => {
          expect(joint).toBeLessThan(jointNames.length);
          if (row[index + 5] > 0)
            expect(jointNames[joint]).toMatch(/^mixamorig:(?:Left|Right)(?:Hand.*|ForeArm)$/);
        });
      }
      for (const binding of patch.bindings) {
        expect(jointNames).toContain(binding.name);
        expect(binding.name).toMatch(/^mixamorig:(?:Left|Right)Hand/);
        const matrix = new pc.Mat4().set(binding.matrix);
        expect(Array.from(new pc.Mat4().copy(matrix).invert().data).every(Number.isFinite)).toBe(true);
        expect(binding.matrix[15]).toBeCloseTo(1, 6);
      }
      for (const row of patch.shoulderVertices ?? []) {
        expect(id).toBe('nova');
        expect(uniqueVertices.has(row[0])).toBe(false);
        uniqueVertices.add(row[0]);
        expect(row[0]).toBeGreaterThanOrEqual(0);
        expect(row[0]).toBeLessThan(patch.vertexCount);
        expect(row.slice(5).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 5);
        row.slice(1, 5).forEach((joint) => expect(joint).toBeLessThan(jointNames.length));
      }
      for (const bone of patch.bones) {
        expect(gltf.nodes.some((node: { name?: string }) => node.name === bone.name)).toBe(true);
        expect(Math.hypot(...bone.rotation)).toBeCloseTo(1, 6);
        expect(Math.hypot(...bone.restRotation)).toBeCloseTo(1, 6);
      }
      for (const digit of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'])
        expect(patch.bones.some((bone) => bone.name === `mixamorig:RightHand${digit}1`)).toBe(true);
      if (id === 'kira' || id === 'nova') expect(patch.vertices.length).toBeGreaterThan(0);
      else {
        expect(patch.vertices).toEqual([]);
        expect(patch.bindings.length).toBeGreaterThan(0);
        expect(patch.bindings.every((binding) => binding.name.includes('HandThumb'))).toBe(true);
      }
    // Hashing/inflating the unchanged full-detail source is bounded file I/O,
    // not a gameplay performance assertion. Slow cloud disks exceed Vitest's
    // default five seconds; all provenance/skin/transform assertions remain.
    }, 30000);

  it('rejects wrong-character, duplicate/out-of-range and unnormalized sparse rows before skin mutation', () => {
    const source = patchFor('kira');
    expect(() => validateGripPatch(source, 'nova')).toThrow();
    const mutations = [
      (patch: GripPatch) => patch.vertices.push([...patch.vertices[0]]),
      (patch: GripPatch) => (patch.vertices[0][0] = patch.vertexCount),
      (patch: GripPatch) => (patch.vertices[0][1] = -1),
      (patch: GripPatch) => (patch.vertices[0][5] = NaN),
      (patch: GripPatch) => (patch.vertices[0][5] = 2),
      (patch: GripPatch) => (patch.bindings[0].name = 'mixamorig:Spine'),
      (patch: GripPatch) => (patch.bones[0].name = 'mixamorig:Hips'),
    ];
    for (const mutate of mutations) {
      const patch = structuredClone(source);
      mutate(patch);
      expect(() => validateGripPatch(patch, 'kira')).toThrow();
    }
  });
});

describe('GOAL 009 hand frame preserves the actual socket transform', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects render components whose skin was torn down by disabling the athlete', async () => {
    vi.stubGlobal('document', { baseURI: 'https://centre-court.test/' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => patchFor('rico') })));
    const root = new pc.GraphNode('inactive skin fixture') as pc.Entity;
    (root as any).findComponents = () => [{ meshInstances: [{ skinInstance: null }] }];
    const hand = new pc.GraphNode('mixamorig:RightHand'); root.addChild(hand);
    const socket = new pc.GraphNode('racket socket') as pc.Entity; hand.addChild(socket);
    await expect(new AthleteGrip(root, 'rico', socket).ready).rejects.toThrow('skin must be active');
  });

  it('keeps grip and sweet spot fixed across wrist poses and repeated application', async () => {
    // This deliberately tests the real post-animation layer with GraphNodes,
    // not a WebGL skin or an artistic claim about finger/handle intersections.
    const patch = { ...patchFor('kira'), bones: [], bindings: [], vertices: [] };
    vi.stubGlobal('document', { baseURI: 'https://centre-court.test/' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => patch })));
    const root = new pc.GraphNode('test athlete') as pc.Entity;
    (root as any).findComponents = () => [];
    root.setLocalPosition(2, 1, -3);
    root.setLocalEulerAngles(12, -24, 7);
    const hand = new pc.GraphNode('mixamorig:RightHand');
    hand.setLocalPosition(0.4, 0.8, -0.1);
    const source = new pc.Quat().setFromEulerAngles(23, -41, 12);
    hand.setLocalRotation(source);
    root.addChild(hand);
    const socket = new pc.GraphNode('racket socket') as pc.Entity;
    const position = new pc.Vec3(0.01, 0.065, -0.02);
    const rotation = new pc.Quat().setFromEulerAngles(0, 0, 90);
    socket.setLocalPosition(position);
    socket.setLocalRotation(rotation);
    hand.addChild(socket);
    const localHead = new pc.Vec3(0, 0.4384, 0);
    const expectedHead = socket.getWorldTransform().transformPoint(localHead);
    const expectedGrip = socket.getPosition().clone();
    const grip = new AthleteGrip(root, 'kira', socket);
    await grip.ready;
    grip.apply('Forehand');
    expect(socket.getPosition().distance(expectedGrip)).toBeLessThan(0.000001);
    expect(socket.getWorldTransform().transformPoint(localHead).distance(expectedHead)).toBeLessThan(0.000001);
    const after = hand.getLocalRotation().clone();
    grip.apply('Forehand');
    grip.setSocket(socket);
    grip.apply('Forehand');
    expect(Math.abs(hand.getLocalRotation().dot(after))).toBeCloseTo(1, 10);
    expect(socket.getWorldTransform().transformPoint(localHead).distance(expectedHead)).toBeLessThan(0.000001);

    // A new animation-evaluated wrist pose must survive the layer, not be forced
    // to a shared wrist angle or accumulated a second time.
    hand.setLocalRotation(new pc.Quat().setFromEulerAngles(-31, 15, 53));
    const originalSocket = new pc.Mat4().setTRS(position, rotation, pc.Vec3.ONE);
    const nextHead = new pc.Mat4().mul2(hand.getWorldTransform(), originalSocket).transformPoint(localHead);
    grip.apply('Serve');
    expect(socket.getWorldTransform().transformPoint(localHead).distance(nextHead)).toBeLessThan(0.000001);
    expect(Math.abs(grip.snapshot().equipmentFrameError)).toBeLessThan(1e-10);
    expect(grip.snapshot().secondaryHandContact).toBe(false);
    grip.destroy();
  });

  it('restores the evaluated secondary-hand posture when the stroke or proximity no longer supports contact', async () => {
    const sourceRotation = new pc.Quat().setFromEulerAngles(2, 8, 4);
    const closedRotation = new pc.Quat().setFromEulerAngles(65, 15, 10);
    const original = patchFor('dante');
    const patch: GripPatch = {
      ...original,
      bindings: [],
      vertices: [],
      bones: [{
        ...original.bones.find((bone) => bone.name === 'mixamorig:LeftHandIndex1')!,
        position: [0, 0.03, 0],
        rotation: closedRotation.toArray() as [number, number, number, number],
        restRotation: sourceRotation.toArray() as [number, number, number, number],
      }],
    };
    vi.stubGlobal('document', { baseURI: 'https://centre-court.test/' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => patch })));
    const root = new pc.GraphNode('secondary-hand test') as pc.Entity;
    (root as any).findComponents = () => [];
    const right = new pc.GraphNode('mixamorig:RightHand');
    root.addChild(right);
    const socket = new pc.GraphNode('racket socket') as pc.Entity;
    socket.setLocalPosition(0, 0.065, 0);
    right.addChild(socket);
    const left = new pc.GraphNode('mixamorig:LeftHand');
    left.setLocalPosition(0, 0.065, 0);
    root.addChild(left);
    const finger = new pc.GraphNode('mixamorig:LeftHandIndex1');
    finger.setLocalPosition(0, 0.03, 0);
    finger.setLocalRotation(sourceRotation);
    left.addChild(finger);
    const grip = new AthleteGrip(root, 'dante', socket);
    await grip.ready;
    grip.apply('Backhand');
    expect(grip.snapshot().secondaryHandContact).toBe(true);
    expect(Math.abs(finger.getLocalRotation().dot(closedRotation))).toBeCloseTo(1, 10);
    grip.apply('Forehand');
    expect(grip.snapshot().secondaryHandContact).toBe(false);
    expect(Math.abs(finger.getLocalRotation().dot(sourceRotation))).toBeCloseTo(1, 10);
    grip.apply('Backhand');
    right.setLocalPosition(1, 0, 0); // Emulate CCD moving the racket away within the same evaluated frame.
    grip.apply('Backhand');
    expect(grip.snapshot().secondaryHandContact).toBe(false);
    expect(Math.abs(finger.getLocalRotation().dot(sourceRotation))).toBeCloseTo(1, 10);
    grip.destroy();
  });
});
