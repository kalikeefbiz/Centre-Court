"""Sample the owned runtime rig, socket and feet. No retargeting or asset edits.
python tools/sample-tennis-motion.py
Outputs compact gameplay racket/hand paths plus frame-by-frame shuffle diagnostics.
"""
import sys, json, math
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent / 'kira-midres'))
from glb import GLB
ROOT = Path(__file__).resolve().parents[1]
g = GLB(ROOT / 'public/assets/characters/kira/Kira_Midres_Rigged.glb')
nodes = g.json['nodes']; named = {n.get('name'): i for i,n in enumerate(nodes)}
parent = {c:i for i,n in enumerate(nodes) for c in n.get('children',[])}
# Semantic order is resolved explicitly; the source container order isn't a contract.
clips = {'Forehand':'_01a16f14_df89_70e4_966f_38087b9b2ef7','Backhand':'_01a16f17_0702_776b_a578_5ae634002c9e','ForehandVolley':'_01a16f19_f977_75c8_82d3_00bd61e22843','BackhandVolley':'_01a16f1f_22af_74e9_af26_8f1aec798eb5','Smash':'_01a16f20_14b9_70d3_b4cd_5b3e4d514601','Serve':'_01a16f21_3bc1_7312_b0db_d96fda6475ea','Slice':'_01a16f27_4128_711d_a437_5651121a8e2c','Lob':'_01a16f33_ae88_77f6_8f6a_d4c208041d36','ShuffleLeft':'_01a16f36_0b96_76c3_ac06_6409b3e12e89','ShuffleRight':'_01a16f37_5a33_7498_91c4_55e2e1439bac'}
def matrix(t,q,s):
 x,y,z,w=q; q=np.array(q)/np.linalg.norm(q); x,y,z,w=q
 m=np.eye(4);m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(s);m[:3,3]=t;return m
def sample(channels,t):
 transforms=[{k:np.array(n.get(k,d),dtype=float) for k,d in [('translation',[0,0,0]),('rotation',[0,0,0,1]),('scale',[1,1,1])]} for n in nodes]
 for node,path,times,values in channels:
  idx=int(np.searchsorted(times,t,side='right'))-1;idx=max(0,min(len(times)-1,idx));j=min(idx+1,len(times)-1)
  f=0 if idx==j else (t-times[idx])/(times[j]-times[idx]);a,b=values[idx],values[j]
  if path=='rotation':
   dot=np.dot(a,b)
   if dot<0:b=-b;dot=-dot
   if dot<.9995:
    angle=math.acos(max(-1,min(1,dot)));v=(math.sin((1-f)*angle)*a+math.sin(f*angle)*b)/math.sin(angle)
   else:v=a*(1-f)+b*f
  else:v=a*(1-f)+b*f
  transforms[node][path]=v
 world={}
 def get(i):
  if i not in world:
   n=transforms[i];local=matrix(n['translation'],n['rotation'],n['scale']);world[i]=get(parent[i])@local if i in parent else local
  return world[i]
 hips=get(named['mixamorig:Hips'])[:3,3].copy()
 def point(name,offset=[0,0,0]):
  p=(get(named[name])@np.array([*offset,1]))[:3];p[[0,2]]-=hips[[0,2]];p[[0,2]]*=-1;return np.round(p,5).tolist()
 # Existing socket translate, Z90 rotation, racket offset/scale, sweet spot.
 head=point('mixamorig:RightHand',[-(.28+.72*.22),.065,0])
 return {'head':head,'palm':point('mixamorig:LeftHand',[0,.04,.035]),'left':point('mixamorig:LeftFoot'),'right':point('mixamorig:RightFoot'),'hips':np.round(hips,5).tolist()}
paths={};audit={}
for state,name in clips.items():
 a=next(a for a in g.json['animations'] if a['name']==name);channels=[]
 for c in a['channels']:
  s=a['samplers'][c['sampler']];channels.append((c['target']['node'],c['target']['path'],g.array(s['input']).ravel(),g.array(s['output'])))
 frames=[sample(channels,i/30) for i in range(90)]
 if state.startswith('Shuffle'):audit[state]=frames
 else:paths[state]={'racket':[f['head'] for f in frames],'palm':[f['palm'] for f in frames] if state=='Serve' else []}
(ROOT/'src/core/rig-motion.json').write_text(json.dumps(paths,separators=(',',':'))+'\n')
output=ROOT/'artifacts/goal005';output.mkdir(parents=True,exist_ok=True)
(output/'shuffle-frames.json').write_text(json.dumps(audit,indent=2))
for state,frames in audit.items():
 print(state)
 for i in range(0,90,3):
  f=frames[i];print(i,'hips',f['hips'],'feet',f['left'],f['right'])
for state,frame in [('Forehand',28),('Backhand',30),('ForehandVolley',29),('BackhandVolley',29),('Smash',26),('Serve',46),('Slice',27),('Lob',37)]:print(state,paths[state]['racket'][frame])
