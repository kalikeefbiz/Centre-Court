# GOAL 009 Gameplay specialist handoff

Profile loaded: `.codex/agents/gameplay_engineer.toml`. Starting gameplay baseline:
`f7fdda3e75a1d93b053da2e5ad941618547793da`. Shared-file integration belongs to the lead.

## Implemented equipment modules

- `src/render/racket-equipment.ts`: one real supplied Pink / Black racket, with
  source asset path, grip reference, handle axis, face normal, sweet spot, source
  scale, material-preservation settings and optional per-character socket correction.
- `racketAttachment()` builds geometry-to-canonical-grip transforms. The current
  racket retains scale 0.72, Y translation 0.28 and local sweet spot Y 0.22.
  All defined cosmetics normalize onto the same socket-space `(0, 0.4384, 0)`
  sweet spot. Axis/scale/point validation rejects invalid attachment metadata.
- `EquipmentSelection`: separate `centre-court-equipment-v1` local save, keyed by
  athlete. Corrupt/stale data falls back to the shipped model. Missing/denied
  storage keeps the current visit usable and reports that persistence is unavailable.
  The Court Circuit save is neither migrated nor rewritten.
- `src/platform/equipment-ui.ts` and `equipment.css`: accessible selection dialog
  over the actual scene preview, with honest one-model availability, full-athlete
  and grip-detail framing hooks, preview/equip/back actions, focus containment,
  loading/failure feedback and persistence status.

The supplied production racket's GLB header contains one primitive, 2,080
triangles, and Y bounds ±0.475342 m. Only this distinct racket model was found;
no new meshes, recolour variants, motion data or commerce features were created.

## Integration contract

The lead integrates `AthleteRenderer.setEquipment(id)` and Scene/main hooks.
Same-racket equip must be idempotent: reuse the current container, character and
animation graph. A changed future racket loads only its own source. Invalid or
failed swaps must keep the established equipment until the replacement is ready.
Character & Graphics owns calibrated finger/hand posture and socket compensation.

Equipment metadata does not change `Match`, `stroke.ts`, `rig-motion.json`,
collision reach, hit timing, ball physics, signatures, heat or progression.
Per-character fitting and cosmetic geometry remain visual presentation. The
equipped raw sweet spot is the renderer's visual contact reference; the fixed
competitive envelope continues to come from the existing simulation.

## Verification and limits

QA owns persistence/catalog/transform tests and actual browser integration tests;
their results belong in the consolidated production report. TypeScript validation
is also required after the lead integrates the shared files. This specialist
does not claim visual grip acceptance, model-switch validation with a nonexistent
second racket, physical iPhone validation or a successful deployment.
