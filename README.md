# Centre Court · GOAL 001B + 002

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
- **Touch:** left joystick moves. Hold/release SHOT with the right thumb. Aim arrows toggle direction; Slice/Lob toggle the selected shot. Movement and shots accept independent pointers.
- **Serve:** hold/release SHOT or Space. The game chooses the correct serving position and service box. Aim and power still affect the serve. The 70% charge mark is a useful starting point.
- Forehand/backhand and volley are contextual. A release opens a 250 ms swing window; the ball must be within 1.75 m and at a playable height. Contact near waist height with balanced positioning improves accuracy. There is limited lateral footwork assistance, never automatic returns.
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

World +Y is up; +Z is the human end. The singles court is **8.23 × 23.77 m**; service lines are 6.4 m from the net. The ball's arcade collision radius is 0.12 m, displayed at 0.17 m for visibility. A ball touching a boundary counts as in. Net height rises from 0.914 m at centre to 1.07 m near the posts.

## State and rules

`menu → serve → rally → pointOver → serve`, with `result` after match point. Pause remembers the interrupted state. Restart constructs fresh scoring and resets the ball, timers and commands. Point resolution checks the rally state first, so competing collision events cannot award twice.

A serve's first floor contact is checked against its diagonal service box. A fault retries the same point and side; a second fault awards one point. A grazing net cord that reaches the proper box is a let and preserves the serve attempt. Returns before a serve bounces are disabled. Rally first bounces must be on the receiver's singles court. A second bounce loses the point. Non-grazing net shots are dead immediately. Each contact launches from the actual ball position; there are no interpolated player-to-player rally paths or rally ball teleports.

Simulation uses an accumulator at 120 Hz with floating-point tolerance, a maximum 100 ms frame catch-up, and lifecycle resets. Extremely slow devices deliberately slow game time rather than leap ahead. A flight watchdog resolves escaped/dead balls after bounded time and distance.

## Deployment

GitHub Pages serves the Vite `dist/` artifact, with relative asset URLs for repository subpaths. `.github/workflows/pages.yml` runs core tests, TypeScript/build and Chromium/WebKit checks before deployment. Pull requests verify without publishing. Pushes to `main` publish via the `github-pages` environment. Failed verification prevents deployment.

Pages is configured to use GitHub Actions.

Subsequent releases: commit and push to `main`, inspect the **Verify and deploy Centre Court** Actions run, then open the published URL. Never commit `node_modules/` or `dist/`. The package lockfile is committed for reproducible installs.

## Known limitations

See [docs/LIMITATIONS.md](docs/LIMITATIONS.md). The existing arcade ball/contact tolerances are preserved. Kira has four supplied clips; the tennis motion is reused for all shot types, with configurable contact synchronization. Actual iPhone Safari compatibility and sustained device performance remain unverified until the manual checklist is run on hardware. No multiplayer, customization, monetization, tournaments or progression is implemented.

## Kira assets and animation

Original uploads are served once from `public/assets/characters/kira/` and `public/assets/equipment/rackets/`. Embedded textures, PBR materials, 44-joint skeleton and character proportions are preserved. `src/render/athlete-config.ts` holds clip mappings, grip transforms, racket scale, contact frame and playback/blend timings. `src/render/kira.ts` loads both GLBs, blends locomotion and swing states, removes horizontal animation root travel, and attaches the racket to `mixamorig:RightHand`. Asset errors keep the temporary player playable.

Gameplay emits read-only contact records at the existing immediate ball launch. Rendering seeks to the custom clip’s contact frame in the same update, then plays follow-through. An 80 ms visual ball offset starts the displayed shot at the strings and decays onto the unchanged simulated trajectory. It does not change timing windows, aim, speed, rules or AI. This is presentation synchronization, not racket-mesh collision or reach IK; see the visual limitations.
