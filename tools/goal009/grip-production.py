"""Build sparse hand-skin/bind corrections without editing any source GLB.

Run with Python/NumPy/SciPy, then use graphics-validate.py in Blender. Patches
change only existing hand/finger bindings and the hand-vertex skin influences.
Positions, normals, UVs, topology, materials, image and clip bytes remain source.
"""
from pathlib import Path
import sys,json,hashlib,math
from functools import lru_cache
import numpy as np
from scipy.spatial.transform import Rotation
from scipy.optimize import least_squares
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tools/kira-midres'))
from glb import GLB
OUT=ROOT/'public/assets/characters/grips';OUT.mkdir(parents=True,exist_ok=True)
REPORT=ROOT/'public/verification/goal-009/graphics';REPORT.mkdir(parents=True,exist_ok=True)
FILES={'kira':'kira/Kira_Midres_Rigged.glb','nova':'nova/Nova_Fullres_Rigged.glb','dante':'dante/Dante_Tennis.glb','rico':'rico/Rico_Tennis.glb','zuri':'zuri/Zuri_Tennis.glb'}
# Measured source-hand vs inherited bind-frame corrections. Native rigs retain
# their exact palm bind. Kira and Nova need localized rigid bind translations.
FITS={'kira':{'translation':[.018,-.012,.080],'fingerScale':[1,1.03,1]},'nova':{'translation':[.065,.004,0],'fingerScale':[1,.70,.90]},'dante':{'translation':[0,0,0],'fingerScale':[1,1,1]},'rico':{'translation':[0,0,0],'fingerScale':[1,1,1]},'zuri':{'translation':[0,0,0],'fingerScale':[1,1,1]}}
def mat(n):
 m=np.eye(4);m[:3,:3]=Rotation.from_quat(n.get('rotation',[0,0,0,1])).as_matrix()@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m

def direction_rotation(a,b):
 a=np.array(a)/np.linalg.norm(a);b=np.array(b)/np.linalg.norm(b);v=np.cross(a,b);c=np.clip(a@b,-1,1)
 if c<-.999999:
  axis=np.cross(a,[1,0,0]);axis=axis if np.linalg.norm(axis)>.01 else np.cross(a,[0,0,1]);return Rotation.from_rotvec(axis/np.linalg.norm(axis)*math.pi).as_matrix()
 if np.linalg.norm(v)<1e-8:return np.eye(3)
 k=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]])
 return np.eye(3)+k+k@k/(1+c)

def finger_path(root,lengths,angles):
 a=np.cumsum(angles);dirs=np.c_[np.sin(a),np.cos(a)]
 points=np.vstack([root[:2],root[:2]+np.cumsum(dirs*np.array(lengths)[:,None],axis=0)])
 return np.c_[points,np.repeat(root[2],4)]

reports=[]
for character,relative in FILES.items():
 if len(sys.argv)>1 and character not in sys.argv[1:]:continue
 source=ROOT/'public/assets/characters'/relative;g=GLB(source);ns=g.json['nodes'];parents={c:i for i,n in enumerate(ns) for c in n.get('children',[])}
 @lru_cache(None)
 def world(i):return world(parents[i])@mat(ns[i]) if i in parents else mat(ns[i])
 worlds=[world(i) for i in range(len(ns))];fitworld=[m.copy() for m in worlds];names={n.get('name'):i for i,n in enumerate(ns)};skin=g.json['skins'][0];jn=[ns[i]['name'] for i in skin['joints']];ibm=g.array(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
 primitive=g.json['meshes'][0]['primitives'][0];positions=g.array(primitive['attributes']['POSITION']);ji=g.array(primitive['attributes']['JOINTS_0']);jw=g.array(primitive['attributes']['WEIGHTS_0']);records={};bones=[];bindings=[];finger_report=[]
 for side in ['Right','Left']:
  handname=f'mixamorig:{side}Hand';hi=names[handname];hand=worlds[hi];invhand=np.linalg.inv(hand);local=(invhand@np.c_[positions,np.ones(len(positions))].T).T[:,:3];fit=FITS[character];translation=np.array(fit['translation'])*np.array([1,1,1 if side=='Right' else -1]);correction=np.eye(4);correction[:3,3]=translation
  # Native left hand coordinates are mirrored about their palm-normal axis.
  handids=[i for i,n in enumerate(jn) if n.startswith(handname)];handweight=np.where(np.isin(ji,handids),jw,0).sum(1);mask=(handweight>.05)&(local[:,1]>(-.12 if character=='nova' else -.005))&(local[:,1]<.25)
  aligned=local+translation;all_chains=[]
  for finger in ['Index','Middle','Ring','Pinky','Thumb']:
   ids=[names[f'{handname}{finger}{k}'] for k in range(1,5)]
   bindpoints=np.array([(invhand@worlds[i])[:3,3] for i in ids]);bindpoints*=np.array(fit['fingerScale'])
   if finger=='Thumb' and character in ['dante','rico','zuri']:
    # Positive weights alone did not establish a valid native thumb pivot.
    # Fit the three phalanges to their actual weighted source surface, retaining
    # those native weights and preserving neutral geometry with inverse binds.
    centers=[]
    for ni in ids[:3]:
     j=jn.index(ns[ni]['name']);w=np.where(ji==j,jw,0).sum(1)
     centers.append((local*w[:,None]).sum(0)/w.sum())
    c1,c2,c3=np.array(centers)
    bindpoints=np.array([c1-.45*(c2-c1),(c1+c2)*.5,(c2+c3)*.5,c3+.45*(c3-c2)])
   # Preserve individual native joint rotations; fit only existing digit pivots.
   for i,p in zip(ids,bindpoints):fitworld[i][:3,3]=(hand@np.r_[p,1])[:3]
   lengths=np.linalg.norm(np.diff(bindpoints,axis=0),axis=1)
   root=bindpoints[0]
   if finger!='Thumb':
    target=np.array([-.008,.052])
    def residual(a):
     path=finger_path(root,lengths,a);samples=np.vstack([path[j,:2]*(1-t)+path[j+1,:2]*t for j in range(3) for t in [.2,.4,.6,.8,1]])
     radius=np.linalg.norm(samples-np.array([0,.065]),axis=1)
     return np.r_[(path[-1,:2]-target)*100, np.maximum(0,.014-radius)*80,(a-np.radians([100,85,55]))*.05]
    result=least_squares(residual,np.radians([100,85,55]),bounds=(np.radians([40,20,5]),np.radians([140,115,90])),max_nfev=45)
    posed=finger_path(root,lengths,result.x);angles=np.degrees(result.x).tolist()
   else:
    # A continuous opposed arc avoids the former endpoint-chasing thumb, whose
    # final phalanx could reverse direction and fold through the handle.
    theta=np.linspace(0,2*np.pi,145)[:-1]
    candidates=np.c_[.025*np.cos(theta),.065+.025*np.sin(theta)]
    distance=np.linalg.norm(candidates-root[:2],axis=1);length=float(sum(lengths))
    feasible=candidates[(distance<length*.85)&(distance>length*.25)]
    if not len(feasible):feasible=candidates
    target=feasible[np.argmin(np.linalg.norm(feasible-np.array([-.005,.087]),axis=1))]
    def residual(a):
     path=finger_path(root,lengths,a);samples=np.vstack([path[j,:2]*(1-t)+path[j+1,:2]*t for j in range(3) for t in [.25,.5,.75,1]])
     radius=np.linalg.norm(samples-np.array([0,.065]),axis=1)
     return np.r_[(path[-1,:2]-target)*100,np.maximum(0,.019-radius)*120,(a-np.radians([70,-95,-45]))*.025]
    results=[least_squares(residual,np.radians(seed),bounds=(np.radians([-110,-140,-110]),np.radians([130,80,40])),max_nfev=90) for seed in [[70,-95,-45],[100,-110,-70],[-45,60,-70]]]
    result=min(results,key=lambda fit:float(fit.fun@fit.fun))
    posed=finger_path(root,lengths,result.x);angles=np.degrees(result.x).tolist()
   target_rot={}
   for k,i in enumerate(ids):
    if k<3:
     before=bindpoints[k+1]-bindpoints[k];after=posed[k+1]-posed[k]
     localrot=(invhand@worlds[i])[:3,:3]
     target_rot[i]=hand[:3,:3]@direction_rotation(before,after)@localrot
    else:target_rot[i]=target_rot[ids[k-1]]@mat(ns[i])[:3,:3]
   for i in ids:
    parent=parents[i];localbind=np.linalg.inv(fitworld[parent])@fitworld[i];parentrot=target_rot[parent] if parent in target_rot else worlds[parent][:3,:3];q=Rotation.from_matrix(parentrot.T@target_rot[i]).as_quat()
    bones.append({'name':ns[i]['name'],'position':localbind[:3,3].round(9).tolist(),'rotation':q.round(9).tolist(),'restRotation':ns[i].get('rotation',[0,0,0,1])})
   # Fit the actual local-joint FK, not just directions in the source rest
   # frame. Native phalanx axes/roll differ across supplied rigs. The offline
   # solve is shared; runtime uses only the resulting fixed, inexpensive pose.
   segment=bones[-4:];start=[Rotation.from_quat(b['rotation']) for b in segment]
   def forward(delta):
    parent=np.eye(4);points=[]
    for k,b in enumerate(segment):
     q=(Rotation.from_rotvec(delta[k*3:k*3+3])*start[k]).as_quat() if k<3 else b['rotation']
     local=np.eye(4);local[:3,:3]=Rotation.from_quat(q).as_matrix()@np.diag(ns[ids[k]].get('scale',[1,1,1]));local[:3,3]=b['position'];parent=parent@local;points.append(parent[:3,3].copy())
    return np.array(points)
   def fit_residual(delta):return np.r_[(forward(delta)[1:]-posed[1:]).reshape(-1)*100,delta*.001]
   solved=least_squares(fit_residual,np.zeros(9),bounds=(-np.ones(9)*2,np.ones(9)*2),max_nfev=100,ftol=1e-10,xtol=1e-10,gtol=1e-10)
   for k in range(3):segment[k]['rotation']=(Rotation.from_rotvec(solved.x[k*3:k*3+3])*start[k]).as_quat().round(9).tolist()
   fk_error=float(np.linalg.norm(forward(solved.x)-posed,axis=1).max())
   if fk_error>.003:raise ValueError(f'{character} {side} {finger}: grip FK fit failed {fk_error}')
   all_chains.append((finger,ids,bindpoints))
   finger_report.append({'side':side,'finger':finger,'root':root.round(6).tolist(),'tip':posed[-1].round(6).tolist(),'jointFlexDegrees':angles,'tipHandleRadialM':float(np.linalg.norm(posed[-1,:2]-[0,.065])),'fkMaxJointErrorM':fk_error})
  # Keep original non-hand influences (forearm transition), distribute the hand
  # influence only to that anatomical digit. No nearest-thigh contamination.
  affected=np.where(mask)[0] if character in ['kira','nova'] else []
  chain_joint_ids=[[jn.index(ns[i]['name']) for i in ids] for _,ids,_ in all_chains]
  for vi in affected:
   p=aligned[vi];best=None
   for fi,(finger,ids,points) in enumerate(all_chains):
    delta=points[1:]-points[:-1];t=np.clip(((p-points[:-1])*delta).sum(1)/(delta*delta).sum(1),0,1);closest=points[:-1]+t[:,None]*delta;dist=np.linalg.norm(closest-p,axis=1)
    if finger!='Thumb' and p[1]<points[0,1]-.012:continue
    score=float(dist.min())
    if best is None or score<best[0]:best=(score,fi,dist,t)
   # Bad inherited non-hand weights must not pull glove webbing toward the arm
   # or torso. The wrist is the only transition: blend smoothly to this forearm.
   u=float(np.clip((local[vi,1]+(.08 if character=='nova' else .005))/(.12 if character=='nova' else .045),0,1));total=u*u*(3-2*u)
   forearm=jn.index(f'mixamorig:{side}ForeArm')
   influences={forearm:1-total} if total<1 else {}
   hand_joint=jn.index(handname)
   if best and best[0]<.030:
    _,fi,dist,t=best;finger,ids,points=all_chains[fi];rootgate=np.clip((p[1]-points[0,1]+.012)/.030,0,1) if finger!='Thumb' else np.clip((p[1]-points[0,1]+.006)/.025,0,1)
    gaussian=np.exp(-((dist-dist.min())/.010)**2);gaussian/=gaussian.sum();influences[hand_joint]=total*(1-rootgate)
    for j,w in zip(chain_joint_ids[fi][:3],gaussian):influences[j]=influences.get(j,0)+total*rootgate*float(w)
   else:influences[hand_joint]=total
   keep=sorted(influences.items(),key=lambda x:-x[1])[:4];total2=sum(w for _,w in keep);row=[int(vi),*[j for j,w in keep],*([0]*(4-len(keep))),*[round(w/total2,8) for j,w in keep],*([0]*(4-len(keep)))];records[int(vi)]=row
  for j in handids:
   ni=skin['joints'][j];common=worlds[ni]@ibm[j];new=np.linalg.inv(fitworld[ni])@hand@correction@invhand@common
   bindings.append({'name':jn[j],'matrix':new.T.reshape(-1).round(9).tolist()})
 payload={'version':1,'character':character,'vertexCount':len(positions),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'fit':fit,'handFrame':[0,math.sqrt(.5),0,math.sqrt(.5)],'bones':bones,'bindings':bindings if character in ['kira','nova'] else [b for b in bindings if 'HandThumb' in b['name']],'vertices':list(records.values())}
 prior=OUT/f'{character}.json'
 if character=='nova' and prior.exists():
  old=json.loads(prior.read_text())
  if old.get('sourceSha256')==payload['sourceSha256'] and old.get('shoulderVertices'):payload['shoulderVertices']=old['shoulderVertices']
 (OUT/f'{character}.json').write_text(json.dumps(payload,separators=(',',':')))
 report={'character':character,'vertexCount':len(positions),'patchedHandVertices':len(records),'sourceSha256':payload['sourceSha256'],'rightHandSourceInfluences':{n:float(np.where(ji==i,jw,0).sum()) for i,n in enumerate(jn) if 'RightHand' in n},'fit':fit,'fingers':finger_report,'preserved':['POSITION','NORMAL','TANGENT','TEXCOORD_0','indices','materials','images','animations','source GLB bytes']}
 reports.append(report);print(character,'PATCH',len(records),'vertices',flush=True)
audit=REPORT/'grip-bind-audit.json'
if len(sys.argv)>1 and audit.exists():
 previous=json.loads(audit.read_text());updated={r['character']:r for r in reports};reports=[updated.get(r['character'],r) for r in previous]
audit.write_text(json.dumps(reports,indent=2))
