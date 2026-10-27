# GOAL 009 — QA and regression evidence

Baseline: `f7fdda3e75a1d93b053da2e5ad941618547793da`.
The QA specialist loaded and adopted `.codex/agents/qa_regression_engineer.toml`
and root `AGENTS.md` in the GOAL 009 worktree. This is a real bounded specialist
assignment through the hosted collaboration tools; automatic CLI role discovery
is a separate capability and is not implied by this report.

## Verification plan

| Area | Required evidence | Current status |
| --- | --- | --- |
| Equipment catalog | Actual asset path, one entry per real cosmetic, complete grip/sweet-spot metadata; no invented variants | Unit checks PASS; runtime preview pending |
| Persistence | Versioned local choice survives reload; malformed/future/unavailable storage recovers without altering progression saves | Unit checks PASS; browser reload pending |
| Attachment | Equipped ID appears on selected athlete in a real match; attachment and semantic animation library survive equip/no-op reload | Pending integration |
| Competitive contact | Visual head stays aligned with existing canonical sweet spot; existing 8-stroke sampled path, Lob and serve checks retained | Existing tests identified; pending execution |
| Grip | Actual finger pose and skin deformation, stable palm/handle alignment through 13 states, available roster and representative contact/recovery frames | Pending graphics evidence and browser inspection |
| Nova detail | Source/derived mesh and texture preservation, normalized finite weights, shoulder/finger deformation checks and actual close-up views | Pending derived-asset decision |
| Gameplay | Locomotion, gestures, serve, scoring, AI, heat, Signature Strikes, audio and circuit save tests | Existing GOAL 008 coverage retained; pending integrated run |
| Browser | Targeted Chromium and mobile-profile WebKit tests; known errors/skips reported without weakening assertions | Pending browser slot |
| Device | Physical iPhone Safari interaction, thermal/GPU/memory behavior | NOT_CHECKED — no physical device available in this execution |

Existing `tests/assets.test.ts` preserves source payloads and pins Kira/Nova
identity. A deliberate derived asset must get its own source-preservation checks;
passing finite-coordinate checks alone is not visual acceptance. Existing
`tests/browser/tennis.spec.ts` compares all eight stroke-contact racket heads to
the authoritative sampled rig path within 5 mm. Preserve that contact contract.

Browser rendering and CPU-heavy evidence collection are scheduled with the
coordinator to avoid competing captures or misleading benchmark interference.
No test timeout or assertion will be weakened simply to obtain a green result.

## Automated results

`npx vitest run tests/goal009-equipment.test.ts --maxWorkers=1`: **9 passed**, one
file, zero failures/skips. Test bodies took 400 ms; total startup/collection took
169.19 s under concurrent host load. This duration is not a game performance
measurement. The checks cover:

- Independent versioned equipment persistence and untouched progression data.
- Rejection of unshipped IDs and recovery from malformed/future/stale saves.
- Usable in-memory choices when browser storage is missing or throws.
- Unique catalog IDs referencing actual standalone GLB/PBR source assets.
- Unchanged production racket scale/translation and grip/sweet-spot mapping.
- A test-only future source with a different axis, origin and scale, normalized
  through an independent PlayCanvas quaternion point transform to the same
  canonical sweet spot; the fixture is not offered as a cosmetic.
- Explicit rejection of degenerate axes, off-axis head metadata and nonfinite
  values rather than silently changing the competitive visual contact point.

`tests/browser/equipment.spec.ts` is authored but **NOT RUN** until the candidate
is integrated and a browser slot is available. It checks the actual interface,
idempotent equip without character/animation reload, local persistence after
refresh, progression isolation, focus restoration and a real equipped serve. A
second case gates a Dante asset request, selects Dante again while still loading,
then returns to Kira before releasing the disposed request; this checks the
asynchronous roster/equipment cancellation path for uncaught errors.

`tests/goal009-grip.test.ts` is authored but **NOT RUN** pending the integrated
test slot. It checks calibration-to-source SHA/vertex/joint correspondence,
normalized sparse hand/wrist influences, hand-only inverse-bind changes and
existing finger nodes. An algebraic test exercises the real `AthleteGrip` layer
on PlayCanvas GraphNodes with two different wrist poses: hand-frame compensation
must retain both socket and sweet-spot world positions and stay idempotent. The
renderless test establishes transform behavior; it does not establish believable
mesh deformation or finger/handle intersection quality.

No fresh rendered or physical-device result is claimed yet. Integrated results,
visual evidence and outstanding defects will be appended after implementation.
