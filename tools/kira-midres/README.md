# Kira mid-resolution rig transfer

Uses Blender 4.3.2 and its bundled NumPy. Normal Python audit/sheet commands need
NumPy and Pillow respectively. Run commands from the repository root.

Source release: https://github.com/kalikeefbiz/Centre-Court/releases/tag/kira-midres-source

```sh
mkdir -p artifacts/kira-midres
curl --fail --location 'https://github.com/kalikeefbiz/Centre-Court/releases/download/kira-midres-source/Pink.Valkyrie_Meshy_AI_2026-10-25_b2abe2.glb' --output artifacts/kira-midres/source.glb
blender -b --factory-startup --python tools/kira-midres/transfer.py -- artifacts/kira-midres/source.glb
blender -b artifacts/kira-midres/kira-midres-transfer.blend --python tools/kira-midres/check-native.py
python tools/kira-midres/audit.py artifacts/kira-midres/source.glb
blender -b artifacts/kira-midres/kira-midres-transfer.blend --python tools/kira-midres/measure.py
blender -b --factory-startup --python tools/kira-midres/render.py
python tools/kira-midres/sheets.py
npm ci
npm test
npm run build
npm run test:browser
```

The transfer checks the release SHA-256 before use. It imports both assets,
normalizes the new mesh to the original 1.70 m bind frame, transfers weights with
nearest-triangle barycentric interpolation, repairs the skirt midline split,
relaxes weights on welded topology, and keeps the strongest four influences.
The rig already fits after uniform normalization; its bones do not need moving.

`glb.py` exports the full new geometry with its original normals, UVs, faces,
material settings and embedded texture payloads. It grafts these onto the original
GLB node hierarchy and skin. All original bone transforms, inverse bind matrices,
animation accessors and samples remain exact. Unreferenced original buffers are
retained to avoid remapping protected animation indices. This deliberately favors
compatibility over download-size optimization. There is no mesh simplification.

Outputs:

- `public/assets/characters/kira/Kira_Midres_Rigged.glb`: production asset.
- `artifacts/kira-midres/kira-midres-transfer.blend`: editable source; hidden original mesh, shared original armature, original actions, new vertex groups, packed textures.
- `artifacts/kira-midres/validated-reimport.blend`: independently reimported delivery GLB and render setup.
- `public/verification/kira-midres/`: transfer, byte-compatibility and deformation reports; pose sheets and browser evidence.

For production browser pose evidence, start `npm run preview -- --port 4173` and
run `CC_URL=http://127.0.0.1:4173/ node tools/kira-midres/browser-evidence.mjs`.
Optional `SOURCE_GLB` substitutes a local candidate through Playwright routing;
leave it unset for the integrated production asset. The actual shipped inspector
and racket are used. `EVIDENCE_DIR` selects a different output directory.
`QUICK=1` captures one principal pose per clip plus four side views; the Blender
sheets still contain four samples per clip.

Rollback: set `KIRA.characterUrl` to `KIRA.rollbackUrl` in
`src/render/athlete-config.ts`, then rebuild. The prior Valkyrie and earlier Rebel
assets are preserved. The build hashes the active character for cache revision.

The deformation sweep samples 1,213 source frames at 30 Hz. It compares edge
strain against the original skin, ignoring bind edges shorter than 1 mm. The
acceptance bounds require finite geometry, a maximum stretch no worse than the
original in each clip, and a 99th percentile no more than 8% above the original.
These are comparative diagnostics, not a substitute for rendered pose review.
