# GOAL 005 — integrated tennis

Baseline: `59975ed138c7b0d8cb188a3cba9148675f4cb1b5`.
The existing 120 Hz locomotion and match clock remain authoritative.

## Integrated behavior

- **Footwork:** native PlayCanvas AnimStateGraph/direct blend tree, driven by actual
  velocity, speed, acceleration, braking and reversal. A masked upper-body layer
  preserves moving legs during preparation. Gait cadence follows measured speed;
  left/right weights never follow requested direction ahead of physical reversal.
  Fast lateral running turns toward actual travel, then returns toward the net
  during stroke preparation. Existing Walk/Run also supply reverse-playback retreat.
- **Shuffle repair:** both 89-frame clips were sampled at every 30 Hz source frame,
  with rendered three-frame interval sheets. Startup, crossover and hop sections
  were excluded. Runtime loops use Left frames 45–63 and Right frames 39–51, with
  the final three samples closing to the initial pose. Original GLB and all 13
  source tracks remain unchanged and inspectable. A bounded 5.5 cm grounding
  correction keeps the lowest foot near its calibrated planted height; no foot IK.
- **Shot execution:** Match owns preparation, swing, contact, follow-through and
  recovery. A 130 ms wind-up reaches the registry marker, with a ±55 ms contact
  window. Relative ball/racket segment sweeps detect crossings between ticks.
  The racket template is sampled from Kira's actual hand hierarchy, grip, racket
  scale and sweet spot by `tools/sample-tennis-motion.py`; browser checks compare
  every stroke marker against the actual rig within 5 mm. Bounded reach warping
  and 46 cm contact forgiveness allow mobile timing without proximity-only hits.
  Position, timing and reach affect quality, pace and deterministic placement
  error. Incoming pace contributes modestly to the outgoing strike. Early/late,
  stretched and missed contacts have distinct feedback. Drive, slice, lob, volley,
  smash, aim and charging remain available. The same rules apply to AI shots.
- **Visible contact:** Kira follows the simulation's action timeline continuously.
  Existing bounded arm alignment follows the physical racket path throughout the
  swing. The old contact-frame snap, athlete rewind and visual ball-origin offset
  have been removed. The visible ball always occupies the authoritative position.
- **Serve:** ball begins at the sampled left palm, follows the hand during the
  initial action, detaches at 0.36 s into a gravity-driven toss, and reaches the
  sampled overhead racket point at 0.90 s. The simulated serve launches there;
  the stroke continues through follow-through/recovery. AI uses the identical
  toss/contact sequence. Faults, lets and first/second serve rules are retained.
- **Ball:** quadratic aerodynamic drag, spin-ratio Magnus lift, angular decay,
  impact-speed restitution and a Coulomb friction/angular-impulse bounce. Topspin
  dips and retains more horizontal speed under grip; slice lifts and responds
  differently at impact. Lobs use the same flight equations. A small inverse
  shooting solver uses that integrator to fit requested placement. AI, landing
  indication and live flight use the same 120 Hz collision/flight rules.
- **AI:** existing tactics and difficulty remain. Planning copies spin as well as
  position/velocity. Shot preparation starts ahead of impact; tactical quality is
  evaluated at predicted contact rather than at the earlier wind-up position.
  Acceleration, speed budgets, errors and recovery discipline remain bounded.

Measured seeded simulation (30 attempts per difficulty, seeds 700–729, 900 s cap):
legal AI return rates 87.78% / 93.59% / 97.06% on Easy / Normal / Hard; median
rallies 4 / 7 / 7 contacts, p90 38 / 45 / 87. Completed attempts 30 / 22 / 18;
capped attempts are not completed matches. The scripted human now releases ahead
of the swing marker, so these are current-playability measurements, not a strict
like-for-like comparison with 005A. Average AI decision CPU cost in the cloud run
was 0.032–0.039 ms. Real device performance and human enjoyment are not inferred.

Flight measurement at 0.5 s, identical initial 20 m/s horizontal / 4 m/s upward
velocity and ±180 rad/s spin: slice 2.885 m, flat 2.664 m, topspin 2.443 m high.
At a 20 m/s horizontal / 10 m/s downward court impact, ±315 rad/s spin produced
13.889 m/s backspin versus 16.221 m/s topspin horizontal rebound. These are
controlled tuning examples, not measured real-player biomechanics.

## Presentation and performance

The high-DPI rendering path explicitly disabled antialiasing at DPR ≥2. The opaque
Kira material already used trilinear mipmaps, and Kira does not cast mesh shadows.
MSAA is now enabled at every DPR, texture anisotropy is capped at 4, and match
resolution is capped at DPR 1.5. Menu retains its previous DPR 1.75 budget. Mesh,
skin weights, normals, textures, skeleton and racket socket are unchanged.

Portrait composition uses a shallower camera, improving athlete pixel height
while retaining the singles playing court, opponent and ball. Wide/deep movement
smoothly eases the framing outward. Portrait doubles-alley edges can crop;
landscape retains full court context. The portrait scoreboard is compacted to
keep the far athlete clear of its overlay. Broadcast and behind options remain.
Royal Rally's visual scale is 2.25 (previous default 1.5), a 1.5× increase in rendered
diameter to 0.15075 m. Its physical radius remains 0.0335 m. No glow or extra trail.

No new runtime libraries or paid assets. Flight, movement and swing sweeps avoid
per-step temporary geometry. Target shooting runs only on launch; contact prediction
runs only during preparation. Render animation uses the engine's existing graph.

## Validation and limits

Focused tests cover every stroke, swept contacts, misses, movement during shots,
palm/toss/strike, pause, deterministic schedules, spin, drag, bounce, net/tape and
landing prediction. Existing control, scoring, locomotion, match-flow, assets,
AI simulation and performance tests remain. Browser tests cover the native blend
and actual rig path, mobile control ownership, serving, AI returns, camera framing,
ball visual/physical scale separation and the unchanged 13 source clips.

Screenshots and frame samples: [verification/goal-005](../public/verification/goal-005/).
Baseline screenshots refer to the deployed 005A build; integrated precommit images
are explicitly labeled working-tree evidence. Full CI verification and deployed
commit identity are reported in the completion handoff.

Remaining limitations: these derived shuffle cycles and reverse playback are
bounded adaptations of the available assets, not newly captured tennis motion.
Foot sliding can remain at extreme speeds/turns; grounding is not planted-foot IK.
Racket contact uses a sampled, reach-adjusted string-bed path with forgiveness,
not deforming mesh collision. Physics coefficients are tuned for accessible rallies,
not a fitted biomechanical or professional-ball validation model. Linux Chromium
and WebKit results do not constitute physical iPhone/Safari or sustained GPU tests.

## Sources and licensing

Exact sources and adaptation boundaries are in
[THIRD_PARTY_NOTICES.txt](../public/THIRD_PARTY_NOTICES.txt), shipped in production.
PlayCanvas's native animation documentation, blending tutorial, configure-animation
skill and installed engine implementations supplied the graph/layer API patterns.
OpenTennis `ball.rs`, `player.rs` and `motion.rs` informed flight/contact/state
separation under its MIT option. Tetetennis flight/bounce and articulation/mocap
notes were conceptual/mathematical references only; no unlicensed source was copied.
All sampled animation/hand/racket data comes from Centre Court's existing assets.
