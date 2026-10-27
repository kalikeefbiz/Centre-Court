"""Blender-native inspection of the actual runtime sparse grip patch.

Preserves original GLBs. Builds a local derived GLB with identical render source
and applies the exact runtime skin/bind/finger changes, then saves editable blend.
"""
import bpy,sys,json,math,hashlib,copy,os
from pathlib import Path
import numpy as np
from mathutils import Vector,Matrix,Quaternion
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tools/kira-midres'));from glb import GLB
name=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'kira'
paths={'kira':'kira/Kira_Midres_Rigged.glb','nova':'nova/Nova_Fullres_Rigged.glb','dante':'dante/Dante_Tennis.glb','rico':'rico/Rico_Tennis.glb','zuri':'zuri/Zuri_Tennis.glb'}
source=ROOT/'public/assets/characters'/paths[name];patch=json.loads((ROOT/f'public/assets/characters/grips/{name}.json').read_text());g=GLB(source);OUT=ROOT/'artifacts/goal-009/graphics'/name;OUT.mkdir(parents=True,exist_ok=True)
orig=copy.deepcopy(g.json);ns=g.json['nodes'];names={n.get('name'):i for i,n in enumerate(ns)};skin=g.json['skins'][0];jointnames=[ns[i]['name'] for i in skin['joints']];primitive=g.json['meshes'][0]['primitives'][0]
ji=g.array(primitive['attributes']['JOINTS_0']);jw=g.array(primitive['attributes']['WEIGHTS_0']);ibm=g.array(skin['inverseBindMatrices'])
for row in patch['vertices']:ji[row[0]]=row[1:5];jw[row[0]]=row[5:9]
primitive['attributes']['JOINTS_0']=g.append_array(ji,5123,'VEC4');primitive['attributes']['WEIGHTS_0']=g.append_array(jw,5126,'VEC4')
for bind in patch['bindings']:ibm[jointnames.index(bind['name'])]=bind['matrix']
skin['inverseBindMatrices']=g.append_array(ibm,5126,'MAT4',False,None)
for bone in patch['bones']:ns[names[bone['name']]]['translation']=bone['position']
# A dedicated additive pose is kept as a separate action; source clips unchanged.
h=names['mixamorig:RightHand'];times=g.append_array(np.array([[0],[1]],dtype=np.float32),5126,'SCALAR',True,None);channels=[];samplers=[]
handq=ns[h].get('rotation',[0,0,0,1]);q=Quaternion((handq[3],*handq[:3]))@Quaternion((patch['handFrame'][3],*patch['handFrame'][:3]));targets=[(h,list(q)[1:]+[q.w])]+[(names[b['name']],b['rotation']) for b in patch['bones'] if 'RightHand' in b['name']]
for node,qv in targets:
 out=g.append_array(np.array([qv,qv],dtype=np.float32),5126,'VEC4',False,None);samplers.append({'input':times,'output':out,'interpolation':'LINEAR'});channels.append({'sampler':len(samplers)-1,'target':{'node':node,'path':'rotation'}})
g.json['animations'].append({'name':'GOAL009_Grip','channels':channels,'samplers':samplers});derived=OUT/'grip-native.glb';g.save(derived)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(derived));arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
actions={t.name:t.strips[0].action for t in arm.animation_data.nla_tracks}
for t in arm.animation_data.nla_tracks:t.mute=True
arm.animation_data.action=actions['GOAL009_Grip'];bpy.context.scene.frame_set(0)
# Render a physical handle at the source racket grip frame (same H*H^-1 world).
# Original equipment is imported separately and parented by its actual glTF node
# transforms rather than substituting a cylinder in the final production view.
racket=ROOT/'public/assets/equipment/rackets/Meshy_AI_Pink_and_Black_Tennis_1024095819_texture.glb'
oldset=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(racket));racketobjects=[o for o in bpy.context.scene.objects if o not in oldset];rroot=next(o for o in racketobjects if o.parent not in racketobjects)
# Blender glTF bone basis differs from original node axes. Derive the original
# hand world from the input glTF, then use its compensated runtime equipment pose.
parents={child:i for i,n in enumerate(ns) for child in n.get('children',[])}
def nodeworld(i):
 n=ns[i];qv=n.get('rotation',[0,0,0,1]);m=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((qv[3],*qv[:3])),Vector(n.get('scale',[1,1,1])));return nodeworld(parents[i])@m if i in parents else m
G=nodeworld(h);S=Matrix.Translation(Vector((0,.065,0)))@Matrix.Rotation(math.pi/2,4,'Z')@Matrix.Translation(Vector((0,.28,0)))@Matrix.Diagonal(Vector((.72,.72,.72,1)));C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)));rroot.matrix_world=C@G@S@C.inverted()
# glTF importers may bake non-rest inverse binds into their native bone rest
# frames. Render an independently evaluated runtime LBS surface to avoid calling
# those importer-specific rest conversions the PlayCanvas result.
posed_nodes=copy.deepcopy(ns)
for node,qv in targets:posed_nodes[node]['rotation']=qv
from functools import lru_cache
@lru_cache(None)
def posedworld(i):
 n=posed_nodes[i];qv=n.get('rotation',[0,0,0,1]);m=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((qv[3],*qv[:3])),Vector(n.get('scale',[1,1,1])));return posedworld(parents[i])@m if i in parents else m
positions=g.array(primitive['attributes']['POSITION']);normal=g.array(primitive['attributes']['NORMAL']);matrices=np.array([np.array(posedworld(i))@ibm[j].reshape(4,4).T for j,i in enumerate(skin['joints'])]);posed=np.zeros_like(positions);posednormal=np.zeros_like(normal)
for k in range(4):
 posed+=np.einsum('nij,nj->ni',matrices[ji[:,k]],np.c_[positions,np.ones(len(positions))])[:,:3]*jw[:,k,None]
 posednormal+=np.einsum('nij,nj->ni',matrices[ji[:,k],:3,:3],normal)*jw[:,k,None]
posednormal/=np.maximum(np.linalg.norm(posednormal,axis=1)[:,None],1e-9)
converted=posed[:,[0,2,1]]*np.array([1,-1,1]);convertednormal=posednormal[:,[0,2,1]]*np.array([1,-1,1]);faces=g.array(primitive['indices']).reshape(-1,3);uv=g.array(primitive['attributes']['TEXCOORD_0']);uv[:,1]=1-uv[:,1];material=mesh.data.materials[0]
geometry=bpy.data.meshes.new('Exact runtime LBS inspection surface');geometry.from_pydata(converted.tolist(),[],faces.tolist());geometry.update();geometry.materials.append(material);geometry.polygons.foreach_set('use_smooth',[True]*len(geometry.polygons));layer=geometry.uv_layers.new(name='UVMap');loopverts=np.array([l.vertex_index for l in geometry.loops]);layer.data.foreach_set('uv',uv[loopverts].reshape(-1));geometry.normals_split_custom_set_from_vertices(convertednormal.tolist())
mesh.data=geometry;mesh.parent=None;mesh.matrix_world=Matrix.Identity(4)
for modifier in list(mesh.modifiers):mesh.modifiers.remove(modifier)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=int(os.environ.get('CC_RENDER_SAMPLES','12'));scene.cycles.use_denoising=False;scene.render.resolution_x=int(os.environ.get('CC_RENDER_SIZE','700'));scene.render.resolution_y=scene.render.resolution_x;scene.render.resolution_percentage=100;scene.view_settings.view_transform='Standard';scene.world.color=(.25,.25,.25)
def look(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for loc in [(2,-4,5),(-3,-2,3),(1,3,4)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=250;o.data.size=4;look(o,(0,0,1))
center=C@G@Vector((0,.075,0,1));center=Vector(center[:3]);bpy.ops.object.camera_add(location=center+Vector((.15,-.5,.12)));cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=.34;look(cam,center)
for view,offset in [('grip-side',(.15,-.5,.12)),('grip-opposite',(-.20,.5,.10))]:
 cam.location=center+Vector(offset);look(cam,center);scene.render.filepath=str(OUT/f'{view}.png');bpy.ops.render.render(write_still=True)
for im in bpy.data.images:
 if im.source=='FILE' and not im.packed_file:im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'grip-validated.blend'))
print('SOURCE_UNCHANGED',hashlib.sha256(source.read_bytes()).hexdigest()==patch['sourceSha256'],flush=True)
