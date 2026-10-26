# GOAL 005A — velocity-based tennis locomotion

The match's existing 120 Hz FixedClock remains authoritative. `Match.move` no
longer translates normalized input directly. Both athletes call the same
`requestMovement` → `stepLocomotion` pipeline once per rally tick; positions
are integrated from persistent velocity with trapezoidal integration.

## Interfaces and tuning

`src/core/locomotion.ts` exports `LocomotionConfig`, `LocomotionState`,
`createLocomotion`, `resetLocomotion`, `requestMovement`, `stepLocomotion`,
`directionalSpeed`, and `movementTravelDistance`. `HUMAN_LOCOMOTION`,
`PLAYER_BOUNDS`, and `FOOTWORK_ASSIST` hold shared tuning. Existing AI difficulty
pace and acceleration remain in `PRESETS`; `AI_LOCOMOTION` derives directional
limits and braking from these and the shared human proportions.

Positions are meters, velocities m/s, accelerations m/s², time seconds.
The speed envelope is elliptical; analog magnitude scales its radius, and
input length above one is normalized. Forward means toward the net on either
court half. Maximum human acceleration is 24 m/s², release braking 32 m/s²,
and reversal braking 36 m/s². Near-target velocity uses exponential feedback
at 20/s, with a small finite settling threshold. Reversal brakes the whole
old travel vector to zero before starting the opposite acceleration next tick.
Boundary contact removes outward velocity without transferring its magnitude
to the remaining axis. Collision acceleration includes the contact impulse.

Existing serve immobility, shot selection, charging, contacts, and independent
movement remain intact. The existing X-only assistance now requests velocity
through the shared integrator; it no longer moves an athlete a second time in
the same tick. No new stroke locks, stamina or dash mechanics were added.

`OpponentAI.steer` returns desired velocity only. Its `velocity` getter refers
to the same object as `players[1].locomotion.velocity`. Arrival steering limits
speed by both proportional distance and the braking-distance envelope.
Interception uses directional pace, signed velocity projection (including lost
distance on reversal), transverse turning time and damped acceleration. It is
an analytical conservative planning estimate with the existing contact margin,
not a second movement integrator or an exact multidirectional path solver.

`Match.repositionPlayer` clears movement on intentional placement. Serve setup,
point completion, fault, let, result, menu and restart clear velocity, intent,
acceleration and flags. Pause freezes the complete simulation with momentum
intact; resume advances the usual single fixed step.

## External foundations

Exact examined files, pinned upstream revisions, adaptations and full MIT notices
are in [public/THIRD_PARTY_NOTICES.txt](../public/THIRD_PARTY_NOTICES.txt), which
also ships with the production distribution.

PlayCanvas's `damp` / `_updateController` supply time-based damping, persistent
horizontal velocity feedback and physical-speed/travel-direction observation.
The vector acceleration cap is adapted from Centre Court's existing AI steering,
relocated to the common integrator. No PlayCanvas rigidbody dependency is needed.

OpenTennis `player.rs` (`run_speed`, `run_velocity`, `angle`, `run_motion`,
`Body::step/go/toward`), `motion.rs` recovery functions and P7 movement research
informed the separation of pace/agility, directional movement and stroke state.
Its instantaneous directional assignment and frame-based/commercial motion paths
were unsuitable and were not ported. Directional speed ratios are Centre Court
starting values, not upstream or real-player measurements. No commercial assets,
character stats, motion data or animation files were fetched or reused.
PlayCanvas AnimComponent documentation was checked for compatibility. Tetetennis
was examined only for design context; no source was copied.

## Measured behavior

Measured by `tests/locomotion.test.ts` using production functions at 1/120 s.
These values are tuning observations, not evidence of realistic biomechanics.

| Human behavior                                 | Measurement |
| ---------------------------------------------- | ----------: |
| Forward speed                                  |     6.3 m/s |
| Lateral speed                                  |     6.0 m/s |
| Backward speed                                 |     4.6 m/s |
| Rest → 99% forward speed                       |    0.3667 s |
| Rest → fully settled forward speed             |    0.4667 s |
| Full forward speed → stop                      |    0.2000 s |
| Forward stopping distance                      |    0.6204 m |
| Full rightward speed → zero                    |    0.1750 s |
| Full rightward speed → first leftward velocity |    0.1833 s |
| Full rightward speed → full leftward speed     |    0.6250 s |

The existing 30-match-attempt seeded simulation per difficulty (seeds 700–729,
900 simulated seconds cap per attempt) measured AI legal return rates of 83.70%,
90.62%, and 95.99% on Easy/Normal/Hard. Completed matches were 30/29/14; capped
unfinished attempts are not counted as completed. Hard remains competitive
without increasing its existing 6.2 m/s forward speed budget. These are scripted
simulation results, not human playtesting or iPhone performance measurements.

## Validation and GOAL 005B handoff

Run `npm test` for existing core/AI/input/scoring/match-flow/performance tests
and focused locomotion tests. The latter cover acceleration, limits, braking,
reversal, analog and diagonal input, both court halves, all boundaries, shot
preparation, X-only assistance, state transitions, AI arrival/integration and
identical results under 30/60/144 Hz render schedules. `npm run build` checks
TypeScript and Vite. Targeted Playwright checks use `play.spec.ts`, `ai.spec.ts`
and `kira.spec.ts` for gameplay, mobile controls, AI and existing animation/contact
compatibility. The unchanged Pages workflow runs the complete required suite
before deployment.

GOAL 005B should read `match.players[side].locomotion`: `velocity`, `speed`,
`desiredVelocity`, `acceleration`, unit `travelDirection`, `state`, `braking`,
and `reversing`. Vectors use world X/Z, Y remains zero. The development snapshot
copies all these fields under `locomotion`; ordinary games retain the existing
absence of the developer API. `Kira.update` already feeds authoritative speed
and velocity into its existing discrete `locomotionState` selection.

No clips, blend tree, rig, racket socket, contact behavior or animation assets
changed. Directional blending, shuffle-cycle inspection, foot sliding and foot
IK remain outside this goal. No physical iPhone/Safari hardware validation has
been performed. Browser coverage uses Chromium and Playwright's iPhone WebKit
profile on Linux; it does not establish device performance or touch feel.
