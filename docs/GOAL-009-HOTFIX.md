# GOAL 009 animation ownership hotfix

Baseline: `69f0434` (integrated GOAL 009). Single-agent corrective assignment.
No specialist was spawned or resumed. No model, rig, grip calibration, source
animation, equipment definition, contact path, gameplay or deployment workflow changes.

## Reproduction and root cause

A source-only browser harness (`tools/goal009/idle-harness.html`) loads the actual
AthleteRenderer, production GLBs, calibrated active SkinInstances and native
PlayCanvas AnimComponent. It uses fixed 1/60 s presentation steps, separately from
the unchanged 120 Hz Match simulation. The regression is reproducible without
assuming a defective rig.

On the baseline, stationary Nova with no action selects ForehandVolley, holds its
clock at 22/30 s and raises Stroke weight to approximately 1. Crossing the .15 m/s
cutoff withdraws that layer; stopping restores it. A controlled zero → .16 → zero
speed sequence produces a maximum consecutive hand displacement of 0.524 m.
Disabling AthleteGrip.alignFrame/apply yields the identical arm positions and
0.524 m displacement; disabling forced Stroke influence removes the raised-arm
pose. Held stationary source breathing is approximately 1.5 mm per frame, not
an accumulating grip error. This distinguishes the reproducible cutoff snap
from a claim that a fully stationary athlete continually restarts its clip.

The controller is shared by all five athletes and both renderer sides. The forced
volley idle therefore contributed directly. Changing live masks between full-body
serve/preview and upper-body rally also required native rebinding at ownership
boundaries. No rig/bind failure was found that justified replacing the GOAL 009
corrections. The existing absolute finger targets and paired hand/socket frames
remain intact; native repeated-evaluation tests retain them.

## Correction

- Base/Locomotion exclusively owns idle and movement. No-action stationary play
  does not select an action, seek an action clock or start a Stroke transition.
- The locomotion Idle copy bends only the dominant elbow forward by 60 degrees
  in its existing local rotation keys, clearing clothing with a low ready carry.
  PlayCanvas blends this cyclic Idle derivative normally. The original Idle and
  all action tracks remain unchanged for source inspection and contact sampling.
  There is no additional per-frame arm override or custom animation engine.
- Stroke retains its Spine-descendant upper-body mask throughout its lifetime.
  Hips, root and legs stay under Base control for rally strokes/preparation.
- A separate native FullBody layer owns serve setup/execution/follow-through and
  explicit cosmetic preview. It has no mask; no live mask switching/rebinding
  occurs during gameplay. Both action layers fade out and clamp to exactly zero
  below 0.0001 influence. Foot grounding follows the fading full-body influence.
- Explicit charging can show the existing anticipation pose. Match actions own
  wind-up, contact, follow-through and recovery times. Transition calls occur only
  when the selected clip or authoritative action ID changes; idle never restarts
  them. Serve setup intentionally holds Serve at time zero until release.
- Cosmetic equipment preview still intentionally uses the volley pose, confined
  to its explicit menu presentation flag. Closing preview releases it to Idle.
- Inspector temporarily silences both action layers and restores their weights.
  Read-only snapshots now expose both native action-layer states and weights.

Native APIs: [state graphs](https://developer.playcanvas.com/user-manual/animation/anim-state-graph-assets/),
[layer masks](https://developer.playcanvas.com/user-manual/animation/anim-layer-masking/),
[AnimComponentLayer](https://api.playcanvas.com/engine/classes/AnimComponentLayer.html).
The graph's initial mask is also set once through the layer API because the engine
binder can have a graph mask while the public layer.mask getter still reports null.

## Verification method and limitations

The targeted browser regression covers every athlete on renderer sides 0 and 1:
initial idle; six simulated seconds/360 consecutive idle frames; 120 repeated
held-time evaluations; movement near the old cutoff; serve preparation/execution
and release to rally; forehand, backhand, both volleys, lob, slice and smash recovery;
miss/cancel recovery; move-stop; pause/resume; point-over; restart/rematch; menu;
preview open/close and equipment reselection. Lower-body rotations are compared
with Stroke influence removed at the same animation time. Grip/socket attachment,
actual calibrated skins, fixed masks, weights, clocks and transition counts are
asserted. Six successive half-second rendered samples per athlete provide temporal
image evidence alongside joint-transform data.

The harness supplies controlled presentation scenarios, not autonomous match wins.
The existing UI/browser suite separately exercises real serves, contacts, AI,
reset/rematch, equipment persistence, inspector paths and loading. The catalog
still contains one supplied racket: reselection and persistence are testable;
visually accepting another cosmetic GLB is unavailable without a second model.

Linux Chromium and mobile-profile Linux WebKit are not physical iPhone Safari.
Physical device acceptance must be repeated by the owner. Existing extreme
Nova shoulder/clothing/hair surface artifacts remain outside this controller fix.
There is no claim of a new artist-authored body animation library.

## Results

See the committed temporal evidence in `public/verification/goal-009-hotfix/`.
Final automated counts and release identity are recorded in the delivery handoff
and the unchanged Verify and deploy Centre Court workflow for the final commit.

Native roster results (Chromium and WebKit both pass on both sides):

| Athlete | Consecutive idle frames per side | Maximum idle hand step | Idle action weights | Serve / seven rally strokes / grip stability |
| --- | ---: | ---: | --- | --- |
| Kira | 360 | 2.03 mm | 0 / 0 | Pass |
| Zuri | 360 | 2.44 mm | 0 / 0 | Pass |
| Dante | 360 | 2.45 mm | 0 / 0 | Pass |
| Rico | 360 | 1.88 mm | 0 / 0 | Pass |
| Nova | 360 | 2.07 mm | 0 / 0 | Pass |

These small steps are continuous Idle breathing, with zero action transitions.
All 120 held-time repetitions retain identical racket-head positions and stable
joint rotations. The old .14/.16 m/s boundary now keeps both action layers at zero;
maximum hand step is 1.39–2.04 cm for this alternating-speed stress sequence.
GIFs named `<athlete>-idle.gif` contain six rendered half-second samples;
`<athlete>-frames.json` contains 360 consecutive hand/head samples per side.
`chromium-summary.json` and `webkit-summary.json` record per-athlete results.

Local setup/verification notes: 20 focused unit tests and the production build
pass; five native roster cases pass in each browser (each case covers both sides).
The first WebKit attempts failed before browser launch because this non-root
executor lacked system libraries. Extracting official Debian packages into the
local browser runtime enabled actual WebKit 27.2 tests. Its system-cache-only host
check was bypassed for that local invocation; no test assertion or animation
update was disabled. CI uses its unchanged standard browser dependency install.
The first full local unit run passed 195/196 tests; the existing 30-second scripted
simulation comparison timed out on this Node 24 cloud host, including a focused
rerun under rendering load. Its timeout/assertions remain unchanged. The final
release gate runs on the repository's standard Node 22 GitHub runner.
