"""Blender: preserve uploaded skins/native locomotion; add Kira's missing clips by named bind-frame deltas."""
import sys,copy,json
from pathlib import Path
import numpy as np
from mathutils import Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'kira-midres'))
from glb import GLB
ROOT=Path(__file__).resolve().parents[2]
src=GLB(ROOT/'public/assets/characters/kira/Meshy_AI_Pink_Valkyrie_All_Animations.glb')
paths={'dante':'dante_near_original_24mb','rico':'Meshy_AI_Crimson_Court_Champio_All_Animations','zuri':'Meshy_AI_Emerald_Valkyrie_All_Animations'}
for name,file in paths.items():
 dst=GLB(ROOT/f'public/assets/characters/{name}/{file}.glb'); names={n.get('name'):i for i,n in enumerate(dst.json['nodes'])}
 for anim in src.json['animations']:
  if anim['name'] in ['Running','Walking']:continue
  a={'name':anim['name'],'channels':[],'samplers':[]}
  for ch in anim['channels']:
   sn=src.json['nodes'][ch['target']['node']]; ni=names.get(sn.get('name'))
   if ni is None:continue
   dn=dst.json['nodes'][ni]; sampler=anim['samplers'][ch['sampler']]; path=ch['target']['path']; data=src.array(sampler['output'])
   if path=='translation':
    sr=np.array(sn.get('translation',[0,0,0])); dr=np.array(dn.get('translation',[0,0,0])); data=data-sr+dr
   elif path=='rotation':
    sq=sn.get('rotation',[0,0,0,1]);dq=dn.get('rotation',[0,0,0,1]);delta=Quaternion((dq[3],*dq[:3])) @ Quaternion((sq[3],*sq[:3])).inverted()
    data=np.array([(lambda q:[q.x,q.y,q.z,q.w])(delta @ Quaternion((v[3],*v[:3]))) for v in data])
   out=src.json['accessors'][sampler['output']]
   a['samplers'].append({'input':dst.append_array(src.array(sampler['input']),5126,'SCALAR',True,None),'output':dst.append_array(data,5126,out['type'],False,None),'interpolation':sampler.get('interpolation','LINEAR')})
   a['channels'].append({'sampler':len(a['samplers'])-1,'target':{'node':ni,'path':path}})
  dst.json['animations'].append(a)
 dst.save(ROOT/f'public/assets/characters/{name}/{name.title()}_Tennis.glb')
 print('RETARGET',name,len(dst.json['animations']),flush=True)
