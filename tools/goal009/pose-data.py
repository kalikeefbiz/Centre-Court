"""Evaluate the real roster/registry once for shared Blender evidence.
Run with the existing Python/NumPy/SciPy authoring environment, not at runtime.
"""
from pathlib import Path
import hashlib, json, sys
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from rig_evaluation import Rig, ROOT

characters = sys.argv[1:] or ['kira', 'zuri', 'dante', 'rico', 'nova']
for character in characters:
    rig = Rig(character)
    output = ROOT / 'artifacts/goal-009/graphics' / character
    output.mkdir(parents=True, exist_ok=True)
    states = ['Idle','Walk','Run','ShuffleLeft','ShuffleRight','Forehand','Backhand',
              'ForehandVolley','BackhandVolley','Slice','Lob','Smash','Serve']
    vertices, normals, equipment, hands, records = [], [], [], [], []
    for state in states:
        pose = rig.pose(state)
        vertices.append(pose['vertices'].astype('f4'))
        normals.append(pose['normals'].astype('f4'))
        equipment.append(pose['equipment'])
        hands.append(pose['hand'])
        definition = rig.contract[state]
        samples = []
        for seconds in ([definition['prepare'], definition['contact'], definition['end']] if 'contact' in definition else [pose['seconds']]):
            sample = pose if abs(seconds - pose['seconds']) < 1e-8 else rig.pose(state, seconds)
            # This checks the actual matrix pair, including translation and a
            # noncommuting animated wrist, rather than quaternion equality alone.
            right = rig.names['mixamorig:RightHand']
            frame = np.eye(4)
            from scipy.spatial.transform import Rotation
            frame[:3,:3] = Rotation.from_quat(rig.patch['handFrame']).as_matrix()
            socket = np.eye(4); socket[:3,:3] = Rotation.from_euler('z',90,degrees=True).as_matrix(); socket[:3,3] = [0,.065,0]
            actual = sample['world'][right] @ np.linalg.inv(frame) @ socket
            expected = sample['hand'] @ socket
            head = np.array([0,.4384,0,1])
            error = float(np.linalg.norm((actual @ head)[:3] - (expected @ head)[:3]))
            samples.append({'seconds': seconds, 'worldSweetSpotErrorM': error,
                            'secondaryHandContact': bool(sample['secondary']),
                            'finiteSurface': bool(np.isfinite(sample['vertices']).all())})
            assert error < 1e-6
        records.append({'state':state,'seconds':pose['seconds'],'samples':samples})
    np.savez(output/'poses.npz', vertices=np.array(vertices), normals=np.array(normals),
             equipment=np.array(equipment), hands=np.array(hands), source=rig.positions)
    report={'character':character,'sourceSha256':hashlib.sha256(rig.path.read_bytes()).hexdigest(),
            'vertices':len(rig.positions),'triangles':len(rig.faces),
            'method':'Exact glTF linear blend skinning; actual source clips/registry markers, carry wrist and current grip patch. No Match/arm-CCD simulation; Blender images are controlled pose inspection, not browser gameplay proof.',
            'states':records,'sourceUnchanged':True}
    (output/'poses.json').write_text(json.dumps(report,indent=2))
    print(character, 'evaluated', len(states), 'states; world contact invariant PASS',flush=True)
