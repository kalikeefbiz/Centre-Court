# Centre Court · GOAL 002C

A playable mobile-first 3D arcade singles tennis foundation by **BlackHouse**, built with PlayCanvas and TypeScript. Kira uses the owner-supplied rigged character and separate racket GLBs. The AI opponent retains its temporary model.

**GitHub Pages:** https://kalikeefbiz.github.io/Centre-Court/

## Run, build, verify

Requires Node.js 22+ and npm. No PlayCanvas editor account, API key, backend, or external asset service is required. Fonts and the engine are bundled locally.

```sh
npm ci
npm run dev          # Vite development server; opens to the local network
npm test             # deterministic gameplay tests
npm run build        # strict TypeScript check and production build in dist/
npx playwright install --with-deps chromium webkit
npm run test:browser # production browser checks; run build first
npm run preview      # serve the production build locally
```

`npm run check` runs tests, the build, and browser checks. Browsers and their OS dependencies must be installed first. WebKit with an iPhone viewport is **emulation, not actual iPhone device verification**. See [verification](docs/VERIFICATION.md) and the [iPhone checklist](docs/IPHONE-CHECKLIST.md).

## Play

- **Desktop:** WASD / arrows move. Hold Space or left mouse on the court to charge, then release beside the ball to swing. J/L or mouse position aim left/right; I/K adjust depth. 1 drive, 2 slice, 3 lob. Escape pauses; C changes camera.
- **Touch:** left joystick moves. Tap HIT for a quick shot; hold to charge, drag horizontally to aim and vertically for depth, then release. One STANDARD ↻ selector cycles standard / slice / lob. Movement and shots accept independent pointers.
- **Serve:** tap or hold/release HIT or Space. The game chooses the correct serving position and service box. Aim and power still affect the serve. The 70% charge mark is a useful starting point.
- Forehand/backhand and volley are contextual. A release opens a 250 ms swing window; the ball must be within the stroke’s contact zone (ground 1.35 m, volley 1.30 m, overhead 1.25 m) and at a playable height. Contact near waist height with balanced positioning improves accuracy. There is limited lateral footwork assistance, never automatic returns.
- **Quick set:** one set, first to two games, win by two; seven-point tiebreak at 2–2. **Standard:** best of three six-game sets, seven-point tiebreak at 6–6. All tiebreaks require two clear points. **Practice:** endless rallies without scoring.
- Pause offers resume, restart, and menu. Camera preference persists locally. Backgrounding pauses play and requires an explicit resume.

## System boundaries

| Module                  | Responsibility                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/core/court.ts`     | Metre scale, regulation court geometry, line/service validation, seeded randomness                       |
| `src/core/ball.ts`      | Continuous ballistic flight, swept net crossing, floor-crossing interpolation, shot profiles, prediction |
| `src/core/scoring.ts`   | Pure point/game/set/match scoring, deuce, tiebreaks and service rotation                                 |
| `src/core/match.ts`     | 120 Hz match state machine, contact validation, athlete movement, point resolution, pause/resume         |
| `src/core/ai.ts`        | Difficulty presets, interception search and contextual shot selection                                    |
| `src/core/camera.ts`    | Smoothed camera rig and resilient local preference storage                                               |
| `src/render/scene.ts`   | One PlayCanvas camera, batched arena, Kira, temporary AI, shadows, ball and landing cue                  |
| `src/platform/input.ts` | Keyboard, mouse, multi-pointer joystick, charge/release and aiming                                       |
| `src/main.ts`           | Composition, UI binding, browser lifecycle and fixed-step scheduling                                     |

Core modules have no PlayCanvas or DOM runtime dependency. Camera storage is injected. Identical seed and fixed-step commands reproduce a match. The renderer never changes the ball, scoring, AI or match state. AI uses the same reach checks, launch physics, movement bounds and court rules as the player.

World +Y is up; +Z is the human end. The singles court is **8.23 × 23.77 m**; service lines are 6.4 m from the net. Royal Rally’s visual diameter is 0.067 m; the separate simulation sphere has radius 0.0335 m. Court paint tops meet the physics ground plane at Y=0. A ball touching a boundary counts as in. Net height rises from 0.914 m at centre to 1.07 m near the posts.

## State and rules

`menu → serve → rally → pointOver → serve`, with `result` after match point. Pause remembers the interrupted state. Restart constructs fresh scoring and resets the ball, timers and commands. Point resolution checks the rally state first, so competing collision events cannot award twice.

A serve's first floor contact is checked against its diagonal service box. A fault retries the same point and side; a second fault awards one point. A grazing net cord that reaches the proper box is a let and preserves the serve attempt. Returns before a serve bounces are disabled. Rally first bounces must be on the receiver's singles court. A second bounce loses the point. Non-grazing net shots are dead immediately. Each contact launches from the actual ball position; there are no interpolated player-to-player rally paths or rally ball teleports.

Simulation uses an accumulator at 120 Hz with floating-point tolerance, a maximum 100 ms frame catch-up, and lifecycle resets. Extremely slow devices deliberately slow game time rather than leap ahead. A flight watchdog resolves escaped/dead balls after bounded time and distance.

## Deployment

GitHub Pages serves the Vite `dist/` artifact, with relative asset URLs for repository subpaths. `.github/workflows/pages.yml` runs core tests, TypeScript/build and Chromium/WebKit checks before deployment. Pull requests verify without publishing. Pushes to `main` publish via the `github-pages` environment. Failed verification prevents deployment.

Pages is configured to use GitHub Actions.

Subsequent releases: commit and push to `main`, inspect the **Verify and deploy Centre Court** Actions run, then open the published URL. Never commit `node_modules/` or `dist/`. The package lockfile is committed for reproducible installs.

## GOAL 002C production integration

Pink Valkyrie replaces Pink Rebel; the old GLB remains in `public/assets/characters/kira/` for rollback. The 74-joint skeleton, 15,399 vertices, 13,296 triangles and all 13 clips are preserved. See [animation identification](docs/GOAL-002C-ANIMATIONS.md) for exact IDs, durations, confidence and contact frames, plus rendered inspection sheets. Runtime clips are indexed semantically, never by their source order.

`src/core/hitting.ts` selects sided forehand/backhand, compact volley, overhead, serve and deliberate slice/lob intents. Gameplay stays authoritative: a release opens a 250 ms contact window. The renderer seeks to the event’s calibrated contact frame and plays a nonlooping follow-through. Movement remains under the original fixed-step controller. Root travel is canceled, and a bounded arm-only correction helps bring the racket to contact without moving the athlete’s feet. The first rendered contact shows the calibrated pose and ball at the recorded contact (with at most 18 cm string-bed correction), then blends onto the current simulation position over 65 ms; it does not move the collision sphere. Stretched contacts can still show a gap. The right-hand racket socket uses the updated skeleton and retains the separate production racket.

Royal Rally is the supplied 3D mesh and all three original PBR material maps, optimized to 512 px. The character maps are 1024 px. [Optimization report](docs/asset-optimization.json) records hashes, bytes and dimensions; tests verify every nonimage buffer and material definition against the uploaded originals. `python tools/optimize-assets.py` reproduces the derivatives (requires Pillow). No replacement model or reference-image sprite is used.

Both assets are mandatory. Failed loads block match start and offer retry. The AI, camera rig, scoring and match lifecycle remain the existing foundation; GOAL 003 and GOAL 004 have not begun.

[Current limitations](docs/LIMITATIONS.md), [verification and evidence](docs/VERIFICATION.md), and [physical iPhone acceptance](docs/IPHONE-CHECKLIST.md) document the remaining checks. Actual iPhone Safari compatibility and sustained device performance remain unverified until hardware acceptance. Older Kira integration/hotfix documents describe the previous release and are historical.

Production evidence: https://kalikeefbiz.github.io/Centre-Court/verification/goal-002c/ . `release.json` identifies the exact build; GLB requests include a content revision across character, racket and ball.
