# GOAL 006 — unified HIT and lateral refinement

Baseline: `3b51886863b7178123c671af5ca12e8c45872071`.

## Controls and impact commitment

`src/core/shot-gesture.ts` is the sole recognizer for HIT pointers, canvas mouse,
Space, and assistive button activation. It uses normalized native event timestamps for press/release duration (including
queued release delivery after a slow frame), and monotonic polling for expiry, without timeout callbacks or a gesture dependency. Match still advances
all athlete movement, swing markers, racket sweeps, serving and ball physics at
120 Hz. Input recognition does not create a second simulation clock.

- Release before 180 ms: provisional slice. Preparation starts immediately when
  the incoming ball is reachable; no impact can happen before commitment.
- A second press within 160 ms of first release, within 40 CSS pixels and on the
  same input surface cancels that provisional preparation. A short second release
  commits one lob. Holding the second press to 180 ms instead requests power.
- At 160 ms without a second press, commit the slice. Its initial contact marker
  is 160 ms, 30 ms beyond the ordinary 130 ms windup; the animation rate and racket
  trajectory use that same marker. There is no separate pre-animation tap delay.
- Holds commit a drive on release. The existing 45–100% power curve, 1.2 s charge
  cap, aim/depth dragging, power bar, and 130 ms committed-shot windup remain.
- The existing 250 ms input buffer and ±55 ms contact window remain. A provisional
  slice cannot hit on the early side of its marker. Lob/hold contact uses the
  ordinary window. New commands cannot queue another shot behind recovery;
  rejected logical gesture IDs remain rejected when their later commit arrives.
- Command sequence IDs make repeated fixed-step delivery idempotent. Cancelled
  taps never become irreversible ball strikes. Point/fault/let/restart/pause epochs
  clear incomplete gestures and buffers; committed strokes freeze on pause.
- Tap or hold during serve commits the existing serve action immediately on
  release, preserving hand hold, toss, overhead contact and follow-through. Rally
  double-tap recognition does not delay or replace the serve sequence.

The visible selector is removed. HIT shows SLICE / POWER / LOB feedback. Space and
mouse use the same gestures; 1/2/3 remain explicit next-press overrides. Stroke
animation follows ball context (including volleys/overheads); slice/lob intent
still determines ball outcome. No animation assets or racket sockets changed.

## Lateral tuning and measurements

The GOAL 005 controller and vector acceleration cap remain. Direction-weighted
lateral coefficients blend with unchanged longitudinal coefficients; AI retains
its existing difficulty coefficients and shared integrator.

| Human parameter                                       |          Before |     After |
| ----------------------------------------------------- | --------------: | --------: |
| Lateral acceleration (m/s²)                           |              24 |        27 |
| Lateral release braking (m/s²)                        |              32 |        38 |
| Lateral reversal braking (m/s²)                       |              36 |        42 |
| Lateral convergence rate (/s)                         |              20 |        24 |
| Forward / lateral / backward caps (m/s)               | 6.3 / 6.0 / 4.6 | unchanged |
| Longitudinal acceleration / braking / reversal (m/s²) |    24 / 32 / 36 | unchanged |

Measured by the real fixed-step integrator at 120 Hz, from unobstructed full
lateral speed (tests compare the baseline coefficients with the new coefficients):

| Lateral measurement             |  Before |   After |
| ------------------------------- | ------: | ------: |
| Reach 99% speed                 |  350 ms |  308 ms |
| Reach full speed                |  450 ms |  392 ms |
| Release to rest                 |  192 ms |  158 ms |
| Stopping distance               | 0.563 m | 0.474 m |
| Reversal to zero                |  175 ms |  150 ms |
| Reversal to full opposite speed |  625 ms |  542 ms |

Animation still follows actual velocity, including during opposing input. The
low-speed motion blend reaches full weight at 0.5 rather than 0.65 m/s; braking /
reversal retain 98% / 94% movement weight instead of 95% / 88%. Body orientation
convergence increases from 12/s to 14/s normally, 18/s while braking/reversing;
stroke-facing remains 35/s. Existing derived shuffle loops and speed-dependent
cadence are preserved. No requested-direction animation leads physical reversal.

## References examined

- [Hammer.js TapRecognizer](https://github.com/hammerjs/hammer.js/blob/master/src/recognizers/tap.js):
  duration, intertap interval, positional slop and failure-dependent delayed
  recognition; MIT license inspected. No code copied and no Hammer dependency.
  Centre Court uses reversible preparation instead of Hammer's delayed single-tap
  emission, allowing immediate presentation with deterministic impact commitment.
- [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events):
  pointer ownership, capture, cancellation and touch-action conventions.
- [MDN dblclick](https://developer.mozilla.org/en-US/docs/Web/API/Element/dblclick_event):
  click/double-click ordering explains why native click/dblclick handlers cannot
  safely commit mutually exclusive tennis shots. Recognition uses pointer events.

Existing PlayCanvas/OpenTennis notices and all GOAL 005 foundations remain.
No new library, assets, build pipeline, or deployment infrastructure was added.

## Validation scope

Focused recognizer, input-owner, buffer/contact, serve, lifecycle, boundary,
AI, physics and deterministic simulation tests use existing Vitest. Browser
coverage uses the existing Chromium and iPhone WebKit Playwright projects,
including actual-rally intent changes, native multitouch hold/aim ownership,
cancellation, pause, practice, layout and native animation blending. Timing-tight
pairs are dispatched inside one browser task to avoid software-WebGL CDP round
trips being mistaken for human holds; native touch ownership is tested separately.
The standard Pages workflow runs the full regression suite before publishing.

Coverage: 148 Vitest tests; TypeScript/Vite build passed. The
existing seeded scripted-player regression observed legal-return rates of 87.3%
Easy, 92.2% Normal and 96.9% Hard; these are simulation observations, not hardware
playtest results. Existing prediction (<2 ms) and match-tick (<0.1 ms) CPU budget
checks passed on the Linux Node runner.

Physical iPhone testing was not performed for this change. Thresholds and the
modest lateral/animation tuning still need owner hardware feel validation.
