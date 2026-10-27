"""Build the local/static inspection index from completed, labelled captures."""
from pathlib import Path
from html import escape
from PIL import Image, ImageDraw
import json

root=Path(__file__).resolve().parents[2]/'public/verification/goal-009'
states=['Idle','Walk','Run','ShuffleLeft','ShuffleRight','Forehand','Backhand',
        'ForehandVolley','BackhandVolley','Slice','Lob','Smash','Serve']
characters=['kira','zuri','dante','rico','nova']
sections=[]
for name in characters:
    folder=root/'graphics'/name
    report=json.loads((folder/'poses.json').read_text())
    sheet=Image.new('RGB',(1200,780),'#20242a');draw=ImageDraw.Draw(sheet)
    for i,state in enumerate(states):
        image=Image.open(folder/f'{state}-grip.png').convert('RGB').resize((230,230))
        x,y=(i%5)*240,(i//5)*260
        sheet.paste(image,(x,y));draw.text((x+5,y+234),state,fill='white')
    sheet.save(folder/'grip-sheet.jpg',quality=90)
    links=' '.join(f'<a href="graphics/{name}/{s}-grip.png">{s}</a>' for s in states)
    body=' '.join(f'<a href="graphics/{name}/{s}-body.png">{s} body</a>' for s in ['Idle','Forehand','Backhand','Serve','Smash'])
    sections.append(f'<section><h2>{name.title()}</h2><p>{report["vertices"]:,} source vertices; {report["triangles"]:,} triangles. <a href="graphics/{name}/poses.json">Pose timing and transform evidence</a>.</p><a href="graphics/{name}/grip-sheet.jpg"><img src="graphics/{name}/grip-sheet.jpg" alt="{name.title()} controlled grip poses"></a><p>{links}</p><p>{body} <a href="graphics/{name}/source-neutral.png">Source neutral</a></p></section>')
browser=[]
for name in characters:
    folder=root/'runtime'
    if not all((folder/f'{name}-{s}-grip.png').exists() for s in states):continue
    sheet=Image.new('RGB',(1200,1260),'#20242a');draw=ImageDraw.Draw(sheet)
    for i,state in enumerate(states):
        image=Image.open(folder/f'{name}-{state}-grip.png').convert('RGB')
        image.thumbnail((230,390));x,y=(i%5)*240,(i//5)*420
        sheet.paste(image,(x,y));draw.text((x+5,y+394),state,fill='white')
    sheet.save(folder/f'{name}-sheet.jpg',quality=90)
    browser.append(f'<a href="runtime/{name}-sheet.jpg"><img loading="lazy" src="runtime/{name}-sheet.jpg" alt="{name.title()} thirteen actual browser inspection poses"></a>')
for path in sorted((root/'runtime').glob('*.png')):
    browser.append(f'<a href="runtime/{escape(path.name)}"><img loading="lazy" src="runtime/{escape(path.name)}" alt="{escape(path.stem)}"></a>')
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Centre Court GOAL 009 evidence</title><style>body{max-width:1200px;margin:2rem auto;padding:0 1rem;font:17px/1.5 system-ui;background:#151a20;color:#e7edf5}a{color:#87d8ff;margin-right:.6rem}img{max-width:100%;height:auto}section{margin:3rem 0}.runtime{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem}.runtime img{width:100%}</style><h1>GOAL 009 character and equipment evidence</h1><p>Controlled Blender images evaluate original source clips with the production skin corrections. They are pose inspections, not browser gameplay captures. Runtime images below come from the actual game. Neither establishes physical iPhone validation.</p><p>The thirteen source states retain their existing timing and clips. Original Idle remains a source-reference capture; normal stationary play uses the existing volley preparation upper layer, with native locomotion legs (see the Zuri stationary-ready capture). World-space racket transform preservation is checked at preparation, contact and follow-through. Source neutral images use the original mesh, UVs, normals and material, at normalized scale.</p>'''+''.join(sections)+'<h2>Actual browser captures</h2><div class="runtime">'+''.join(browser)+'</div><p><a href="graphics/nova-source-comparison.json">Nova source comparison</a><a href="graphics/nova-shoulders.json">Nova shoulder measurements</a><a href="validation.json">Integrated validation record</a></p></html>'
(root/'index.html').write_text(html)
print('Evidence gallery and five contact sheets written')
