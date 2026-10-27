# GOAL 009 — roster grip and cosmetic equipment

Baseline: `f7fdda3e75a1d93b053da2e5ad941618547793da` (GOAL 008).

## Character production

The shared hand layer fits all five supplied playable rigs. Kira and Nova receive
sparse hand/wrist weights and bind corrections (2,115 and 4,157 vertices); native Dante,
Rico and Zuri keep their vertex weights and receive calibrated thumb pivots/binds.
Every athlete has individual finger targets, fitted by offline constrained FK.
Runtime uses the resulting poses, preserves animated wrists, and restores the
non-dominant hand when a supported backhand no longer reaches the handle.

The paired hand/socket frames preserve the full world-space racket transform.
Finger posing follows arm contact correction; no Match, physics, registry marker,
contact envelope, original GLB, source animation track or original texture changes.
All thirteen source states are rendered for each athlete; 145 preparation/contact/follow-through samples preserve the socket head within 4.6e-16 m. Those are source-pose/matrix checks, separate from live match CCD.

Nova retains 138,224 vertices and 102,942 triangles. Source/runtime normalization
has zero positional residual; normals, UVs, indices, materials and all three
embedded images are identical. Her 1,880-vertex localized shoulder-weight smoothing
reduces matched edge extension (serve worst: 11.1 cm to 6.3 cm), without simplifying
geometry. Extreme armpit/hair/clothing intersections remain a visual limitation.

## Equipment and presentation

One distinct supplied Pink / Black racket ships. The UI states this honestly.
Definitions contain path, grip origin, axes, sweet spot, scale and material policy;
new verified GLBs can be catalog data. Canonical socket head remains(0,.4384,0)m.
Independent equipment replacement preserves the character/animation instance,
cleans failed/stale loads, and treats reselection as a no-op.

Equipment selection and hand/full-athlete preview use the actual selected model.
Per-athlete choices persist in `centre-court-equipment-v1`, independently of the
existing circuit save. Inspection reuses the existing ForehandVolley preparation pose to keep the hand clear of clothing; source clips and authoritative match behavior remain unchanged. Inspection alone uses a restrained unshadowed fill and
PBR Neutral tone mapping; match composition, lighting and resolution budgets stay
at the established baseline. Required assets still gate actual visible readiness.

## Reproduction and evidence

Use `tools/goal009/grip-production.py`, `nova-shoulders.py`, `pose-data.py`, then
Blender 4.3.2 with `roster-validate.py -- <athlete>`. These require the existing
Python/NumPy/SciPy authoring environment. Source GLBs are unchanged. Ordinary
packed Blender checkpoints and earlier diagnostic iterations are preserved in
`artifacts/goal-009/graphics/`. Inspection surfaces evaluate the exact runtime
linear blend rather than assuming native glTF reimport preserves non-rest binds.

Final controlled renders/data are under `public/verification/goal-009/graphics/`.
Blender pose evidence, actual browser screenshots and physical device checks must
be distinguished. Physical iPhone Safari/thermal/driver GPU validation is NOT_CHECKED.

## Execution and verification

Saved Gameplay, Graphics, Performance and QA profiles ran initially; the existing
fifth audit agent supplied independent lifecycle/contact reviews. Their work was
preserved. Following the founder's final instruction, completion is single-agent;
no specialist was resumed or spawned. No new service, economy, scheduled job or
deployment workflow is added. Jax remains unavailable with his profile preserved.

Equipment: 9 targeted tests passed before final integration. Earlier local grip
checks timed out under concurrent rendering, rather than failing value assertions.
Final controlled image review and all five ordinary packed Blender checkpoint reopen checks passed. The final isolated equipment/grip run passes 18 tests, including rejection of inactive render skins. Initial contention-related timeouts are retained in local logs; the full-detail archive provenance test now has a bounded 30-second I/O allowance with unchanged assertions. The final CI/browser and runtime measurements are recorded below when available.


## Roster result

| Athlete | Localized corrections | Controlled pose result |
| --- | --- | --- |
| Kira | 2,115 hand vertices; repaired missing influences, fitted digit binds and opposed thumb | Thirteen held-grip poses reviewed; source wrist/clip tracks retained |
| Zuri | Native vertex weights retained; thumb pivots/binds and individual digit pose | Thirteen poses reviewed; bulky-clothing idle occlusion avoided in cosmetic preview |
| Dante | Native vertex weights retained; thumb pivots/binds and individual digit pose | Thirteen poses reviewed; preview uses existing volley pose for clear hand presentation |
| Rico | Native vertex weights retained; thumb pivots/binds and individual digit pose | Thirteen poses reviewed with stable palm/handle alignment |
| Nova | 4,157 hand/wrist vertices and fitted binds; 1,880 shoulder vertices | Thirteen revised poses reviewed; wrist seam removed; extreme shoulder/clothing limits remain |

The algorithm calibrates existing joints/weights offline, applies small versioned
runtime patches, and inspects the exact resulting LBS surface in Blender 4.3.2.
This is not a claim of manually repainted Blender actions or a replacement rig.
The packed checkpoints retain the source editable armature, all 13 actions,
textures, exact inspection surface, and embedded calibration/provenance text.
The non-dominant hand closes only when supported source backhands bring it close
to the handle; there is no permanent two-hand constraint or new hand IK.

## Actual agent participation

| Existing specialist | Preserved contribution |
| --- | --- |
| goal009_graphics | Initial rig/finger/bind findings and shared grip/Blender tooling |
| goal009_gameplay | Equipment definitions, persistence, UI and initial integration |
| goal009_performance | Bounded benchmark/probe scripts and verified rendering/source facts |
| goal009_qa | Equipment, skin and browser validation plan/tests |
| character_graphics_audit | Async roster/equipment lifecycle and secondary-hand review |

Genuine bounded specialist work occurred earlier in the GOAL. The founder's
single-agent continuation superseded that execution policy; the coordinator
completed roster weight/pose calibration, Nova corrections, integration and final
validation without resuming or spawning any specialist. Saved role definitions
remain on demand; they do not run continuously or create recurring usage.


## Integration defects resolved

Actual browser close-ups caught a calibration initialization defect that loading
and transform-only tests could not detect: PlayCanvas removes SkinInstances when
an entity is disabled. Initialization now hides render meshes without disabling
the rig, requires an active skin before calibration, and retains corrected mesh
skin metadata when render components are re-enabled. Runtime captures must show
`skinInstancesPatched > 0`; data counters alone do not establish visual success.

The initial full browser run at 397ee35 passed 64 cases, skipped the four existing
unsupported cases, and failed four assertions across the two browser projects.
Two failures were the diagnostic fixture's old asset count; it now still requires
exactly five GLB records and separately requires the two actual calibration JSONs.
Two exposed focus restoration before the menu became visible. Closing equipment
now renders the menu synchronously before returning focus, and its launcher is
explicitly focused on touch WebKit. Gameplay, contact and original control
assertions were retained. These corrections require the final release gate below.


## Final working-tree verification and performance

- 18 focused equipment/skin tests pass; TypeScript/Vite production build passes.
- 65 controlled Blender poses and65 actual Linux WebKit inspector poses cover all
 five athletes in all 13 supported states. Five packed Blender checkpoints reopen
 with source rigs, 13 actions, textures and embedded calibration/provenance.
- 145 source-pose matrix samples preserve the existing world racket head within
 4.6e-16 m. Existing eight-stroke browser contact checks and gameplay regressions
 remain part of the release gate; those matrices are not a live collision benchmark.
- Equipment preview/equip succeeds for every athlete, keeps each animation instance,
 restores focus and persists all five choices to the independent equipment save.
 One distinct supplied model is available; different-model swapping is supported
 by metadata/attachment contracts but cannot be visually accepted without another
 approved model. No synthetic cosmetic is offered to the player.
- Nova performs an actual equipped serve and enters a match against Rico. The
 preserved runtime JSON records the match, source hashes, equipment and resources.

The equipped-match eight-second software-WebKit diagnostic window contains only 6 intervals: median
930 ms, maximum/p95 3,576 ms. This small, slow software-rendering sample is not a
statistically reliable frame-stability result, an iPhone result, or a basis for
reducing source quality. Native animation evaluation at the final snapshot is 2 ms.
Engine-accounted scene texture allocation is 612,063,476 bytes with selected Nova
and 813,393,424 bytes with Nova plus the real Rico opponent. Vertex/index allocation
in that match is 17,471,684 / 2,138,424 bytes. These are engine counters, not measured
driver residency, total process memory or decoded-image memory. Texture counters
remain unchanged across equipment/source-pose inspection for each selected athlete;
no additional full-resolution athlete is loaded just for a preview. Earlier
setup/bug-diagnosis captures and measurements remain archived locally, not presented
as final performance acceptance. A matched final baseline throughput comparison,
physical iPhone Safari and sustained thermal/resource testing remain unavailable.

Source clips and their original timings remain intact. Improvements come from
functional finger influences, individual pivots/poses, stable hand/socket frames,
Nova's localized shoulder correction and clearer cosmetic presentation. There is
no claim of a newly authored set of 13 body motions or final artist-approved anatomy.
Extreme Nova forearm/shoulder surface artifacts and hair/clothing intersections
remain visible in some overhead poses; unsupported secondary-hand contact is not
forced. Jax remains unavailable.

The existing [verify/deploy workflow](https://github.com/kalikeefbiz/Centre-Court/actions/workflows/pages.yml)
is unchanged and runs the full unit/build/Chromium/WebKit checks for main before
publication. Final run status, exact commit and production checks are reported in
the delivery handoff; production identity is available in
[release.json](https://kalikeefbiz.github.io/Centre-Court/release.json).
The complete changed-file inventory is [GOAL-009-FILES.txt](GOAL-009-FILES.txt).
The [evidence gallery](https://kalikeefbiz.github.io/Centre-Court/verification/goal-009/)
distinguishes Blender, actual browser inspector poses and the actual match capture.


## Stationary ready posture

The actual source-idle captures expose clothing occlusion on Zuri and Dante.
The normal stationary renderer now reuses the existing ForehandVolley preparation
on the upper-body layer, with native locomotion legs. Motion, charging, serving
and real actions take precedence. Source clips and the inspector's original-idle
sample remain unchanged. The five-rig matrix check places each prepared hand
about 32 cm or more forward of its torso, rather than inside casual-idle clothing.
See `graphics/ready-pose.json` and the focused actual Zuri ready-state capture.
The 65 inspector captures precede only this stationary controller refinement;
their hand calibration and exact source-clip evaluation are unchanged.

The focused normal stationary Zuri browser check passes with native Locomotion
legs, no action and zero speed. The recorded match timing precedes this last
stationary-controller refinement; it establishes a rendered high-resolution
workload observation, not final frame-stability/device acceptance.
