# GOAL 002C verification

Date: 2026-10-24 UTC. Physical iPhone acceptance is **not run**. GOAL 003 AI and GOAL 004 stadium production are outside this release.

## Automated checks

- `npm test`: **45 passed** across scoring/physics/match lifecycle, source asset integrity, contextual strokes, contact zones, animation registry, scale and input ownership. The complete human-win and no-return loss regressions remain enabled; the human driver now positions beside and behind its predicted contact point for the calibrated reach.
- `npm run build`: passed strict TypeScript and Vite production compilation. The existing large engine-bundle warning remains (about 536 KB gzip).
- Local iPhone-profile WebKit: **9 passed, 3 Chromium-only CDP cases skipped**. The dedicated trusted two-pointer Chromium regression also passed after fixing its layout wait. Local Chromium subsystem checks passed; interrupted local full runs are not counted as full passes.
- The complete **24-case browser matrix** (12 desktop Chromium, 12 mobile WebKit, with 3 expected WebKit skips) runs against the production build in [GitHub Actions](https://github.com/kalikeefbiz/Centre-Court/actions/workflows/pages.yml). The workflow must pass before Pages deployment. Use the run for the delivered commit as the full-suite/deployment result.

Coverage includes each missing-asset failure/retry, delayed loading without a human substitute, textured Kira/racket/ball rendering, stationary serve preparation, contact events, pause/restart, in-place hips, lateral shuffle/run transitions, independent trusted movement/charge/release, drag aim/depth in both cameras, selector input without synthesized-click duplication, cancellation and interruptions, regulation ball scale, faults/lets/in-out, scoring and complete matches.

## Actual gameplay evidence

[Gallery](https://kalikeefbiz.github.io/Centre-Court/verification/goal-002c/) and [`gameplay-evidence.json`](../public/verification/goal-002c/gameplay-evidence.json).

`node tools/gameplay-evidence.mjs` drives the shipped keyboard/pointer input handlers in the production preview. It never writes match state, ball positions or animation states. It serves, moves into incoming returns, releases HIT, and pauses immediately after successful forehand/backhand contacts. The scene, physics, scoring and both cameras are the playable game. Pause overlays are hidden only for screenshots. The crops are unscaled crops of those same gameplay pixels.

The captured working-tree build identifies its base code commit in the JSON; final CI camera screenshots identify the delivered commit. The release and exact deployed commit are published in `release.json`.

- `gameplay-broadcast.png`, `gameplay-behind.png`: actual gameplay cameras with Pink Valkyrie, separate racket and Royal Rally GLB.
- `gameplay-forehand.png` / `-detail.png`: successful forehand, source contact frame 28, contact error before visual correction about **0.088 m**.
- `gameplay-backhand.png` / `-detail.png`: successful distinct two-handed backhand, source contact frame 30; stretched contact error about **0.303 m** before the capped 0.18 m presentation correction. A remaining gap on stretched contacts is a documented limitation.
- CI also writes Chromium/WebKit full-court and detail screenshots plus rendering diagnostics to `dist/verification/goal-002c/` for publication.
- `ball-material-preview.png` is an isolated **supplementary material inspection**, not a replacement for gameplay evidence. It shows the actual optimized red-felt/crown/seam GLB in detail because regulation-scale balls occupy few pixels in the gameplay cameras.

## Assets, animation and physical calibration

Exact source paths:

- `assets/characters/kira/Meshy_AI_Pink_Valkyrie_All_Animations.glb`
- `assets/balls/royal-rally/Meshy_AI_Royal_Rally_1024220842_texture.glb`
- Existing separate racket: `public/assets/equipment/rackets/Meshy_AI_Pink_and_Black_Tennis_1024095819_texture.glb`

Runtime derivatives retain these filenames under `public/assets/`. Pink Rebel remains available for rollback. [Optimization report](asset-optimization.json) records source/runtime SHA-256, bytes and texture dimensions. Tests compare every nonimage buffer and material definition with the source, preserving geometry, UVs, skeleton, clips and approved design. Character textures: 2048→1024 px; ball textures: 2048→512 px. Ball runtime: **246,488 bytes**, 2,058 triangles. No flat sprite or substitute model is used.

The singles court is 8.23×23.77 m, confirming metre units. Valkyrie remains native 1.70 m mesh height. Royal Rally diameter is **0.067 m**, derived from its measured source diameter 0.952636 m; its separate collision sphere radius is 0.0335 m. Court paint and floor physics meet at Y=0. Its ground shadow is scaled and lowered accordingly. Ball launch, restitution, swept net collision, faults, lets and boundary rules retain the established implementation with the regulation radius.

[Animation identification](GOAL-002C-ANIMATIONS.md) records exact clip identifiers, estimated 30 fps contact frames, durations, loop settings, confidence and visual contact sheets. No interface-order mapping is used. Idle/walk/run/shuffles loop; hits do not. Forehand/backhand and compact volleys use incoming side and bounce context; descending overheads consider height and court position. Slice/lob require explicit intent. Serve is dedicated.

Gameplay retains a configurable 250 ms release window. Contact events record ball and athlete positions at the same simulation tick. Presentation samples that contact pose once, applies bounded arm correction without changing gameplay position, then follows through. The first visible ball sample uses the recorded contact point plus at most 0.18 m string-bed correction and converges onto current physics over 65 ms. Normal ground reach is 1.25 m; balls below 0.65 m require a closer 0.65 m reach. The AI retains its original reach/tactics/presets.

## Mobile interaction and remaining acceptance

Left thumb continuously moves. Right thumb taps HIT for quick power (0.45), holds up to 1.2 s for capped charge (1.0), drags left/right for direction and up/down for depth, then releases to execute. One STANDARD ↻ button cycles standard/slice/lob. It acts on pointerdown and ignores synthesized click duplicates. Forehand/backhand are contextual. There is no double-tap power shot. Desktop movement, Space/mouse charge/release, J/L aim, I/K depth and 1/2/3 intent remain supported.

Owner checks remain in [IPHONE-CHECKLIST.md](IPHONE-CHECKLIST.md): real Safari multitouch feel, release/cancel/interrupt behavior, orientation and browser chrome, ball readability in both cameras, grip and generated-motion review, full matches, cached/fresh deployment loading, and ten-minute heat/memory/frame pacing. Medium-confidence generated motions, open fingers, foot sliding and stretched-contact gaps are recorded in [LIMITATIONS.md](LIMITATIONS.md).
