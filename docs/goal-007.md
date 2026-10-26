# GOAL 007 — lob contact and mobile controls

Baseline: `f17e41cb3c2cc9a63f66a80dfb8c8277dacb99bf`.

The Lob track contains an initial forward/upward scoop and a later overhead
motion. The registry selected the latter: frame 37 places the sampled sweet spot
at `(0.03177, 2.17581, -0.11636)` m relative to the athlete. That is incompatible
with many legal low groundstrokes even after the existing 0.95 m bounded warp.
The original first scoop at frame 17 places it at
`(-0.01481, 1.09761, -0.61016)` m and is moving upward, in front of the body.

Native rig inspection at frames 10, 17, 23, 32 and 37 confirmed the sampled path.
The marker changes are preparation **27 → 10**, contact **37 → 17**, end
**61 → 32**. Ending before frame 33 excludes the second overhead motion. The
original GLB, all 13 source tracks, rig, textures and racket socket are untouched.
`rig-motion.json` is unchanged: its samples were correct; the chosen segment was
wrong. Kira and gameplay consume the same registry and fixed-step stroke time.

## Matched contact measurements

`tests/lob-contact.test.ts` uses the real recognizer, Match prediction, movement
assistance, Ball integration, bounded racket warp, swept contact and launch.
Ninety identical incoming/player setups per intent combine lateral offsets
±0.25/0.5/0.8 m, nominal contact heights 0.45/0.75/1.1/1.5/1.85 m, incoming
speeds 9/14/20 m/s, side drift, gravity, drag and topspin. The contact comparison
aligns committed releases; separate fixed-step tests execute the full double-tap
sequence while the incoming ball continues moving.

| Measurement                                          | Baseline | Corrected |
| ---------------------------------------------------- | -------: | --------: |
| Lob gestures recognized                              |    90/90 |     90/90 |
| Lob requests accepted into a stroke                  |    89/90 |     89/90 |
| Lob successful contacts                              |    54/90 |     89/90 |
| Slice successful contacts                            |    89/90 |     89/90 |
| Drive successful contacts                            |    89/90 |     89/90 |
| Lob contacts among 35 reachable low-ball comparisons |     0/35 |     35/35 |

One wide, low setup is unreachable for all three intents. It remains a miss.
For a representative backhand-side 0.75 m ball at 9 m/s, the old stroke starts
normally at the first 120 Hz tick and selects Lob correctly. The ball is inside
the legal contact zone. At marker time its height is 0.740 m but the warped racket
is still 1.329 m high; the minimum swept distance is 0.523 m, beyond 0.46 m.
The corrected marker's planned racket position equals the predicted target,
without saturating the existing warp limit. Physical contact then occurs through
the unchanged sweep/window, with timing/position quality still affecting the shot.

Additional tests compare ten whole-court rising/falling drive, slice and lob feeds
on both body sides, execute six moving-ball double taps, measure high-arc launches
and opposing-court bounces, and retain unreachable, too-high, too-low and late
misses. No automatic lob contact, larger forgiveness, or new ball physics is used.
Detailed rows can be generated with
`CC_LOB_OUTPUT=/tmp/lob-contact.json npx vitest run tests/lob-contact.test.ts`.

## Mobile controls

Dimensions are CSS pixels, measured at 390 px portrait and 844×390 landscape:

| Surface / range                                |       Before |         After |
| ---------------------------------------------- | -----------: | ------------: |
| Portrait joystick acquisition                  |      110×110 |       164×164 |
| Portrait knob                                  |        48×48 |         64×64 |
| Portrait full-input travel radius              |         39.6 |         62.32 |
| Portrait HIT acquisition                       |       121×85 |       164×148 |
| Portrait full horizontal / vertical aim travel | 78.65 / 96.8 | 114.8 / 125.8 |
| Landscape joystick acquisition                 |      100×100 |       148×148 |
| Landscape HIT acquisition                      |       110×66 |       164×132 |

At 320 px width the acquisition targets scale to 144 px wide. Transparent margins
keep the visible faces smaller than the acquisition surfaces. Controls respect
all three relevant safe-area insets; landscape and simulated notch/home-indicator
insets are browser-tested. The joystick remains fixed-center, preserves analog
magnitude and normalized diagonals, and tracks beyond its visible boundary.

Pointer IDs remain exclusively owned by the initiating control. Capture is the
primary route; window routing handles an initially unavailable capture outside
the element. Owned element events stop propagation to avoid duplicate handling.
Only an owned pointerup releases a shot. Pointercancel, genuine capture loss,
blur, pause and point reset cancel rather than release. Natural capture loss
following pointerup is harmless. Unrelated IDs cannot end another thumb's input.

Both controls disable text selection, touch callouts and native panning. HIT no
longer scales its hit box while pressed. Geometry is latched at acquisition, so
charging, layout changes and dragging do not alter aim sensitivity mid-gesture.
Joystick engagement, direction, charge and shot intent remain visible. A small
on-court target shows intended placement while holding; it uses the same extracted
placement formula as Match, before execution error, not a separate flight model.

Tap/hold/double-tap timing remains **180 ms / 160 ms** with the existing 1.2 s
charge cap. A standalone drag beyond 12 px is aiming input, so a brief intentional
swipe commits power rather than becoming a tap. A recognized short second tap can
still aim its lob; holding the second press retains power priority. Serve semantics
are unchanged. No additional shot-selection buttons were introduced.

## Reference and validation scope

The W3C Pointer Events capture, implicit-release and cancellation algorithms and
MDN `setPointerCapture` documentation were reviewed. No external gesture library
or copied source was introduced:

- https://www.w3.org/TR/pointerevents3/#pointer-capture
- https://www.w3.org/TR/pointerevents3/#the-pointercancel-event
- https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture

The existing Vitest and Playwright projects cover the matched physics scenarios,
actual rendered lob returns, large thumb contacts, native capture/loss, out-of-pad
aiming, independent pointers, cancellation, serving, pause, layout and safe areas.
Chromium provides native multi-contact injection; WebKit also tests real mouse
pointer capture plus touch-event ownership. Emulation does not establish physical
iPhone comfort or OS touch behavior. No physical hardware validation was performed.

Two GitHub-hosted setup attempts downloaded Ubuntu browser dependencies very
slowly from the Azure HTTP mirror. The existing Pages workflow now selects the
official Ubuntu HTTPS archive/security mirrors through the runner's existing APT
mirror lists. Repository signatures, package requirements, all checks and the
production deployment jobs remain unchanged; no new pipeline was introduced.
