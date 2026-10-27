"""Blender inspection of all five actual production skins and source tracks.

First run pose-data.py. One source import per athlete; retained editable source
rig plus exact runtime-LBS inspection surface. No source GLB is overwritten.
"""
import bpy, sys, json, os
from pathlib import Path
import numpy as np
from mathutils import Matrix, Vector
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/kira-midres'))
from glb import GLB
name=sys.argv[sys.argv.index('--')+1]
paths={'kira':'kira/Kira_Midres_Rigged.glb','nova':'nova/Nova_Fullres_Rigged.glb','dante':'dante/Dante_Tennis.glb','rico':'rico/Rico_Tennis.glb','zuri':'zuri/Zuri_Tennis.glb'}
source=ROOT/'public/assets/characters'/paths[name]
work=ROOT/'artifacts/goal-009/graphics'/name
out=Path(os.environ.get('CC_OUTPUT',str(ROOT/'public/verification/goal-009/graphics'/name)));out.mkdir(parents=True,exist_ok=True)
stem=os.environ.get('CC_POSE_DATA','poses');hand_only=os.environ.get('CC_HAND_ONLY')=='1'
data=np.load(work/f'{stem}.npz');report=json.loads((work/f'{stem}.json').read_text());g=GLB(source)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
original=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
material=original.data.materials[0]
for obj in list(bpy.context.scene.objects):obj.hide_render=True
primitive=g.json['meshes'][0]['primitives'][0];faces=g.array(primitive['indices']).reshape(-1,3)
uv=g.array(primitive['attributes']['TEXCOORD_0']);uv[:,1]=1-uv[:,1]
def converted(v):return v[:,[0,2,1]]*np.array([1,-1,1])
geometry=bpy.data.meshes.new('Runtime skin inspection surface')
geometry.from_pydata(converted(data['vertices'][0]).tolist(),[],faces.tolist());geometry.materials.append(material)
geometry.polygons.foreach_set('use_smooth',[True]*len(geometry.polygons))
layer=geometry.uv_layers.new(name='UVMap');loopverts=np.array([loop.vertex_index for loop in geometry.loops]);layer.data.foreach_set('uv',uv[loopverts].reshape(-1))
athlete=bpy.data.objects.new('Validated production pose',geometry);bpy.context.collection.objects.link(athlete)
before=set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/assets/equipment/rackets/Meshy_AI_Pink_and_Black_Tennis_1024095819_texture.glb'))
objects=[o for o in bpy.context.scene.objects if o not in before];racket=next(o for o in objects if o.parent not in objects)
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=6;scene.cycles.use_denoising=False
scene.render.use_persistent_data=True
scene.render.resolution_x=360;scene.render.resolution_y=360;scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard';scene.world.color=(.25,.25,.25)
def look(obj,point):obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()
for location in [(2,-4,5),(-3,-2,3),(1,3,4)]:
 bpy.ops.object.light_add(type='AREA',location=location);light=bpy.context.object;light.data.energy=250;light.data.size=4;look(light,(0,0,1))
bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO'
for i,state in enumerate(report['states']):
 coordinates=converted(data['vertices'][i]);normal=converted(data['normals'][i])
 geometry.vertices.foreach_set('co',coordinates.reshape(-1));geometry.normals_split_custom_set_from_vertices(normal.tolist());geometry.update()
 racket.matrix_world=C@Matrix(data['equipment'][i])@C.inverted()
 hand=Matrix(data['hands'][i]);center=C@hand@Vector((0,.065,0,1));center=Vector(center[:3])
 outward=Vector((center.x,center.y,0))
 if outward.length<.15:outward=Vector((0,-1,0))
 outward.normalize()
 camera.location=center+outward*.55+Vector((0,0,.15));look(camera,center);camera.data.ortho_scale=.30
 scene.render.filepath=str(out/f"{state['state']}-grip.png");bpy.ops.render.render(write_still=True)
 if not hand_only and state['state'] in ['Idle','Forehand','Backhand','Serve','Smash']:
  camera.location=(2,-5,1.7);look(camera,(0,0,1.1));camera.data.ortho_scale=3.0
  scene.render.resolution_x=480;scene.render.resolution_y=600
  scene.render.filepath=str(out/f"{state['state']}-body.png");bpy.ops.render.render(write_still=True)
  scene.render.resolution_x=360;scene.render.resolution_y=360
 print(name,state['state'],'RENDERED',flush=True)
# A normalized source-mesh view isolates skin/pose from source detail. Original
# topology/UV/material payload is the same reference verified in source audit.
if not hand_only:
 geometry.vertices.foreach_set('co',converted(data['source']).reshape(-1))
 geometry.normals_split_custom_set_from_vertices(converted(g.array(primitive['attributes']['NORMAL'])).tolist());geometry.update()
 for obj in objects:obj.hide_render=True
 camera.location=(2,-5,1.6);look(camera,(0,0,.9));camera.data.ortho_scale=2.1
 scene.render.filepath=str(out/'source-neutral.png');bpy.ops.render.render(write_still=True)
 for image in bpy.data.images:
  if image.source=='FILE' and not image.packed_file:image.pack()
 # Open the saved authoring checkpoint on a useful stroke rather than the
 # source-comparison pose. Retain the imported rig/actions for further editing.
 contact=next(i for i,state in enumerate(report['states']) if state['state']=='Forehand')
 geometry.vertices.foreach_set('co',converted(data['vertices'][contact]).reshape(-1))
 geometry.normals_split_custom_set_from_vertices(converted(data['normals'][contact]).tolist());geometry.update()
 racket.matrix_world=C@Matrix(data['equipment'][contact])@C.inverted()
 for obj in objects:obj.hide_render=False
 camera.location=(2,-5,1.7);look(camera,(0,0,1.1));camera.data.ortho_scale=3.0
 notes=bpy.data.texts.new('GOAL009 calibration and provenance.json')
 notes.write((ROOT/f'public/assets/characters/grips/{name}.json').read_text())
 notes=bpy.data.texts.new('GOAL009 pose inspection.json');notes.write(json.dumps(report,indent=2))
 bpy.ops.wm.save_as_mainfile(filepath=str(work/'roster-grip-validated.blend'))
(out/'poses.json').write_text(json.dumps(report,indent=2))
print(name,len(report['states']),'STATE INSPECTION COMPLETE',flush=True)
