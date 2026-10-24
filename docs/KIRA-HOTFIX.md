# GOAL 002 rendering hotfix

## Confirmed cause and limits of the diagnosis

The prior release created a temporary human unconditionally in `Scene`, enabled Play/Practice immediately, and loaded Kira asynchronously. Any container, texture, skeleton or rendering initialization error was swallowed into `status: fallback`; the temporary human remained playable and the owner saw no UI error. Slow loading also allowed a match to begin with that model. This behavior was explicitly exercised as a passing fallback test, so the earlier acceptance gate could pass without Kira being visible.

Reproduction: block the actual GLB requests with HTTP 404, load the old production path and start a match. The audit reports `phase: serve`, `kira.status: fallback`, a disabled Kira root, and an enabled temporary human. Its rendered batches contain the original human geometry. With successful requests, the old path does attach the textured Kira mesh and remove the temporary human from its batch; a persistent batch ghost was not reproduced. The exact network/GPU error on the owner's physical iPhone cannot be recovered from this environment.

The old menu copy (`GOAL 001`, `Temporary athletes`, `FOUNDATION v0.1`) was present in the latest deployed HTML itself. The canonical origin served the expected `0c32011` JavaScript bundle when investigated, so stale origin deployment was not the explanation for that copy. Pages sends `Cache-Control: max-age=600`; an already-open/cached device session can still be older. The new release exposes its commit in `release.json` and debug diagnostics, versions GLB requests by asset content, and uses Vite's hashed JavaScript/CSS URLs.

## Correction

- `src/render/scene.ts`: never constructs a temporary human. Kira's root is the only render entity driven by `match.players[0]`. The single temporary model maps to the existing AI and is hidden in the menu. Human ground shadow remains independent. Gameplay camera definitions, movement, AI and tennis rules are unchanged.
- `src/render/kira.ts`: requires a textured skinned body, the hand hierarchy, animation clips and racket. Play readiness waits for a camera render of both meshes, not just container parsing. Errors disable the Kira root and report an error; no substitution branch remains. Requests have bounded timeouts and content revisions.
- `src/main.ts`, `index.html`, `src/style.css`: disable both start actions during loading/failure; programmatic start is also guarded. Show loading/error/retry UI. Feature Kira in the menu, label the human as Kira, and remove foundation/placeholder advertising.
- `vite.config.ts`, `src/build.d.ts`: embed build identity and emit `release.json`; derive the GLB revision from the two unchanged authoritative uploads.
- Browser checks now fail if Kira never reaches a rendered frame; failed/delayed requests must block both modes. Retry must recover to Kira. The old playable-fallback assertions have been removed.

## Visual evidence

`tests/browser/visual.spec.ts` launches the built app through Vite preview, starts an actual singles match, waits for each shipped gameplay camera to settle, and captures full frames plus character crops. It records render visibility, textured skin, unit scale, right-hand racket hierarchy, model counts and release identity. `kira.spec.ts` drives real controls through Idle, Walk, Run and Swing and captures paused animation samples; only the pause panel is hidden for those pose crops.

The screenshots are written into `dist/verification/kira-hotfix/` after the production build. The existing Pages workflow uploads that exact verified `dist/` directory, including the public gallery and evidence JSON. Evidence therefore travels with the release artifact, without a separate staged model, alternate camera or generated image.

The production screenshots must be visually inspected in addition to automated assertions. The source asset is identifiable by pink hair, white top, pink skirt/boots and pink-and-black racket; it is distinct from the AI's orange temporary model. Both actual GLB files remain byte-for-byte unchanged.

Physical iPhone verification remains the owner's responsibility. The hotfix prevents the reported silent substitution; if an iPhone asset/render error persists, the explicit loading error and build identity make it diagnosable instead of misrepresenting a placeholder match as Kira gameplay.
