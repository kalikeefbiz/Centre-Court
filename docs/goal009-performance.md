# GOAL 009 mobile performance investigation

Role: saved `mobile_performance_engineer` profile, invoked by the coordinator
through the current hosted collaboration tools. Work is bounded to measurement,
evidence, and rendering recommendations; the coordinator owns integrated runtime
changes. Starting commit: `f7fdda3e75a1d93b053da2e5ad941618547793da`.

## Confirmed baseline rendering facts

- PlayCanvas uses a PBR material imported from each production GLB, including
  normal, base-color and metallic/roughness maps. Kira's supplied images are
  4096²; Nova retains 4096² / 8192² / 4096² images. Geometry count or image size
  alone is not a mobile-suitability verdict.
- The supplied GLB sampler is linear magnification with trilinear mipmapped
  minification. Athlete textures already request anisotropy up to four, bounded
  by the device. No evidence supports calling these assets automatically
  downsampled by the application.
- The installed engine's camera shader defaults are sRGB output correction and
  linear tone mapping. The baseline does not explicitly override those camera
  properties. This is not a demonstrated missing-gamma defect.
- Baseline scene light is a directional light at intensity 1.35 with broad
  ambient `(0.48, 0.54, 0.59)`. Characters do not cast shadow maps; existing
  projected ground shadows avoid a new per-frame shadow render pass.
- Rendering requests MSAA and caps pixel ratio at 1.75 in menu / 1.5 during play.
  On a DPR1 browser, neither cap increases the underlying 390×844 render target.
- The gameplay camera intentionally preserves the court and athletes. Source
  details cannot all be resolved on a character occupying tens of screen pixels;
  that is a projection/sampling limitation, not proof that source geometry was
  removed. Existing menu panels also obscure the athlete, whereas the separate
  character preview offers a controlled view.

These facts come from `scene.ts`, `kira.ts`, local GLB headers and the installed
PlayCanvas camera shader source. Source inspection identifies possible causes;
the runtime measurements and actual images below distinguish observed effects.

## Method and reproducibility

Run from the repository root against a built preview server:

```sh
CC_STAGE=baseline CC_URL=http://127.0.0.1:4173/ node tools/goal009/performance.mjs
CC_STAGE=candidate CC_URL=http://127.0.0.1:4173/ node tools/goal009/performance.mjs
```

Optional `CC_BROWSER=webkit`, `CC_CHARACTERS=kira,nova`, `CC_SAMPLE_MS=8000`,
and `CC_OUTPUT=/path` select a bounded workload. The default uses a fresh browser
context for each initial selected athlete and a Rico opponent for both, avoiding
simultaneous unused full-resolution roster loads. Menu, clean close-up, real
serve/match, and movement windows run sequentially. Each view change receives six
warmup animation frames; timestamps include browser scheduling. Snapshots are
read at the same rate in both stages. The script closes browser resources and
records errors instead of declaring unsupported measurements successful.

The candidate additionally measures the live equipment grip view, then records
resource/request deltas across three preview/equip operations. With the single
supplied racket this checks idempotence and resource retention; it cannot prove
swapping between distinct model assets that do not exist. Browser/driver caches
may remain warm across contexts, so initial ready time is not labelled a cold
mobile-download benchmark or isolated decoder cost.

Evidence records separate:

- Loopback request transfer/body bytes and fetch/load timings.
- Engine-accounted texture/vertex/index allocations.
- Coarse JS heap estimates where Chromium exposes them.
- Frame intervals, draw calls and selected-athlete animation evaluation time.
- Screen-space athlete height, render target, AA samples and selected resources.

## Acceptance limits

Linux Chromium/SwiftShader and Linux WebKit are browser/rendering coverage only.
They do not certify physical iPhone Safari, native GPU timing, total decoded CPU
memory, driver-resident VRAM, thermal stability or mobile network loading.
Engine VRAM counters are useful for comparing resource retention but are not a
driver memory measurement. `performance.memory` is JS heap only. Shared cloud
host timings have a workload/interference limitation and must not be marketed as
device frame-rate benchmarks. No automatic geometry or texture downgrade is
authorized by this investigation.

The inspected cloud cgroup permits two CPU cores (`cpu.max` 200000/100000) and
8 GiB of memory. Its memory event counters showed no OOM/high/max events at the
setup-failure check. This explains why concurrent rendering/compilation can
invalidate timing comparisons, but does not identify the readiness failure's
cause and is not a mobile resource budget.

## Measurement status and setup limits

An initial full-page `load` wait exceeded 30 seconds. The measurement tool now
waits for DOM readiness and then the actual selected renderer plus enabled Play,
which is the relevant application gate. A subsequent startup was deliberately
interrupted before recording because concurrent Blender/compiler/test work made
timing comparisons invalid. Those setup attempts are not gameplay benchmarks.

With compiler/tests paused and the baseline browser slot reserved, headless
Chromium launched but the selected-Kira/Play gate exceeded its explicit
180-second ceiling. **No timed window started.** The browser closed and the slot
was released; this is not evidence of an application regression or iPhone cost.
See `public/verification/goal-009/performance/baseline-chromium/baseline-setup-failure.json`.
The exact blocked resource/render state was not captured by that already-loaded
script, so its cause remains unknown. The current tool captures failure
snapshots/screenshots/console errors and has independent wall-clock ceilings.
Another throughput attempt should follow a discriminating setup diagnosis,
rather than repeat the same unknown failure.

Baseline and candidate frame/resource measurements therefore remain
**NOT_MEASURED**, and physical iPhone/GPU/thermal measurements remain
**NOT_CHECKED**. Successful GLB metadata inspection or Chromium launch is not
substituted for rendered-game evidence.

## Rendering recommendations pending controlled runtime comparison

Prioritize clean closer previews while preserving normal match composition;
this directly addresses known occlusion and insufficient screen-space detail.
Preserve the imported PBR/normal/metallic-roughness data, existing trilinear/
anisotropic sampling and MSAA. Do not add shadow maps or postprocessing solely
because the engine supports them.

A controlled candidate can compare ACES2 highlight roll-off against the linear
default, with modestly reduced broad ambient and a soft opposing fill to restore
shape/normal-map contrast. This is a proposed visual trial, not a proven
correction or measured performance win. Inspect matched screenshots and record
the final camera/light values before accepting it. No geometry reduction or
texture-resolution change follows from the unavailable runtime measurements.
