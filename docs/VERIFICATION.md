# Verification record

Current milestone: GOAL 001B + 002. See the GOAL 001B and GOAL 002 sections below for this run; the original foundation record is retained for history.

Verification date: **2026-10-24 (UTC)**. Repository: `kalikeefbiz/Centre-Court`.

Local results: **24 simulation tests passed; 5 browser checks passed, 1 CDP-only WebKit case explicitly skipped; production build passed; production dependency audit found zero vulnerabilities.**

## Automated simulation coverage

`npm test` runs the production core modules, not a parallel implementation of the rules. The suite covers:

- Love/15/30/40, deuce, advantage, win-by-two games, quick sets, standard best-of-three sets and match finality.
- Service-side alternation, service-game rotation, 6–6 and 2–2 tiebreak entry, one-then-two tiebreak serve rotation, two-point margin and next-set service.
- All four diagonal serve boxes, wrong-side/deep faults, regulation singles boundaries and touching-line calls.
- Targeted ballistic landing, swept net collision, distinct shot arcs, bounce restitution and independent trajectory prediction.
- Start, serve, rally, point resolution, first fault, double fault, net-cord let, double bounce, out, practice, result and restart.
- Pause freezes the exact ball state; resume advances it. Equal seeded simulation outcomes at 30, 60 and 144 Hz.
- Contextual AI lob/volley selection, legal interception targets, difficulty limits and measured per-step AI speed bounds.
- Camera switching, smooth tracking, preference persistence and denied-storage recovery.
- A complete AI win without player returns and a complete human-side win using only movement/release commands. The human-side driver must make more than ten returns and sustain at least a four-contact rally.

## Browser coverage

Playwright opens the real PlayCanvas/WebGL app in desktop Chromium and Linux WebKit using the iPhone 13 device profile (390 × 664 CSS pixels). A DPR of 1 keeps software-rendered CI practical; this does not emulate a physical Retina GPU.

Browser checks run against the built `dist/` app through Vite preview, rather than the development server. They cover menu actions, Play and Practice, actual serve launch, scoreboard, pause freeze/resume, restart, menu return, camera persistence, one active rendering camera, shot toggles, aim, keyboard/pointer movement, portrait/landscape resize and blur interruption. A Chromium CDP test sends independent **trusted touch pointers** to the joystick and shot button, checks simultaneous movement/charge and releases the shot independently. The corresponding CDP-only test is explicitly skipped in WebKit; WebKit exercises its pointer-event path instead.

Screenshots are generated for menu, gameplay and landscape layouts in `test-results/` (ignored by git); failure traces and screenshots are uploaded by CI. An arena draw-call budget is checked in the browser suite. Arena geometry uses static batching and humanoid parts use dynamic batching; shadows avoid shadow-map passes. Pixel ratio is capped at 1.75 on devices.

The minimal cloud executor does not allow system package installation. Local WebKit OS libraries were downloaded from Debian and extracted outside the repository into a browser-only library directory. Playwright's ldconfig-based host preflight was skipped for this local run because it cannot see those extracted libraries; the browser itself still loads and executes. GitHub CI uses the regular `playwright install --with-deps` procedure without this workaround.

## Release checks

```sh
npm test
npm run build
npm run test:browser
npm audit --omit=dev
```

The build includes strict TypeScript validation. Font and engine assets are bundled locally with license notices. Vite reports the expected large-engine-chunk warning (about 0.53 MB gzip); no asset CDN is required at runtime.

The GitHub Actions workflow repeats automated verification before deployment. Deployment status and the final commit are recorded in the delivery response; a configured URL by itself is not evidence of a live deployment.

## Hardware verification remains open

No physical iPhone testing was performed. [IPHONE-CHECKLIST.md](IPHONE-CHECKLIST.md) records the required hardware checks. Sustained frame rate, battery/thermal behavior, actual iOS multi-touch latency, browser chrome and safe areas remain unverified until that checklist is run on named devices.

## Historical GitHub deployment blocker (subsequently resolved)

The [CI run for d00dfc0](https://github.com/kalikeefbiz/Centre-Court/actions/runs/40086254166) passed its complete **verify** job (core tests, strict build and browser suite). The subsequent deployment job failed at Pages activation: `Create Pages site failed: Resource not accessible by integration` (HTTP 403). A direct Pages activation request using the available credential returned the same error. The repository reports `has_pages: false`; a live preview is therefore not claimed.

The account action at that time was to open [repository Settings → Pages](https://github.com/kalikeefbiz/Centre-Court/settings/pages), set the build source to **GitHub Actions**, then rerun the failed deployment job (or the latest workflow). The intended address is https://kalikeefbiz.github.io/Centre-Court/. During GOAL 002, the Pages API confirmed `build_type: workflow`; the owner had cleared this activation blocker.

## GOAL 001B — independent mobile pointers

Shot type and aim now activate on `pointerdown`, including secondary touches while the joystick owns the primary touch. Keyboard/assistive clicks remain supported without double-toggling synthesized pointer clicks. Charge release/cancellation checks its owning pointer (or keyboard); unrelated pointer cancellation cannot clear it. Joystick and shot captures remain independent across control boundaries. Blur, page hide and visibility loss clear held input without firing a shot.

Regression coverage adds trusted Chromium multitouch selection/aim/charge while moving in both cameras, both release orders, captured boundary crossing, unrelated/owned cancellation, capture loss and blur/resume. WebKit covers the pointer-event cancellation path; CDP-only cases are explicitly skipped there. The simulation and camera systems are unchanged from the tested foundation.

GOAL 001B gate: **24/24 simulation tests, production build, and 9/9 applicable browser checks passed** (3 Chromium-CDP-only checks skipped on WebKit). The cancellation assertion was rerun on both engines after changing it to wait for the next sampled input frame. Browser libraries were extracted outside the repository as described above. No physical iPhone validation was performed in this run.

## GOAL 002 verification scope

The actual supplied GLBs are shipped unchanged and are parsed by the asset tests and loaded by PlayCanvas in browser tests. The character has four clips and 44 joints; six embedded 2048×2048 texture maps are loaded once across the two containers. Source content uses approximately 128 MiB of uncompressed RGBA texture storage with mipmaps (driver format can vary); no second character texture set is cloned. The browser suite waits for asset readiness before timing input checks. Software-rendered local checks allow longer loading/expectation timeouts than the original primitive-only scene.

See [KIRA-INTEGRATION.md](KIRA-INTEGRATION.md) for calibration and visual limits. Existing full-match human-win/AI-win, scoring, restart and deterministic camera/core checks remain enabled. Physical iPhone timing, GPU memory and thermal behavior remain open.

GOAL 002 final local gate: **34/34 unit tests passed** (24 original gameplay tests, 5 GLB/contact tests, 5 input ownership tests), **15/15 applicable browser checks passed** with 3 CDP-only WebKit skips, strict TypeScript/production build passed, and `npm audit --omit=dev` reported **0 vulnerabilities**. The full production browser run completed in 4.5 minutes on the software-rendered cloud executor. Both actual assets loaded and animated in Chromium and WebKit; each missing-asset path retained playable fallback controls. Close-up pose inspection covered ready, walking, running, backswing, contact and follow-through. The additional input tests caught and guard charge release while gameplay is disabled between points.

## GOAL 002 release-blocking rendering hotfix

The prior acceptance gate permitted a silent temporary-human fallback and did not prevent matches from starting before Kira was ready. It was insufficient; the owner's physical iPhone rejection supersedes the earlier GOAL 002 acceptance claim. See [the root-cause investigation](KIRA-HOTFIX.md).

Hotfix local results: **34 unit tests passed**, production build passed, and **19 applicable browser checks passed** with 3 CDP-only WebKit skips. The full run passed 18 cases; the Chromium animation-pose capture was rerun successfully after waiting for the pause panel to finish hiding before sending the next charge key. Both engines verify error/retry, slow loading, both modes, textured visible skin, attached racket and the absence of a temporary human. Existing scoring/full-match, AI, camera and multitouch checks remain enabled.

Actual production-build screenshots were manually viewed: Kira's pink hair, white top, pink skirt/boots and separate racket are visible in a started match in Broadcast and Behind player cameras. Idle, walk, run and custom tennis poses were also inspected. Production evidence is generated into the Pages artifact at `verification/kira-hotfix/`; it is not a separately staged model. Post-deployment verification must compare `release.json` with the pushed commit, check the unchanged GLB hashes, and visually inspect the live game again. No physical iPhone retest was performed by this environment.
