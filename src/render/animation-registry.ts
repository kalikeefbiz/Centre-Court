// Identified from rendered front / three-quarter sequences, not interface order.
// Contact frames are zero-based at 30 fps. Source custom clips all run 89/30 s.
const action = (
  clip: string,
  contactFrame: number,
  prepareFrame: number,
  endFrame: number,
  confidence: 'high' | 'medium',
) => ({
  clip,
  duration: 2.9666669368743896,
  loop: false,
  contactFrame,
  contact: contactFrame / 30,
  prepare: prepareFrame / 30,
  end: endFrame / 30,
  confidence,
});
export const ANIMATIONS = {
  Idle: { clip: 'Idle_7', duration: 8.733333587646484, loop: true },
  Walk: { clip: 'Walking', duration: 1.0333329439163208, loop: true },
  Run: { clip: 'Running', duration: 0.6333330273628235, loop: true },
  Forehand: action('_01a16f14_df89_70e4_966f_38087b9b2ef7', 28, 20, 55, 'high'),
  Backhand: action('_01a16f17_0702_776b_a578_5ae634002c9e', 30, 22, 57, 'high'),
  ForehandVolley: action('_01a16f19_f977_75c8_82d3_00bd61e22843', 29, 22, 43, 'medium'),
  BackhandVolley: action('_01a16f1f_22af_74e9_af26_8f1aec798eb5', 29, 23, 44, 'medium'),
  Smash: action('_01a16f20_14b9_70d3_b4cd_5b3e4d514601', 26, 18, 53, 'high'),
  Serve: action('_01a16f21_3bc1_7312_b0db_d96fda6475ea', 46, 36, 65, 'high'),
  Slice: action('_01a16f27_4128_711d_a437_5651121a8e2c', 27, 20, 57, 'medium'),
  Lob: action('_01a16f33_ae88_77f6_8f6a_d4c208041d36', 37, 27, 61, 'medium'),
  ShuffleLeft: {
    clip: '_01a16f36_0b96_76c3_ac06_6409b3e12e89',
    duration: 2.9666669368743896,
    loop: true,
  },
  ShuffleRight: {
    clip: '_01a16f37_5a33_7498_91c4_55e2e1439bac',
    duration: 2.9666669368743896,
    loop: true,
  },
} as const;
export type AthleteState = keyof typeof ANIMATIONS;
