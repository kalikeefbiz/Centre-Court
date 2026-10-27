"""Reopen the ordinary Blender checkpoint; verify retained rig/data and pack notes.
No GLB export or source-asset mutation is performed.
"""
from pathlib import Path
import bpy, json, sys
import numpy as np
from mathutils import Matrix
root=Path(__file__).resolve().parents[2]
name=sys.argv[sys.argv.index('--')+1]
folder=root/'artifacts/goal-009/graphics'/name
path=folder/'roster-grip-validated.blend'
bpy.ops.wm.open_mainfile(filepath=str(path))
data=np.load(folder/'poses.npz');report=json.loads((folder/'poses.json').read_text())
surface=bpy.data.objects['Validated production pose'];geometry=surface.data
assert len(geometry.vertices)==report['vertices']
assert sum(len(p.vertices)-2 for p in geometry.polygons)==report['triangles']
rigs=[o for o in bpy.data.objects if o.type=='ARMATURE']
assert len(rigs)>=1 and len(bpy.data.actions)>=13
assert all(image.packed_file for image in bpy.data.images if image.source=='FILE')
index=next(i for i,s in enumerate(report['states']) if s['state']=='Forehand')
convert=lambda v:v[:,[0,2,1]]*np.array([1,-1,1])
geometry.vertices.foreach_set('co',convert(data['vertices'][index]).reshape(-1))
geometry.normals_split_custom_set_from_vertices(convert(data['normals'][index]).tolist());geometry.update()
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
# Only the validation surface and imported independent equipment are visible.
for obj in bpy.data.objects:
 if obj.type in {'MESH','ARMATURE'}:obj.hide_render=obj!=surface
racket=next(o for o in bpy.data.objects if o.type=='MESH' and o!=surface and not any(m.type=='ARMATURE' for m in o.modifiers))
while racket.parent:racket=racket.parent
racket.matrix_world=C@Matrix(data['equipment'][index])@C.inverted()
def show(obj):
 obj.hide_render=False
 for child in obj.children:show(child)
show(racket)
for title,content in [('GOAL009 calibration and provenance.json',(root/f'public/assets/characters/grips/{name}.json').read_text()),('GOAL009 pose inspection.json',json.dumps(report,indent=2))]:
 text=bpy.data.texts.get(title) or bpy.data.texts.new(title);text.clear();text.write(content)
bpy.ops.wm.save_as_mainfile(filepath=str(path))
result={'character':name,'checkpoint':str(path.relative_to(root)),'reopened':True,'vertices':len(geometry.vertices),'triangles':report['triangles'],'armatures':len(rigs),'actions':len(bpy.data.actions),'packedImages':sum(bool(image.packed_file) for image in bpy.data.images),'sourceGLBExported':False}
(root/f'public/verification/goal-009/graphics/{name}/checkpoint.json').write_text(json.dumps(result,indent=2))
print('CHECKPOINT_VERIFIED',json.dumps(result),flush=True)
