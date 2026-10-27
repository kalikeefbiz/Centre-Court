"""Exact glTF linear-blend reference for bounded production-pose inspection.

Reads the existing registry and source GLBs; never rewrites source geometry.
Used by Blender visual checks and the localized skin-weight comparison.
"""
from pathlib import Path
from functools import lru_cache
import copy, json, re, sys
import numpy as np
from scipy.spatial.transform import Rotation

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/kira-midres'))
from glb import GLB

FILES = {'kira': 'kira/Kira_Midres_Rigged.glb', 'nova': 'nova/Nova_Fullres_Rigged.glb',
         'dante': 'dante/Dante_Tennis.glb', 'rico': 'rico/Rico_Tennis.glb', 'zuri': 'zuri/Zuri_Tennis.glb'}

def multiply(a, b):
    return (Rotation.from_quat(a) * Rotation.from_quat(b)).as_quat()

def trs(node):
    if 'matrix' in node:
        return np.array(node['matrix'], dtype=float).reshape(4, 4).T
    m = np.eye(4)
    m[:3, :3] = Rotation.from_quat(node.get('rotation', [0, 0, 0, 1])).as_matrix() @ np.diag(node.get('scale', [1, 1, 1]))
    m[:3, 3] = node.get('translation', [0, 0, 0])
    return m

def registry():
    text = (ROOT / 'src/render/animation-registry.ts').read_text()
    result = {}
    for state, clip, contact, prepare, end in re.findall(r"(\w+): action\('([^']+)', (\d+), (\d+), (\d+)", text):
        result[state] = {'clip': clip, 'contact': int(contact) / 30, 'prepare': int(prepare) / 30, 'end': int(end) / 30}
    for state, clip in re.findall(r"(Idle|Walk|Run|ShuffleLeft|ShuffleRight):\s*\{\s*clip: '([^']+)'", text):
        result[state] = {'clip': clip, 'time': {'Idle': .6, 'Walk': .3, 'Run': .25, 'ShuffleLeft': 1.8, 'ShuffleRight': 1.5}[state]}
    assert len(result) == 13, 'Registry changed: update the explicit visual inspection contract.'
    return result

class Rig:
    def __init__(self, character):
        self.character = character
        self.path = ROOT / 'public/assets/characters' / FILES[character]
        self.g = GLB(self.path)
        self.nodes = self.g.json['nodes']
        self.names = {n.get('name'): i for i, n in enumerate(self.nodes)}
        self.parents = {child: i for i, node in enumerate(self.nodes) for child in node.get('children', [])}
        self.skin = self.g.json['skins'][0]
        self.joints = self.skin['joints']
        self.jointnames = [self.nodes[i]['name'] for i in self.joints]
        self.primitive = self.g.json['meshes'][0]['primitives'][0]
        a = self.primitive['attributes']
        self.positions = self.g.array(a['POSITION'])
        self.normals = self.g.array(a['NORMAL'])
        self.indices = self.g.array(a['JOINTS_0']).astype(np.int32)
        self.weights = self.g.array(a['WEIGHTS_0']).astype(float)
        self.binds = self.g.array(self.skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
        self.faces = self.g.array(self.primitive['indices']).reshape(-1, 3)
        self.patch = json.loads((ROOT / f'public/assets/characters/grips/{character}.json').read_text())
        self.animations = {a['name']: a for a in self.g.json['animations']}
        self.contract = registry()
        self._arrays = {}

    def array(self, index):
        if index not in self._arrays:
            self._arrays[index] = self.g.array(index)
        return self._arrays[index]

    def worlds(self, nodes):
        @lru_cache(None)
        def world(i):
            m = trs(nodes[i])
            return world(self.parents[i]) @ m if i in self.parents else m
        return np.array([world(i) for i in range(len(nodes))])

    def pose(self, state='Idle', seconds=None, patched=True, carry=True):
        nodes = copy.deepcopy(self.nodes)
        definition = self.contract[state]
        seconds = definition.get('contact', definition.get('time', .5)) if seconds is None else seconds
        animation = self.animations[definition['clip']]
        for channel in animation['channels']:
            sampler = animation['samplers'][channel['sampler']]
            times = self.array(sampler['input']).reshape(-1)
            output = self.array(sampler['output'])
            i = int(np.clip(np.searchsorted(times, seconds, side='right') - 1, 0, len(times) - 1))
            j = min(i + 1, len(times) - 1)
            f = 0 if i == j else float(np.clip((seconds - times[i]) / max(1e-9, times[j] - times[i]), 0, 1))
            if sampler.get('interpolation', 'LINEAR') == 'STEP': f = 0
            if sampler.get('interpolation', 'LINEAR') not in ['LINEAR', 'STEP']:
                raise ValueError('Unsupported inspection interpolation; do not approximate silently.')
            path = channel['target']['path']
            a, b = output[i].astype(float), output[j].astype(float)
            if path == 'rotation':
                dot = float(a @ b)
                if dot < 0: b = -b; dot = -dot
                if dot < .9995:
                    theta = np.arccos(np.clip(dot, -1, 1))
                    value = (np.sin((1-f)*theta)*a + np.sin(f*theta)*b) / np.sin(theta)
                else: value = a * (1-f) + b * f
                value /= np.linalg.norm(value)
            else: value = a * (1-f) + b * f
            nodes[channel['target']['node']][path] = value.tolist()
        right = self.names['mixamorig:RightHand']
        if carry and 'contact' not in definition:
            nodes[right]['rotation'] = multiply(nodes[right].get('rotation', [0,0,0,1]), [0,1,0,0]).tolist()
        source_world = self.worlds(nodes)
        # Canonical reference remains independent of cosmetic corrections.
        socket = np.eye(4); socket[:3, :3] = Rotation.from_euler('z', 90, degrees=True).as_matrix(); socket[:3, 3] = [0,.065,0]
        equipment = source_world[right] @ socket
        if patched:
            nodes[right]['rotation'] = multiply(nodes[right].get('rotation', [0,0,0,1]), self.patch['handFrame']).tolist()
            left = self.names['mixamorig:LeftHand']
            secondary = state in ['Backhand','BackhandVolley'] and np.linalg.norm(source_world[left,:3,3] - equipment[:3,3]) < .13
            for bone in self.patch['bones']:
                node = nodes[self.names[bone['name']]]
                node['translation'] = bone['position']
                if 'RightHand' in bone['name'] or secondary: node['rotation'] = bone['rotation']
        else: secondary = False
        world = self.worlds(nodes)
        ji, jw, binds = self.indices.copy(), self.weights.copy(), self.binds.copy()
        if patched:
            for row in self.patch['vertices'] + self.patch.get('shoulderVertices', []):
                ji[row[0]], jw[row[0]] = row[1:5], row[5:9]
            for binding in self.patch['bindings']:
                binds[self.jointnames.index(binding['name'])] = np.array(binding['matrix']).reshape(4,4).T
        matrices = world[self.joints] @ binds
        homogeneous = np.c_[self.positions, np.ones(len(self.positions))]
        vertices, normals = np.zeros_like(self.positions, dtype=float), np.zeros_like(self.normals, dtype=float)
        for k in range(4):
            vertices += np.einsum('nij,nj->ni', matrices[ji[:,k]], homogeneous)[:,:3] * jw[:,k,None]
            normals += np.einsum('nij,nj->ni', matrices[ji[:,k],:3,:3], self.normals) * jw[:,k,None]
        normals /= np.maximum(np.linalg.norm(normals, axis=1)[:,None], 1e-12)
        assert np.isfinite(vertices).all() and np.isfinite(normals).all()
        geometry = np.eye(4); geometry[:3,:3] *= .72; geometry[:3,3] = [0,.28,0]
        return {'vertices':vertices, 'normals':normals, 'world':world, 'equipment':equipment @ geometry,
                'grip':equipment[:3,3], 'hand':source_world[right], 'seconds':seconds, 'secondary':secondary}
