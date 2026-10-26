"""Sample every 30 Hz source frame in Blender and measure both skins.

Run after transfer.py:
blender -b artifacts/kira-midres/kira-midres-transfer.blend --python tools/kira-midres/measure.py
"""
import bpy
import math
import json
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.modifiers]
scene = bpy.context.scene
arm.data.pose_position = 'POSE'
actions = {t.name: t.strips[0].action for t in arm.animation_data.nla_tracks}
for track in arm.animation_data.nla_tracks:
    track.mute = True
depsgraph = bpy.context.evaluated_depsgraph_get()
reference = {}
for obj in meshes:
    edges = np.array([e.vertices[:] for e in obj.data.edges], dtype=np.int32)
    points = np.array([v.co[:] for v in obj.data.vertices])
    lengths = np.linalg.norm(points[edges[:, 0]] - points[edges[:, 1]], axis=1)
    keep = lengths > 0.001  # Sub-millimeter edges magnify harmless floating error.
    reference[obj.name] = (edges[keep], lengths[keep])
records = []
for name, action in actions.items():
    arm.animation_data.action = action
    duration = action.frame_range[1] / (scene.render.fps / scene.render.fps_base)
    metrics = {obj.name: {'finite': True, 'max_edge_stretch': 0, 'worst_p99_edge_stretch': 0,
                          'worst_p001_edge_ratio': 1} for obj in meshes}
    frame_count = 0
    for time in np.arange(0, duration, 1/30):
        frame = time * scene.render.fps / scene.render.fps_base
        scene.frame_set(math.floor(frame), subframe=float(frame % 1))
        bpy.context.view_layer.update()
        for obj in meshes:
            evaluated = obj.evaluated_get(depsgraph)
            points = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
            evaluated.data.vertices.foreach_get('co', points)
            points = points.reshape(-1, 3)
            edges, lengths = reference[obj.name]
            ratio = np.linalg.norm(points[edges[:, 0]] - points[edges[:, 1]], axis=1) / lengths
            m = metrics[obj.name]
            m['finite'] &= bool(np.isfinite(points).all())
            m['max_edge_stretch'] = max(m['max_edge_stretch'], float(ratio.max()))
            m['worst_p99_edge_stretch'] = max(m['worst_p99_edge_stretch'], float(np.percentile(ratio, 99)))
            m['worst_p001_edge_ratio'] = min(m['worst_p001_edge_ratio'], float(np.percentile(ratio, .1)))
        frame_count += 1
    records.append({'clip': name, 'frames': frame_count, 'skins': metrics})
    print('MEASURED', name, frame_count, metrics, flush=True)
(ROOT / 'public/verification/kira-midres/deformation.json').write_text(json.dumps(records, indent=2) + '\n')
for record in records:
    old, new = record['skins'].values()
    assert new['finite']
    assert new['max_edge_stretch'] <= old['max_edge_stretch']
    assert new['worst_p99_edge_stretch'] <= old['worst_p99_edge_stretch'] * 1.08
print('DEFORMATION_BASELINE_CHECK_PASS', sum(r['frames'] for r in records))
