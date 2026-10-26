"""Clean reimport and textured Blender pose checks of the delivered GLB.

Run: blender -b --factory-startup --python tools/kira-midres/render.py
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts/kira-midres/poses'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'public/assets/characters/kira/Kira_Midres_Rigged.glb'))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.modifiers)
actions = {t.name: t.strips[0].action for t in arm.animation_data.nla_tracks}
for track in arm.animation_data.nla_tracks:
    track.mute = True
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 8
scene.cycles.use_denoising = False
scene.render.resolution_x = 360
scene.render.resolution_y = 500
scene.render.resolution_percentage = 100
scene.world.color = (.22, .22, .22)
scene.view_settings.view_transform = 'Standard'

def look(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

for loc, power, size in [((2, -4, 5), 350, 5), ((-3, -2, 3), 250, 4), ((1, 3, 4), 350, 3)]:
    bpy.ops.object.light_add(type='AREA', location=loc)
    light = bpy.context.object
    light.data.energy, light.data.size = power, size
    look(light, (0, 0, .9))
bpy.ops.object.camera_add(location=(2.3, -6, 1.4))
camera = bpy.context.object
scene.camera = camera
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 2.45
look(camera, (0, 0, .95))

states = {
    'Idle': ('Idle_7', [0, 2, 4, 6]),
    'Walk': ('Walking', [0, .25, .5, .75]),
    'Run': ('Running', [0, .15, .3, .45]),
    'ShuffleLeft': ('_01a16f36_0b96_76c3_ac06_6409b3e12e89', [0, .7, 1.4, 2.1]),
    'ShuffleRight': ('_01a16f37_5a33_7498_91c4_55e2e1439bac', [0, .7, 1.4, 2.1]),
    'Forehand': ('_01a16f14_df89_70e4_966f_38087b9b2ef7', [.5, 28/30, 1.4, 2]),
    'Backhand': ('_01a16f17_0702_776b_a578_5ae634002c9e', [.5, 1, 1.4, 2]),
    'ForehandVolley': ('_01a16f19_f977_75c8_82d3_00bd61e22843', [.5, 29/30, 1.3, 2]),
    'BackhandVolley': ('_01a16f1f_22af_74e9_af26_8f1aec798eb5', [.5, 29/30, 1.3, 2]),
    'Serve': ('_01a16f21_3bc1_7312_b0db_d96fda6475ea', [.5, 1.2, 46/30, 2]),
    'Smash': ('_01a16f20_14b9_70d3_b4cd_5b3e4d514601', [.5, 26/30, 1.4, 2]),
    'Slice': ('_01a16f27_4128_711d_a437_5651121a8e2c', [.5, .9, 1.4, 2]),
    'Lob': ('_01a16f33_ae88_77f6_8f6a_d4c208041d36', [.5, 37/30, 1.6, 2]),
}
for state, (clip, times) in states.items():
    arm.animation_data.action = actions[clip]
    for i, t in enumerate(times):
        frame = t * scene.render.fps / scene.render.fps_base
        scene.frame_set(math.floor(frame), subframe=frame % 1)
        hips = arm.pose.bones['mixamorig:Hips'].head
        arm.location = (-hips.x, -hips.y, 0)
        bpy.context.view_layer.update()
        scene.render.filepath = str(OUT / f'{state}-{i}.png')
        bpy.ops.render.render(write_still=True)
    print('POSE_CHECK', state, flush=True)
arm.animation_data.action = actions['Idle_7']
scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'artifacts/kira-midres/validated-reimport.blend'))
print('CLEAN_REIMPORT_OK', len(arm.data.bones), len(actions), len(mesh.data.vertices))
