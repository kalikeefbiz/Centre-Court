> Historical architecture setup snapshot, before GOAL 008. For GOAL 009 use baseline `f7fdda3e75a1d93b053da2e5ad941618547793da`, `docs/GOAL-008.md`, and current source. The original report is retained as history.

# Mobile performance and compatibility

Verified source findings at the [baseline commit](PROJECT_BASELINE.md). No physical
iPhone benchmark or new asset optimization was performed for this infrastructure GOAL.

## Policy and measurement requirements

Measure before optimizing. Preserve supplied visual quality wherever technically
feasible. A GLB's raw size or polygon count alone does not establish suitability.
Keep these quantities separate:

| Quantity | Evidence required |
| --- | --- |
| Download | Actual transferred/compressed bytes, network/cache conditions and request timings |
| Initialization | Fetch, decode/decompression, parsing, skin/animation setup, texture upload and time-to-ready |
| CPU memory | Decoded geometry/images, JS objects, retained buffers and repeated-load/restart behavior |
| GPU memory | Texture dimensions/formats/mipmaps and geometry/skin resources; not inferred from GLB bytes |
| Rendering | Draw calls, shaded pixels/overdraw, geometry/skinning and shader work; GPU timing when available |
| Frame stability | Comparable frame intervals, mean/p95/max, long-frame counts and sustained workload duration |

For every comparison record commit, scenario/seed, device, OS/browser versions,
real hardware vs emulation/software renderer, viewport/orientation, DPR, stadium
tier, network/cache, sample duration and power/thermal state. Compare identical
workloads before/after with bounded iterations and assigned files. A proposed
target is not an achieved result.

## Existing instrumentation and sensitive systems

- `?dev=1` exposes the developer performance UI and JSON records. `FrameWindow`
  (`src/dev/metrics.ts`) retains at most 600 frame intervals and summarizes fps,
  average/stddev/p95/max and intervals above 33.33 ms. These include scheduling;
  they are **not GPU timings**.
- Existing diagnostic exports expose PlayCanvas draw calls, dimensions/pixel
  ratio, available memory counters, asset timing ledger and stadium context.
  A missing browser memory API must be reported as unavailable, not zero usage.
- `tests/performance.test.ts` measures a seeded Node CPU workload with warmup and
  five repetitions: prediction median <2 ms/call, tick median <0.1 ms/call.
  These are test thresholds, not an iPhone frame budget or current device result.
- `tests/simulation.test.ts` and `tools/ai-browser-performance.mjs` inspect
  simulation/decision costs. Browser/stadium measurement scripts under `tools/`
  can capture bounded evidence. Inspect each script's workload/output before use.
- Source-inspected sensitive paths: inverse launch solving, ball prediction,
  120 Hz Match/stroke integration, skin/animation evaluation and joint lookups,
  embedded image decode/upload, pixel count, crowd geometry/batching and dynamic
  scoreboard uploads. These are investigation targets, not measured bottlenecks.

Existing controls include DPR caps of 1.75 in menu / 1.5 in play, full/reduced
stadium tiers, geometry batching, projected shadows without character shadow-map
casting, and scoreboard texture updates on state changes. Preserve them unless
an authorized measured task justifies a change.

The current required Kira/racket/ball files total **68,873,584 raw bytes**.
This is a file inventory, not compressed transfer, runtime or GPU memory. Uploaded
Dante/Rico/Zuri files are copied by Vite but not loaded by the gameplay code.
Do not download Nova merely to repeat a size estimate; its release metadata is
indexed in [ASSET_PIPELINE](ASSET_PIPELINE.md).

## Browser lifecycle and hardware acceptance

`main.ts` pauses and clears input/clock on hidden-page, blur, pagehide and WebGL
context loss. Input has independent cancellation handlers; audio observes match
state and requires a user gesture unlock. Context-loss pause handling does not
prove successful context restoration on a real device.

Use [IPHONE-CHECKLIST](IPHONE-CHECKLIST.md) for actual Safari testing: both thumb
owners, hold/drag/release/cancel, portrait/landscape/safe areas/browser chrome,
ball readability, loading/retry, match lifecycle, background/lock/resume,
restarts and sustained thermal/memory/frame behavior. Record named hardware and
OS/browser versions. Desktop Chromium and Linux WebKit with an iPhone viewport
establish only those automated environments.

Historical reports in `public/verification/` and prior GOAL documents remain
available, but their numbers belong to their original commits and workloads.
Do not carry older asset totals or reported measurements forward as fresh facts.
Owner feedback on one visual choice does not certify the whole device checklist.

## Unresolved requirements

No comprehensive physical iPhone acceptance result or agreed device-tier frame,
memory or loading SLA was found in the reviewed evidence. The historical
checklist discusses 60/30 fps budgets; those are comparison targets, not measured
acceptance. Agree scenario/device targets when the next performance GOAL needs
them, then measure. No optimization is authorized by this infrastructure GOAL.

## GOAL 010 lifecycle measurement

The ordinary menu now excludes arena rendering and all match simulation. It loads
only the selected rig/racket; full stadium and ball load lazily at first match.
One renderer/device/camera persists, and one unused ordinary character container
may remain warm (unused Nova is evicted immediately). Entity/asset/owner counters,
pending frame-readiness handlers, input handler count, session IDs and native
VRAM counters are exposed in opt-in diagnostics. See [GOAL-010](GOAL-010.md) and
its checked-in measurements; bounded caches are distinguished from session leaks.
Physical-device/thermal/driver-memory acceptance remains separate from desktop
Chromium and mobile-profile Linux WebKit automation.
