# 3D card-action animation — working notes

Goal (user, approved defaults): hands carry every card (IK reach, card attached to the hand, up to the face, then
to the slot); cards never pass through bodies; bouncy Pixar-like timing ~1 s per action plus a Fast/Normal setting;
idle breathing/blinking/head look-at; all actions (draw, peek own, Q peek, J swap, 10 give, throw, receive
penalty); small expressions (focused peek, surprise at a penalty); Low/phone = same actions, simplified.

## Run 1 (2026-10-23) — inspection only, no game code changed

### How it works today
- `render/director.ts` (shared 2D/3D) turns server events into flights: `sprite(from).move(to)` between named
  anchors (`deck`, `hand-N`, `slot:ID`, `pile:i`, `area-N`). In 3D, `render3d/backend3d.ts` maps anchors to world
  places (`layout3d.ts`) and the sprite is a free 3D card on an eased arc. **Nothing links a card to a character**:
  `hand-N` is a fixed point in front of the seat (`L.hands`, 1.08 m from centre, 0.36 m up), so cards fly to a spot
  in the air at/inside the figure — that is the "flying / getting inside the character" the user sees.
- Figures: `render3d/Figures.tsx` `ModelFigure` poses bones procedurally from the mood only (`pose()` with
  model-space axes); placeholders use `rig.ts`. No per-action motion, no look-at, no reach.
- Seats: characters at 1.30 m from centre, scaled 0.85 (≈0.8 m tall); opponent card areas at 0.66–0.68 m from
  centre (≈0.62 m in front of the figure); deck at (-0.17, 0, 0) ≈ 1.3 m away. **No arm can reach the deck at this
  scale** without a big lean + stretch, so the plan below uses a table-level hand-off (see Design).

### Rigs (from the GLB skins)
| character | bones | notes |
|---|---|---|
| ammar | hips, spine, head | **no arm bones at all** (bust-style, chair:false, motion person) |
| orange-guy | root, body, armL, armR | one bone per arm (tentacle arms) |
| biscuit, mint, pepper, choco, sugar | hips, spine, head, armL, armR | **one bone per arm**: no elbow, wrist or fingers |
No animations, no morph targets (so no blend-shape blinks; eyes are in the texture → blink needs a lid mesh or a
texture/UV trick). Low GLBs have the same bones. Rig source: `tools/character-pipeline/bl/rig.py` +
`rig_<name>.json` (`arm_z`, `arm_x` = shoulder heights/offsets).

=> Real elbow/wrist IK needs a re-rig: split each arm into upper/lower/hand (+ optional finger/paw bone) in
`rig.py` (auto weights along the arm), re-export high+low. Choco and Sparkle (stubby limbs) may get upper+hand only.
Ammar needs arms added (mesh may not have them — check the 9 meshes first).

### Capture tooling (scripts/anim-capture.mjs, scripts/anim-frames.mjs) — NOT yet reliable
- `anim-capture.mjs` (CDP screencast, real time): works but only ~2.3 fps under SwiftShader at 1280×720 → too
  coarse. It also stalls at the opening "pick 2 cards to peek" step (needs Skip → Yes handling).
- `anim-frames.mjs` (Playwright `page.clock` fake time, fixed 50 ms steps): renders correctly but the driver loop
  hangs in `page.evaluate` after the roll (page starves while fake rAF runs). Next: drive time only with
  `clock.runFor` in small steps, avoid evaluate while running, or add an in-app debug hook
  (`window.__mlAnimClock`) that steps the director + r3f frame loop deterministically (`frameloop="never"` +
  `advance()`), which is the robust option.

## Run 2 (2026-10-23) — deterministic capture hook (branch `anim-wip`, not on main yet)
Decisions from the parent: re-rig approved (upper/forearm/hand + one curl bone, arms for Ammar, Ammar's face must
not change), blink per character, table radius + seat distance configurable (garden terrace with a smaller table is
coming from another job), order = capture hook -> anim system -> re-rig + 2-bone IK -> draw/peek -> the rest.
- `apps/client/src/debug/vclock.ts` (imported first in main.tsx): with localStorage `marlivo.animstep=1` the page
  runs on a virtual clock (performance.now, Date.now, timers, rAF); `window.__mlAdvance(ms, frameMs)` steps it.
  Off by default. Verified: stepping works, the 3D scene renders, the game plays under it.
- `scripts/anim-frames.mjs` rewritten on top of it: plays the human seat (roll, picks the 2 start peeks,
  draw + throw, skips powers), records each wanted event (ONLY=...) as exact 50 ms frames; SEAT=me|bots.
  First sequence: /workspace/sb/anim/before-laptop-4p/00-PEEK_PICKED-s3 (actually shows the DEAL: the peek event
  is logged while the deal is still animating) -> strip before-laptop-4p-peekpicked-strip.jpg + .mp4.
- Known: slow (~150 s real for load + one round start; screenshots ~0.3 s each). An earlier run hung inside
  __mlAdvance once (not reproduced since; the script now aborts with a 'advance hung' message + hung.jpg).
- Not merged to main: game-code change (main.tsx import) needs pnpm test + e2e + monkey first.
- Next: run the full baseline set (DREW by bots and me, THROWN, SWAPPED, Q/J/10, penalties) for 2/3/4p, laptop/phone,
  High/Low; then step (b) the actor registry.

## Run 3 (2026-10-23) — re-rig + first hand-carried draw (branch `anim-rig`)
- main = f1871de (capture hook merged after pnpm test + e2e laptop/phone R3D=1 BOTS=3, both clean).
- WARNING for later runs: around 01:43 the box's /workspace/sb and the /workspace/marlivo working tree were
  restored from an older snapshot (node_modules, dist and uncommitted edits vanished). Work in
  /workspace/animwork/repo (git worktree on anim-rig) and commit/push often. The garden-scene job uses
  /workspace/marlivo-scene (branch scene-garden).
- `tools/character-pipeline/split_arms.mjs` (run with @gltf-transform v4 + meshoptimizer, e.g. from
  /workspace/animwork/gt): splits armL/armR into arm -> _fore -> _hand -> _curl on the exported GLBs (High + Low,
  same bones) and rebuilds the arm weights from geometry (lateral of the torso, between the rig's arm heights;
  optional "split" overrides in rig_<name>.json, Mint uses cx/armX/zmin to keep the tail out). Mesh, UVs and
  textures are untouched, rest pose identical. Old weights made legs, the belly, Choco's wrapper, Sparkle's cube and
  Mint's tail follow the arms (see /workspace/sb/anim/rig-before-after-sheet.jpg: per character, old rest | old rig
  arms raised | new rig same raise + elbow/wrist/curl; right half = weight colours).
  Known: Mint's arms are fused with the body sides, so its arm region still takes a strip of the flank.
  Ammar: no arms yet (mesh has none) -> needs modelled arms; not done. Blink: not done.
- `render3d/actors.ts`: per-seat actor registry, analytic two-bone IK (no stretching, elbow pole out/down/back),
  paw curl, lean, head look-at (neck limits) and focus; `Figures.tsx` layers it on the mood pose every frame
  (seed = seat). `backend3d.ts` `act('draw')`: the card slides low on the felt to a pickup point the arm can reach
  (towards the deck, inside the table edge: uses TABLE_R and the seat distance from the layout, so a smaller table
  just shortens the slide), the figure leans in, reaches, the paw closes, the card rides in the hand up to the face
  (head follows, focused), then down to the hold spot; the arm keeps holding until THROWN/SWAPPED (release) or the
  view says the card left. Director: DREW for opponents uses it when available, else the old flight.

- Capture notes: under SwiftShader a High 4-player frame can take seconds; the script now waits up to 120 s per
  advance / 180 s per screenshot and renders once per saved frame. Don't run two captures + pnpm test at once (the
  GPU process backs up and screenshots time out). vclock timers now fire >= 1 ms later (no setTimeout(0) spin).
- NOT verified yet in the running game (clips pending): the draw choreography may need sign fixes (lean direction,
  curl axis, elbow pole) per character; check frames before merging. Not deployed.

## Run 4 (2026-10-23)
- Capture: director `captureHook` + vclock `__mlStop` stop the virtual clock on the exact frame a wanted event's
  animation starts (`anim-frames.mjs` sets `window.__mlCapture`), so clips start on the action.
- IK bug fixed: `slerpQuaternions(qI, qA)` into qA copied identity first, so the arms never moved.
- Clips (/workspace/sb/anim): before-draw-orange-* (card arcs high and lands in the face) vs after-draw-mint-* (card
  slides on the felt, Mint leans in, the paw takes it at the rim, lifts it to the face, holds it at the chest);
  after-peek-own-orange-* (opponent reaches its slot, lifts the card to its face, lays it back). Before had no
  opponent peek motion at all.
- Hold spot for opponents moved from face height (1.08 m, y 0.36) to chest height in reach (1.14 m, y 0.25).
- Peeks run per seat in a queue (`queueSeat`) without blocking the director; `stagedHidden` hides the table copy of
  a card while a hand carries it (Card3D checks it every frame).
- Idle breathing layer (spine + forearms). Blink NOT done (eyes are painted: needs per-character lid meshes placed
  from front renders). Ammar's arms NOT done: his mesh has arms but the hands are fused into his trouser pockets, so
  rigging them would tear the pants; needs geometry surgery (cut the forearms, fill the pockets, model new
  forearms/hands in sleeve + skin colours) with a face pixel check. He uses the old flights meanwhile.
- Known: Orange guy leans a lot (whole body is one bone); Mint's head dips far during the lean; held card is small
  and nearly edge-on when lifted to the face. Pepper's wing tip stretches a thin feather strip in extreme reaches.
- IK test page: /workspace/animwork/gt/ik.html (bundled actors.ts via esbuild) for quick per-character checks.

## Run 5 (2026-10-23) — polished draw & peek-own, all actions staged through hands, idle look-at, LIVE on main
- Polished the three rough spots from Run 4:
  1. Per-character `leanScale` (`0.28` for one-bone creatures like Orange guy, `0.42` for blocky bodies Choco/Sparkle,
     `0.48` for animals Biscuit/Mint/Pepper) + capped creature head pitch (`±0.08` rad) so bodies never tip too far.
  2. Separate-head rigs (Mint, Biscuit, Pepper, Choco, Sparkle) counter-rotate `-leanEff * 0.9` on the neck during a
     forward spine lean so the crown never dips and the face/glasses stay upright toward the camera.
  3. Held and peeked cards yaw (`-sin(yaw) * 0.45`, plus `±0.28` for top seat) and roll (`±0.15`) toward the camera
     so they never read razor-thin / edge-on from any seat.
- Added idle head look-at (`Figures.tsx`): when not performing an action, each character turns its head to watch the
  active player (or their held card, or its own cards on its turn).
- Added hand-staged choreography (`backend3d.ts` + `director.ts`) for all remaining opponent card actions:
  - `throw` (`THROWN`): holding hand swings to the rim, uncurls, and releases the card face-up onto the discard pile.
  - `swap` (`SWAPPED`): holding hand places the drawn card into the slot while the outgoing slot card flips to the pile.
  - `matchThrow` (`ATTEMPT_END` complete): hand reaches the matched slot and flicks the card onto the pile.
  - `queenPeek` (`QUEEN_PEEKED`): owner leans and reaches toward the target slot (own or opponent's) while the card
    slides/lifts for a focused look and returns.
  - `jackSwap` (`JACK_SWAPPED`): owner reaches with both arms while the two cards slide low across the felt with gold trails.
  - `tenGive` / `penalty` (`TEN_GIVEN`, `PENALTY_DEALT`): card slides low from the deck; giver pushes it, receiver
    reacts with a surprised pull-back (`lean < 0`) and reaches to settle the card into the slot.
- Verified:
  - Every-seat check (`2/3/4p × High/Low × laptop/phone`, 30 s model load): 12/12 clean (`/workspace/sb/anim/seatcheck-sheet.jpg`).
  - `pnpm test` (82/82), `e2e-solo` laptop & phone (`R3D=1 BOTS=3`), `monkey` (`R3D=1 N=4`): all pass with 0 errors.
- Next:
  1. Ammar's free forearms/hands in Blender (cut forearms above trouser pockets, close pockets, model stylised
     forearms/hands in sleeve + skin colours, pixel-by-pixel check on head/face/glasses).
  2. Per-character eyelid meshes or scale/UV blink.

## Run 6 (2026-10-23) — Ammar's 4-bone arms (0 face pixel diff), all-character eyelid blink, and garden terrace reach tuning (LIVE on main)
- **Ammar's arms (`tools/character-pipeline/rig_ammar.mjs`, `ammar.glb`, `ammar-low.glb`):**
  - Tucked the old fused bare forearms (`y in [0.365, 0.615]`) flush into a smooth closed trouser-pocket and shirt
    flank contour (`|x| ≈ 0.098`) and reassigned the old forearm skin UVs on the flank to his black cloth UV (`[412.5, 174.5]`
    at flat normal `[128, 128, 255]`), weighted 100% to `spine`/`hips` so his shirt, backpack straps, and trousers never
    stretch when his arms move.
  - Modelled stylised short-sleeved arms + bare forearms + rounded hands with thumbs in his exact sleeve (`RGB [26,25,26]`)
    and warm tan skin (`RGB [192,126,87]`) atlas texels, rigged with the same 4-bone chain (`armL/R -> _fore -> _hand -> _curl`).
  - Kept every vertex with `y >= 0.615` (neck, head, face, hair, ears), all 8 glasses/chain meshes, and both textures
    100% bit-for-bit identical. Verified in neutral before/after renders (`/workspace/sb/anim/ammar-arms-before-after.jpg`):
    **0 pixel difference (`maxDiff = 0, pixels > 0 = 0`)** across his face, hair, and glasses.
- **Blink support across all 7 characters (`Figures.tsx`, `actors.ts`, `backend3d.ts`):**
  - Added `attachBlinkShader` (`onBeforeCompile` on `MeshStandardMaterial`) using rest-pose unit-height bind coordinates
    (`vBindP`, computed before `#include <skinning_vertex>` so eyelids stay locked to the face as the head turns/nods)
    and modifying both `diffuseColor.rgb` and `totalEmissiveRadiance` (`#include <emissivemap_fragment>`) so eyelids are
    100% opaque with a curved dark lash line and never clip through 3D glasses.
  - Organic `3.5–4.6 s` blink cycle with occasional double-blinks, surprised flutter on `surprised` mood or penalty card
    reception (`blinkUntil`), and a subtle `0.32` focused squint during card peeks.
  - Visual proof across all 7 characters (open vs closed): `/workspace/sb/anim/blink-all-characters.jpg`.
- **Garden terrace integration (`TABLE_R = 0.98`, `SEAT_DIST = 1.20`):**
  - Rebased onto `359eb42` (Golden garden, Sunny picnic, Lantern dusk, Classic room + 3D Orange waiter).
  - Updated `layout3d.ts` opponent held-card distance to `SEAT_DIST - 0.15` (`1.05 m`) and `backend3d.ts` draw pickup
    reach so seated characters reach further onto the table cloth without clipping their bodies.
  - Verified with `pnpm test` (101/101), 3D E2E (`laptop` and `phone` `R3D=1 BOTS=3`), `monkey` (`R3D=1`), and the 12-way
    every-seat check with Ammar at opponent seats (`/workspace/sb/anim/seatcheck-ammar-sheet.jpg`).

## Run 7 (2026-10-23) — Orange waiter 4-bone arm IK & prop parenting + first-person mySeat hand & Pixar card polish (LIVE on main)
- **Orange waiter 4-bone arm IK & prop parenting (`render3d/scenes/waiter.tsx`):**
  - Connected `useWaiterModel` (`tango` / `orange-guy.glb` & `orange-guy-low.glb`) to `findArms`, `solveArm`, `curlArm`,
    `resetArm`, `handPos`, and `attachBlinkShader`.
  - **W1 (`visit`):** raises his right hand to his chin while inspecting the cards, then raises `armR` high with elbow
    and wrist bend to wave at the camera while winking.
  - **W2 (`refill`):** `armL` bends to carry the folded waiter towel (`towelRef` parented to the forearm/wrist midpoint)
    while `armR` grips the porcelain teapot handle (`teapotRef` parented to `handPos(arms.R)`) and tilts to pour the amber tea stream.
  - **W3 (`shuffle`):** brings both hands forward with bent elbows to gather/square the deck, holds both ends of the
    card-bridge flourish (`±0.18` m), and sets the deck down while bowing.
  - **W4 (`roundEnd`):** `armR` carries the water glass (`glassRef` parented to `handPos(arms.R)`), winds back and swings
    forward to splash water droplets on the loser, then claps both hands together in front of his chest while cheering the winner.
  - **W5 (`medal`):** carries the red velvet cushion (`cushionRef` parented between `handPos(arms.L)` and `handPos(arms.R)`)
    with both hands, then reaches both hands forward and up to drape the gold medal around the match winner's neck.
- **Player's own seat (`mySeat`) card handling (`backend3d.ts`, `Card3D.tsx`):**
  - Added `createFpHand` & `updateMyPeekHand`: a stylised first-person forearm, sleeve cuff, palm, thumb, and curling
    fingers (matching all 7 characters' exact sleeve and paw/skin palettes, with `raycast = () => {}` so it never intercepts clicks)
    that reaches in from the bottom edge of the camera view to hold the local player's peeked card and accompany single-card
    draws, throws, and swaps on the player's half of the table.
  - Upgraded `Sprite3D.move` and `Card3D` with Pixar-like anticipation (`0..10%` pull-back), `easeOutBack` overshoot settle,
    banking roll along lateral velocity, and gentle breathing hover on lifted peek cards.
  - Scaled multi-card penalty duration (`Math.min(380, 640 / count)`) so rapid 4-card penalties never lag behind monkey taps.
- **Verification:**
  - `pnpm test` (101/101), 3D E2E (`laptop` and `phone` `R3D=1 BOTS=3`), `monkey` (`R3D=1 N=4`): all pass with 0 failures.
  - Visual strip: `/workspace/sb/anim/waiter-ik-and-myseat-strip.jpg`.

## Run 8 (2026-10-23) — Big Win/Lose Reactions, HUD Emotes, and Background Badminton 4-Bone Arm IK (LIVE on main)
- **Big Win/Lose Character Reactions & Playful Emotes (`actors.ts`, `Figures.tsx`, `backend3d.ts`, `Table3D.tsx`, `director.ts`, `Game.tsx`, `props.tsx`, `waiter.tsx`):**
  - Added pure, unit-tested `computeEmotePose(kind, u)` (`apps/client/test/emotes3d.test.ts`), `triggerEmote`, `activeEmoteFor`,
    and `seatCupBounce` for `'wave'`, `'cheer'`, `'boo'`, `'slam'`, `'win'`, and `'sputter'`.
  - **Round / Match Lose (`slam` = `sadSlump` + `tableSlam` + `sputter`):** Losers slump forward with droopy half-closed
    eyelids (`0.55` blink) and perform 3 cartoon fist/paw slams onto the table rim in front of them (`y >= 0.025`, never
    clipping through the tabletop `y = 0`), imparting a vertical bounce & rattle (`seatCupBounce`) to their porcelain
    teacup and saucer (`props.tsx`). When the Orange waiter splashes the loser with water (`waiter.tsx`), the loser
    triggers `'sputter'` (`💦 Brrr!`) with a rapid head/torso shake and eyelid flutter.
  - **Round / Match Win (`win` = `celebrate` + playful `boo`):** The winner raises both arms in a bouncy victory pump and
    overhead/chest clap (`0..50%`), then leans in with a cheeky cupping-hand by the mouth and playful thumbs-down wag
    toward opponents (`50..100%`) with a happy squint (`0.48` blink).
  - **Quick Emote Bar in HUD (`Game.tsx`, `styles.css`):** Added a compact, non-intrusive `.emote-bar` with 4 pill buttons
    (`👋 Wave`, `🎉 Cheer`, `😜 Boo`, `💢 Slam`) in `.me-plate` (outside `.actions` so automated tap scripts never collide)
    that triggers the player's first-person hand (`updateMyEmoteHand`), 3D character pose, and floating `.emote-pill` badge
    without blocking or delaying card play.
- **Background Badminton Players 4-Bone Arm IK (`render3d/scenes/badminton.tsx`):**
  - Connected both background badminton Orange guys (`A` and `B`) to `findArms`, `solveArm`, `curlArm`, `resetArm`, and
    `handPos` so their rackets are held in `armR_hand` and their overhead jump-smashes and underhand returns bend naturally
    at the shoulder, elbow, and wrist while `armL` counter-balances.
- **Verification:**
  - `pnpm test` (105/105 passed, including 4 new unit tests in `apps/client/test/emotes3d.test.ts`), 3D E2E (`laptop` and
    `phone` `R3D=1 BOTS=3`), `monkey` (`R3D=1 N=3`): all pass with 0 failures and 0 errors.
  - Visual verification strip: `/workspace/sb/anim/reactions-and-badminton-strip.jpg`.

## Run 10 (2026-10-23) — Ammar Natural Light-Tan Skin Tone Adjustment (LIVE on main)
- **Measured Reference vs Previous `ammar.glb` / `ammar-low.glb` Skin Tone:**
  - In `ref_ammar_avatar.png` and `/workspace/sb/gen5/cut/ammar_front.png`, Ammar's skin has `p25 = [190, 125, 84]`,
    `p50 (median) = [225, 141, 99]`, `p75 = [241, 157, 117]`.
  - In the previous `ammar.glb` (`hyb29`), the right cheek, eye sockets, jawline/neck, ears, side temples, and forearms
    had texture values `[155..192, 91..126, 52..87]` (`lum = 105..141`), which after 3D lighting + normal-map crevices
    rendered at `p50 = [167, 111, 80]` (`p25 = [147, 99, 71]`) — reading too dark/muddy ("too close to be blacky").
- **Fix (`tools/character-pipeline/polish_ammar_skin.py`, `apply_ammar_skin.mjs`, `ammar.glb`, `ammar-low.glb`, `manifest.json`, `Figures.tsx`, `backend3d.ts`):**
  - Built a continuous, UV-seam-free chroma/redness skin transfer (`f = ss(R - B, 16, 78) * ss(R - G, 10, 48) * ss(R, r_lo, r_hi)`)
    that maps all skin regions (forehead, cheeks, nose, eye sockets, chin, neck/jawline, ears, side/back fade skin, and
    the 4-bone forearms/hands) onto Ammar's warm light-tan reference curve (`[216, 146, 104] -> [233, 160, 115] -> [245, 173, 127]`)
    while keeping a tight protection mask (`w_fh`) + dark-core crispening on his mustache, goatee, eyebrows, eyelashes,
    pupils, and dark curly hair so his facial hair and hair stay deep and sharp with zero haloing or seams.
  - Updated Ammar's `glow` in `manifest.json` (`0.45 -> 0.65`), softened `mt.normalScale` to `0.28` in `Figures.tsx` so
    baked normal-map crevices don't carve dark shadows into his face, and matched his eyelid blink colour (`#e6a87e` in
    `Figures.tsx`) and first-person hand colour (`#eab086` in `backend3d.ts`).
  - Preserved all 11 joints (`hips, spine, head, armL/R -> _fore -> _hand -> _curl`) and `EXT_meshopt_compression` on
    both `ammar.glb` and `ammar-low.glb`.
- **Verification:**
  - Before/After/Reference 15-panel sheet: `/workspace/sb/anim/ammar-skintone-before-after.jpg`.
  - Golden garden 3D table sheet (Laptop High/Low, Phone High/Low + zoomed top/side seat close-ups): `/workspace/sb/anim/ammar-skintone-table.jpg`.
  - `pnpm test` (105/105), 3D E2E (`laptop` and `phone` `R3D=1 BOTS=3`), `monkey` (`R3D=1 N=3`): all pass with 0 failures.

## Run 11 (2026-10-23) — Cascaded Quaternion Bone Smoothing, Living Relaxed Idle with Radial Body Clearance, and Animated Cartoon Mouth Shader (LIVE on main)
- **Continuous Quaternion Slerp Bone Smoothing (`actors.ts`, `Figures.tsx`, `scenes/waiter.tsx`):**
  - Replaced hard per-frame `resetArm()` snapping with `stepArmSmoothing(arm, dt)`: exponential quaternion `slerp` with
    overlapping joint hierarchy lag (`shoulder lambda=16 -> elbow lambda=12.5 -> wrist/hand lambda=9.5 -> curl lambda=14`)
    plus torso/head quaternion damping (`lambda=11.5`) so every transition between idle, reach, hold, and release flows
    with follow-through and zero snapping.
  - Auto-decays stale post-draw arm holds in `applyActor` when `drawn.by !== seat` and clears `a.cmd.arm` on action completion.
- **Natural Relaxed Idle & Radial Body Clearance for Orange Guy (`fix_orange_rig.mjs`, `actors.ts`, `Figures.tsx`, `layout3d.ts`):**
  - Moved `orange-guy.glb` & `orange-guy-low.glb` shoulder joints (`armL`/`armR`) from `|x| = 0.245` (11 cm inside the egg
    torso) out to the true shoulder exit surface (`|x| = 0.340, y = 0.512`) and weighted 100% of the egg torso (`|x| < 0.338`)
    to `body`/`root` so the torso never caves in when the arms move.
  - Added `computeIdlePose` and `clampArmTarget` with radial clearance (`|x| >= 0.49..0.52` and outward forearm slope
    `fDir.x >= 1.2 * hypot(dy, dz)` in `solveArm`) so Orange guy's elbows, wrists, and fingers stay 40–50 px clear of his
    round egg body while cycling through relaxed side/table-rim rest, finger taps, torso sway, and casual gestures.
  - Angled side-seat characters `~22°` toward the camera in `layout3d.ts` so their faces, mouths, and both arms read clearly.
- **Procedural 2D SDF Cartoon Mouth Shader (`attachBlinkShader` in `Figures.tsx`, `computeMouthTarget` in `actors.ts`):**
  - Added `uMouth = vec4(open, smile, width, cover)` in unit-height bind coordinates (`vBindP`) that masks over the static
    baked mouth line with the surrounding skin colour and draws a cartoon mouth cavity (`#2e0a0d`), pink tongue crescent
    (`#eb5c5c`), upper teeth rim, and dark outline across relaxed smiles, curious `"O"` peeks, big laughing grins
    (`cheer`/`win`/`matchThrow`), and shocked/groaning reactions (`slam`/`sputter`/`penalty`).
- **Verification & Visual Evidence:**
  - `orange-relaxed-and-mouth-sheet.jpg`: 6-panel Before vs After sheet with verified 40–50 px radial arm-to-body air gap.
  - `smooth-motion-overlap-strip.jpg` & `orange-living-showcase.mp4`: 140-frame (`7.0 s @ 20 fps`) Golden garden showcase.
  - Client & unit tests (`vitest run`): 107/107 passed.

## Design (next runs)
1. `render3d/anim/` — per-seat **actor registry**: each figure registers `{ handWorld(side), reach(target, w),
   look(target), lean(x), expr(kind) }`; backend3d resolves `hand-N` to the live hand bone instead of `L.hands`.
2. Reach: two-bone analytic IK (shoulder→elbow→wrist, pole = down/out) once re-rigged; until then one-bone aim +
   spine lean (no stretching). Per-character arm length from the rest pose, tuned in the manifest (`reach`).
3. Card hand-off: the card leaves the deck by **sliding low along the felt** to the seat's reach point (never
   through the air into a body), the hand reaches, the card parents to the hand bone, lifts to the face (head looks
   at it, focused look), then the hand lays it in the slot / throws it to the pile.
4. Timing: anticipation (small pull-back 120 ms), main move ease-in-out, overshoot + settle, ~1 s total ×
   speedScale(); add Fast/Normal in Settings (reuse `prefs.speed`).
5. Idle layer: breathing (spine scale/rot), head look-at to the active player or the card, blink trick.
6. Low graphics/phone: same timeline, no fingers, fewer layers.

## Known issues
- Baseline frame strips per action not captured yet (tooling hang above); only a still of the 4-player laptop
  table: /workspace/sb/anim/baseline-laptop-4p-table.jpg.

## Scene config (from the scenes job, 2026-10-23)
Table radius, seat distance, chair offset and character scale now live in `render3d/sceneConfig.ts`
(`TABLE_R` 0.98, `SEAT_DIST` 1.20 — characters moved 0.10 closer to the table). Read them from there, not from
literals. Cups to avoid while reaching: `propLayout(L).avoid` in `render3d/scenes/propLayout.ts`. Details:
[SCENES.md](SCENES.md).
