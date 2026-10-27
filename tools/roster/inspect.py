"""Fresh Blender reimport, deformation bounds and textured samples; no source edits."""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]; name=sys.argv[sys.argv.index('--')+1]
file=ROOT/f'public/assets/characters/{name}/{name.title()}_Tennis.glb' if name!='nova' else ROOT/'public/assets/characters/nova/Nova_Fullres_Rigged.glb'
OUT=ROOT/f'artifacts/goal-008/poses/{name}';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(file));arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE'); mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
actions={t.name:t.strips[0].action for t in arm.animation_data.nla_tracks}
for t in arm.animation_data.nla_tracks:t.mute=True
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=4;scene.cycles.use_denoising=False;scene.render.resolution_x=280;scene.render.resolution_y=400;scene.render.resolution_percentage=100;scene.world.color=(.3,.3,.3);scene.view_settings.view_transform='Standard'
def look(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for loc in [(2,-4,5),(-3,-2,3),(1,3,4)]:
 bpy.ops.object.light_add(type='AREA',location=loc);bpy.context.object.data.energy=250;bpy.context.object.data.size=4;look(bpy.context.object,(0,0,1))
bpy.ops.object.camera_add(location=(2,-6,1.6));camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=2.5;look(camera,(0,0,.95))
report=[]
for clip,action in actions.items():
 arm.animation_data.action=action
 for frac in [.25,.52]:
  frame=action.frame_range[0]+(action.frame_range[1]-action.frame_range[0])*frac;scene.frame_set(math.floor(frame),subframe=frame%1)
  hips=arm.pose.bones['mixamorig:Hips'].head;arm.location=(-hips.x,-hips.y,0);bpy.context.view_layer.update()
  deps=bpy.context.evaluated_depsgraph_get();ev=mesh.evaluated_get(deps);geo=ev.to_mesh();coords=[v.co for v in geo.vertices];bounds=[[min(v[i] for v in coords),max(v[i] for v in coords)] for i in range(3)];ev.to_mesh_clear()
  assert all(math.isfinite(x) for axis in bounds for x in axis)
  report.append({'clip':clip,'fraction':frac,'bounds':bounds})
  scene.render.filepath=str(OUT/f'{len(report):02}.png');bpy.ops.render.render(write_still=True)
arm.animation_data.action=actions['Idle_7'];scene.frame_set(0)
for im in bpy.data.images:
 if im.source=='FILE' and not im.packed_file:im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/f'artifacts/goal-008/{name}-validated.blend'))
(ROOT/f'public/verification/goal-008/{name}-poses.json').write_text(json.dumps(report,indent=2))
