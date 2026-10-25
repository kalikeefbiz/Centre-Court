# Manual iPhone Safari test checklist

**Status: NOT RUN on physical iPhone hardware.** Automated mobile WebKit checks do not establish iPhone compatibility. Record device model, iOS version, Safari version, date, commit, orientation and network for every device run.

## Launch and layout

- [ ] Load the GitHub Pages URL in Safari in a fresh tab; no blank canvas or stuck loading screen.
- [ ] Menu, difficulty/format selections, Play, Practice and How to Play are reachable without browser zoom.
- [ ] Verify small-screen portrait (e.g. iPhone SE) and a notched phone; safe-area controls remain reachable.
- [ ] Rotate portrait → landscape → portrait, including during an active rally. Court, score and controls resize correctly.
- [ ] Expand/collapse Safari's address bar and bottom toolbar; neither thumb control is covered.
- [ ] Both athletes, ball and shadow remain readable in Broadcast and Behind Player modes.

## Input and gameplay

- [ ] Move in all eight directions. Release joystick outside its bounds; athlete stops without drift.
- [ ] Hold joystick with left thumb while charging/releasing HIT with right thumb. No lost pointer or page scroll.
- [ ] Release outside HIT; verify the swing still fires once. Cancel a gesture; no unintended shot or stuck charge.
- [ ] Hold HIT and drag left/right and up/down. Cycle STANDARD ↻ through slice/lob/standard. Observe visibly different trajectories.
- [ ] Use light, medium and full charge. Timing/accuracy and contact/miss feedback are readable.
- [ ] Play several actual rallies by moving into range and releasing beside the ball; no automatic player returns.
- [ ] Approach the net for a volley; serve cannot be volleyed before its bounce.
- [ ] Verify net shots, out calls and double bounces end a point exactly once.
- [ ] Observe legal serves from both sides, first fault/second serve, double fault and net-cord let if reproducible.

## Match and UI

- [ ] Complete a Quick set win and loss; result screen matches final scoring.
- [ ] Observe Love/15/30/40, deuce and advantage; a game requires two clear points.
- [ ] Reach 2–2 for a Quick tiebreak; verify one serve followed by alternating two-serve blocks and win by two.
- [ ] In Standard, verify set progression, 6–6 tiebreak and best-of-three match completion.
- [ ] Compare Easy/Normal/Hard movement, reaction delay and accuracy.
- [ ] Practice continues after rallies without awarding points.
- [ ] Pause → resume preserves ball position and score. Restart resets the game without reloading.
- [ ] Return to menu and start another match. Change difficulty and format between matches.
- [ ] Switch cameras during play; reload and confirm saved preference. Test private browsing with storage restrictions.

## Interruptions and sustained use

- [ ] Switch Safari tabs, background Safari, lock/unlock, take a call and return. Match is paused and resumes on request.
- [ ] Leave mid-charge and mid-joystick gesture; resume without stuck movement, ghost shots or skipped points.
- [ ] Play for 10+ minutes on battery; record heat, battery use, stutters and subjective input latency.
- [ ] Test Low Power Mode and a throttled/slow connection; record time to interactive and frame pacing.
- [ ] WebGL interruption/restoration (if available through device tools) pauses and recovers or shows a useful reload message.
- [ ] Inspect remote Safari console for runtime errors, duplicate listeners or growing GPU/memory use after five restarts.

Record each failure with reproduction steps and a screenshot/video. Do not mark hardware compatibility as passed until these checks are completed on named devices.

## GOAL 001B multitouch retest

Run in Broadcast and Behind player, in portrait and landscape:

- Hold left thumb on the joystick continuously; cycle STANDARD ↻, then charge HIT and drag its aim with the right thumb. Each should update immediately without stopping movement or toggling twice.
- With movement held, hold Shot, drag outside its boundary and release: movement must continue and exactly one shot should execute.
- Hold both controls, then lift the joystick thumb first: charge must continue. Release Shot to execute.
- Drag joystick over other controls: it must remain movement input until released.
- While both are held, switch apps, open Control Center, lock/unlock or rotate the phone; return and resume. No stuck movement, phantom shot or retained charge should occur. New touches must work immediately.

## Kira / GOAL 002

- On a fresh load and a cached reload, confirm the pink character and pink/black racket appear with textures (the temporary opponent should remain).
- In each camera, watch idle, low joystick movement, full-speed movement, charge, release, return, pause/resume, point reset and match restart. Check for pose snaps, detached racket, foot sliding and texture corruption.
- Inspect the right-hand grip through the full swing; report any floating, wrong rotation, open fingers or body intersections. Confirm the dedicated serve, forehand, two-handed backhand, volley and overhead motions are distinct. Review medium-confidence slice/lob mappings against the inspection sheets.
- Check ball/string contact at serve, forehand, backhand-side reaches, slices, lobs, volleys and low/high or stretched returns. Report any visible snap from the short visual contact correction.
- Complete and restart a quick match, then play 10 minutes in both orientations. Record device/iOS, loading time, perceived input latency, frame stability, heat, memory reloads and battery behavior.
- Interrupt while Kira is charging or swinging (Control Center, app switch, lock, incoming call); resume and confirm both animation and input recover without a phantom shot.

## GOAL 002C acceptance additions

- [ ] Confirm Pink Valkyrie (white/pink outfit and pink hair), the separate pink/black racket, and red/lime Royal Rally ball load on fresh and cached production visits.
- [ ] Tap HIT twice as separate quick shots; no double-tap power behavior. Compare with capped full hold/release.
- [ ] Hold continuous left-thumb movement while the right thumb charges, drags direction/depth and releases outside HIT. Repeat lifting either thumb first, canceling either touch and rotating.
- [ ] Intercept on each side after bounce, then before bounce at the net. Confirm sided groundstrokes and compact volleys, dedicated serve and descending overhead. Slice/lob should happen only when selected.
- [ ] Observe hand grip, ball/string gap, root stability and open fingers at low/high/stretched contact; review the 30 fps calibration frame estimates and medium-confidence mappings.
- [ ] Judge regulation ball readability in both cameras, especially portrait, bright daylight and Low Power Mode. Do not increase geometry size without reviewing the approved scale.
- [ ] Record download time, memory pressure, heat and sustained frame pacing over ten minutes.

## GOAL 004 — Crown Pavilion

- [ ] In portrait and landscape, play both cameras. Verify Kira, opponent, 1.50× Royal Rally, net tape and singles lines remain readable against the blue hardcourt. The existing behind portrait framing crops the outer doubles alleys; check actual play at wide positions and near the touch-control area.
- [ ] Pause → Stadium detail: compare reduced/full crowd; confirm court, ball, characters, input, score and camera preference stay intact. Check sound On/Off, Safari gesture unlock, background/pause silence and resumed ambience.
- [ ] Serve, return, extend a rally, win/lose a point, continue, finish a match. Compare the physical stadium display with the HUD, including deuce/advantage and match winner. Inspect display up close with DEV → Stadium inspection if required.
- [ ] Export three uninterrupted GOAL 002D 10-second records each for loading/init, serving, sustained rally and camera switching. Compare baseline/GOAL 004 on the same iPhone, iOS, orientation, DPR, power/thermal state, cache and crowd tier. Keep 60/30 fps budgets separate from observed values.
- [ ] Check quiet point reactions, clipping, safe areas, simultaneous move/charge/aim, cancellations, context recovery and Safari JSON export. These remain hardware acceptance steps; Linux WebKit is not an iPhone measurement.
