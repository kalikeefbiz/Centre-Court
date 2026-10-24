# GOAL 002C animation identification

Inspected in PlayCanvas with the separate production racket: seven three-quarter samples per clip, then six front samples around the hitting phase. Export order was not used as the mapping rule. In particular, the overhead clip is before the serve clip. Source animations are retained unchanged.

Evidence: [overview A](../public/verification/goal-002c/sheet-0.jpg), [overview B](../public/verification/goal-002c/sheet-7.jpg), [front contact detail](../public/verification/goal-002c/detail.jpg). The numbered rows match the source indices below. Reproduce with `npm run dev -- --port 5173`, `node tools/inspect.mjs` and `python tools/contact-sheet.py`.

Contact frames are **estimated calibration samples**, zero-based at 30 fps, not embedded GLB event markers. Full-body Meshy motion is stylized; contacts are synchronized by the authoritative shot event plus bounded arm correction. Medium confidence mappings need owner review of the supplied source motion. No clip is left unidentified or assigned solely by its index.

| Index | Semantic | Exact clip identifier | Duration (s) | Loop | Contact frame / seconds | Confidence |
|---|---|---|---:|---|---|---|
| 0 | Run | `Running` | 0.633333 | yes | — | high |
| 1 | Walk | `Walking` | 1.033333 | yes | — | high |
| 2 | Forehand | `_01a16f14_df89_70e4_966f_38087b9b2ef7` | 2.966667 | no | 28 / 0.933 | high |
| 3 | Backhand (two handed) | `_01a16f17_0702_776b_a578_5ae634002c9e` | 2.966667 | no | 30 / 1.0 | high |
| 4 | Forehand volley | `_01a16f19_f977_75c8_82d3_00bd61e22843` | 2.966667 | no | 29 / 0.967 | medium |
| 5 | Backhand volley | `_01a16f1f_22af_74e9_af26_8f1aec798eb5` | 2.966667 | no | 29 / 0.967 | medium |
| 6 | Overhead smash | `_01a16f20_14b9_70d3_b4cd_5b3e4d514601` | 2.966667 | no | 26 / 0.867 | high |
| 7 | Serve | `_01a16f21_3bc1_7312_b0db_d96fda6475ea` | 2.966667 | no | 46 / 1.533 | high |
| 8 | Backhand slice | `_01a16f27_4128_711d_a437_5651121a8e2c` | 2.966667 | no | 27 / 0.9 | medium |
| 9 | Defensive lob | `_01a16f33_ae88_77f6_8f6a_d4c208041d36` | 2.966667 | no | 37 / 1.233 | medium |
| 10 | Shuffle left | `_01a16f36_0b96_76c3_ac06_6409b3e12e89` | 2.966667 | yes | — | medium |
| 11 | Shuffle right | `_01a16f37_5a33_7498_91c4_55e2e1439bac` | 2.966667 | yes | — | medium |
| 12 | Idle | `Idle_7` | 8.733334 | yes | — | high |

Recognition evidence: forehand has a separated off arm and low outside backswing; backhand brings both hands together through the forward extension. Volley clips use a shorter preparation/contact segment, one outside the right shoulder and one crossing the body. The smash raises the hitting hand without a toss; the serve first raises the left tossing arm and then jumps into overhead extension. Slice has a cutting cross-body segment; lob has an upward open-arm finish. The two lateral clips use opposite lead legs in a low ready stance. Slice handedness and the lob’s exaggerated finish are less convincing than the forehand/backhand and serve/smash distinctions; these are mapping confidence limits, not claims of motion-capture quality.

Runtime registry: `src/render/animation-registry.ts`. Custom hit playback uses the preparation/contact/follow-through segment once; shuffle clips loop with 100 ms blends. Horizontal hips travel is canceled, preserving source vertical motion and gameplay position.
