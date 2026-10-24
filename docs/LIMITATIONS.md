# Foundation limitations

- Physical iPhone Safari testing has not been performed. Desktop Chromium and Linux WebKit with mobile emulation are the automated targets; device heat, battery usage, Safari chrome/safe areas and actual multi-touch feel need hardware verification.
- Athletes are lightweight assembled primitives. Stroke and gait animations are cues, not skeletal motion capture. Generic temporary rackets are used; no Kira assets are integrated.
- Arcadified ball radius (0.12 m), 1.75 m contact reach, simplified restitution and forgiving contact height favor readability. There is no spin aerodynamics, racket rigid-body collision, player/ball body collision, full obstruction physics, manual serve toss or foot-fault system; serve stance is locked legally behind the baseline.
- A below-tape net collision immediately ends the shot. Grazing top cords continue physically and can produce serve lets. Not every professional net-cord scenario is modeled.
- Presentation keeps the human at the near end. Service order and service courts change correctly; physical end changes are not animated.
- Broadcast framing prioritizes full-court visibility. Portrait play makes athletes smaller; landscape is useful for reading contacts. The behind-player mode is lower but retains an elevated arcade perspective to show the far court.
- Short set configuration is the fixed two-game preset; Standard is best of three six-game sets. There is no custom rules editor or no-ad scoring.
- No sound, replay system, detailed crowds or final stadium art. Shadows are inexpensive projected silhouettes rather than dynamic shadow maps. Prediction markers help read the first bounce.
- The bundled PlayCanvas runtime is roughly 0.53 MB gzipped plus app code and fonts. There is no offline service worker. WebGL support is required.
- Slow frames are capped at 100 ms of catch-up, so severe sustained overload slows simulation rather than allowing large physics jumps. Determinism is for identical seed/commands on this implementation, not a network lockstep guarantee across arbitrary engines or future releases.
- AI uses the same collision/contact constraints as the player, but trajectory prediction knows current ball velocity. Reaction is delayed, movement is speed limited, and seeded shot error/missed returns prevent perfect play. Difficulty and game feel will benefit from user playtesting.
