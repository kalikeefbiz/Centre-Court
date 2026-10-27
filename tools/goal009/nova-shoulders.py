"""One bounded shoulder-weight smoothing candidate; source detail is immutable.

Only accepts a localized candidate when matched source poses reduce the worst
shoulder edge extension without materially worsening the upper-tail extension.
Rendered shoulder inspection remains required; this is not artistic acceptance.
"""
from pathlib import Path
import sys,json
import numpy as np
from scipy.sparse import coo_matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
from rig_evaluation import Rig,ROOT
rig=Rig('nova');p=rig.positions;world=rig.worlds(rig.nodes)
centres=np.array([world[rig.names[f'mixamorig:{side}Arm'],:3,3] for side in ['Left','Right']])
mask=(np.linalg.norm(p[:,None,:]-centres[None,:,:],axis=2).min(1)<.17)&(np.abs(p[:,0])>.10)
faces=rig.faces;edges=np.unique(np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]),axis=1),axis=0)
selected=edges[mask[edges].all(1)]
rest=np.linalg.norm(p[selected[:,0]]-p[selected[:,1]],axis=1);selected=selected[rest>1e-5];rest=rest[rest>1e-5]
W=np.zeros((len(p),len(rig.joints)),dtype=np.float64)
for k in range(4):np.add.at(W,(np.arange(len(p)),rig.indices[:,k]),rig.weights[:,k])
rows=np.r_[edges[:,0],edges[:,1],np.arange(len(p))];cols=np.r_[edges[:,1],edges[:,0],np.arange(len(p))]
adj=coo_matrix((np.ones(len(rows)),(rows,cols)),shape=(len(p),len(p))).tocsr();degree=np.asarray(adj.sum(1)).reshape(-1,1)
original=W.copy()
for _ in range(3):W[mask]=.6*W[mask]+.4*(adj@W/degree)[mask]
top=np.argsort(W,axis=1)[:,-4:][:,::-1];weights=np.take_along_axis(W,top,axis=1);weights/=weights.sum(1)[:,None]
records=[[int(i),*top[i].tolist(),*weights[i].round(8).tolist()] for i in np.where(mask)[0]]
before=[];after=[]
patchfile=ROOT/'public/assets/characters/grips/nova.json';patch=json.loads(patchfile.read_text());rig.patch=patch
for state,seconds in [('Forehand',rig.contract['Forehand']['contact']),('Serve',rig.contract['Serve']['contact']),('Smash',40/30)]:
 rig.patch={**patch,'shoulderVertices':[]};a=rig.pose(state,seconds)['vertices']
 rig.patch={**patch,'shoulderVertices':records};b=rig.pose(state,seconds)['vertices']
 def metric(v):
  extension=np.maximum(0,np.linalg.norm(v[selected[:,0]]-v[selected[:,1]],axis=1)-rest)
  return {'maxExtensionM':float(extension.max()),'p95ExtensionM':float(np.quantile(extension,.95)),'p99ExtensionM':float(np.quantile(extension,.99))}
 before.append({'state':state,'seconds':seconds,**metric(a)});after.append({'state':state,'seconds':seconds,**metric(b)})
accepted=max(a['maxExtensionM'] for a in after)<.98*max(a['maxExtensionM'] for a in before) and all(a['p95ExtensionM']<=b['p95ExtensionM']*1.2+1e-4 for a,b in zip(after,before))
if accepted:patch['shoulderVertices']=records
else:patch.pop('shoulderVertices',None)
patchfile.write_text(json.dumps(patch,separators=(',',':')))
report={'scope':'Vertices within17cm of actual upper-arm roots, outside centre torso; three iterations of40% adjacent-weight smoothing, four normalized influences; no geometry/texture/clip edits.',
        'candidateVertices':len(records),'matchedShoulderEdges':len(selected),'acceptedNumerically':bool(accepted),'before':before,'after':after,
        'visualAcceptance':'REQUIRES_RENDERED_INSPECTION'}
(ROOT/'public/verification/goal-009/graphics/nova-shoulders.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2),flush=True)
