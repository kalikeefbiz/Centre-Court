# GOAL 008 assets

Run in repository root with Blender 4.3.2 and Python/NumPy:

```
blender -b --factory-startup --python tools/roster/retarget.py
# Download the unchanged source from the nova-hires-source Release to artifacts/goal-008/Nova_Source.glb.
blender -b --factory-startup --python tools/roster/nova-transfer.py -- artifacts/goal-008/Nova_Source.glb
blender -b --factory-startup --python tools/roster/nova-heat.py
blender -b --factory-startup --python tools/roster/inspect.py -- nova
# Repeat inspect.py for dante, rico, zuri.
gzip -n -c public/assets/characters/nova/Nova_Fullres_Rigged.glb > assets/characters/nova/Nova_Fullres_Rigged.glb.gz
node tools/roster/fetch-nova.mjs
```

`fetch-nova.mjs` reconstructs and hashes the exact full-detail runtime GLB.
The original Release source is untouched. Gzip is a lossless transport/archive
container, with no texture transcoding, geometry reduction or fidelity change.
Update the pinned SHA only after inspecting a deliberate skin/rig revision.
Native editable `.blend` files are saved in `artifacts/goal-008/`.

Dante/Rico/Zuri keep their complete original binary buffer, skins, materials,
meshes and two native locomotion clips. Only missing animation channels are
appended, remapped by Mixamo node name with local bind-frame rotation and
translation deltas. No animations or original character payloads are discarded.
Nova uses barycentric surface weights, anatomical arm/body search restrictions,
fitted distal-arm bind positions, then Blender bone-heat weights solved on a temporary 18 mm voxel proxy and
barycentrically transferred to the original full-detail mesh with normalized four influences.
The proxy is never exported. Fingers follow rigid palms; final individual finger
weights remain an artist refinement. Her triangles, UVs, normals and embedded images are retained.

Audio edits: `audio.py` uses verified public CC0 HQ previews, recorded URLs and
source files in `artifacts/goal-008/`; the shipped `assets/audio/sources.json`
records sample windows and changes. See the audio README for surface limitations.
