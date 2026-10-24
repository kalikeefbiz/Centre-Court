from PIL import Image,ImageDraw
import json
from pathlib import Path
p=Path('artifacts/animation-inspection');audit=json.loads((p/'audit.json').read_text())
for start,end in [(0,7),(7,13)]:
 sheet=Image.new('RGB',(7*220,(end-start)*280),'#19252d');d=ImageDraw.Draw(sheet)
 for row,a in enumerate(audit[start:end]):
  for col,f in enumerate(a['frames']):
   im=Image.open(f['path']).resize((220,254));sheet.paste(im,(col*220,row*280+26));d.text((col*220+3,row*280+3),f"{a['i']}  {f['t']}s",fill='white')
 sheet.save(p/f'sheet-{start}.jpg')
