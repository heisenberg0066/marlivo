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
