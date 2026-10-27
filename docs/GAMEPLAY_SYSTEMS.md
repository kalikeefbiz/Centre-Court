> Historical architecture setup snapshot, before GOAL 008. For GOAL 009 use baseline `f7fdda3e75a1d93b053da2e5ad941618547793da`, `docs/GOAL-008.md`, and current source. The original report is retained as history.

# Implemented gameplay systems

Verified against the [discovery baseline](PROJECT_BASELINE.md). This document
describes behavior to preserve, not a redesign or a new acceptance decision.

## Simulation, rules and control

| System | Current implementation and dependencies |
| --- | --- |
| Clock | `FixedClock` in `src/core/match.ts`: 120 Hz, up to 100 ms catch-up per rendered update; pause/interruption resets frame accumulation in `main.ts` |
| State | `menu → serve → rally → pointOver → serve`; `paused` remembers prior phase; `result` follows match completion. Restart/menu reset state and input ownership |
| Scoring | `scoring.ts`: love/15/30/40, deuce/advantage, win by two, rotating server, tiebreak to seven by two. Short: one set to two games; standard: best of three sets to six games |
| Court | `court.ts`: SI metres, human at +Z, Y up, singles half-width 4.115 m, half-length 11.885 m, touching lines in, collision ball radius 0.0335 m |
| Movement | `locomotion.ts`: one shared velocity integrator per athlete/tick; acceleration, braking, reversal through zero, directional speed envelope, analog magnitude and normalized diagonals, bounded court travel |
| Human speed | Forward 6.3, backward 4.6, lateral 6.0 m/s; limited X-only footwork assist routes through the same integrator, never automatic shots |
| Physics | `ball.ts`: gravity, quadratic drag, spin-dependent lift/decay, speed-dependent bounce restitution and friction/spin impulse. Flight substeps at most 1/120 s; swept net crossing and top-cord grazing |
| Shot placement | `hitting.ts` shares `shotTarget` with the on-court preview; the preview is intended placement before execution error |
| Stroke choice | Sided forehand/backhand, compact volley, descending overhead smash, deliberate slice/lob and serve. Context includes side, height, bounce and velocity |
| Contact | `stroke.ts`, `Match` and `rig-motion.json`: predicted ball/racket trajectory, bounded warp, timed swept contact; 250 ms release buffer, deliberate misses for unreachable/late balls |
| Serve | Dedicated animation/toss timing; palm release, ballistic toss and overhead strike. Service-box validation, first/second faults, double fault, net-cord let and no volleying an unbounced serve |
| Point outcome | Out, net, double bounce and unreturned balls resolve once; match phase guards prevent duplicate scoring |
| Practice | Endless rallies with human service and no scoring mutation |
| Opponent | Seeded `OpponentAI` in `ai.ts`, difficulty-specific delayed reaction/precision/aggression, interception prediction, tactical shots and recovery. AI requests velocity; Match performs movement |

AI prediction uses the same ball integrator with scratch state and bounded
lookahead. It refreshes on its decision cadence/events rather than every render
frame. The seeded deterministic tests establish behavior for the implementation
and given commands; they do not establish cross-engine network lockstep.

## Unified HIT and mobile ownership

`src/platform/input.ts` handles pointer, mouse, keyboard and assistive activation.
`src/core/shot-gesture.ts` implements the shared recognizer:

- Tap: provisional slice, committed after the 160 ms pairing window.
- Hold/release: power at the 180 ms hold threshold, charge capped at 1.2 s.
- Short paired double tap: cancels provisional slice, produces one lob.
- A deliberate standalone drag beyond 12 px is aimed power; a short second tap
  may aim its lob, while holding it prioritizes power.
- Serving bypasses rally ambiguity: tap or hold starts the existing serve.

The left joystick and HIT own independent initiating pointer IDs, use capture
plus window routing, and latch geometry during a gesture. Only an owned release
commits. Cancel, genuine capture loss, blur, pause, new input epoch and page
interruption cancel pending input; unrelated pointers cannot end another thumb's
charge. `main.ts` synchronizes phase/input epoch before and after simulation to
cover serve-to-rally transitions between DOM events.

GOAL 007 enlarged acquisition targets and analog/aim travel. Safe-area CSS and
portrait/landscape layout are already implemented; do not replace these controls
or add separate shot selectors as infrastructure work. Desktop uses WASD/arrows,
Space, J/L aim, I/K depth, Escape pause, C camera, with number-key intent overrides.

## Animation and presentation contract

`render/animation-registry.ts` maps semantic states to exact source clips and
markers. GOAL 007 Lob uses preparation/contact/end frames **10/17/32** at 30 fps
to use the original upward scoop and exclude the later overhead motion.
Both gameplay and Kira consume this registry. The sampled socket trajectories
in `rig-motion.json` must stay aligned with the rig, socket and scale.

Actual locomotion velocity drives the animation blend. Presentation can correct
the racket/contact appearance without changing physical position/ball collision.
Broadcast/behind cameras consume the existing camera rig; the Royal Rally visual
default is 2.25× while the collision radius remains regulation-sized.

## Regression dependencies

| Changed area | Relevant existing checks |
| --- | --- |
| Match / scoring / clock | `tests/core.test.ts`, `simulation.test.ts`; browser `play.spec.ts`, `stadium.spec.ts` |
| Ball / strikes / markers | `tennis-physics`, `hitting`, `lob-contact`, `assets` tests; browser `tennis`, `kira`, `touch` |
| Movement / AI | `locomotion`, `ai`, `simulation`, `performance` tests; browser `ai` |
| Gesture / DOM / CSS | `input`, `shot-gesture`, `lob-contact` tests; browser `play`, `touch`, `tennis` |

Changes crossing these areas require a combined plan and a single owner for
shared files. Historical goal evidence and outstanding manual checks are indexed
in [GOAL_HISTORY](GOAL_HISTORY.md) and [PROJECT_BASELINE](PROJECT_BASELINE.md).
