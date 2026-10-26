# Kira mid-resolution rig transfer

Status: PASS for rig transfer and tested PlayCanvas integration. All 43 executed
browser scenarios pass, including an isolated rerun of one graphics timeout.
The suite retains its three existing WebKit multitouch skips.

The replacement uses the existing 74-joint Valkyrie rig and all 13 original tennis
clips. No new animation system or gameplay retargeting layer was introduced.

## Sources and inspection

- Repository baseline: `3fe030c`.
- Original rig: `public/assets/characters/kira/Meshy_AI_Pink_Valkyrie_All_Animations.glb`.
- Registry: `src/render/animation-registry.ts`; exact semantic IDs, durations,
  preparation, contact and end frames are unchanged.
- [Unrigged release source](https://github.com/kalikeefbiz/Centre-Court/releases/tag/kira-midres-source):
  `Pink.Valkyrie_Meshy_AI_2026-10-25_b2abe2.glb`.
- Source SHA-256: `3a714caab749e548de5d34d2fb2d32c64972aad08947eaee31ff990b99912035`.
- Output: `public/assets/characters/kira/Kira_Midres_Rigged.glb`.
- Output SHA-256: `f55979d3991fc1a2647df1fc63be4751c91a743f7498d37726362ae3468fd2d9`.
- Blender 4.3.2 executed headless imports, weight editing, action sampling, renders,
  native save/reopen and clean delivery reimport.

The original mesh has 15,399 exported vertices and 13,296 triangles. The new mesh
has 46,890 exported vertices and 30,463 triangles. Their vertex order and topology
are different. The release has one mesh/material, three embedded PNG textures,
and no skin or animation. Its centered 1.899122 m height was normalized with scale
`0.8951505422592163` and glTF Y offset `0.8505586981773376` to the original 1.70 m
bind frame. Both face forward along glTF +Z (Blender -Y).

The existing A-pose skeleton fits the normalized shoulders, elbows, wrists,
pelvis, knees and ankles. Bone movement was unnecessary and would have disturbed
the absolute translation tracks and established racket calibration. Bind and pose
comparisons were made geometrically and visually, not by assuming topology
compatibility. See [neutral comparison](../public/verification/kira-midres/neutral-comparison.jpg).

## Transfer and preservation

Nearest-triangle barycentric interpolation transfers the original skin in the
common bind frame. Median correspondence distance is 6.2 mm; p90 is 21.9 mm, p99
64.6 mm and maximum 83.5 mm, primarily reflecting changed clothing/hair surfaces.
The initial raw transfer showed a discontinuous opposite-thigh split across skirt
pleats and abrupt finger-web influences. The final transfer uses a smooth skirt
midline partition and six inverse-edge-length relaxation half-steps across welded
topology, including UV seams. It retains and normalizes the strongest four weights.

Every vertex is weighted; maximum float weight-sum error is `1.19e-7`. Joint
indices for zero-weight slots are canonicalized to zero. Skinning remains standard
linear blend skinning supported by PlayCanvas.

The Blender script writes the textured GLB by grafting the replacement render
mesh into the original container. This avoids resampling or re-exporting the
animation library. Checks verify all original node transforms/hierarchy, skin,
inverse bind matrices and 1,938 referenced animation/bind accessors exactly.
Original clip names and animation samples are byte-identical. New source faces,
vertex positions after uniform normalization, normals, UVs, PBR material settings
and embedded texture bytes are also verified. No decimation or texture reduction
was used. Native Blender checkpoints have packed textures and editable groups.

The GLB is 63,532,244 bytes (60.59 MiB), compared with the old runtime asset's
11,837,468 bytes. Full source textures and protected original buffers account for
the larger download. This work prioritizes the requested asset fidelity; mobile
network loading and sustained physical-device performance need device acceptance.

## Animation and visual checks

Clean GLB reimport recognizes 74 bones, 13 actions and the full new mesh. A 30 Hz
sweep evaluates 1,213 source frames. All deformed coordinates are finite. The
largest edge stretch is lower than the original mesh in each clip; the worst
99th-percentile increase is 6.4%, within the explicitly chosen 8% comparison bound.
Edges below 1 mm are excluded from strain statistics to avoid unstable ratios.
These diagnostics complement the actual rendered views; they do not certify
absence of every possible self-intersection.

| Action          | Sampled frames | Original maximum edge stretch | New maximum edge stretch | Visual pose sheet                                                                 |
| --------------- | -------------: | ----------------------------: | -----------------------: | --------------------------------------------------------------------------------- |
| Idle            |            263 |                         3.168 |                    2.694 | [Locomotion](../public/verification/kira-midres/locomotion.jpg)                   |
| Walk            |             31 |                         6.511 |                    2.818 | Locomotion                                                                        |
| Run             |             19 |                         7.859 |                    2.957 | Locomotion                                                                        |
| Shuffle left    |             90 |                         6.099 |                    3.751 | [Lateral](../public/verification/kira-midres/lateral.jpg)                         |
| Shuffle right   |             90 |                         7.176 |                    3.811 | Lateral                                                                           |
| Forehand        |             90 |                         6.570 |                    4.801 | [Groundstrokes](../public/verification/kira-midres/groundstrokes.jpg)             |
| Backhand        |             90 |                         9.476 |                    4.188 | Groundstrokes                                                                     |
| Slice           |             90 |                         8.508 |                    4.677 | Groundstrokes                                                                     |
| Lob             |             90 |                         6.612 |                    5.106 | Groundstrokes                                                                     |
| Serve           |             90 |                         7.176 |                    5.862 | [Overheads and volleys](../public/verification/kira-midres/overheads-volleys.jpg) |
| Smash           |             90 |                         6.899 |                    6.322 | Overheads and volleys                                                             |
| Forehand volley |             90 |                         6.356 |                    3.940 | Overheads and volleys                                                             |
| Backhand volley |             90 |                         5.656 |                    3.766 | Overheads and volleys                                                             |

Four textured Blender samples per action cover preparation, contact/extension and
follow-through, plus locomotion phases. Review found no severe shoulder, elbow,
wrist, hip, knee or ankle collapse, detached accessories, or major skirt/hair
breakup in those views. The skirt remains a skinned shell and hair uses the
existing rig; neither has cloth simulation. Extreme intersections outside sampled
views remain possible. Source stylization, existing contact reach limitations and
gameplay locomotion speed are unchanged. Identical skeleton trajectories and root
cancellation preserve foot/racket timing; no new foot-lock system was added.

The largest measured local stretch occurs at the left underarm during the smash
at 1.367 s. A [matched close-up comparison](../public/verification/kira-midres/underarm-comparison.jpg)
was rendered from the original and replacement skins using the same rig, pose,
camera and lighting; the replacement retains a continuous shoulder/torso contour.
The editable checkpoint was reopened in a fresh Blender process with all six
original/reference and replacement texture images embedded; see the
[native reopen check](../public/verification/kira-midres/native-reopen.json).

## Integration and rollback

`KIRA.characterUrl` selects the new GLB; `KIRA.rollbackUrl` points to the immediately
previous Valkyrie. The earlier Rebel GLB also remains. Set `characterUrl` to the
rollback path and rebuild to revert. Vite now hashes the selected character for
cache revision. The standalone inspection tool uses the same model and socket
configuration as production.

No tennis mechanics, controls, AI, ball physics, camera, stadium, registry timing,
event mapping, arm correction or racket socket parameters were changed.

## Validation and evidence

- Baseline: all 77 tests and production build passed before changes.
- Updated automated suite: 79 tests passed; production build passed.
- Full Chromium and mobile WebKit run: 42 passed, 1 failed, 3 existing skips.
  The failure was the Chromium visual check's 15-second camera-convergence
  deadline while Blender was also rendering. It passed on an isolated rerun
  without a camera, gameplay, animation or GLB change: 43 distinct executed
  scenarios pass overall. The WebKit skips require Chromium CDP for trusted
  multitouch and were already present in the suite.
- Production screenshots and snapshots show the replacement textured skin and
  attached racket in [Chromium](../public/verification/kira-midres/production/chromium/)
  and [WebKit](../public/verification/kira-midres/production/webkit/), including
  both shipped cameras, forehand, backhand and serve inspection.
- A final [production pose sheet](../public/verification/kira-midres/production-poses.jpg)
  captures all 13 states using the existing inspector and racket. The
  [runtime samples](../public/verification/kira-midres/browser/samples.json) record
  zero page errors, a visible textured skin and attached racket in every state,
  and finite hand/foot markers. There are 17 PlayCanvas screenshots including
  four side views, in addition to the 52 Blender pose renders.
- Khronos glTF Validator: zero errors, two inherited warnings, untruncated report.
  The warnings concern runtime-generated tangent space and the original non-root
  skinned mesh. Unused-accessor informational messages are suppressed for both
  containers so they cannot truncate geometry/skin validation.
- Actual iPhone Safari hardware and sustained GPU performance: NOT_CHECKED.

Machine-readable reports: [transfer](../public/verification/kira-midres/transfer.json),
[byte compatibility](../public/verification/kira-midres/compatibility.json),
[full-frame deformation](../public/verification/kira-midres/deformation.json), and
[GLB validator](../public/verification/kira-midres/gltf-validator.json).

[Test results](../public/verification/kira-midres/test-results.json) retain the
initial timeout and isolated rerun explicitly. Full logs are saved alongside them:
[automated tests](../public/verification/kira-midres/unit-tests.txt),
[build](../public/verification/kira-midres/production-build.txt),
[browser suite](../public/verification/kira-midres/browser-full-suite.txt) and
[visual rerun](../public/verification/kira-midres/browser-visual-rerun.txt).
The final camera evidence was built from implementation commit `424f867` with
asset revision `6f39af91d1a2dbc3`; the larger first run carried the pre-commit build
label `3fe030c`.

Reproduce with [the transfer scripts and commands](../tools/kira-midres/README.md).
Editable checkpoint: `artifacts/kira-midres/kira-midres-transfer.blend`; clean
reimport/render checkpoint: `artifacts/kira-midres/validated-reimport.blend`.
The ignored `artifacts/` directory holds native checkpoints and full command logs;
the GLB, scripts, compact reports and visual sheets are committed deliverables.
