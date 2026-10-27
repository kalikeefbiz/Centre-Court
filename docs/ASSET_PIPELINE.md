> Historical architecture setup snapshot, before GOAL 008. For GOAL 009 use baseline `f7fdda3e75a1d93b053da2e5ad941618547793da`, `docs/GOAL-008.md`, and current source. The original report is retained as history.

# Character and asset pipeline

Inspection: 2026-10-27, [baseline commit](PROJECT_BASELINE.md). Repository files
were inspected directly, including read-only GLB JSON headers. Release attachment
facts below come from GitHub metadata; Nova's binary was not downloaded.

## Locations and current integration

Paths are relative to the repository unless explicitly a release URL.

| Character | Actual asset location | Format / download bytes | Integration |
| --- | --- | --- | --- |
| Kira active | `public/assets/characters/kira/Kira_Midres_Rigged.glb` | GLB 2.0 / 63,532,244 | Playable human selected by `src/render/athlete-config.ts` |
| Dante | `public/assets/characters/dante/dante_near_original_24mb.glb` | GLB 2.0 / 24,561,500 | Uploaded; no playable integration found |
| Rico | `public/assets/characters/rico/Meshy_AI_Crimson_Court_Champio_All_Animations.glb` | GLB 2.0 / 24,881,944 | Uploaded; no playable integration found |
| Zuri | `public/assets/characters/zuri/Meshy_AI_Emerald_Valkyrie_All_Animations.glb` | GLB 2.0 / 22,714,996 | Uploaded; no playable integration found |
| Nova | [nova-hires-source release attachment](https://github.com/kalikeefbiz/Centre-Court/releases/download/nova-hires-source/Meshy_AI_Golden_Voltage_1027041855_texture.glb) | Metadata: model/gltf-binary / 93,520,036 | Source release; repository folder contains README only; no integration found |

The opponent currently uses procedural temporary athlete geometry in `scene.ts`.
There is no implemented Dante/Rico/Zuri/Nova character selector or per-character
gameplay behavior. Folder READMEs explicitly distinguish upload from integration.

Preserved Kira variants include the rollback
`public/assets/characters/kira/Meshy_AI_Pink_Valkyrie_All_Animations.glb`, previous
Pink Rebel, root `assets/characters/kira/` source, and the
[kira-midres-source release](https://github.com/kalikeefbiz/Centre-Court/releases/tag/kira-midres-source)
attachment `Pink.Valkyrie_Meshy_AI_2026-10-25_b2abe2.glb` (50,569,964 bytes).
The two source releases are asset distributions, not proof of game-version acceptance.

The required racket is
`public/assets/equipment/rackets/Meshy_AI_Pink_and_Black_Tennis_1024095819_texture.glb`
(5,094,852 bytes). Royal Rally's runtime GLB is
`public/assets/balls/royal-rally/Meshy_AI_Royal_Rally_1024220842_texture.glb`
(246,488 bytes); a separate original exists under root `assets/balls/`.
These locations must not be merged or normalized without an authorized migration.

## Direct rig / animation findings

| Model | Skin joints | Actual embedded clips | Embedded images |
| --- | ---: | --- | --- |
| Kira active and rollback | 74 | 13 each | Active: 3 PNGs |
| Dante | 66 | `Running`, `Walking` only | 3 JPEGs |
| Rico | 66 | `Running`, `Walking` only | 3 JPEGs |
| Zuri | 72 | `Running`, `Walking` only | 3 JPEGs |
| Nova | Not inspected | Not inspected | Not inspected |

Inspected models have one mesh/primitive/material and no declared glTF extensions.
Names containing “All Animations” do not establish a full tennis clip library.
The current loader requires the 13-state Kira library.

Kira active/rollback have identical `nodes`, `skins` and `animations` JSON;
`tests/assets.test.ts` also verifies preserved animation/bind payloads. Existing
`tools/kira-midres/` transferred skin weights to replacement geometry while
retaining the original skeleton, inverse bind matrices and animation data. See
[the transfer report](KIRA-MIDRES-RIG-TRANSFER.md) and
[tool instructions](../tools/kira-midres/README.md) before reusing the process.

Dante/Rico share 66 named joints and their common-parent relationships with Kira;
Zuri shares 72. Their joint order and rest transforms differ; Kira has extra
accessory joints. Common `mixamorig:*` names support investigating reuse, not
declaring compatibility. Before new rigging, compare rest/bind transforms,
hierarchy, skin weights, scale, motion, root travel and racket attachment, then
validate deformation and contacts. Nova's rig remains an explicit unknown.

## Current PlayCanvas loading and animation

- `src/render/kira.ts` loads Kira and racket concurrently as PlayCanvas container
  assets. Paths resolve against Vite's base; the build hash is appended as a cache
  revision. Container loading has a 30-second deadline; this includes more than
  isolated network transfer.
- Initialization checks required clips/bones, textured skinned geometry and racket
  geometry, then actual camera visibility within another 15 seconds. `main.ts`
  keeps Play/Practice disabled until Kira and Royal Rally report ready; failed
  loads expose retry. Rollback references do not activate automatic fallback.
- `animation-registry.ts` maps semantic states to exact clip identifiers and
  contact markers. `tennis-animation.ts` builds the native locomotion blend and
  runtime-derived closed shuffle loops. Strokes use a masked upper-body layer
  and Match-provided clip time. Source tracks are retained.
- Root travel is canceled in presentation. Right-hand socket, calibrated scale,
  sampled rig paths and contact markers form the shared gameplay contract.
- `royal-ball.ts` loads the supplied ball separately. Visual scale and collision
  radius are distinct. Asset timings are recorded by existing diagnostics.

## Validation and preservation policy

Start with provenance and read-only format inspection. Use existing asset tests,
GLB/validator tooling, deformation/contact evidence and actual PlayCanvas loading
before claiming compatibility. GPU/device readiness needs its own measurements.
Preserve sources, supplied visual quality, texture/material design and licensing.
No arbitrary polygon or byte caps, automatic substitution, simplification or
unrequested re-rigging. Evaluate reuse first and optimize only measured costs.

Existing conversion scripts can rewrite binaries: run them only for an explicit
asset task with assigned output paths. The infrastructure GOAL executes none.
Historical 17.2 MB runtime totals and older 1024 px texture statements in
`LIMITATIONS.md`/older README sections describe earlier assets; they are not the
current Kira figures. See [PERFORMANCE](PERFORMANCE.md) for measurement limits.
