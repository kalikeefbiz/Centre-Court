# Kira integration

The two GLBs supplied in the conversation are the production source. They are copied **byte for byte** into `public/assets/characters/kira/` and `public/assets/equipment/rackets/`; tests pin their SHA-256 hashes. No generated replacement, re-rigging, texture conversion or character rescaling is used.

## Asset inspection

- Character: 9,422,392 bytes, one skinned mesh, 12,722 vertices, 10,396 triangles, 44 joints, three embedded JPEG texture maps.
- Racket: 5,094,852 bytes, one mesh, 2,435 vertices, 2,080 triangles, three embedded JPEG texture maps.
- Clips: `Idle_5` (1.8333 s), `Walking` (1.0333 s), `Running` (0.6333 s), `_01a16d42_9295_73c7_8a05_a5b744b94d9d` (2.9667 s).
- The custom clip contains horizontal hips displacement reaching about 1.41 m. Rendering cancels horizontal travel at the model wrapper, retaining vertical body motion and every bone track. Gameplay controls the athlete position.

## Grip and animation

`src/render/athlete-config.ts` is the calibration profile. The socket is a child of `mixamorig:RightHand`, local position `(0, .08, 0)` and Euler rotation `(0, 0, 90)`. The racket is a child of that socket, uniformly scaled `.72`, offset `(0, .28, 0)` so the handle meets the palm. No per-frame world-space racket positioning is used. The original character scale remains 1.

The actual GLBs were loaded in PlayCanvas and inspected in ready, backswing, extension and follow-through poses. The supplied hand pose leaves some fingers open; it is not a closed racket grip. There is no replacement finger animation or IK. Grip calibration is shared by idle, walk, run and swing. An additive local wrist roll keeps the racket outside the legs in locomotion and clears the shoulder in late follow-through; it blends back to the source wrist around contact. This adjusts the hand orientation without detaching the racket or changing the character’s proportions.

Movement speed chooses Idle / Walk / Run; transitions blend over .12 s. Stationary charging holds the backswing near .5 s. Moving charge keeps locomotion active. Shot release opens the original gameplay swing window. Actual successful contact seeks the custom motion to **1.30 s**, at forward extension before the high follow-through. A serve uses the higher 1.40 s pose. Playback runs at 2.2× through 1.85 s. Successful contacts snap to this pose to preserve immediate gameplay responsiveness; other transitions blend. A missed attempt plays a swing without emitting a contact event.

The renderer consumes contact ID, ball position and simulation age emitted at each existing serve/return launch. Seeking accounts for fixed steps already elapsed in the frame. No delayed shot queue, changed reach, changed aim or animation-driven ball physics is introduced. An 80 ms visual-only ball offset brings the launch to the racket sweet spot before returning to the simulated trajectory. At stretched or high contacts, especially serves, this correction may be visible. The supplied clip is a forehand-style swing, not a complete tennis animation set.

Pause freezes the model and ball presentation. Serve preparation and restart clear the contact state; IDs remain monotonic to avoid reusing stale animation events. The AI remains on its original model and logic. Loading is asynchronous. Since the rendering hotfix, no temporary human is created: Play and Practice remain disabled until the textured body and racket have reached a camera render. Either asset failing shows a visible error with a reload/retry action.

## Performance and verification

Each container loads once; its three embedded textures are reused without cloning. No shadow maps, extra camera, effects or extra animation skeleton are added. The GLBs add about 14.5 MB before transport compression. The unchanged engine bundle still produces Vite’s size warning. Physical-device GPU memory and sustained frame time require the owner’s iPhone check.

Asset hash/structure and gameplay-event tests complement actual PlayCanvas loading tests in Chromium and WebKit. Browser tests cover clip transitions, grip hierarchy, in-place hips, pause, contact-driven swing, both cameras, restart and each asset’s visible failure/retry behavior. Existing deterministic full-match win/loss tests remain enabled.
