"""Lossless compatibility checks, separate from visual acceptance."""
import hashlib
import json
import sys
from pathlib import Path
import numpy as np
from glb import GLB

ROOT = Path(__file__).resolve().parents[2]
OLD = ROOT / 'public/assets/characters/kira/Meshy_AI_Pink_Valkyrie_All_Animations.glb'
NEW = ROOT / 'public/assets/characters/kira/Kira_Midres_Rigged.glb'
a, b = GLB(OLD), GLB(NEW)
assert a.json['nodes'] == b.json['nodes']
assert a.json['skins'] == b.json['skins']
assert a.json['animations'] == b.json['animations']
assert a.json['scenes'] == b.json['scenes']
accessors = {a.json['skins'][0]['inverseBindMatrices']}
clips = []
for clip in a.json['animations']:
    for sampler in clip['samplers']:
        accessors.update([sampler['input'], sampler['output']])
    clips.append({'name': clip['name'], 'channels': len(clip['channels']),
                  'duration': max(float(a.array(s['input']).max()) for s in clip['samplers'])})
for i in accessors:
    assert a.json['accessors'][i] == b.json['accessors'][i]
    assert np.array_equal(a.array(i), b.array(i)), i
p = b.json['meshes'][0]['primitives'][0]
j, w = [b.array(p['attributes'][k]) for k in ['JOINTS_0', 'WEIGHTS_0']]
assert j.max() < len(b.json['skins'][0]['joints'])
assert np.isfinite(w).all() and (w >= 0).all()
assert np.allclose(w.sum(axis=1), 1, atol=1e-6)
report = {'skeleton_nodes': 'PASS', 'hierarchy': 'PASS', 'inverse_bind_matrices': 'PASS',
          'animation_samples_byte_identical': 'PASS', 'animation_accessors_checked': len(accessors),
          'normalized_four_influence_skin': 'PASS', 'output_bytes': NEW.stat().st_size,
          'output_sha256': hashlib.sha256(NEW.read_bytes()).hexdigest(), 'clips': clips}
if len(sys.argv) > 1:
    source = GLB(sys.argv[1])
    sp = source.json['meshes'][0]['primitives'][0]
    transfer = json.loads((ROOT / 'public/verification/kira-midres/transfer.json').read_text())
    original_positions = source.array(sp['attributes']['POSITION'])
    original_positions *= transfer['scale']
    original_positions[:, 1] += transfer['y_offset']
    assert np.array_equal(original_positions, b.array(p['attributes']['POSITION']))
    for key in ['NORMAL', 'TEXCOORD_0']:
        assert np.array_equal(source.array(sp['attributes'][key]), b.array(p['attributes'][key]))
    assert np.array_equal(source.array(sp['indices']), b.array(p['indices']))
    assert source.json['materials'] == b.json['materials']
    assert source.json['textures'] == b.json['textures']
    for si, bi in zip(source.json['images'], b.json['images']):
        def payload(g, i):
            v = g.json['bufferViews'][i['bufferView']]
            start = v.get('byteOffset', 0)
            return g.bin[start:start + v['byteLength']]
        assert payload(source, si) == payload(b, bi)
    report.update(source_geometry_after_uniform_normalization='PASS', source_normals_uvs_indices='PASS',
                  source_texture_bytes='PASS', source_pbr_materials='PASS')
(ROOT / 'public/verification/kira-midres/compatibility.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
