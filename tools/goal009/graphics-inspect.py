"""Read-only Blender hand/mesh baseline. Does not alter original assets."""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
name=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'kira'
file=ROOT/('public/assets/characters/kira/Kira_Midres_Rigged.glb' if name=='kira' else 'public/assets/characters/nova/Nova_Fullres_Rigged.glb')
OUT=ROOT/'artifacts/goal-009/graphics'/name;OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(file))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
for t in arm.animation_data.nla_tracks:t.mute=True
arm.animation_data.action=None;arm.data.pose_position='REST'
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.use_denoising=False
scene.render.resolution_x=600;scene.render.resolution_y=600;scene.render.resolution_percentage=100;scene.view_settings.view_transform='Standard';scene.world.color=(.25,.25,.25)
def look(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for loc in [(2,-4,5),(-3,-2,3),(1,3,4)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=250;o.data.size=4;look(o,(0,0,1))
hand=arm.data.bones['mixamorig:RightHand'];center=arm.matrix_world@hand.head_local
print('HAND_CENTER',list(center),flush=True)
bpy.ops.object.camera_add(location=center+Vector((.10,-.5,.10)));cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=.30;look(cam,center+Vector((-.03,0,-.07)))
scene.render.filepath=str(OUT/'hand-rest.png');bpy.ops.render.render(write_still=True)
# Full neutral with consistent source-space lighting.
cam.location=(2,-6,1.6);cam.data.ortho_scale=2.15;look(cam,(0,0,.9));scene.render.filepath=str(OUT/'neutral.png');bpy.ops.render.render(write_still=True)
for im in bpy.data.images:
 if im.source=='FILE' and not im.packed_file:im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'inspection.blend'))
