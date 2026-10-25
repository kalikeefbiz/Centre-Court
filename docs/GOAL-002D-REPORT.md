# GOAL 002D — Development diagnostics

Baseline: `dd3935aabfb46ab46c2395a0d8f6048f07eeb94d` (GOAL 002C). Engine: PlayCanvas. Next production milestone remains **GOAL 003 — Competitive AI**. No AI, stadium, broad animation polish, gameplay camera or production serve changes are included.

## Access and safety

Open **https://kalikeefbiz.github.io/Centre-Court/?dev=1** and tap **DEV · Tools**. Ordinary visits, `?dev=0`, and the existing read-only `?debug` QA mode do not load the developer panel. This is explicit opt-in diagnostic access, not authentication or a secret route.

The panel scrolls, respects safe areas and has native labels, focus indicators and large controls. Close it to uncover the game. Pointer events remain owned by the existing joystick/HIT elements; the performance overlay has no pointer hit area. Keyboard actions originating in the panel do not reach gameplay, while key releases still clear held gameplay keys.

**Inspect Kira animations** freezes the fixed-step match without changing its phase, score, ball, players or random state. It reuses the actual production Kira and attached production racket. **Return to normal gameplay** restores the saved model transforms, animation state/time and camera transforms without reloading. Normal browser interruptions still pause the match for safety. Pause/charge inputs are cleared when entering/exiting a frozen tool; a held shot is never released as a side effect.

Ball comparison references also freeze simulation. Select **Live gameplay** before playing again. Serve/near/far references move only the rendered Royal Rally mesh; they do not represent a gameplay event or alter the physics ball. The live and frozen-current options allow inspection of real serve preparation or rally frames.

## Production audit and implementation

| System            | Existing implementation and diagnostic integration                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle         | `src/main.ts`: creates Match, FixedClock, Scene and Input, drives simulation/render on PlayCanvas update. `Scene` starts one Application and one rendering camera. Dev UI is dynamically imported only for `dev=1`.                                                                                           |
| Kira              | `src/render/kira.ts`: production GLB, explicit `AnimComponent.update`, in-place horizontal root compensation, carry-wrist orientation and bounded live contact correction. Inspector uses the same instance; source shots are shown without live ball contact correction. It does not rewrite the controller. |
| Registry          | `src/render/animation-registry.ts`, documented in [GOAL 002C](GOAL-002C-ANIMATIONS.md). All 13 exact mappings and their estimated contact markers are retained.                                                                                                                                               |
| Ball              | `RoyalBall` normalizes the source diameter 0.952636 m to 0.067 m, then applies the selected multiplier at its parent. `src/core/ball.ts` and `COURT.radius = 0.0335` are unchanged. The imported red/lime textured model is retained.                                                                         |
| Cameras           | `src/core/camera.ts`: existing broadcast/behind modes and mobile framing. Diagnostics measure camera-space depth with the real FOV/viewport; the rig is unchanged. Four separate inspection views use the same camera and restore its transform afterward.                                                    |
| Input             | `src/platform/input.ts`: existing independent pointer capture, joystick and shot ownership, keyboard controls. No input-system rewrite. Developer controls are separate DOM siblings.                                                                                                                         |
| Loading           | Existing timeouts, rendered-Kira readiness gate, blocked match starts on missing assets, retry UI. Added timing/status/error ledger around the three existing container loads. Durations include fetch/decode/parse and are not pure network measurements. Late responses cannot erase timeout failures.      |
| Diagnostics/tests | Existing `?debug` read-only snapshots, offline `inspect.html`, asset/unit tests, Chromium/WebKit match and multitouch tests. Added bounded metrics, visible controls, JSON exports and targeted tests. No inspection dependency was added.                                                                    |

## Animation inspection

Available clips: Idle, Walk, Run, Shuffle left/right; Forehand groundstroke, Two-handed backhand, Forehand/backhand volley, Tennis serve, Overhead smash, Backhand slice and Defensive lob. Controls provide play/pause, restart, loop override, 0.25–2× speed, native PlayCanvas time seeking, elapsed/duration, estimated contact seek and front/side/rear/three-quarter views.

Optional guides show root, grip socket, calibrated racket sweet-spot region, forward direction, left hand and the sampled estimated contact position. The green region is a world-space guide, **not a collision shape**; pink markers and 30 fps contact-frame values are registry estimates, not embedded GLB events. Inspection selects complete source clips; production normally plays shortened contextual segments at its existing speed and blend. Inspection is not a claim that live transitions have been polished. A transition already in progress returns to its saved active state/time and pose; its previous blend history is not reconstructed.

Findings for GOAL 005:

- Native, time-confirmed in-place shuffle samples show low ankle markers spanning about 0.35 m (left shuffle) and 0.44 m (right shuffle) horizontally across the sampled cycle. This flags a plant/slide mismatch for closer review; these are spans across different samples, not a measured single planted-foot slip.
- Horizontal hips travel is canceled by the existing controller. Source walking/running/shuffle feet still move relative to that stationary root; planted-foot appearance and movement speed need review together in live gameplay. Root cancellation alone cannot guarantee no foot sliding.
- Full source hit clips have long preparations/recoveries. Switching full clips in the inspector cuts deliberately; production's existing 100 ms transitions and authoritative contact seeks can expose discontinuities. Do not interpret an inspector cut as a newly introduced production transition.
- The left-hand joint is approximately 0.184 m and 0.221 m from the right grip socket at backhand samples 0.8 s and 1.2 s. This does not prove two hands remain seated on the handle; review the grip through contact before any future hand correction.
- Carry-wrist orientation is retained for locomotion, while hit inspection shows the authored arm. The one right-hand grip socket cannot prove correct grip for every shot; verify two-hand backhand contact and frame orientation from the side/rear views.
- Volley, slice, lob and shuffle mappings retain GOAL 002C's medium confidence. The lob finish and slice handedness deserve owner review; no mappings were invented or changed.
- Contact timing is approximate. The serve's source sweet spot is materially below the existing gameplay serve origin; see feasibility study below. No missing event marker has been represented as an authored contact event.

Rendered samples and measured hand/feet/racket positions: [animation data](../public/verification/goal-002d/animation-samples.json). Use these to distinguish source motion from procedural live correction. This milestone records issues; it does not fix every pose or transition.

## Ball readability

Choose **Royal Rally visual scale**: 1.00×, 1.25×, 1.50× or 1.75×. Every visit starts at **1.00×**; presets are not persisted. They affect the normalized visible mesh only, including the developer serve prototype. Ball radius, launch, bounce, net, in/out, serve validity and scoring code are unchanged.

Compare both original cameras with **Freeze current rally / serve**, **Serve reference**, **Near court** and **Far court**. Reference heights/locations are fixed and labeled, making A/B screenshots reproducible. The overlay estimates projected diameter in **CSS pixels** and **render-buffer pixels**, using camera-space depth and actual FOV. This is an approximate sphere diameter, not a count of recognizable red/lime pixels; occlusion, motion blur, compression and antialiasing affect perception.

[Comparison measurements](../public/verification/goal-002d/ball-comparisons.json) and actual rendered captures below demonstrate size differences. At a few CSS pixels, a larger mesh can improve visibility without making the crown graphic reliably recognizable. A physical iPhone judgment is still required; no new default has been approved.

Measured projected diameters in the 390×844 CSS-pixel Chromium comparison captures (DPR 1; **not an iPhone hardware measurement**):

| Camera / reference |   1.00× |   1.50× |   1.75× |
| ------------------ | ------: | ------: | ------: |
| Broadcast / near   | 1.61 px | 2.41 px | 2.81 px |
| Broadcast / far    | 1.24 px | 1.87 px | 2.18 px |
| Behind / near      | 2.52 px | 3.77 px | 4.40 px |
| Behind / far       | 1.60 px | 2.39 px | 2.79 px |

These settled views indicate a framing/resolution constraint rather than an unnormalized mesh: measured mesh diameters are 0.067, 0.1005 and 0.11725 m, with the collision radius always 0.0335 m. The red felt remains a tiny colored mark; the lime crown is not reliably identifiable in these wide gameplay views, including 1.75×. Turn off the performance overlay for unobstructed visual comparisons. Keep 1.00× until the owner reviews actual iPhone play.

## Performance diagnostics and reproducible iPhone checks

Enable **Performance overlay** to see wall-clock current/rolling FPS, mean frame interval, standard deviation, p95/max, render dimensions, DPR/effective scale, active camera, phase, loaded assets, ready time and estimated ball diameter. GPU timing is explicitly unavailable. These values cannot distinguish a CPU bottleneck from a GPU bottleneck on their own.

Sampling stores at most 600 recent intervals; the UI refreshes at 4 Hz. **Record 10 seconds** saves a named scenario with frame summary and start/end context. Up to 50 records are retained in memory. Hidden-tab intervals are excluded and interruptions are counted; discard interrupted records. **Export JSON** downloads records plus loading details, build identity, device/browser and current context. Use Safari's download/share UI to retain the file. No telemetry is uploaded. Very high refresh rates may fill the 600-sample window before 10 seconds; exported sample counts reveal that limitation.

Use the deployed release on the **same physical iPhone**, Safari version, orientation, display refresh setting, thermal/power state and network. Record those conditions, cache state, viewport, render dimensions, scale and build SHA. Compare 60 fps / 16.67 ms and 30 fps / 33.33 ms as reference budgets, not measured guarantees. Run each scenario three times; distinguish cold loading from warm cache. Close the tool panel while playing and keep the small readout optional.

| Scenario                    | Repeatable check and values to retain                                                                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial loading             | Open a fresh `?dev=1` navigation with the chosen cache/network condition. After loading, export the asset start/duration/status and ready-from-navigation time; initial frame window is also visible. Ready time includes bootstrap and first rendered athlete. |
| Match initialization        | Select scenario before tapping Practice/Play. Start a record, close panel, start the match; retain max/p95 and verify the first serve becomes visible. The record includes menu→serve transition.                                                               |
| Serving                     | Start fresh Practice, select Serving, record, close panel, hold HIT about 0.6 s and release. Repeat from the same serve side/camera. Note contacts and any visible hitch.                                                                                       |
| Sustained rally             | In Practice, warm up, record a 10 s interval while returning balls with standard shots; record rally length and any missed shots so workloads can be compared. This is a controlled human procedure, not an automated iPhone benchmark.                         |
| Camera switching            | Record while switching broadcast→behind→broadcast at approximately 3 s intervals. Keep orientation and ball preset fixed.                                                                                                                                       |
| Animation inspection        | Enter inspector, choose Run loop at 1×, markers off, record; repeat with Serve loop and markers on as a separate capture.                                                                                                                                       |
| Ball visual-scale switching | Freeze the same near/far frame and camera, record while cycling 1→1.25→1.5→1.75 at 2 s intervals. Then compare actual live rally readability at each size.                                                                                                      |

Also test portrait/landscape, notch/home-indicator clearance, scroll/select/range controls, closing tools during simultaneous move+charge, touch cancellation, app background/resume, asset retry and Safari JSON downloads. Desktop Chromium and Linux WebKit runs are **not physical iPhone performance measurements**.

## Serve animation feasibility

The source contains animated `mixamorig:LeftHand`, fingers, right hand and hips. It has a recognizable left-arm lift followed by an overhead swing. Attachment can use a child socket on the left hand; the prototype samples a candidate local palm offset `(0, 0.04, 0.035)` m. This socket is diagnostic and still needs visual grip calibration.

In the inspector, choose **Tennis serve**, enable **Serve feasibility prototype**, restart at 0.25×, and inspect side/front views. The actual Royal Rally mesh follows the palm until 0.900 s, then follows gravity with launch velocity solved to intersect the source racket sweet spot at the existing estimated 1.533 s contact. A separate throwaway `Ball` supplies the post-contact launch calculation; timeline-based analytical display allows deterministic scrubbing. No ball position is teleported between release/contact phases, and no hand animation is modified. The live Match ball is never touched.

The toss is a **fitted feasibility path**, not measured authored release velocity or a calibrated production serve. The exported study includes candidate release/contact positions, fitted velocity and sampled hand velocity so those differences are reviewable. Native PlayCanvas samples put release at 1.578 m and contact at 2.175 m. The fitted upward release velocity is 4.049 m/s versus about 2.559 m/s sampled palm velocity: the fitted toss requires a release impulse and is not a claim of perfect source synchronization. Production serve preparation uses a 2.6 m ball origin, about 0.425 m higher than this source contact. Reusing this clip in production therefore needs explicit synchronization and asset/contact calibration; a convincing 2.6 m overhead contact may require extending the authored serve pose/reach. Do not solve that by teleporting the live ball or stretching the arm.

Minimum future work: calibrate a left-palm socket and finger/grip pose; confirm a release sample from multiple angles; author release/contact/recovery events; validate toss trajectory and contact height; decide whether to adjust the source serve extension. A future production pre-serve state would hold→release→toss→contact→recover and invoke the existing authoritative serve validation only at contact. That replacement is outside GOAL 002D and requires approval. Prototype evidence is a technical path, not a finished serve improvement.

## Visual evidence and validation

All images are captures of the rendered application, not mockups. Reproduce with `npm run build`, `npm run preview -- --port 4174`, then `node tools/diagnostics-evidence.mjs` (or set `CENTRE_COURT_URL`). Raw snapshots accompany the images.

- [Inspection interface](../public/verification/goal-002d/inspection.png) · [Mobile WebKit forehand](../public/verification/goal-002d/mobile-forehand.png) · [Mobile WebKit backhand](../public/verification/goal-002d/mobile-backhand.png) · [Mobile racket guide](../public/verification/goal-002d/mobile-racket-overlay.png)
- [Forehand](../public/verification/goal-002d/forehand-0.80.png) · [Backhand](../public/verification/goal-002d/backhand-0.80.png) · [Racket attachment overlay](../public/verification/goal-002d/racket-overlay.png)
- [Serve contact prototype](../public/verification/goal-002d/serve-contact.png)
- Behind-player, near court: [1.00×](../public/verification/goal-002d/ball-behind-near-1.png) · [1.50×](../public/verification/goal-002d/ball-behind-near-1.5.png) · [1.75×](../public/verification/goal-002d/ball-behind-near-1.75.png)
- Broadcast, far court: [1.00×](../public/verification/goal-002d/ball-broadcast-far-1.png) · [1.50×](../public/verification/goal-002d/ball-broadcast-far-1.5.png) · [1.75×](../public/verification/goal-002d/ball-broadcast-far-1.75.png)
- [Performance panel](../public/verification/goal-002d/performance.png) · [Active rally](../public/verification/goal-002d/active-rally.png) · [Normal gameplay without dev controls](../public/verification/goal-002d/normal-gameplay.png)

Validation: **49 unit tests passed** (45 existing plus four diagnostic tests); TypeScript/Vite production build passed. Across Chromium and WebKit, **33 browser checks passed**, with **three intentional WebKit skips** for CDP-only trusted multitouch injection. Existing Chromium trusted multitouch tests passed; WebKit covers pointer-event behavior. The final inspector checks were rerun after mobile select/readout changes. Asset failures were exercised for Kira, racket and ball in both engines. There are no invented physical-iPhone measurements.

Local WebKit required workspace-only system-library extraction; no project dependency was added. GitHub Actions installs browser dependencies through the existing workflow. An initial overlapping preview-server run and a noncanonical test range value (`0.900` versus browser-normalized `0.9`) were corrected before final verification.

Capture provenance: inspection images were taken from implementation build `4039a81`, ball comparisons from `e598c2a`, native time-confirmed bone samples from `5c82100`, performance from `3ff2203`, and mobile inspection from the final UI build. These commits are all in this milestone's history; the publication commit adds the report and evidence. `release.json` on the deployed site identifies the exact commit and unchanged asset revision. GitHub Pages deployment uses the existing verify→deploy workflow; no hosting architecture was changed.

## Required skill references — milestone only

Consulted the [awesome-gamedev-agent-skills index](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) at `184b72be02884f782a0058f2eeae2ce4277453e4`. Only these SKILL.md files were read; the collection was not installed:

| Guidance                                                                                                                                                                                      | Selective application / architecture boundary                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [performance-optimization](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/performance-optimization/SKILL.md) | Measure first; frame budgets, bounded interval collection, major-asset timing and reproducible deployed-device scenarios. No speculative batching, pooling or renderer rewrite without evidence. No invented GPU timing.                                                                         |
| [camera-systems](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/camera-systems/SKILL.md)                     | Evaluate framing/size from the actual post-camera-update view. Preserve existing smoothing and mobile camera behavior; new views apply only inside inspection. Engine-specific orbit/deadzone APIs are inapplicable.                                                                             |
| [input-systems](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/input-systems/SKILL.md)                       | Respect action/pointer ownership, discrete controls, cancellation and accessibility. Existing controls already abstract match input; introducing a new binding framework would conflict with this milestone's preservation requirement.                                                          |
| [game-ui-ux](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/game-ui-ux/SKILL.md)                             | Responsive safe-area panels, native focus/labels, touch targets, isolated screen flow. Controls use events; live diagnostic readouts are necessarily sampled at 4 Hz rather than rebuilding the game's existing HUD architecture.                                                                |
| [threejs-gltf-loading](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/web-engines/threejs-gltf-loading/SKILL.md)         | Conceptual only: inspect hierarchy, exact clip names/durations, transforms and loading errors; one animation owner per model. Translated to PlayCanvas ContainerResource, GraphNode, AnimComponent/AnimTrack and baseLayer seeking. No Three.js loader/mixer/API or other engine was introduced. |
