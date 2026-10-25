# GOAL 004 — Stadium environment, court presentation & match atmosphere

Deployment: **https://kalikeefbiz.github.io/Centre-Court/**. [Rendered evidence gallery](https://kalikeefbiz.github.io/Centre-Court/verification/goal-004/). Baseline: `48c7e501ece1dd58cc8b2caf1fb38dfe41310e7c`. Implementation commit: `85998304ea55eb1128d3b2a9b69b8a0b7b6a58e1` (initial stadium `a37d797bf3d71106a48e2fbde6abf21f486f2d3e`) (full identity in the capture JSON and `release.json`). The delivery commit also includes this report and verification artifacts. `release.json` identifies the exact deployed delivery SHA; the environment code and capture provenance use the implementation SHA above. Next milestone: **GOAL 005 — Final Gameplay, Animation & Visual Polish**.

## Audit and preserved boundaries

Read GOAL 002D and GOAL 003 reports, inspected the deployed HTML/release and the matching local baseline, and retained the existing PlayCanvas Application, single rendering camera, fixed clock, Match, Input, Kira and RoyalBall architecture.

| System         | Baseline and GOAL 004 treatment                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Court          | 23.77 × 10.97 m doubles rectangle; singles width 8.23 m; service lines ±6.4 m; baselines ±11.885 m. Shared COURT constants now also drive rendered lines. Runoff is 20 × 36 m. Lines remain 0.05 m wide with original centre marks.                                                        |
| Net            | Baseline used an opaque dark panel behind cords. Replaced by actual open cord geometry, dark posts/footings, light tape and centre strap. Net height references remain 0.914/1.07 m; post centres remain ±5.03 m. Swept ball/net collision code is untouched.                              |
| Lighting       | Existing one directional light plus ambient fill and cheap ground shadows. Retained that inexpensive model; adjusted fill/key balance and blue-grey atmospheric depth. No stadium light casts a shadow map.                                                                                |
| Cameras        | Both original CameraRig modes and smoothing remain unchanged, including portrait framing. New diagnostic views operate on the rendering camera only while simulation is frozen; they do not replace gameplay cameras or save new rig positions.                                            |
| Players        | Production Pink Valkyrie Kira, all thirteen clips and separate attached racket retained byte-for-byte. GOAL 003 temporary procedural AI opponent retained. No new animation controller or smoothing/toss work.                                                                             |
| Ball           | Original Royal Rally GLB/materials retained. Owner-confirmed 1.50× readability preference becomes the visit default. DEV retains 1/1.25/1.5/1.75×. Collision radius remains 0.0335 m. Landing ring and six trail cues retained.                                                            |
| Assets         | Existing three local container loads, timeouts, readiness gate and retry UI preserved. Stadium meshes and tiny textures are built locally at boot; the asset ledger separately records `procedural:Crown-Pavilion` construction time. No asset service/CDN/runtime external request added. |
| UI/diagnostics | Existing menu, HUD, announcements, pause/results flow, multitouch ownership and bounded GOAL 002D recordings preserved. Pause adds crowd-detail and sound controls. Exports identify GOAL 004 and include venue/scoreboard/tier context.                                                   |
| Gameplay       | No modifications to `src/core/`, Input, character files, or competitive AI. No stadium collision components. Player limits (X ±6.7 m, end Z 15.3 m) remain inside the scenery perimeter.                                                                                                   |

## Original venue: Crown Pavilion

The architectural hierarchy is court → quiet runoff → low branded retaining barrier → lower bowl → cross-concourse → upper seating → thin cantilever wings. Twenty-four sections include eight lower side sections, eight upper side sections, four end sections and four angled corner sections. The corners soften the rectangular playing enclosure; two open end portals and independently framed roof wings establish an original identity without copying a tournament venue.

Rows rise 0.47 m on a 0.94 m pitch. Separate seat pans/backs, aisle gaps, half-rise stairs with visible nosings, stepped handrails, rear rails, dark retaining walls, vertical supports and roof beams establish human scale. Upper side seating reads as premium seating beneath the roof. End portals, courtside equipment and the scoreboard act as landmarks. Most detail is visible from the accepted gameplay cameras; the outside shell is deliberately simple.

| Material family      | Palette / intent                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Frame and barriers   | Graphite `#202c36`, steel edges `#465762`; low gloss and dark silhouettes frame the match.                     |
| Court / runoff       | Blue acrylic `#285f91`, quiet teal `#294f5c`; one cohesive hardcourt, no new surface physics.                  |
| Seating and concrete | Muted teal `#294852`, cool stair/concourse greys; alternating riser values create depth without a noisy court. |
| Brand accents        | Restrained lime `#b4cc61` and red `#b14e54` on roof lips, crown motif, equipment and signage. No neon/bloom.   |
| Markings and net     | Warm near-white painted boundaries/tape, thin dark opaque mesh cords with open holes.                          |

A deterministic 256² mipmapped repeating aggregate map creates very small acrylic value variation. It stays deliberately subtle at gameplay distance; matte response avoids specular glare. No noisy decals, large wear patches or additional court types were added. Court-to-concourse separation uses a dark plinth, continuous runoff and low capped barriers. Original Centre Court / Crown Pavilion / Royal Rally graphics are drawn into one 1024×128 local canvas texture. No commercial sponsor or tournament marks are present.

## Crowd, loading and quality

The crowd uses seeded occupancy, eight muted clothing colours, four skin tones, varied body heights and small placement offsets. Full detail bakes 3D seated figures into two spatially scattered meshes. Reduced detail uses a separate opaque silhouette mesh with rounded polygon heads, torsos and seated knees. Neither tier uses rigs, AI, individual spectator entities or per-spectator update loops. Seats and architecture are separately baked. Full detail uses four scenery mesh draws before culling. Reduced detail switches individual chairs to continuous row seating and 3D people to opaque, unlit, seated polygon silhouettes in two baked meshes. There is no alpha overdraw. The architecture, aisles, player/ball/court rendering and gameplay are retained.

**Full:** 1,180 spectators. **Reduced:** 645 spectators. Devices with fewer than 600 pixels on their shorter viewport side, or four or fewer reported CPU cores, start reduced. The pause-menu selector provides a manual override. Reducing crowd does not change court, characters, ball, camera, input or score. Both detail sets are built at boot, so reduced mode saves rendering rather than all construction memory. Approximate environmental allocation is 101,352 triangles at full detail and 22,980 at reduced detail across both crowd groups, seating and architecture; actual draw submission depends on tier/culling.

Distant spectators remain static. Full quality permits only a few millimetres of brief point-reaction displacement in the two scattered crowd groups at different frequencies/phases; reduced mode keeps them still. This is inexpensive grouped reaction, not individually animated applause or head-turn simulation. No synchronized continuous stadium wave is used. No automatic frame-time tier switching was added; the conservative startup tier and manual option avoid oscillation and misleading device detection.

## Lighting and courtside presentation

Controlled daylight uses ambient RGB `(0.48, 0.54, 0.59)` and one warm directional key at intensity 1.35 with the original orientation. The blue-grey clear/fog colour and 65–150 m linear depth range unify the far architecture. Structural normals and stepped tiers supply shape shading; existing cheap character/ball ground contact marks remain. Roof-edge light fixtures and four mast arrays are visible luminaires, not additional real-time lights. No postprocessing, screen-space effects, transparent crowd layers or shadow passes were added.

The court remains the brightest broad colour field, with white boundaries and light tape. Dark net mesh preserves visibility of the far player's feet. Courtside additions include the elevated umpire station/ladder, two player benches, equipment chests, ball containers, access portals, perimeter signs, modern lighting supports, the main portal-mounted display and a side score repeater. All equipment is outside the active movement envelope.

Both displays share a 1024×512 canvas texture repainted only when the displayed state changes. They read authoritative sets/games/point labels, serving side, deuce/advantage/tiebreak values, practice dashes, pause and winner state. They never generate demonstration scores. A lowered portal display keeps it in the stadium frame; the HUD remains the primary score source on small screens where physical signage cannot be read at full-court scale.

Quiet crowd atmosphere is synthesized locally using filtered noise. A user Play/Practice gesture unlocks Web Audio where supported. Short noise swells react to real point totals, with a longer response after an extended rally or match finish. Pause/menu/background silence the bed; pause offers a sound toggle. It is deliberately a simple murmur/applause-like texture, not a sampled human audience. No new impact sound or commentary system was added. Match initialization/serve/rally/point/result changes reach the stadium caption and brief crowd reaction without delaying gameplay or adding cinematics.

## Verification and actual performance

Validation: **77 unit tests passed**, strict TypeScript/Vite production build passed. Across Chromium and mobile WebKit, **43 applicable browser tests passed; 3 Chromium-CDP-only touch tests were skipped in WebKit**. The complete local run had one desktop multi-navigation timeout at 60 s; that unchanged gameplay flow passed when rerun with the 120 s software-renderer harness budget. A fixed 400 ms diagnostic animation-progress assertion was also changed to wait for observed frame progression. No gameplay assertions were removed. Linux Chromium uses SwiftShader software WebGL; Linux WebKit is an iPhone-sized browser emulation. **Neither is a physical iPhone test or GPU timing measurement.**

Performance procedure: serve the unmodified baseline separately on port 4175; use the final production build on 4173. `tools/stadium-performance.mjs` uses existing GOAL 002D diagnostics, three uninterrupted ten-second Serving records per version at 390×844, DPR 1, broadcast camera, 1.50× visual ball in both builds, tools closed, performance overlay on. The idle player serves and allows the normal AI reply. Keep captures sequential on this two-vCPU Linux host. Raw JSON includes samples, frame intervals, scenario context, tier, asset timings and build. This software renderer is too slow to establish mobile 30/60 fps acceptance.

| Browser / renderer     | Build / window       | Mean interval, ms | p95, ms |   FPS | End-window draw calls |
| ---------------------- | -------------------- | ----------------: | ------: | ----: | --------------------: |
| Chromium / SwiftShader | Baseline / 1         |            190.67 |  536.20 |  5.24 |                    29 |
| Chromium / SwiftShader | Baseline / 2         |            162.32 |  308.90 |  6.16 |                    31 |
| Chromium / SwiftShader | Baseline / 3         |            197.93 |  347.60 |  5.05 |                    29 |
| Chromium / SwiftShader | GOAL 004 reduced / 1 |            212.74 |  383.60 |  4.70 |                    33 |
| Chromium / SwiftShader | GOAL 004 reduced / 2 |            237.16 |  548.60 |  4.22 |                    33 |
| Chromium / SwiftShader | GOAL 004 reduced / 3 |            202.80 |  359.70 |  4.93 |                    33 |
| Linux WebKit           | Baseline / 1         |             36.15 |   47.00 | 27.66 |                    31 |
| Linux WebKit           | Baseline / 2         |             34.75 |   45.00 | 28.77 |                    31 |
| Linux WebKit           | Baseline / 3         |             36.89 |   48.00 | 27.11 |                    31 |
| Linux WebKit           | GOAL 004 reduced / 1 |            347.32 | 1162.00 |  2.88 |                    42 |
| Linux WebKit           | GOAL 004 reduced / 2 |             47.16 |   64.00 | 21.20 |                    35 |
| Linux WebKit           | GOAL 004 reduced / 3 |             47.94 |   63.00 | 20.86 |                    35 |

Raw records: [Chromium baseline](../public/verification/goal-004/performance-baseline.json), [Chromium final](../public/verification/goal-004/performance-goal004.json), [WebKit baseline](../public/verification/goal-004/performance-baseline-webkit.json), [WebKit final](../public/verification/goal-004/performance-goal004-webkit.json). All twelve records have zero interruptions. End-window calls vary with serve/rally/point-over state; they are not whole-window average draw counts.

The stadium costs more to render. Chromium's across-window mean is 217.56 ms versus 183.64 ms baseline, about 18.5% higher. WebKit's final warmed windows are 47.16/47.94 ms versus baseline 34.75/36.89 ms. The **first final WebKit record has a substantial 1,767 ms maximum hitch and a 347.32 ms mean**; this cold/early serving window is retained, not discarded. Warmed results do not erase first-entry risk. Frame intervals alone cannot identify GPU versus CPU/scheduling/shader-compilation cost, and WebKit's privacy renderer label `Apple GPU` is not evidence of Apple hardware on this Linux executor. Do not use these runs to claim iPhone 30/60 fps.

An initial reduced tier only lowered crowd population while retaining detailed seats and 3D figures. Its WebKit windows measured 146.35/93.20/74.94 ms ([raw pre-LOD records](../public/verification/goal-004/performance-before-lod-webkit.json)); that regression justified replacing reduced-tier geometry. The final tier submits **22,980 environmental triangles**, versus **101,352** in full detail, while preserving 645 spectators, architecture and the complete playing surface. Full detail keeps 1,180 3D figures and individual chairs. This is a measured geometry reduction and a useful warmed improvement, not a claim that hardware performance is certified. First-entry stutter, full-tier thermals and actual iPhone latency remain acceptance risks.

Observed ready-from-navigation values were 2,883/2,791 ms for baseline/final Chromium and 1,796/2,845 ms for baseline/final WebKit. These local-server observations include startup and first athlete rendering; they are not download-only timings or device-loading guarantees. The three local GLBs and procedural construction timings are retained in the raw JSON. The capture script waits for each distinct completed record rather than assuming the next render arrives within a fixed delay.

Automated coverage includes the unchanged seeded AI comparisons, scoring, continuous ball/net/floor collision tests, serving, shared contact gates, production asset hashes, all animation mappings, both cameras, independent touch ownership/cancellation, diagnostic inspection/export and load failures. Stadium-specific checks add finite outward-wound baked geometry, exact rendered court scales/line count/net posts, local readiness ledger, zero scenery colliders, quality density, player/court projections, actual point-to-scoreboard continuation, mute and inspection restoration. Browser screenshots remain necessary evidence separate from these assertions.

## Actual rendered evidence

All images below are captures of the playable application. Stadium detail views use the explicitly labeled shipped DEV inspection, freezing the same scene and existing match; they are not concept art. The normal gameplay capture has no developer tools loaded. Full provenance/state accompanies the images in [browser-evidence.json](../public/verification/goal-004/browser-evidence.json).

- [Full stadium overview](../public/verification/goal-004/overview.png)
- [Behind-player gameplay / lighting](../public/verification/goal-004/behind-player-gameplay.png)
- [Broadcast gameplay / lighting](../public/verification/goal-004/broadcast-gameplay.png)
- [Court surface and open net](../public/verification/goal-004/net.png)
- [Seating architecture and crowd](../public/verification/goal-004/seating.png)
- [Scoreboard](../public/verification/goal-004/scoreboard.png)
- [Benches and courtside equipment](../public/verification/goal-004/courtside.png)
- [Portrait behind](../public/verification/goal-004/mobile-behind.png) / [portrait broadcast](../public/verification/goal-004/mobile-broadcast.png)
- [Normal gameplay without developer tools](../public/verification/goal-004/normal-gameplay.png)

[Actual match-flow observations](../public/verification/goal-004/match-flow.json) record **four contacts**: native keyboard serve, competitive Hard AI return, human rally return, another AI return, a scored opponent point, the stadium display updating to **0–15**, and the next serve. The QA driver positions the human using read-only observations and ordinary key events, then allows the point to resolve. It does not inject a feed, edit a score, teleport a player/ball or change physics. [Continuation capture](../public/verification/goal-004/match-continuation.png). Both Chromium and mobile WebKit browser tests independently verify serve → AI reply → point → synchronized display → next serve.

The initial independent [GitHub verification/deployment run](https://github.com/kalikeefbiz/Centre-Court/actions/runs/40174051679) succeeded. The final delivery triggers the same complete workflow for the final geometry tier and evidence bundle. After it succeeds, verify `release.json` and render the published response bytes using `CC_OUTPUT_DIR=/tmp/centre-court-live node tools/stadium-live.mjs`. The live verifier retains TLS validation through the managed HTTP proxy; it does not disable certificate verification. Deployment identity can be checked independently of screenshots.

## Limitations and physical iPhone acceptance

This is a procedural, stylized professional venue rather than a scanned stadium. Spectators are intentionally simplified, the exterior is economical, and shadows are contact approximations rather than cast roof/athlete shadows. Crowd sound is synthesized noise rather than licensed recordings. Full crowd density and construction memory still need device profiling. No GPU timings or physical iPhone performance claim is made.

The accepted behind-player portrait camera still crops outer doubles-alley edges, and the existing touch overlays can cover lower-court content at wide positions. These were not redesigned in an environment milestone. Both camera paths remain clear of new roofs, barriers and seating. The existing serve-origin/source-animation mismatch and movement/animation polish findings remain GOAL 005 work. The ball's final texture redesign is not included.

On the same physical iPhone/Safari version, test portrait/landscape, both cameras, wide movement, rallies and 1.50× ball readability. Compare reduced/full tiers, background/resume and audio gesture/mute behavior. Confirm simultaneous move/charge/aim and safe-area clearance. Capture three uninterrupted ten-second GOAL 002D exports per scenario, recording device model, iOS, refresh/power/thermal state, cache, viewport/render scale, tier and build. Check actual scoreboard progression through deuce, game/set and match end. See [iPhone checklist](IPHONE-CHECKLIST.md).

## References actually consulted

Read selected files from `gamedev-skills/awesome-gamedev-agent-skills` at `184b72be02884f782a0058f2eeae2ce4277453e4`; did not install the library. Cross-engine concepts were translated into the existing PlayCanvas renderer.

| Reference                                                                                                                                                                                     | Application                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Level design](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/level-design/SKILL.md)                         | Derive art from actual playing metrics; protect the accepted camera/movement envelope; establish court-to-bowl hierarchy and clear entry landmarks.                                      |
| [Materials / lighting](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/web-engines/threejs-materials-lighting/SKILL.md)   | Matte lit architecture, unlit screen graphics, soft fill plus directional key, few lights/shadows; verify in the actual scene. No three.js runtime imported.                             |
| [Camera systems](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/camera-systems/SKILL.md)                     | Design scenery around follow/framing constraints, preserve original frame-independent smoothing, inspect both modes and aspect ratios.                                                   |
| [Game UI/UX](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/game-ui-ux/SKILL.md)                             | Native labeled pause settings, preserve safe-area HUD/controls, repaint the diegetic score only on displayed-state changes. No general UI-system rewrite.                                |
| [Performance optimization](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/performance-optimization/SKILL.md) | Record baseline/final, bake repeated geometry, share small textures, keep the crowd out of per-person update loops, and separate software-browser measurements from GPU/device evidence. |
