# GOAL 011 validation ledger

- Baseline: `6959d6746cdd0eea560b705fedac4c7925163dcb` (verified main on checkout).
- Environment: Debian 13 cloud, Node 24.19.0; PlayCanvas 2.23.3, TypeScript/Vite.
- One agent, no subagents. Source animation/model assets and Pages workflow unchanged.
- `npm ci`: passed.
- Initial baseline: targeted locomotion/lob/lifecycle and seeded measurement: 37 tests passed.
- `npm test` final: **219 tests / 21 files passed**, 39.39 s.
- `npm run build` final: passed, full-detail Nova verified. Existing large-chunk warning remains.
- Fixed 120 Hz / render schedule consistency: targeted active anticipation test passed at 30/60/144 Hz.
- Existing measured acceleration, braking, reversal and speed-cap tests passed unchanged.
- Initial full-suite attempt: 216 tests passed, long aggregate simulation exceeded its old 30 s timeout during contention. Standalone rerun passed in 28.78 s. Scoped aggregate timeout increased to 90 s; all seeds/counts/assertions and per-call CPU budgets retained. Final unit run above passed.
- Local browser checks: **37 distinct cases passed**. Initial complete-matrix run passed 28 Chromium cases before an environment interruption. Its resumed suspension case passed; the next case was stopped deliberately to use the required CI gate for full coverage. No product-test failure was reported in those runs.
- Final focused browser run: **8 passed (3.4 min)** — new WebKit preparation tests for all five athletes plus preference persistence, and three natural consecutive points in Chromium and WebKit. Together with the earlier Chromium preparation tests, all five athletes passed both Standard and Off on both engines.
- Local source/TypeScript recheck after added coverage: `npx tsc --noEmit` passed.
- Required release gate: the unchanged [Pages workflow](https://github.com/kalikeefbiz/Centre-Court/actions/workflows/pages.yml) runs all 219 unit tests, builds the committed source, and runs the complete 106-case Chromium/WebKit matrix before production deployment. The exact commit/run outcome is included in the production handoff; the commit's GitHub checks are the full-suite release receipt.

Browser setup used Playwright Chromium 156 / WebKit 27.2. The unprivileged cloud
image lacks some OS libraries, so Debian packages were extracted into the local
browser cache; `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` bypasses only its
system package-presence preflight. Both actual engines launched. No repository
configuration, production dependency or CI workflow was changed for this setup.

`baseline.json` is the original pre-edit feed/established-script capture.
`baseline-rallies.json` adds the beginner workload on an isolated exact-baseline
checkout. `revised.json` records the same scenarios on the implementation.
`performance-*.json` use the existing one-warmup/five-repetition test. Raw timings
are cloud CPU measurements with JIT/scheduling noise. See ../../GOAL-011.md for
interpretation, counters, limits and regressions.

Physical iPhone Safari / sustained thermal / hardware frame acceptance: **UNVERIFIED**.

The existing stadium flow test now continues through three natural consecutive
points and checks anticipation/actions are cleared at each new serve, without
fixture scoring or repositioning. It is part of the two-project browser run.

An additional targeted recheck passed all 12 anticipation tests after extending
early/late miss scenarios to both Off and Standard (same 219-test suite count).

Native evidence: `native-anticipation.json` records all five athletes in both modes
and engines, layer times, 78 ms committed leads, grip state and observed contact
path error. The five `*-webkit-preparation.png` files show the actual native
preparation before input. `consecutive-points.json` retains compact real-rule
three-point flows for both engines. The three-point browser test has a scoped
180 s deadline because it now includes three full flights and software-GL loading
(the Chromium run took approximately 120 s); assertions and simulation timing
are unchanged.
