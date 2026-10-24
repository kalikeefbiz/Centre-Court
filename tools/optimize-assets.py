"""Repack embedded JPEG textures only; preserve every mesh, UV and animation byte."""
from pathlib import Path
from PIL import Image
import io,json,struct,hashlib
ROOT=Path(__file__).resolve().parents[1]
def optimize(relative,limit):
 source=ROOT/'assets'/relative;dest=ROOT/'public/assets'/relative
 raw=source.read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);binary=raw[28+n:];images={x['bufferView'] for x in g['images']};out=bytearray();sizes=[]
 for i,v in enumerate(g['bufferViews']):
  data=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
  if i in images:
   im=Image.open(io.BytesIO(data));before=im.size;im.thumbnail((limit,limit),Image.Resampling.LANCZOS);buf=io.BytesIO();im.save(buf,'JPEG',quality=90,subsampling=0,optimize=True);data=buf.getvalue();sizes.append({'from':before,'to':im.size})
  out.extend(b'\0'*(-len(out)%4));v['byteOffset']=len(out);v['byteLength']=len(data);out.extend(data)
 out.extend(b'\0'*(-len(out)%4));g['buffers'][0]['byteLength']=len(out);js=json.dumps(g,separators=(',',':')).encode();js+=b' '*(-len(js)%4)
 result=struct.pack('<III',0x46546c67,2,28+len(js)+len(out))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(out),0x004e4942)+out
 dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(result)
 return {'file':str(relative),'sourceBytes':len(raw),'runtimeBytes':len(result),'sourceSHA256':hashlib.sha256(raw).hexdigest(),'runtimeSHA256':hashlib.sha256(result).hexdigest(),'textures':sizes}
report=[optimize(Path('characters/kira/Meshy_AI_Pink_Valkyrie_All_Animations.glb'),1024),optimize(Path('balls/royal-rally/Meshy_AI_Royal_Rally_1024220842_texture.glb'),512)]
(ROOT/'docs/asset-optimization.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
