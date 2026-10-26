"""Run in a fresh Blender process on the saved editable checkpoint."""
import bpy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
mesh = bpy.data.objects['Kira Midres - transferred skin']
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
images = [node.image for obj in bpy.context.scene.objects if obj.type == 'MESH'
          for material in obj.data.materials if material and material.use_nodes
          for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image]
images = sorted(set(images), key=lambda i: i.name)
assert len(arm.data.bones) == 74
assert len(arm.animation_data.nla_tracks) == 13
assert len(mesh.data.vertices) == 46890
assert mesh.modifiers[0].object == arm
assert len(images) == 6
for image in images:
    assert image.packed_file, image.name
    assert min(image.size) > 0, image.name
report = {'native_reopen': 'PASS', 'bones': 74, 'clips': 13,
          'packed_images': [{'name': i.name, 'size': list(i.size)} for i in images]}
(ROOT / 'public/verification/kira-midres/native-reopen.json').write_text(json.dumps(report, indent=2) + '\n')
print('NATIVE_REOPEN_PASS', json.dumps(report))
