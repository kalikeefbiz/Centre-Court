# GOAL 009 — roster grip and cosmetic equipment

Baseline: `f7fdda3e75a1d93b053da2e5ad941618547793da` (GOAL 008).

## Character production

The shared hand layer fits all five supplied playable rigs. Kira and Nova receive
sparse hand weights/bind corrections (2,115 and 2,588 vertices); native Dante,
Rico and Zuri keep their vertex weights and receive calibrated thumb pivots/binds.
Every athlete has individual finger targets, fitted by offline constrained FK.
Runtime uses the resulting poses, preserves animated wrists, and restores the
non-dominant hand when a supported backhand no longer reaches the handle.

The paired hand/socket frames preserve the full world-space racket transform.
Finger posing follows arm contact correction; no Match, physics, registry marker,
contact envelope, original GLB, source animation track or original texture changes.
All thirteen source states and preparation/contact/follow-through are inspected.

Nova retains138,224 vertices and102,942 triangles. Source/runtime normalization
has zero positional residual; normals, UVs, indices, materials and all three
embedded images are identical. Her1,880-vertex localized shoulder-weight smoothing
reduces matched edge extension (serve worst:11.1cm to6.3cm), without simplifying
geometry. Extreme armpit/hair/clothing intersections remain a visual limitation.

## Equipment and presentation

One distinct supplied Pink / Black racket ships. The UI states this honestly.
Definitions contain path, grip origin, axes, sweet spot, scale and material policy;
new verified GLBs can be catalog data. Canonical socket head remains(0,.4384,0)m.
Independent equipment replacement preserves the character/animation instance,
cleans failed/stale loads, and treats reselection as a no-op.

Equipment selection and hand/full-athlete preview use the actual selected model.
Per-athlete choices persist in `centre-court-equipment-v1`, independently of the
existing circuit save. Inspection alone uses a restrained unshadowed fill and
PBR Neutral tone mapping; match composition, lighting and resolution budgets stay
at the established baseline. Required assets still gate actual visible readiness.

## Reproduction and evidence

Use `tools/goal009/grip-production.py`, `nova-shoulders.py`, `pose-data.py`, then
Blender4.3.2 with `roster-validate.py -- <athlete>`. These require the existing
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

Equipment:9 targeted tests passed before final integration. Earlier local grip
checks timed out under concurrent rendering, rather than failing value assertions.
Final isolated checks, roster image review and existing GitHub verification are
PENDING. This working report does not yet claim production acceptance.
