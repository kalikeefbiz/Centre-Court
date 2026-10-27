# GOAL 008 — Centre Court

Starting production commit: `152c72c0384a491b978769e084ba19f57bca1fb5`.
Production remains https://kalikeefbiz.github.io/Centre-Court/ .

## Integrated loop

Choose a real athlete preview and rival, or enter the four-rival Court Circuit.
Difficulty remains independent (Easy / Normal / Hard). Quick set and Standard,
practice, camera switching, pause and the existing HIT gestures remain available.
The circuit records actual match results once, persists version-1 saves locally,
advances only when the current rival is beaten, supports rematches and restart,
and recovers malformed/unavailable storage. No account or network service is needed.
Jax's progression position is reserved; unavailable models are excluded from play.

## Roster and rendering

| Athlete | Identity                               | Source                                                                                 | Runtime                                                                                                                                 |
| ------- | -------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Kira    | The Drifter · Speed / Counter          | `public/assets/characters/kira/Kira_Midres_Rigged.glb`                                 | Unchanged production mesh, materials, 74 joints, 13 clips and racket                                                                    |
| Dante   | The Grinder · Defensive Counter        | `public/assets/characters/dante/dante_near_original_24mb.glb`                          | `Dante_Tennis.glb`; original 66-joint skin and two native locomotion clips retained; eleven missing tennis/ready/lateral clips appended |
| Rico    | The Veteran · Tactical All-Court       | `public/assets/characters/rico/Meshy_AI_Crimson_Court_Champio_All_Animations.glb`      | `Rico_Tennis.glb`; original 66-joint skin and native locomotion retained; eleven clips added                                            |
| Zuri    | The Phenom · Aggressive Power          | `public/assets/characters/zuri/Meshy_AI_Emerald_Valkyrie_All_Animations.glb`           | `Zuri_Tennis.glb`; original 72-joint skin and native locomotion retained; eleven clips added                                            |
| Nova    | The Wildcard · Unpredictable Shotmaker | Original `nova-hires-source` Release, `Meshy_AI_Golden_Voltage_1027041855_texture.glb` | Full-detail `Nova_Fullres_Rigged.glb`, fitted Kira 74-joint rig and thirteen animations; see quality limitations below                  |
| Jax     | The Showman · Trickster / All-Court    | Model not supplied                                                                     | Profile, signature and circuit identity only; visibly unavailable, no substitute                                                        |

`AthleteRenderer` is the single renderer for player and opponent. The old `Kira`
export remains an inspector compatibility alias. `ATHLETE_RENDER` provides
independent overridable asset/socket configurations; the gameplay controllers,
registry markers, arm contact alignment and equipment pipeline are shared.
GLBs are loaded only for a selected preview and requested rival. Instances are
destroyed and container resources reference-counted/unloaded on replacement.
Match startup waits for an opponent render warm-up. Loading failures offer retry.

The three native rigs are not assumed identical to Kira: node-name remapping uses
local bind rotation/translation deltas, skips absent nonessential accessory nodes,
and retains the original skins, joint counts and complete native binary payload.
Native running/walking tracks are never replaced. Blender pose sheets cover two
samples from each of the thirteen clips. These are bounded visual checks, not an
assertion of perfect intersections at every possible animated frame.

## Nova quality and delivery

Original source is unchanged: 93,520,036 bytes, SHA256
`a6ba172b1f13c2234f9e7c83591af49e6ffe43d842f70d106abd7f9446036331`.
Runtime retains all 102,942 triangles, 138,224 vertices, one material and original
4096² / 8192² / 4096² image bytes. No decimation, texture downsampling or lossy
recompression was used. Positions are uniformly normalized to the shared metre
scale and grounded; rig fitting and skin weights change animation, not detail.

Initial nearest-surface weights produced hand/thigh contamination and upper-arm
stretching. A fitted arm bind and anatomical search improved this but did not
resolve enough poses. The final weight solve uses Blender bone heat on a temporary
18 mm voxel proxy, then barycentric surface transfer to the untouched full-detail
mesh. That proxy is solely a weight-solving tool; it is never rendered or exported.
Individual finger deformation is not finalized: fingers follow the rigid palm.
Hair/clothing use skinning, without cloth/hair physics. Artist refinement of extreme
armpits, fingers and intersections remains a known limitation; see the worst-strain
render and all-frame report rather than treating finite coordinates as visual proof.

The animated GLB exceeds GitHub's 100 MiB per-file limit. A lossless `.glb.gz` in
`assets/characters/nova/` reconstructs the **exact** GLB during `npm run build`;
`tools/roster/fetch-nova.mjs` verifies its SHA before use. No external runtime CORS
request or broken Release link is needed. The original source Release remains
the visual reference. An attempted Release upload was rejected with HTTP 401 by
the upload endpoint, so no dependency on that unavailable delivery path ships.

Reproduction commands: [tools/roster/README.md](../tools/roster/README.md).
Native editable checkpoints and full logs are in the execution workspace's ignored
`artifacts/goal-008/` directory; compact reports and pose sheets are committed in
`public/verification/goal-008/`.

## Gameplay

Archetypes influence actual tactical candidate scores, pace, risk, approach
probability and recovery discipline. Zuri pressures with more pace and risk;
Dante favors deep neutral/slice defense; Nova favors spin/tempo variety; Rico
mixes calculated placement; Kira favors recovery and consistent crosscourt play.
Jax's future profile favors short angles and creative net play. Difficulty still
owns the original reaction delays and locomotion limits. No athlete teleports,
gets extra reaction information, or changes court/contact rules.

Heat uses `Match.returns`, excluding the serve. 0–7 returns are normal, 8–11
warm the existing short trail, and 12+ use restrained orange/amber fire colors.
Two small contact rings add brief accents. The compact indicator, impact mix and
heat cue reset with the point. Heat never changes ball physics.

Both athletes have independent 100-point Signature meters. A successful return
adds 4, returns in an 8+ exchange add 2 more, clean quality ≥ .78 adds 1, and a
point win adds 10. The meter persists between points and resets for a new match.
Credits originate in authoritative contact/point transitions; no rendered-frame
polling can award twice. Arming is possible only during a rally at full charge.
A separate 48px-tall control leaves HIT gestures untouched. Only real successful
rally contact consumes charge; missed/cancelled inputs do not. Arming clears at
point boundaries without spending the meter. AI uses the same meter and contact.

| Athlete | Signature   | Real shot change                                              |
| ------- | ----------- | ------------------------------------------------------------- |
| Jax     | Showtime    | Open angle with alternating short/deep placement              |
| Kira    | Drift Break | Precise counter placement; bounded pace bonus during recovery |
| Zuri    | Phenomenon  | Deeper attacking drive and bounded extra power                |
| Dante   | Iron Return | Deep, heavier counter                                         |
| Nova    | Wildcard    | Slice/lob trajectory variation and unusual lateral placement  |
| Rico    | Final Read  | Calculated open-court target and modest extra power           |

All target/power changes precede the ordinary ball launch solver. There is no
post-launch homing, instant winning hit, expanded reach or altered scoring rule.
Tests exercise legal landing and Normal-AI reachability for both Nova variants
and the other available signatures from a reproducible baseline position.

## Audio

Six recorded categories ship: soft hit, hard hit, serve, bounce, footsteps and
shoe squeak. Racket/bounce/net/point/heat/signature events originate from Match;
footwork uses distance travelled, speed and braking/reversal. Variation, footstep
cooldowns, a 12-source cap, master volume and compression control repetition/mix.
AudioContext resumes from a user gesture; failure/missing clips remains silent.
Pause/background/mute suppress playback. Stadium audio retains its separate mute.

The recordings are CC0 from Freesound: jamesdrake89 (forehand, serves, slices),
drivr3joe (ball on ground), baidonovan (rubber shoe squeak), SpliceSound (tennis
footwear running on tile). Public HQ MP3 previews were cut, normalized, faded and
converted to mono 24 kHz WAV. Sources, license links and exact edit windows:
[assets/audio/sources.json](../public/assets/audio/sources.json).
Footsteps are **not** claimed to be recorded on hard court; the bounce recording's
surface is unspecified. Authentic court-specific replacement recordings remain
an audio improvement. Two additional CC0 tennis-court bounce/net recordings were
researched, but their preview downloads returned HTTP 403 and were not imported.
Net sound currently uses a restrained racket transient plus a synthetic accent.
Point, heat, signature cues and the existing crowd bed are intentionally synthetic.

All six athletes have separate empty voice manifests, with effort/heavy/challenge,
win/loss/signature hooks, probabilities and per-athlete cooldowns. No licensed
final performances were supplied or sourced; no generic voice or real-person clone
is substituted. Silent vocals are intentional and are not final voice content.

## Validation and hardware status

Use the established `npm test`, `npm run build`, `npm run test:browser` and existing
GitHub Pages workflow. New tests cover save recovery/idempotence, actual contact
consumption, heat thresholds, signatures and AI reachability, rig-source integrity,
lossless Nova delivery, requested-model loading and browser audio/controls.

Native iPhone Safari hardware, thermal behavior and sustained mobile GPU/memory
limits: **NOT_CHECKED**. Mobile WebKit is browser-engine/layout coverage only.
Desktop SwiftShader results cannot establish native iPhone performance. Nova's
RGBA8-plus-mips texture estimate is ~512 MiB versus Kira's ~256 MiB; actual engine
allocation measurements and the runtime geometry audit are retained separately.
This is a substantial device-memory risk even though the file can be delivered.

### Measured presentation and software-renderer resources

At 390×844, the standardized 1.7 m athlete projection increased from 58.36 CSS
pixels to 67.57 pixels (+15.8%) in Broadcast at the serve position. Before/after
screenshots and snapshots are committed. This comes from camera elevation,
framing and projection-fit margin; collision geometry and court scale are unchanged.
The same projection rule covers all normalized athletes. A separate front/side/back
preview exposes the selected real model without mobile roster controls covering it.

An isolated Chromium/SwiftShader 60-frame animated-menu sample recorded Kira
median 233 ms / p95 500 ms and Nova median 350 ms / p95 567 ms. These software
rendering results are **not acceptable real-time performance**, and they are not
an iPhone measurement. Nova's requested switch took 12.7 s locally; this includes
local decoding/upload and is not an internet-download benchmark. Kira's initial
load was already warm before that timed sample. Animation evaluation snapshots
were 0.1–0.3 ms; draw calls in the Kira/Rico match were 27. Rendering/texture work,
not animation evaluation, dominates this runner.

Engine-accounted texture bytes changed 343,628,020 → 612,063,476 → 343,628,020
for Kira → Nova → Kira; registered assets stayed at 31. This checks resource
release on switching, not total browser/OS residency. The Kira/Rico match used
544,957,968 texture bytes. Native Safari memory pressure, GPU timings, thermal
stability and sustained match frame times remain unmeasured. Detailed JSON is in
`public/verification/goal-008/browser-performance.json`.
