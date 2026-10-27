"""Compare original full-detail Nova to runtime data, excluding deliberate rigging."""
import sys,json,hashlib
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tools/kira-midres'));from glb import GLB
source=GLB(ROOT/'artifacts/goal-009/graphics/Nova_Source.glb');runtime=GLB(ROOT/'public/assets/characters/nova/Nova_Fullres_Rigged.glb');sp=source.json['meshes'][0]['primitives'][0];rp=runtime.json['meshes'][0]['primitives'][0];p=source.array(sp['attributes']['POSITION']);q=runtime.array(rp['attributes']['POSITION']);scale=np.ptp(q[:,1])/np.ptp(p[:,1]);offset=q[:,1].min()-p[:,1].min()*scale;expected=p*scale;expected[:,1]+=offset
report={'sourceSha256':hashlib.sha256((ROOT/'artifacts/goal-009/graphics/Nova_Source.glb').read_bytes()).hexdigest(),'sourceVertices':len(p),'runtimeVertices':len(q),'sourceTriangles':len(source.array(sp['indices']))//3,'runtimeTriangles':len(runtime.array(rp['indices']))//3,'normalizationScale':float(scale),'normalizationOffsetY':float(offset),'maximumPositionResidualM':float(np.abs(expected-q).max()),'indicesIdentical':bool(np.array_equal(source.array(sp['indices']),runtime.array(rp['indices']))),'normalsIdentical':bool(np.array_equal(source.array(sp['attributes']['NORMAL']),runtime.array(rp['attributes']['NORMAL']))),'uvIdentical':bool(np.array_equal(source.array(sp['attributes']['TEXCOORD_0']),runtime.array(rp['attributes']['TEXCOORD_0']))),'materialsIdentical':source.json['materials']==runtime.json['materials'],'images':[]}
for old,new in zip(source.json['images'],runtime.json['images']):
 def data(g,i):
  v=g.json['bufferViews'][i['bufferView']];start=v.get('byteOffset',0);return g.bin[start:start+v['byteLength']]
 a,b=data(source,old),data(runtime,new);report['images'].append({'bytes':len(a),'identical':a==b,'sha256':hashlib.sha256(a).hexdigest()})
out=ROOT/'public/verification/goal-009/graphics/nova-source-comparison.json';out.write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
