"""Small, lossless GLB reader/writer used by the Blender transfer and audit."""
import copy
import json
import struct
from pathlib import Path

import numpy as np

DTYPES = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


class GLB:
    def __init__(self, path):
        data = Path(path).read_bytes()
        assert data[:4] == b'glTF' and struct.unpack_from('<I', data, 4)[0] == 2
        assert struct.unpack_from('<I', data, 8)[0] == len(data)
        size = struct.unpack_from('<I', data, 12)[0]
        self.json = json.loads(data[20:20 + size])
        self.bin = bytearray(data[28 + size:])

    def array(self, index):
        a = self.json['accessors'][index]
        assert 'sparse' not in a
        v = self.json['bufferViews'][a['bufferView']]
        dtype = np.dtype(DTYPES[a['componentType']])
        width = WIDTHS[a['type']]
        return np.ndarray((a['count'], width), dtype=dtype, buffer=self.bin,
                          offset=v.get('byteOffset', 0) + a.get('byteOffset', 0),
                          strides=(v.get('byteStride', width * dtype.itemsize), dtype.itemsize)).copy()

    def append_view(self, data, target=None):
        self.bin.extend(b'\0' * (-len(self.bin) % 4))
        view = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target:
            view['target'] = target
        index = len(self.json['bufferViews'])
        self.json['bufferViews'].append(view)
        self.bin.extend(data)
        return index

    def append_array(self, array, component, kind, bounds=False, target=34962):
        array = np.asarray(array, dtype=DTYPES[component])
        a = {'bufferView': self.append_view(array.tobytes(), target),
             'componentType': component, 'count': len(array), 'type': kind}
        if bounds:
            a.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        self.json['accessors'].append(a)
        return len(self.json['accessors']) - 1

    def save(self, path):
        self.bin.extend(b'\0' * (-len(self.bin) % 4))
        self.json['buffers'] = [{'byteLength': len(self.bin)}]
        js = json.dumps(self.json, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4)
        data = struct.pack('<4sII', b'glTF', 2, 28 + len(js) + len(self.bin))
        data += struct.pack('<I4s', len(js), b'JSON') + js
        data += struct.pack('<I4s', len(self.bin), b'BIN\0') + self.bin
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(data)


def graft(old, new, positions, joints, weights, output):
    """Retain original node indices, skin and all animation bytes; replace render mesh.

    Original geometry remains as unreferenced buffer data, avoiding accessor/index
    remapping in the protected animation library. New image and mesh payloads are
    copied verbatim except for uniform position normalization and new weights.
    """
    primitive = copy.deepcopy(new.json['meshes'][0]['primitives'][0])
    source = new.json['meshes'][0]['primitives'][0]
    for name, index in source['attributes'].items():
        a = new.json['accessors'][index]
        primitive['attributes'][name] = old.append_array(
            positions if name == 'POSITION' else new.array(index),
            a['componentType'], a['type'], name == 'POSITION')
    a = new.json['accessors'][source['indices']]
    primitive['indices'] = old.append_array(new.array(source['indices']), a['componentType'], 'SCALAR', target=34963)
    primitive['attributes']['JOINTS_0'] = old.append_array(joints, 5123, 'VEC4')
    primitive['attributes']['WEIGHTS_0'] = old.append_array(weights, 5126, 'VEC4')
    primitive['material'] = 0
    old.json['meshes'] = [{'name': 'Kira_Midres', 'primitives': [primitive]}]
    old.json['materials'] = copy.deepcopy(new.json['materials'])
    old.json['textures'] = copy.deepcopy(new.json['textures'])
    if 'samplers' in new.json:
        old.json['samplers'] = copy.deepcopy(new.json['samplers'])
    images = []
    for image in new.json['images']:
        v = new.json['bufferViews'][image['bufferView']]
        start = v.get('byteOffset', 0)
        image = copy.deepcopy(image)
        image['bufferView'] = old.append_view(new.bin[start:start + v['byteLength']])
        images.append(image)
    old.json['images'] = images
    old.json['asset']['generator'] = 'Centre Court / Blender 4.3.2 surface weight transfer; lossless rig graft'
    old.save(output)
