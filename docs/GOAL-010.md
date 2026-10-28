# GOAL 010 — production application lifecycle

Baseline: `719fe3b20267e6c661c97f55b879d861981d9642`. One agent; no gameplay,
rig, model, physics, timestep, difficulty, scoring or gesture tuning changes.

## Ownership and transitions

`src/app/lifecycle.ts` is the application transition authority. State/session
are read-only to consumers. Its transition methods own invalidation and disposal.

| State / entry | Allowed source                                               | Work / exit ownership                                                                                                                                       |
| ------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BOOT          | page creation                                                | Create one persistent renderer/device, input owner, settings and audio services                                                                             |
| MENU_LOADING  | BOOT, MENU retry, MATCH_LOADING cancellation, MATCH, RESULTS | Abort the old transaction, dispose its session/opponent, clear input/audio, acquire selected preview                                                        |
| MENU          | MENU_LOADING success or recoverable failure                  | Cosmetic native athlete idle/inspection only; failed preview exposes retry                                                                                  |
| MATCH_LOADING | MENU, MATCH restart, RESULTS rematch/next                    | Snapshot validated config, acquire arena/ball/opponent and equipment, create fresh Match/FixedClock, verify actual camera visibility behind branded overlay |
| MATCH         | successful current MATCH_LOADING transaction                 | One session advances the existing 120 Hz FixedClock and established Match; one renderer update callback                                                     |
| RESULTS       | MATCH only                                                   | Freeze authoritative simulation; preserve score, record outcome once by session ID; rematch/next/menu use controller methods                                |

Invalid starts/results are ignored. Duplicate Play during loading cannot enter
another transaction. AbortSignals plus generation checks reject late completions;
ready callbacks and owned entities are removed/disposed on cancellation. Failure
returns to a coherent MENU with explicit error/retry. Native container network
requests can finish after cancellation; their disposed consumers release their
reserved references and cannot activate gameplay.

`src/app/match-session.ts` owns a fresh Match, FixedClock, config, result ID,
record guard, simulation step counter and idempotent cleanup. No Match or clock
is created for the ordinary menu. Explicit developer mode has a separate dormant
inspection Match for the existing diagnostics; it never receives application ticks.

`Scene` owns one PlayCanvas Application, one physical camera and shared lighting.
Menu framing, idle animation, cosmetic inspection, shadow and a simple plinth
are independent of Match. Opening equipment/athlete panels reuses the selected
rig. No ball, opponent, full stadium, prediction, contact or movement runtime is
required for initial menu entry. Camera/lighting switch by presentation context.
The match layer is excluded from menu rendering.

Court/stadium geometry and the small ball are allocated lazily at first match
(or explicitly by developer inspection) and retained as a bounded renderer cache.
They contain no live gameplay ownership. On exit: opponent entity/controller,
Match and clock leave ownership; input/pointer charging, audio sources, effects,
trail history, event cursors, prediction clock and selected rig action layers reset.
No match update runs behind the menu. The persistent arena cache is reused,
not rebuilt each cycle. Asset quality and existing DPR/stadium policies remain.

## Assets and persistence

`src/app/assets.ts` uses PlayCanvas AssetRegistry container loading, unload and
remove. Concurrent acquisition reserves references before waiting. Every actor
releases its containers only after destroying its entities. Partial failed
acquisitions roll back. Rackets/ball remain shared; at most one unowned ordinary
character container stays warm. Unused full-resolution Nova is immediately
unloaded. Viewing the roster cannot retain an unlimited character collection.
Retry attempts use distinct URLs after failures so a late timed-out native
request cannot alias a new request's resource. Browser HTTP caches remain usable
for ordinary reacquisition. Models, textures and native embedded animations keep
the supplied fidelity. Calibration JSON requests retain their existing deduplication.

Audio buffers/preferences, equipment and circuit storage remain persistent.
Audio session event/distance cursors reset for fresh matches; active sources stop
on interruption/exit. An unfinished exit never records a result. Completed results
retain the existing Competition.record deduplication as well as the session guard.

Official references reviewed: [Assets](https://developer.playcanvas.com/user-manual/assets/),
[AssetRegistry](https://developer.playcanvas.com/user-manual/assets/asset-registry/),
[AppBase](https://api.playcanvas.com/engine/classes/AppBase.html), plus the locked
engine's container/asset teardown source. No new engine/framework dependency.

## Suspension and graphics recovery

Visibility, blur, pagehide, pageshow and focus feed the controller. Interruption
pauses Match, clears input/audio and resets the accumulator; the first resumed
simulation frame is discarded. Focus restoration does not resume a rally; use
Resume. Context loss prevents default and suspends the controller, allowing the
engine's supported restoration path. A blocking recovery interface offers reload
if the browser cannot restore. Synthetic context events test state behavior;
they do not prove a driver can restore real device resources.

## Validation and measurements

Automated browser fixtures include ten cycles in one page,
delayed-opponent cancellation/duplicate Play, interruptions, and a source-only
results fixture for rematch/next-opponent/record-once checks. The production API
remains read-only and opt-in. Existing tests now await the intentional restart
transition; stadium assertions run after its lazy load, and ball failure is
injected at match entry. Their gameplay assertions are preserved.

Physical iPhone Safari, thermal behavior and driver-resident GPU memory are
NOT_CHECKED. Linux mobile-profile WebKit is reported separately below.

## Changed files

- New owners: `src/app/lifecycle.ts`, `src/app/match-session.ts`, `src/app/assets.ts`.
- Integration/presentation: `src/main.ts`, `src/render/scene.ts`, `src/render/kira.ts`,
  `src/render/royal-ball.ts`, `src/render/stadium.ts`, `index.html`, `src/style.css`.
- Input/audio/diagnostics ownership: `src/platform/input.ts`,
  `src/platform/court-audio.ts`, `src/platform/stadium-audio.ts`, `src/dev/tools.ts`.
- Release identity: `vite.config.ts`. Existing Pages workflow is unchanged.
- Tests: new `tests/lifecycle.test.ts`, `tests/shared-assets.test.ts`,
  `tests/browser/lifecycle.spec.ts`; transition-aware updates to existing
  `diagnostics`, `kira`, `play` and `stadium` browser tests.
- Source-only fixtures/measurement: `tools/goal010/`.
- Documentation: this report, architecture/asset/performance maps and measured
  records in `docs/verification/goal010/`.

No files in `src/core/` or supplied asset binaries changed.

## Observed before/after comparison

Same headless Chromium 156.0.8078.4, Debian 13 cloud executor, SwiftShader,
390×844 viewport, DPR 1, default reduced mobile stadium policy, local preview
server, fresh browser context, no network/CPU throttling. No other browser/unit
workload ran concurrently with these measurements. `tools/goal010/measure.mjs`
samples 60 wall-clock RAF intervals in menu and each of three practice sessions.
These are scheduling/render intervals, not GPU timings or physical iPhone FPS.
One bounded comparison per version; distributions are noisy on software GL.
Raw observations: `docs/verification/goal010/before.json` and `after.json`.

| Observation                                            |                    Baseline |          GOAL 010 candidate |
| ------------------------------------------------------ | --------------------------: | --------------------------: |
| Navigation → usable menu                               |                    6,061 ms |                    3,084 ms |
| Menu draw calls                                        |                          18 |                           4 |
| Menu 60-frame mean / p95 interval                      |          164.30 / 366.10 ms |          138.07 / 236.10 ms |
| Initial menu registry assets                           |                          31 |                          25 |
| Initial menu native vertex buffer counter              |            10,790,064 bytes |             2,716,312 bytes |
| Initial menu native texture counter                    |           343,628,020 bytes |           335,588,924 bytes |
| First menu → match (including UI interaction)          |                    9,199 ms |                   12,409 ms |
| Warm menu → match, two samples                         |                797 / 828 ms |              763 / 1,349 ms |
| Match → menu (including UI interaction), three samples |        1,020 / 765 / 755 ms |          529 / 703 / 609 ms |
| Match frame means, three sessions                      | 250.88 / 224.13 / 237.01 ms | 284.90 / 241.89 / 222.21 ms |
| Match p95 intervals, three sessions                    | 478.90 / 423.70 / 474.20 ms | 504.80 / 485.80 / 440.60 ms |

The menu improves measured startup, draw count and initial geometry residency.
Cold match entry costs more than the baseline's retained scene; it now creates
the previously eager arena. Warm entry varies between samples. Warm resources avoid
container reload/parsing, but still initialize a fresh opponent animation/skin
instance and validate the real camera frame. No claim of faster match entry or
improved match FPS is made. Match frame intervals remain variable on SwiftShader.
Native VRAM counters are engine allocation accounting, not driver memory readings.
No model-fidelity changes or arbitrary memory targets were introduced.

## Remaining limits

No session leak was observed in the bounded repeated-cycle workloads. The warm
cache deliberately retains procedural arena resources, a small ball/racket and
at most one unused ordinary character container. Native texture accounting can
therefore remain high after first match entry; it is not an unbounded model cache
or a physical-device memory guarantee. Software-rendered frame intervals are
slow and variable. Initial match entry is slower than the eager baseline.

Physical iPhone Safari, screen-lock/app-switch behavior on named hardware,
sustained thermal behavior and driver-resident GPU memory remain NOT_CHECKED.
Linux WebKit/native context restoration results do not establish those outcomes.
A browser that cannot restore WebGL must use the offered reload control.

## Menu audio and native diagnostics

A compact native Audio Preferences disclosure exposes the existing court mute,
volume and stadium-sound preferences from MENU. Pause and menu controls share
the same services and values; they do not allocate a second audio runtime or
reload the athlete. The cycle test changes these preferences in MENU and checks
that all ten fresh matches retain them.

The WebKit regression run also exposed a native diagnostics activation issue:
its periodic refresh rewrote the Play/Pause text node even when the label was
unchanged. Both label writers now avoid unchanged DOM writes. The existing rig
inspection test retains its exact frozen-clock assertion, waits for the UI's
pause acknowledgement, and adds three repeated native Play/Pause pairs. Both
engines passed the focused repeated-activation check after this correction.

## Final local validation

- `npm test`: **206 passed in 19 files**, final shipping-tree run (33.02 s).
- `npm run build`: passed TypeScript and Vite; the existing large-engine-chunk
  warning remains. No dependencies or deployment configuration changed.
- Full browser sweep: **85 passed, 4 expected Chromium-CDP-only skips, 3 failures**.
  Two failures were the obsolete three-startup-container assertion, updated to
  require exactly two containers and an unloaded ball. The third exposed the
  unchanged-label WebKit activation defect described above. No gameplay assertion
  was removed or relaxed.
- Reviewed rendering/readiness/lifecycle subset: **17 passed**, with the WebKit
  diagnostic activation defect then resolved and verified separately.
- Repeated native diagnostic activation: **2 passed** (Chromium and WebKit),
  retaining exact frozen-clock checks and adding repeated native button pairs.
- Final lifecycle/audio/cancellation/results/context suite: **10 passed** across
  Chromium and mobile-profile WebKit. The full final tree is also verified by
  the normal Pages workflow before publication.

Final stress evidence: `stress-chromium.json` and `stress-webkit.json`, ten
cycles each in one page (**20 successfully completed cycles** in this final
run). From cycles 3–10: 219 menu entities, 50 registry assets, 25 persistent input
handlers and four container requests in both engines. Native accounting stayed
at 544,954,608 texture bytes, 12,356,980 vertex-buffer bytes, 1,085,898 index-buffer
bytes and 6,400 uniform-buffer bytes after each exit. There was one application,
one active camera and update callback, zero live/allocated sessions in MENU,
one loaded actor, zero pending asset requests and zero pending frame-readiness
handlers. Session IDs were unique. No uncaught page errors were observed in the
stress tests. Expected warm renderer/container caches are described above.

## Production release

Production URL: https://kalikeefbiz.github.io/Centre-Court/

The implementation is committed to the existing repository and published only
through `.github/workflows/pages.yml` on main. No separate site, manual historical
verified-Kira bypass or alternative deployment pipeline is used. `release.json`
identifies GOAL-010 and the deployed Git commit. The final handoff records the
exact commit, Actions run and observed production verification after publication.

## Final interaction review

The existing camera preference remains selectable in MENU and RESULTS as well
as MATCH. Menu framing stays independent: changing the saved gameplay camera
neither activates a session nor replaces/repositions the selected preview.
The focused native control check passed in both engines (**2 passed**).
Late loading of developer tools may initialize their explicit inspection assets,
but may only reset the menu scene while the application is actually in a menu
state; it cannot tear down an in-flight or active match.

Measurements and stress records were captured from the precommit candidate
working tree. Vite embeds `git HEAD`, so their embedded build field identifies
the parent commit at measurement time; it is not a claim that the baseline
contained this refactor. The candidate designation and source changes are recorded
here. The normal final-commit CI and live `release.json` supply the committed
release identity, which the final handoff verifies separately.
