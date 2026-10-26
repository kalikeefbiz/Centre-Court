"""Run: blender -b --factory-startup --python tools/kira-midres/transfer.py -- SOURCE.glb

No decimation, remeshing, pose resampling, bone renaming or animation retiming.
The native checkpoint includes the original actions and editable vertex groups.
"""
import sys
import json
import hashlib
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
from mathutils.geometry import barycentric_transform

sys.path.insert(0, str(Path(__file__).resolve().parent))
from glb import GLB, graft

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(sys.argv[sys.argv.index('--') + 1])
ORIGINAL = ROOT / 'public/assets/characters/kira/Meshy_AI_Pink_Valkyrie_All_Animations.glb'
OUTPUT = ROOT / 'public/assets/characters/kira/Kira_Midres_Rigged.glb'
WORK = ROOT / 'artifacts/kira-midres'
EVIDENCE = ROOT / 'public/verification/kira-midres'
WORK.mkdir(parents=True, exist_ok=True)
EVIDENCE.mkdir(parents=True, exist_ok=True)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == '3a714caab749e548de5d34d2fb2d32c64972aad08947eaee31ff990b99912035'
old, new = GLB(ORIGINAL), GLB(SOURCE)
op = old.json['meshes'][0]['primitives'][0]
np_ = new.json['meshes'][0]['primitives'][0]
opos = old.array(op['attributes']['POSITION'])
npos = new.array(np_['attributes']['POSITION'])
scale = float((opos[:, 1].max() - opos[:, 1].min()) / np.ptp(npos[:, 1]))
offset = float(opos[:, 1].min() - npos[:, 1].min() * scale)
npos *= scale
npos[:, 1] += offset

# Nearest triangle in the common glTF bind coordinate frame (Y up).
triangles = old.array(op['indices']).reshape(-1, 3)
bvh = BVHTree.FromPolygons([Vector(v) for v in opos], triangles.tolist(), all_triangles=True)
oj = old.array(op['attributes']['JOINTS_0'])
ow = old.array(op['attributes']['WEIGHTS_0'])
joints = np.zeros((len(npos), 4), dtype=np.uint16)
weights = np.zeros((len(npos), 4), dtype=np.float32)
distances = []
for i, co in enumerate(npos):
    hit, normal, face, distance = bvh.find_nearest(Vector(co))
    assert face is not None
    distances.append(distance)
    ids = triangles[face]
    bary = barycentric_transform(hit, *[Vector(opos[k]) for k in ids],
                                 Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
    bary = np.maximum(np.array(bary), 0)
    bary /= bary.sum()
    influences = {}
    for vertex, factor in zip(ids, bary):
        for joint, weight in zip(oj[vertex], ow[vertex]):
            influences[int(joint)] = influences.get(int(joint), 0) + float(weight * factor)
    keep = sorted(influences.items(), key=lambda x: (-x[1], x[0]))[:4]
    total = sum(w for _, w in keep)
    assert total > 0
    for k, (j, w) in enumerate(keep):
        joints[i, k], weights[i, k] = j, w / total
# The skirt is a continuous shell across the midline, whereas the nearest old
# surface can alternate between opposite thigh influences on adjacent pleats.
# Replace only the left/right upper-leg split in the skirt-height band with a
# smooth anatomical partition. Preserve their combined weight and every other
# influence; outer thighs keep their original side. No geometry is changed.
joint_names = [old.json['nodes'][i]['name'] for i in old.json['skins'][0]['joints']]
left, right = [joint_names.index('mixamorig:' + side + 'UpLeg') for side in ['Left', 'Right']]
skirt_corrected = 0
for i, (x, y, z) in enumerate(npos):
    if not .78 < y < 1.0 or abs(x) >= .10:
        continue
    influence = {int(j): float(w) for j, w in zip(joints[i], weights[i]) if w > 0}
    leg_total = influence.get(left, 0) + influence.get(right, 0)
    if leg_total < .01:
        continue
    t = float(np.clip((x + .10) / .20, 0, 1))
    split = t * t * (3 - 2 * t)
    fade = float(np.clip((1.0 - y) / .04, 0, 1))
    old_left = influence.get(left, 0)
    influence[left] = old_left * (1 - fade) + leg_total * split * fade
    influence[right] = leg_total - influence[left]
    keep = sorted(influence.items(), key=lambda p: (-p[1], p[0]))[:4]
    total = sum(w for _, w in keep)
    joints[i], weights[i] = 0, 0
    for k, (j, w) in enumerate(keep):
        joints[i, k], weights[i, k] = j, w / total
    skirt_corrected += 1
# Relax weights on the welded topology, including UV seams. Six half-steps
# regularize finger webs and fine pleats where a nearest-face choice can switch
# abruptly. Inverse edge length keeps thin, dense details coherent. This edits
# skin weights only; source vertices, faces, UVs and normals stay intact.
_, welded = np.unique(np.round(npos.astype(np.float64), 6), axis=0, return_inverse=True)
faces = welded[new.array(np_['indices']).reshape(-1, 3)]
edges = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
edges.sort(axis=1)
edges = np.unique(edges, axis=0)
edges = edges[edges[:, 0] != edges[:, 1]]
unique_count = int(welded.max()) + 1
dense = np.zeros((unique_count, len(joint_names)), dtype=np.float64)
counts = np.bincount(welded, minlength=unique_count)
positions = np.zeros((unique_count, 3), dtype=np.float64)
np.add.at(positions, welded, npos)
positions /= counts[:, None]
for k in range(4):
    np.add.at(dense, (welded, joints[:, k]), weights[:, k])
dense /= counts[:, None]
row = np.concatenate([edges[:, 0], edges[:, 1]])
col = np.concatenate([edges[:, 1], edges[:, 0]])
factors = 1 / np.maximum(np.linalg.norm(positions[row] - positions[col], axis=1), .001)
totals = np.bincount(row, weights=factors, minlength=unique_count)
for iteration in range(6):
    average = np.zeros_like(dense)
    np.add.at(average, row, dense[col] * factors[:, None])
    average /= np.maximum(totals[:, None], 1e-12)
    connected = totals > 0
    dense[connected] = .5 * dense[connected] + .5 * average[connected]
ranked = np.argsort(-dense, axis=1, kind='stable')[:, :4]
values = np.take_along_axis(dense, ranked, axis=1)
values /= values.sum(axis=1, keepdims=True)
joints = ranked[welded].astype(np.uint16)
weights = values[welded].astype(np.float32)
joints[weights == 0] = 0  # glTF canonical representation for unused influences.
assert np.isfinite(weights).all() and np.allclose(weights.sum(axis=1), 1, atol=1e-6)
np.savez_compressed(WORK / 'weights.npz', joints=joints, weights=weights)
graft(old, new, npos, joints, weights, OUTPUT)

# Authoring checkpoint: import both real assets, preserve all original NLA actions.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ORIGINAL))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
old_mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.modifiers)
old_mesh.name = 'Kira original - reference only'
old_mesh.hide_render = True
old_mesh.hide_set(True)
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
mesh = next(o for o in set(bpy.data.objects) - before if o.type == 'MESH')
mesh.name = 'Kira Midres - transferred skin'
# Blender's importer can reorder vertices. Resolve by exact position plus UV.
raw = new.array(np_['attributes']['POSITION'])
lookup = KDTree(len(raw))
for i, p in enumerate(raw):
    lookup.insert(Vector((p[0], -p[2], p[1])), i)
lookup.balance()
groups = [mesh.vertex_groups.new(name=n) for n in joint_names]
for v in mesh.data.vertices:
    _, idx, error = lookup.find(v.co)
    assert error < 1e-6, (v.index, error)
    v.co = Vector((npos[idx, 0], -npos[idx, 2], npos[idx, 1]))
    for j, w in zip(joints[idx], weights[idx]):
        if w > 0:
            groups[int(j)].add([v.index], float(w), 'REPLACE')
modifier = mesh.modifiers.new('Original 74-joint rig', 'ARMATURE')
modifier.object = arm
mesh.parent = arm
arm.data.pose_position = 'REST'
for image in bpy.data.images:
    if image.source == 'FILE' and not image.packed_file:
        image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(WORK / 'kira-midres-transfer.blend'))
report = {
    'method': 'nearest bind-surface barycentric weights; skirt midline correction; 6 welded-topology relaxation half-steps; normalized top 4; exact source rig/animation graft',
    'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'original_sha256': hashlib.sha256(ORIGINAL.read_bytes()).hexdigest(),
    'output_sha256': hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
    'blender': bpy.app.version_string,
    'scale': scale, 'y_offset': offset,
    'vertices': len(npos), 'triangles': len(new.array(np_['indices'])) // 3,
    'joints': len(joint_names), 'clips': [a['name'] for a in old.json['animations']],
    'source_distance_m': dict(zip(['p50', 'p90', 'p99', 'max'], np.percentile(distances, [50, 90, 99, 100]).tolist())),
    'unweighted_vertices': int(np.count_nonzero(weights.sum(axis=1) == 0)),
    'max_weight_sum_error': float(np.abs(weights.sum(axis=1) - 1).max()),
    'skirt_midline_corrected_vertices': skirt_corrected,
    'actions': [{'name': a.name, 'frames': list(a.frame_range)} for a in bpy.data.actions],
    'bones': [{'name': b.name, 'parent': b.parent.name if b.parent else None,
               'head': list(b.head_local), 'tail': list(b.tail_local)} for b in arm.data.bones],
}
(EVIDENCE / 'transfer.json').write_text(json.dumps(report, indent=2) + '\n')
print('TRANSFER_OK', json.dumps({k: v for k, v in report.items() if k not in ['bones', 'actions', 'clips']}))
