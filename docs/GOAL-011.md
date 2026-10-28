# GOAL 011 — predictive preparation and assisted interception

Baseline: `6959d6746cdd0eea560b705fedac4c7925163dcb`. PlayCanvas/TypeScript,
120 Hz fixed simulation. One Codex agent; no delegates, new dependencies or assets.

## Behavior and authority

`src/core/anticipation.ts` is owned by each gameplay Match. It reflects the live
ball into the existing deterministic opponent-half predictor, including axial
spin, and reflects the result back. The shared predictor now returns velocity
at its chosen contact sample and accepts an optional lateral stance offset.
Only the human uses the 0.30 m offset; AI defaults, movement and tactics are
unchanged. Reach estimates retain acceleration, directional pace, momentum,
turn/braking cost, legal bounds, bounce and service constraints.

Prediction refreshes on incoming contacts/bounces and every 180 ms on distant
approaches or 100 ms in the final approach. A reachable arrival within 1.1 s
starts a native upper-body clip at 200 ms before its registered prepare marker,
then advances at source speed to 40% of the prepare-to-contact interval and
holds. A 45 cm side deadband prevents forehand/backhand oscillation. Real family
changes blend through the existing native state graph. No StrokeAction, input,
contact, aim, launch, meter credit or signature can be created by anticipation.

Player input still enters the existing gesture/buffer/StrokeAction pipeline.
Compatible drive input inherits the preparation ID and source time, avoiding a
native transition/restarted wind-up. The remaining contact lead scales with
prepared progress: 130 ms when unadvanced, down to 78 ms at the held pose
(75 ms lower guard). Source time advances to the **unchanged** contact marker;
the sampled physical racket follows that same clock. Prepared warp starts at
zero and ramps into the existing bounded contact reach, rather than jumping
the displayed racket to the ball. Unprepared actions and deliberately different
slice/lob clips retain the 130 ms default. Provisional taps retain their original
160 ms resolution/impact guard. Tap, hold, double tap, drag, serve and signature
recognition are unchanged. Contact windows, 0.46 m sweep forgiveness, 0.95 m warp
limit, shot power, ball physics and target placement are unchanged.

`render/kira.ts` consumes the optional preparation only for the human during a
rally. Base locomotion, native masks, FullBody serve ownership, grip calibration,
source tracks, sockets, five production rigs and character inspection remain
unchanged. Cancellation fades the existing upper layer back to Base.

## Footwork policy

The menu's Footwork select persists in `centre-court-footwork-v1`, independently
of progression/equipment. Standard is the initial recommendation; unavailable
storage keeps the session usable. Settings are snapshotted per MatchSession.
Rematch preserves that session's choice; a new menu start reads the selector.

| Policy   | Neutral final-step cap | Final-step radius | Arrival horizon | Pursuit alignment blend |
| -------- | ---------------------: | ----------------: | --------------: | ----------------------: |
| Off      |                      0 |                 0 |               0 |                       0 |
| Light    |                1.8 m/s |            0.85 m |          400 ms |                     12% |
| Standard |                3.6 m/s |            1.80 m |          650 ms |                     32% |

Early assistance only aligns an already pursuing joystick, at 35% of the table's
blend. Opposing or orthogonal input (alignment below 0.25) is passed through
exactly. Neutral motion requires both the short distance and arrival horizon,
a reachable prediction, and a live incoming ball. Speed also falls with distance
and braking distance. Manual analog magnitude stays authoritative. Every request
passes through the original locomotion speed envelope, acceleration, reversal,
braking and bounds with exactly one integration per athlete per tick. No AI
steering policy was modified. Off disables steering, not anticipatory animation.

## Lifecycle and diagnostics

Point/fault/let transitions, new serves, restart, pause, outgoing/dead/unreachable
balls and menu clear anticipation. MatchSession disposal clears its Match and
clock before existing scene cleanup. Menu/loading/viewer never ticks this system;
resume recomputes rather than replaying a stale target. No timers, listeners,
workers, rendering entities or external resources were added by anticipation.

Existing developer snapshots/readout now include preparation, contact prediction,
mode, assisted ticks, predictor cost and bounded miss counts. Heuristic categories:
`too-far`, `moved-away`, `late-input`, `incompatible-preparation`, `racket-path`,
`contact-timing`. Family incompatibility currently identifies overhead/other
mismatch; it is not a universal animation-error detector. A missed sweep samples
the current live zone; diagnostic labels are evidence aids, not causal proof.
Counts describe unsuccessful attempts, which can precede a later successful
attempt. HUD feedback stays concise: “MISSED · CHECK TIMING AND REACH”.

## Measured results

Raw data and exact workload descriptions are in [verification/goal-011](verification/goal-011).
The original baseline was captured before implementation; the expanded beginner
rally harness was also run against an isolated checkout of the exact baseline.
Baseline “mode” labels all run the same old lateral policy, since modes did not
exist. The original scripted AI comparison is retained separately from the
beginner controller. Measurements are deterministic scenario outcomes, not
human playtesting or physical-phone performance.

| Workload / metric                           |    Baseline | Revised Off | Revised Light | Revised Standard |
| ------------------------------------------- | ----------: | ----------: | ------------: | ---------------: |
| Reachable seeded feeds returned / 120       |          40 |         108 |           120 |              120 |
| Return percentage                           |       33.3% |       90.0% |          100% |             100% |
| Reached a 75 ms predicted zone / 120        |         117 |         109 |           120 |              120 |
| Preparation-delay proxy misses              |          77 |           1 |             0 |                0 |
| Beginner rally average contacts (60 points) |        8.40 |       11.80 |         10.77 |            11.85 |
| Beginner failures ≤4 contacts               | 27/60 (45%) | 27/60 (45%) |   27/60 (45%) |    23/60 (38.3%) |

Feeds use seed 11011, identical launches, 250 ms reaction, 70% joystick, neutral
within the final metre, and one release at predicted 75 ms reach. The proxy counts
failed returns with a 75 ms zone opportunity but no 133 ms zone opportunity; it
is **not** a measured animation-delay diagnosis. Beginner matches use the same
movement/release constraints, seed 11011, easy AI and 60 actual concluded practice
points. The 120 feeds intentionally cover reachable ordinary balls, so 100%
there does not imply guaranteed contact. Unreachable, moving-away, early/late
and no-input tests retain misses.

Trade-offs: the established more capable mixed controller (six match attempts,
seeds 1100–1105) averages **13.54 → 12.28** contacts, median 3 → 3, p90 43 → 39;
≤4-contact failures 40/67 → 33/53. Assistance therefore did not improve every
controller/workload. Near-ground/extreme-side probes in the unchanged 90-case
lob/slice/drive harness return **89 → 86** per intent, with all three intents
remaining equivalent; conservative predictive reach rejects some low wide balls
that the old lateral chase could recover. No forgiveness/physics adjustment was
used to hide that regression. Light and Standard tie on the easy feed workload
but differ in steering tests and beginner match outcomes.

Existing performance workload (one warmup, five repetitions, Node Linux cloud):
median simulation tick **0.00191 → 0.00301 ms**, below its existing 0.1 ms budget.
The return-feed Standard average is 0.00445 ms/tick vs original 0.00168 ms/tick;
short workloads include JIT/order noise. These are CPU timings, not frame times,
thermal measurements or mobile promises. The shared AI comparison keeps its
per-decision budget; its 90-match aggregate timeout is 90 s because the workload
now runs two predictors and measured 28.8 s alone / 44–52 s under contention.
Assertions, match count, seeds and per-call budgets are preserved.

## Verification and acceptance

The prepublication validation ledger is `verification/goal-011/validation.md`.
The commit’s GitHub checks and production handoff record the final full-suite
result and deployment identity.
Targeted units cover prediction/reach, no automatic hit, cancellation, side
hysteresis, source-time continuation, deliberate shots, provisional authority,
early/late input, modes, manual priority, unreachable shots, acceleration,
render-cadence determinism, miss diagnostics and disposal. Browser coverage uses
actual five-athlete GLBs/native layers for prepared returns in Standard and Off,
plus existing serve, roster, grip, idle, multi-point, restart and lifecycle tests.
Jax remains unavailable and unchanged.

Official native capabilities reviewed: [AnimComponent](https://developer.playcanvas.com/user-manual/animation/anim-component/),
[AnimComponentLayer](https://api.playcanvas.com/engine/classes/AnimComponentLayer.html)
(`transition`, `activeStateCurrentTime`, weighted layers), and the installed
PlayCanvas native state graph used by the existing renderer. Interception and
sports motion reuse this repository's AI and locomotion implementation and its
existing third-party notices. No separate skeletal/animation library was added.

**Physical iPhone Safari acceptance remains UNVERIFIED.** Linux Chromium and
mobile-profile WebKit are automated regression evidence only. Next acceptance:
play tap/hold/lob returns on real iPhone Safari with all five athletes, checking
perceived preparation, opposing-stick control, low-wide-ball trade-off, grip,
pause/background/resume and sustained thermal/frame behavior.
