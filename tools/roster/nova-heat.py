"""Alternative weight solve using Blender's anatomical bone heat, preserving all GLB render bytes."""
import sys,json
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tools/kira-midres'))
from glb import GLB
file=ROOT/'public/assets/characters/nova/Nova_Fullres_Rigged.glb';g=GLB(file)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(file))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH');arm.data.pose_position='REST'
for t in arm.animation_data.nla_tracks:t.mute=True
arm.animation_data.action=None
source_mesh=mesh
proxy=mesh.copy();proxy.data=mesh.data.copy();bpy.context.collection.objects.link(proxy);mesh=proxy
mesh.vertex_groups.clear()
for modifier in list(mesh.modifiers): mesh.modifiers.remove(modifier)
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
modifier=mesh.modifiers.new('Weight-solve proxy only; never exported','REMESH');modifier.mode='VOXEL';modifier.voxel_size=.018
bpy.ops.object.modifier_apply(modifier=modifier.name)
print('PROXY_VERTICES',len(mesh.data.vertices),flush=True)
for b in arm.data.bones:
 b.use_deform=not any(x in b.name for x in ['HandThumb','HandIndex','HandMiddle','HandRing','HandPinky','_End','headfront','HeadTop','Bone_'])
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=arm
try:bpy.ops.object.parent_set(type='ARMATURE_AUTO')
except RuntimeError as e:print('HEAT_ERROR',e,flush=True)
primitive=g.json['meshes'][0]['primitives'][0];positions=g.array(primitive['attributes']['POSITION']);tree=KDTree(len(positions))
for i,p in enumerate(positions):tree.insert(Vector((p[0],-p[2],p[1])),i)
tree.balance();names=[g.json['nodes'][i]['name'] for i in g.json['skins'][0]['joints']];mapping={i:names.index(v.name) for i,v in enumerate(mesh.vertex_groups) if v.name in names}
joints=np.zeros((len(positions),4),dtype=np.uint16);weights=np.zeros((len(positions),4),dtype=np.float32)
# Transfer solved proxy weights onto every original full-detail vertex.
mesh.data.calc_loop_triangles()
faces=[tuple(t.vertices) for t in mesh.data.loop_triangles]
coords=[v.co.copy() for v in mesh.data.vertices]
bvh=BVHTree.FromPolygons(coords,faces,all_triangles=True)
for idx,p in enumerate(positions):
 hit,normal,face,error=bvh.find_nearest(Vector((p[0],-p[2],p[1])))
 ids=faces[face]
 bary=barycentric_transform(hit,*[coords[i] for i in ids],Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
 bary=np.maximum(np.array(bary),0);bary/=bary.sum()
 influence={}
 for vi,factor in zip(ids,bary):
  for x in mesh.data.vertices[vi].groups:
   if x.group in mapping: influence[mapping[x.group]]=influence.get(mapping[x.group],0)+x.weight*float(factor)
 keep=sorted(influence.items(),key=lambda p:-p[1])[:4]
 if not keep:raise RuntimeError(f'Unweighted heat vertex {idx}')
 total=sum(w for j,w in keep)
 for k,(j,w) in enumerate(keep):joints[idx,k]=j;weights[idx,k]=w/total
assert np.allclose(weights.sum(axis=1),1,atol=1e-6)
primitive['attributes']['JOINTS_0']=g.append_array(joints,5123,'VEC4');primitive['attributes']['WEIGHTS_0']=g.append_array(weights,5126,'VEC4')
g.save(file)
print('HEAT_OK',len(mesh.data.vertices),flush=True)
