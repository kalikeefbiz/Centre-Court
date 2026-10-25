# Centre Court — GOAL 003

Initial implementation commit: `eb775186b5f09dc8732ceb36896f961539b82da8`. Final contact-fairness follow-up: `3a766bb2072beae1cd5918ad76c3a4021dc3f9cc`. Publication commits add the report and evidence. Baseline: `929aebf30af6148a18850c2db25db5c11d1d01f0`.

Live deployment: <https://kalikeefbiz.github.io/Centre-Court/>. The deployed `release.json` identifies the exact publication SHA and asset revision. Release identifier: `GOAL-003`. Deployment uses the existing GitHub Actions verify → Pages workflow.

Initial publication `6dea2878f204a3f8a144e0af7a6dc5c59d1712ee` passed [the full verify/deploy workflow](https://github.com/kalikeefbiz/Centre-Court/actions/runs/40167270414). A browser check of the public site confirmed that exact GOAL 003 build, a real human serve and AI return (two contacts), loaded Kira/racket/Royal Rally, one camera and zero browser errors. See [live verification](../public/verification/goal-003/live-verification.json). The subsequent reporting correction excludes AI service landings from the legal-return metric; all seeded rally/outcome/positioning results are identical for that reporting correction. A subsequent fairness review added an intent-specific contact guard and vetoed lob/slice choices above their legal volley height. The 500-selection regression test and final 74-unit suite pass; the published simulation was regenerated with this guard enabled.

## Architecture audit

| System        | Baseline finding and retained boundary                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opponent      | `src/core/ai.ts` and `Match.tick`: 120 ms first-reachable-sample prediction, direct movement without acceleration, simple contextual/random shots, near-center recovery, random skipped returns. Opponent reach was 1.75 m, larger than the human's calibrated zone. Replaced decisions and steering; retained the existing opponent presentation.                                                                                  |
| Ball          | `src/core/ball.ts`: continuous ballistic launch, gravity 9.81 m/s², swept net tests, floor crossing interpolation, shot-dependent restitution, horizontal bounce damping. `Ball.step` remains authoritative. Reusable event buffers and scalar previous coordinates reduce allocation without changing equations. A direct old/new comparison matched 25,000 states/events exactly across five shot types and five lateral origins. |
| Court         | `src/core/court.ts`: 23.77 × 8.23 m singles, 6.4 m service line, variable-height net, line-inclusive ball radius 0.0335 m. Existing movement envelope ±6.7 m, 0.65–15.3 m per end retained.                                                                                                                                                                                                                                         |
| Hits          | `hitting.ts` and `Match.hit`: drive, slice, lob, serve, plus automatic volley physics and contextual Smash animation. AI now uses the same forward/contact-height/radius gates as the player, including reduced low-ball reach. Player controls, input buffering, timing feedback and footwork assistance are unchanged.                                                                                                            |
| Match         | `scoring.ts`, `Match`: fault/let, deuce/ad, games, sets, tiebreak, practice, pause, restart and result remain authoritative. Reset now clears a stale `pointWinner` so diagnostic first-fault records cannot inherit the previous winner.                                                                                                                                                                                           |
| Serve         | Production origin remains 2.6 m, with the existing preparation delay and Serve presentation. Receiver starts in the established receiving position. No toss or animation-sequence redesign.                                                                                                                                                                                                                                         |
| Animation     | Kira's production GLB, animation registry, contact presentation, separate racket and Royal Rally GLB/materials are unchanged. The existing temporary opponent remains. No animation mapping or asset replacement.                                                                                                                                                                                                                   |
| Difficulty/UI | Existing native setup select already exposed Easy/Normal/Hard, Normal default. Kept the mobile flow and defaults; centralized richer behavior parameters instead of separate implementations.                                                                                                                                                                                                                                       |
| Diagnostics   | GOAL 002D `?dev=1` lazy-loaded DEV panel, timeline, comparisons, performance windows, exports and opt-in read-only snapshots retained and extended. Ordinary visits expose no developer controls or debug API.                                                                                                                                                                                                                      |

## AI architecture and tactical behavior

`OpponentAI` is a small hierarchical controller with explicit observable states: serve preparation/execution, return anticipation, ball interception, shot preparation/execution, defensive recovery, neutral court recovery, net approach and point conclusion/reset. `Match` owns rules and executes movements/shots; the controller supplies movement intent and shot choices. No framework, navigation mesh or dependency was added.

Prediction copies observable ball state into one scratch `Ball`, steps at the authoritative 1/120 s cadence, and stops at a dead net or second bounce. It searches legal contact windows using the shared racket constraints, available time, projected movement velocity, acceleration, settling margin and court bounds. The result contains bounce position/time, intended contact/time and reachability. Unreachable shots retain a best-effort chase target without granting contact, speed or a successful return. Recalculation occurs at difficulty-specific intervals and on bounce/net events. Reaction delay begins only after an actual shot; perception adds a stable, difficulty-dependent lateral error for that shot. No future controls are inspected.

Movement uses acceleration-limited arrive steering with braking and bounded reversals. Recovery bisects plausible reply angles using outgoing landing X and the human's position, with deeper defensive targets and forward positions after attacks/volleys. Serving also recovers toward baseline coverage. The AI holds a reasonable receiving position before release rather than drifting toward an arbitrary center.

Utility selection evaluates crosscourt, down the line, deep neutral, short angle, defensive lob, slice recovery, volley and overhead. Considerations include open space, contact quality/height, incoming speed, lateral/deep pressure, opponent net position, difficulty aggression, short-ball opportunity and the previous tactic. A repeat penalty and bounded seeded tie variation prevent a fixed sequence. Safer returns use lower power and larger margins; aggressive placement increases execution-error probability. Errors scatter the ordinary landing target and are judged by the existing net/in/out rules; they do not skip a hit or manufacture a point.

Volley and overhead use the engine's existing drive intent → automatic volley launch / `Smash` stroke selection. There is **no new independent smash physics**. Slice and lob use their established trajectories. Short angles use the existing aim/depth range. No AI-only ball speed or collision override exists. Hard's top speed is below the human's 6.3 m/s.

Serving chooses seeded T/body/wide targets in either diagonal box, with normal placement error; second serves use lower power. Existing first fault, double fault, let and scoring progression handle every result. All 720 tested planned service targets landed legally through the real integrator before ordinary Match placement error.

## Difficulty parameters

| Parameter                                       | Easy | Normal (default) |  Hard |
| ----------------------------------------------- | ---: | ---------------: | ----: |
| Reaction delay, s                               | 0.36 |             0.23 |  0.14 |
| Maximum speed, m/s                              |  4.4 |              5.4 |   6.2 |
| Acceleration, m/s²                              |   13 |               16 |    19 |
| Prediction confidence                           | 0.68 |             0.84 |  0.95 |
| Decision commitment interval, s                 | 0.24 |             0.18 |  0.14 |
| Placement scatter half-width, m, before quality | 0.85 |             0.42 |  0.19 |
| Base execution-error probability                | 0.14 |            0.065 | 0.025 |
| Aggression                                      | 0.24 |             0.55 |  0.80 |
| Recovery discipline                             | 0.60 |             0.82 |  0.96 |
| Tactical tie variation                          | 0.16 |             0.23 |  0.27 |

Execution-error probability adds `(1 − quality) × 0.16 + tactic risk × 0.065`, bounded to 0–0.5. It is the probability of extra placement scatter, **not a guaranteed point-ending error**. Actual error frequency is measured separately. Prediction confidence controls perception error, not knowledge of hidden input or a guaranteed reach. Second-serve power is 0.36; first-serve power depends on aggression with bounded variation.

## Developer inspection and reproduction

Open <https://kalikeefbiz.github.io/Centre-Court/?dev=1>, start a match, open **DEV · Tools**, and enable **AI decision overlay**. Close the panel to play. The optional compact readout shows state, difficulty, bounce/time, interception/reachability, recovery, selected tactic/aim, reaction, confidence, utility and mean decision CPU time. Cyan world guides mark interception, yellow bounce and lime recovery. The existing performance overlay remains independently toggleable.

**Reproduction seed → Restart match with seed** starts the current mode/difficulty/length through the normal lifecycle. **AI test feed → Launch test feed** starts a labeled Practice fixture, then delegates all movement, hits, ball physics and scoring to the real `Match.tick`. Available feeds: Baseline exchange, Wide defence, Open court and Short ball. Seed 1 reproduces wide interception/defensive recovery and open-court targeting; Short ball seed 8 produces a contextual net approach on Hard. The fixtures never force the tactical choice or a return.

Existing JSON export now includes initial seed, current random state, ball/velocity, players, scoring, current AI intent, selected actual landing target and bounded last-32 state transitions. Performance sampling remains bounded and UI text updates at 4 Hz. There is no runtime console spam or telemetry. Seeded commands/feeds are deterministic; arbitrary live touch input is not recorded as a complete replay stream.

## Automated verification

- 49 baseline unit tests passed before implementation.
- 74 final unit tests pass, including all existing scoring/control/assets/diagnostic coverage and focused AI, reproduction, simulation and CPU-budget checks.
- TypeScript and Vite production build pass. The pre-existing large PlayCanvas bundle warning remains; no new dependency was introduced.
- Existing full-match test retains a real scripted human win and a sustained rally assertion. Its input driver was updated from assumptions about the old enlarged AI contact radius to the shared contact-aware scripted control driver. The assertions were not weakened.
- The AI validates its selected shot intent immediately before contact. Drive may become an overhead above the ordinary volley window; lob/slice cannot borrow that taller reach. A seeded 500-choice high-contact regression verifies the restriction.
- Tests cover bounce/time prediction, legal/reachable/unreachable contacts, dead net/second bounce, recovery, attack/defence, open court, lob/volley/overhead intent, difficulty dimensions, seeded error probabilities, service targets, speed/acceleration, reaction/returns, reset/pause, state history isolation, net approach, overlays, asset rendering, input ownership and performance.

Local browser coverage: **37 checks passed** (20 Chromium, 17 WebKit), with **three intentional WebKit skips** for Chromium-only trusted CDP multitouch. WebKit covers pointer events, cancellation, pause, render assets and all new AI overlay flows. The existing CI workflow runs all 40 browser entries again before Pages deployment. Local WebKit required workspace-only extracted system libraries in its browser cache; the project and CI dependency installation were unchanged. An initial diagnostic-export filename assertion was updated from `002d` to `003`. Initial WebKit launch failures were host-library failures, not counted as gameplay passes.

## Simulation evidence and balance

See [raw measurements](../public/verification/goal-003/simulation.json). The automated opponent faces scripted human controls, using only normal movement/shot commands. Thirty seeded match attempts per difficulty use seeds 700–729 and a 900 simulated-second cap each. The player model waits 220 ms, moves at 87% of the player's maximum speed, and alternates cooperative neutral and mixed attacking/short-ball/lob strategies. It has consistent aim and is not a model of physical human skill.

Metrics below are generated from the final implementation. Contact rate counts AI contacts / incoming human shots. Legal-return rate counts replies that land legally or are volleyed by the human, excluding AI service landings; incoming shots include their normal engine outcomes. Rally length includes the serve. Completed-point distributions exclude an unfinished rally at a simulation cap; contact counts include it. Capped match attempts are disclosed, not silently called completed matches. “Winner” means an unreturned point; pressure/unforced error labels are a defensive-tactic proxy, not video-judged tennis statistics.

| Metric                                                 |                     Easy |                     Normal |                           Hard |
| ------------------------------------------------------ | -----------------------: | -------------------------: | -----------------------------: |
| Completed matches / 30 attempts                        |                       30 |                         30 |                             15 |
| Resolved points                                        |                      252 |                        313 |                            460 |
| Contact return rate                                    |                   92.39% |                     96.66% |                         99.80% |
| Legal return rate                                      |                   84.91% |                     91.48% |                         96.57% |
| Rally contacts: mean / median / p90 / max              |     12.72 / 4 / 37 / 115 |       19.42 / 7 / 52 / 165 |          36.43 / 17 / 94 / 325 |
| Point lengths 1 / 2–4 / 5–8 / 9+                       |        0 / 141 / 24 / 87 |         0 / 104 / 64 / 145 |             0 / 120 / 68 / 272 |
| AI / player unreturned-point wins                      |                 10 / 122 |                   55 / 101 |                       172 / 10 |
| AI errors: all / unforced proxy / pressure proxy       |            120 / 76 / 44 |              157 / 93 / 64 |                278 / 168 / 110 |
| Player errors                                          |                        0 |                          0 |                              0 |
| Net approach commitments                               |                       28 |                         96 |                            346 |
| Defensive shot contacts (not guaranteed saves)         |                      517 |                       1151 |                           4002 |
| Tactic counts: neutral / cross / line / slice / volley | 739 / 212 / 0 / 517 / 14 | 1033 / 649 / 6 / 1151 / 88 | 2133 / 1895 / 523 / 3964 / 276 |
| Shot directions: left / centre / right                 |           662 / 739 / 81 |          1591 / 1033 / 303 |             4305 / 2133 / 2353 |
| Covered X range, m                                     |            -4.18 to 4.24 |              -4.49 to 4.65 |                  -4.71 to 4.69 |
| Covered Z range, m                                     |          -13.29 to -3.71 |            -12.96 to -2.99 |                -13.26 to -2.18 |
| Mean AI decision CPU, ms                               |                   0.0107 |                     0.0111 |                         0.0141 |

Early runs exposed hundreds-of-contact cooperative exchanges, no approaches and excessive low safe returns. Changes included stable receiving position, shared contact gates, better contact timing, pressure/risk placement scatter, short-ball incentives, outgoing-angle recovery and finite acceleration. The final distributions show separation and varied positions, while retaining a cooperative long tail. These simulations demonstrate behavior and failure modes; they do not establish that the game is fun. No artificial rally-length cap or prescribed winning percentage was introduced.

## Performance findings

The AI has no pathfinding framework, per-frame trajectory array, scene search or per-frame utility evaluation. It reuses a scratch ball, contact context and event buffer. `Ball.step` can reuse caller-owned events; collision results remain identical. Predictive work is throttled to about 4–7 decisions per second while receiving, plus collision invalidations. Tactical scoring runs at contact. Histories and frame windows remain bounded.

[CPU samples](../public/verification/goal-003/cpu-performance.json) compare one warmup plus five repetitions of the same seeded idle-player Practice workload. Values are milliseconds per call, measured in Node on this Linux host.

| Measurement         | Baseline median | GOAL 003 median |
| ------------------- | --------------: | --------------: |
| Interception helper |        0.012933 |        0.024565 |
| Match tick          |        0.000597 |        0.001541 |

The richer interception helper costs more per call: it checks shared contact gates and acceleration and steps at 120 Hz versus the old sampled 60 Hz search. The final total Match-tick difference is about 0.000944 ms in this workload, within the sample variability. Allocation reuse was implemented in the measured prediction path before release; no physics simplification or fairness compromise was used. These are microbenchmarks, not whole-frame CPU/GPU profiles. The regression budgets are 2 ms median per prediction helper and 0.1 ms median per Match tick; actual measurements are far below them.

[Browser samples](../public/verification/goal-003/browser-performance.json) use the existing GOAL 002D 10-second performance capture, three sequential serving/idle-return windows per version, 390×844 render pixels, DPR 1, software SwiftShader Chromium, tools panel closed and performance overlay on. Every record has zero interruptions.

| Version / window | Mean frame interval, ms | p95, ms |   FPS | Draw calls |
| ---------------- | ----------------------: | ------: | ----: | ---------: |
| baseline / 1     |                   97.93 |  190.90 | 10.21 |         31 |
| baseline / 2     |                   98.25 |  186.30 | 10.18 |         31 |
| baseline / 3     |                   86.37 |  170.40 | 11.58 |         31 |
| goal003 / 1      |                   99.73 |  199.60 | 10.03 |         31 |
| goal003 / 2      |                   98.36 |  166.90 | 10.17 |         31 |
| goal003 / 3      |                   90.68 |  179.20 | 11.03 |         31 |

Both versions are slow on software WebGL, and the frame-time ranges overlap. The across-window mean is 94.18 ms baseline versus 96.26 ms GOAL 003. That small difference is below the variation among these windows and does not establish an AI-induced frame regression. No 30/60 FPS mobile claim is made. Draw calls remain 31; the added decision CPU time is separately visible in the raw AI snapshots. A representative physical-device CPU/GPU profile is still required.

The browser frame-window samples and rendered captures predate the final intent-specific guard; that guard adds only a contact-time legality check and no rendering change. Node CPU budgets and both browser AI flows were rerun after it.

The existing diagnostic exports provide frame intervals, draw calls, render dimensions and asset timings. GPU time remains explicitly unavailable. Linux software WebGL, Node timings and emulated mobile WebKit are not physical iPhone performance measurements. Safari responsiveness and thermal behavior still need device review.

## Rendered browser evidence

The following are actual rendered application captures from implementation build `eb775186b5f09dc8732ceb36896f961539b82da8`. The AI scenarios are explicitly labeled developer feeds and are frozen through the existing comparison control only after the real controller reaches the named state. They are not mockups or claims of naturally earned match outcomes.

- [Difficulty selection](../public/verification/goal-003/difficulty-selection.png)
- [Baseline receiving position](../public/verification/goal-003/baseline-positioning.png)
- [Future interception target](../public/verification/goal-003/predicted-interception.png)
- [Defensive recovery](../public/verification/goal-003/defensive-recovery.png)
- [Open-court attack](../public/verification/goal-003/open-court-attack.png)
- [Contextual net approach](../public/verification/goal-003/net-approach.png)
- [Extended existing DEV tools and AI readout](../public/verification/goal-003/ai-diagnostics.png)
- [Portrait gameplay without developer tools](../public/verification/goal-003/normal-gameplay.png)
- [Raw capture snapshots/provenance](../public/verification/goal-003/browser-evidence.json)

Reproduce with `npm run build`, `npm run preview -- --port 4173`, then `node tools/ai-evidence.mjs`. `CC_URL` selects another server. Existing browser tests additionally verify Kira's visible/textured model, racket attachment, animation library, Royal Rally texture, camera views, loading gates, no human placeholder fallback, and touch ownership in Chromium and WebKit.

## Preserved design decisions and known limitations

- Kira, racket, Royal Rally model/materials, cameras, two-thumb controls, input timing and match/scoring foundation remain intact. No stadium, multiplayer, character or animation overhaul was added.
- The owner's initial iPhone assessment establishes **1.50× as the current preferred visual ball scale**. It is recorded here and in the DEV panel. The existing visit default remains 1.00× to preserve defaults; select 1.50× for owner comparison. Collision radius remains **0.0335 m** at every visual scale. No material/texture changes.
- Production serve contact stays at 2.6 m. GOAL 002D's approximate source contact is lower; that animation/origin mismatch remains for later refinement. No toss prototype was promoted into gameplay.
- The current engine's arcade trajectory/contact constraints govern slice, lob, volley and overhead. Smash has an existing contextual animation, not a separate new power mechanic. This milestone does not certify source animation contact accuracy.
- Hard can be beaten by sufficiently wide/fast placement and makes real placement errors. It has no catch-up speed or enlarged reach. Human skill balance still needs owner playtesting; the scripted controller is unusually consistent.
- Cooperative rallies can remain long, especially on Hard; some 900-second match attempts remain unfinished. There is no forced point end merely to shorten a rally. Slice-heavy defensive play and long cooperative tails are explicit tuning watch items for device playtests.
- Prediction uses actual physics but an estimated future movement envelope, not a guaranteed arrival. Reaction/settling/perception can cause misses even when a later snapshot still labels a plan reachable.
- No physical iPhone test was performed in this environment.

## Physical iPhone checks still required

On the deployed build, play each difficulty in portrait and landscape using Safari. Compare reaction, wide winners, neutral rally pacing, low-ball saves, attacks, lob response, serves/returns and recovery. Confirm Hard feels competitive and beatable and that Easy supports learning. Watch the cooperative rally tail and repeated slice preference; adjust using actual play evidence rather than a forced rally target.

Compare 1.00× and preferred 1.50× ball visuals in both cameras without changing physics. Confirm Kira, racket and Royal Rally remain readable. Verify simultaneous movement/charge/aim/shot selection, cancellation, pause/resume, backgrounding and camera switching. Keep the established serve/animation timing limitations distinct from AI decisions.

Use the existing performance overlay and three uninterrupted 10-second exports for serving, sustained rallies, camera switching and tools hidden/shown, with build, iPhone model, iOS/Safari version, orientation, refresh/power/thermal state and cache condition recorded. Compare with GOAL 002D on the same physical device. Confirm seed/select/scroll/export controls and safe-area usability. Desktop automated results do not replace these checks.

## Engineering references adopted

Read only the three requested SKILL.md files from `gamedev-skills/awesome-gamedev-agent-skills` at `184b72be02884f782a0058f2eeae2ce4277453e4`; the collection was not installed.

| Reference                                                                                                                                                                                             | Applied principles                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [game-ai](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/game-ai/SKILL.md)                                           | Separate decisions, steering and physics; shallow state machine; accelerated arrive movement; recompute sparingly; inspect state/targets in the real scene. The unobstructed tennis court needs no pathfinder.        |
| [ai-behavior-trees-utility-ai](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/ai-behavior-trees-utility-ai/SKILL.md) | Graded normalized considerations, weighted tactical utility, repeat penalty, seeded variation, action commitment and slower decision ticks. No reusable behavior-tree framework or unrelated engine API was imported. |
| [performance-optimization](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/performance-optimization/SKILL.md)         | Establish baseline, measure CPU/frame windows, bound work/storage, reduce allocation in the measured prediction path, remeasure, distinguish software-browser timing from real-device/GPU evidence.                   |

Next scheduled milestone: **GOAL 004 — Stadium & Presentation**.
