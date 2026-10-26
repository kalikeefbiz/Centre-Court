# Centre Court · GOAL 004

A playable mobile-first 3D arcade singles tennis game in the original Crown Pavilion stadium by **BlackHouse**, built with PlayCanvas and TypeScript. Kira uses the owner-supplied rigged character and separate racket GLBs. The AI opponent retains its temporary model.

Kira's mid-resolution replacement reuses the existing 74-joint rig and all 13
tennis animations, with 46,890 vertices, 30,463 triangles and the supplied 4096 px
textures. The previous Valkyrie remains available for rollback; the GOAL 002C
geometry and texture figures below describe that earlier source. See the
[rig-transfer report, pose renders and reproduction scripts](docs/KIRA-MIDRES-RIG-TRANSFER.md).

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
- Forehand/backhand and volley are contextual. A release opens a 250 ms swing window; the ball must be within the stroke’s contact zone (ground 1.25 m, volley 1.30 m, overhead 1.25 m) and at a playable height. Contact near waist height with balanced positioning improves accuracy. There is limited lateral footwork assistance, never automatic returns.
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

Core modules have no PlayCanvas or DOM runtime dependency. Camera storage is injected. Identical seed and fixed-step commands reproduce a match. The renderer never changes the ball, scoring, AI or match state. AI uses a lightweight state machine, predictive interception, utility-scored tactics, and acceleration-limited steering. Both athletes use the calibrated contact zones, launch physics, movement bounds and court rules.

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

`src/core/hitting.ts` selects sided forehand/backhand, compact volley, overhead, serve and deliberate slice/lob intents. Gameplay stays authoritative: a release opens a 250 ms contact window. The renderer seeks to the event’s calibrated contact frame and plays a nonlooping follow-through. Movement remains under the original fixed-step controller. Root travel is canceled, and a bounded arm-only correction helps bring the racket to contact without moving the athlete’s feet. The first rendered contact samples athlete and ball from the same fixed-step event and shows the calibrated pose and ball at the recorded contact (with at most 18 cm string-bed correction), then blends onto the current simulation position over 65 ms; it does not move the collision sphere. Stretched contacts can still show a gap. The right-hand racket socket uses the updated skeleton and retains the separate production racket.

Royal Rally is the supplied 3D mesh and all three original PBR material maps, optimized to 512 px. The character maps are 1024 px. [Optimization report](docs/asset-optimization.json) records hashes, bytes and dimensions; tests verify every nonimage buffer and material definition against the uploaded originals. `python tools/optimize-assets.py` reproduces the derivatives (requires Pillow). No replacement model or reference-image sprite is used.

Both assets are mandatory. Failed loads block match start and offer retry. The existing camera rig, scoring and match lifecycle remain the foundation. GOAL 003 adds competitive AI; GOAL 004 adds the original Crown Pavilion stadium. GOAL 005 is Final Gameplay, Animation & Visual Polish.

[Current limitations](docs/LIMITATIONS.md), [verification and evidence](docs/VERIFICATION.md), and [physical iPhone acceptance](docs/IPHONE-CHECKLIST.md) document the remaining checks. Actual iPhone Safari compatibility and sustained device performance remain unverified until hardware acceptance. Older Kira integration/hotfix documents describe the previous release and are historical.

Production evidence: https://kalikeefbiz.github.io/Centre-Court/verification/goal-002c/ . `release.json` identifies the exact build; GLB requests include a content revision across character, racket and ball.

## GOAL 002D developer diagnostics

Open [developer mode](https://kalikeefbiz.github.io/Centre-Court/?dev=1) and tap **DEV · Tools** for the production Kira animation inspector, isolated serve feasibility prototype, visual-only Royal Rally size comparisons, performance readout and JSON measurements. GOAL 004 uses the owner-confirmed 1.50× visual default; select any of the four sizes in DEV tools. Physics and production serve behavior are unchanged.

See [GOAL-002D-REPORT.md](docs/GOAL-002D-REPORT.md) for access, rendered evidence, animation/serve findings, skill references and the physical iPhone test procedure. Normal gameplay shows no developer controls. Next milestone: GOAL 005 — Final Gameplay, Animation & Visual Polish.

## GOAL 003 competitive opponent

Choose Easy, Normal (default), or Hard in the existing setup. The opponent anticipates reachable contact windows, accelerates toward them, selects safe or attacking shots, targets open space, and recovers according to the shot. Hard has finite speed/reaction/accuracy and the same contact and ball rules as the player.

In `?dev=1`, enable **AI decision overlay** in the existing DEV panel. Cyan marks intended interception, yellow predicted bounce, lime recovery. Seed restart and labeled AI test feeds reproduce defensive/short-ball/open-court situations through real gameplay simulation. Export JSON includes the seed, random state, recent transitions, targets, utility, and CPU decision timing. Tools remain absent on ordinary visits.

See [GOAL-003-REPORT.md](docs/GOAL-003-REPORT.md) for architecture, difficulty parameters, simulation distributions, rendered browser evidence, limitations and physical iPhone checks. Run `CC_AI_REPORT=1 npm test` to regenerate simulation measurements; `node tools/ai-evidence.mjs` captures rendered fixtures against the preview server.

## Crown Pavilion stadium (GOAL 004)

The blue hardcourt sits inside a graphite, faceted bowl with 24 tiered seating sections, cantilever wings, aisles, stairs, a lightweight crowd, original Centre Court ribbons and courtside equipment. Two stadium displays use the actual match score. Pause → **Stadium detail** switches between 1,180 and 645 baked spectators. Small viewports and low-core devices start reduced, using opaque crowd silhouettes and simpler row seating while preserving the court and athletes. **Stadium sound** toggles quiet, locally synthesized crowd ambience and point reactions; browser gesture rules still apply.

The Royal Rally visual default is **1.50×**, following confirmed owner iPhone feedback. DEV tools retain all four comparison sizes; collision radius stays 0.0335 m. `?dev=1` also exposes frozen stadium inspection views; return to Gameplay camera to resume. Core cameras and tennis logic are unchanged.

[GOAL 004 report](docs/GOAL-004-REPORT.md) contains architecture, measurements, rendered evidence, verification and remaining physical iPhone checks. Reproduce evidence with `node tools/stadium-evidence.mjs`; measure with `node tools/stadium-performance.mjs` (set `CC_URL` / `CC_VERSION` for baseline comparison).
