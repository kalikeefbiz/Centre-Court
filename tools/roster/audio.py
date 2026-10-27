"""Extract short transients from verified CC0 HQ previews; preserve provenance and edit times."""
from pathlib import Path
import wave,subprocess,json
import numpy as np
ROOT=Path(__file__).resolve().parents[2];out=ROOT/'public/assets/audio';out.mkdir(parents=True,exist_ok=True)
sources={'soft':'662269','hard':'662263','serve':'662265','bounce':'bounce','foot':'foot','squeak':'squeak'}
edits=[]
for category,source in sources.items():
 raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(ROOT/f'artifacts/goal-008/{source}.mp3'),'-f','f32le','-ac','1','-ar','24000','-'])
 x=np.frombuffer(raw,dtype='<f4'); rate=24000;window=120
 envelope=np.max(np.abs(x[:len(x)//window*window].reshape(-1,window)),axis=1)
 peaks=[]
 for idx in np.argsort(-envelope):
  if all(abs(idx-p)>120 for p in peaks):peaks.append(int(idx))
  if len(peaks)==3:break
 for i,idx in enumerate(sorted(peaks)):
  start=max(0,idx*window-480); length=int(rate*(.2 if category in ['foot','bounce'] else .32));clip=x[start:start+length].copy()
  clip*=.72/max(.001,np.max(np.abs(clip)));fade=min(240,len(clip)//2);clip[:48]*=np.linspace(0,1,48);clip[-fade:]*=np.linspace(1,0,fade)
  with wave.open(str(out/f'{category}-{i}.wav'),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes((np.clip(clip,-1,1)*32767).astype('<i2').tobytes())
  edits.append({'file':f'{category}-{i}.wav','source':source,'start_seconds':start/rate,'duration':len(clip)/rate,'edits':'mono 24kHz, transient cut, peak normalization -2.85dBFS, edge fades'})
(out/'sources.json').write_text(json.dumps({'sources':json.loads((ROOT/'artifacts/goal-008/audio-sources.json').read_text()),'edits':edits},indent=2))
