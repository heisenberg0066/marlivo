# 3D scenes (Settings → Scene, or ☰ in a match)

Four selectable table scenes for the 3D renderer. Default: **Golden garden**.

| pref `scene` | name | sketch | table | lights |
|---|---|---|---|---|
| `golden` | Golden garden | v8 p02 | round rustic wood + cream linen drape | hemi + warm low sun + fill; fairy lights = sprites |
| `picnic` | Sunny picnic | v8 p03 | plank picnic table + gingham band, plank benches | hemi + sun + sky fill |
| `dusk` | Lantern dusk | v8 p04 | square dark oak + terracotta runner | hemi + warm key + cool rim; High adds 1 point light; lanterns/candles/floodlights = sprites |
| `classic` | Classic room | v3 | the old back room (`Room.tsx`) | as before |

The scene can be switched at any time, also during a match: `Table3D` preloads the new scene chunk, fades to
black (~0.2 s), swaps, fades back. Only dressing changes; layout, director and game state are untouched.

## Files (`apps/client/src/render3d/`)
- `sceneConfig.ts` — **shared numbers** (see below). Read by the layout, the scenes and the animation job.
- `scenes/index.ts` — lazy registry: each scene is its own chunk (`golden`, `picnic`, `dusk`, `classic`, 1–5 kB);
  the shared garden base (`base.tsx` + props, garden, badminton; ~17 kB) loads once. No image downloads at all:
  textures are canvas-made (`scenes/stex.ts`, seeded, 256–1024 px) when the scene mounts. The Orange guys use the
  existing `orange-guy-low.glb` from the manifest (cached, shared with the table figure).
- `scenes/base.tsx` — fog/sky, lawn + flagstone terrace + stone edge, the court, the badminton loop, greenery,
  the tea service, sugar, chocolate. `scenes/golden|picnic|dusk.tsx` add their lights, table and dressing.
- `scenes/props.tsx` — tea cup + saucer (lathe, gold rims), tea surface, sugar cubes (one InstancedMesh), steam
  (High only), chocolate bar with bite + crinkled foil, garden chairs / picnic benches.
- `scenes/garden.tsx` — `Instances` helper, sky dome, ground, court + net + floodlights, hedges/trees/lavender/
  roses/daisies/pots (all instanced), fairy-light strings (one Points draw for all bulbs), posts.
- `scenes/badminton.tsx` — the 4 s loop (serve, rally, jump smash with squash & stretch, return); pure function
  of time. Clones the GLB and turns only that clone's `armR` bone; `Figures.tsx` and the rigs are untouched.
- `scenes/propLayout.ts` — pure placement of tea/sugar/chocolate (unit test: `apps/client/test/props3d.test.ts`).
- `scenes/tea.ts` — tea levels.

## Shared config (`sceneConfig.ts`) — for the arm-reach / lean animation
| constant | value | meaning |
|---|---|---|
| `TABLE_R` | 0.98 | playing-surface radius; every card stays inside `TABLE_R - 0.04` (tested). Was 1.0 (+0.12 wood rim) |
| `SEAT_DIST` | `TABLE_R + 0.22` = 1.20 | table centre → seated character root (was 1.30) |
| `CHAR_SCALE` | 0.85 | seated character + chair group scale |
| `CHAIR_BACK` | -0.12 | chair offset behind the character root (local, before scale) |
| `FLOOR_Y` | -0.75 | ground height (table top is y = 0) |
| `CENTRE_CLEAR_R` | 0.34 | centre piles keep-clear radius (no props inside) |
| `AREA_MARGIN` | 0.035 | keep-clear margin around each seat's biggest card area |
| `TABLE_SHAPES` | per scene | outline: round (`rim`) or rect (`hx`, `hz`); cards always fit `TABLE_R` |
| `TEA`, `CHOCO` | sizes | saucer/cup radius, bar size |
| `CAMERA` | | outdoor seat-view elevation (laptop 0.5, phone 0.86) and phone side-seat keep (0.8) |

`layout3d.ts` re-exports `TABLE_R`/`SEAT_DIST`; `L.chars[seat]` is at `SEAT_DIST`. Reach targets: own cards
`L.slots`, centre `DECK` / `PILE`. **Arms must not pass over a cup**: `propLayout(L).avoid` lists circles
`{x, z, r}` (one per saucer) to route around; the chocolate is at `propLayout(L).choco`.

## Tea + waiter hook
Each cup drains on its own (a sip every 18–40 s, ~8 min full → dregs, `TEA_DRAIN`). The waiter calls
`refillTea(seat?)` from `scenes/tea.ts` (also `window.__mlTea.refill(seat)`; `level(seat)`, `set(seat, v)`,
`onRefill(fn)`). Levels are local, cosmetic only (not game state, not synced).

## Performance rules (Low / phone)
- No shadow maps, no environment maps; Lambert/Phong only; contact shadows are baked blob textures.
- Fairy lights, lanterns, candles, floodlights are additive sprites — never real lights (dusk High adds one).
- Every repeated thing is one InstancedMesh; Low halves the foliage counts, uses 20-tri blobs, drops the sky dome,
  steam and spoon. Badminton players always use the Low GLB (they are far away).
- `window.__mlScene` = whole-frame draw calls / triangles / geometries / textures for perf checks.
- `node scripts/scene-shots.mjs` (env `SCENES`, `PLAYERS`, `GFX`, `DEV`, `WAIT`, `BASE`, `OUT`) shoots every seat.

## The Orange waiter (`scenes/waiter.tsx`, `scenes/waiterPath.ts`, sketch book v8 p22–27)
A third Orange guy (`id: "tango"` GLB from the character manifest) who enters from `KITCHEN_DOOR` (`[-2.65, FLOOR_Y, 1.55]`)
and walks clockwise along the safe terrace loop (`LOOP_R = 1.64`, stepping in to `STOP_R = 1.28` only at the four
inter-seat gap stops `A, B, C, D`, never crossing onto the table or the badminton court `z < HEDGE_Z`).

### Random outfits (`WAITER_OUTFITS`)
Picked at random on each visit (`pickWaiterOutfit()`, unit-tested in `apps/client/test/waiter3d.test.ts`):
- `full`: crisp white shirt bib, black waistcoat with gold buttons, white waist apron, black bow tie, folded towel on left arm
- `suit`: navy-charcoal suit jacket with lapels, pocket square, white collar and crimson necktie
- `tie`: normal orange body with white collar and red/gold striped necktie
- `plain`: normal unadorned Orange guy (carries the white service towel when pouring tea)
- `tuxedo`: formal black tuxedo with satin lapels, pleated shirt with black studs, black bow tie, folded towel on left arm

### Sequences (`WaiterActionKind`)
- `visit` (W1, p22): periodic table visit (~4–6 min when no `.fly-card` is active); inspects cards at stop `A`, turns to camera, winks and waves.
- `refill` (W2, p23): triggers when at least half the cups drop below `0.42`; walks the full loop `A → D → C → B` with a white porcelain teapot + towel, pours an amber stream into each cup from the gap beside the seat, and calls `refillTea(seat)`.
- `shuffle` (W3, p24): triggers when `roundNo` advances; stops at `A`, gathers/squares the deck, performs an 11-card rainbow bridge flourish between his hands, sets the pile, bows, and exits.
- `roundEnd` (W4, p25): triggers when `view.round.result` arrives; walks to the stop beside the loser with a glass of water, winds up and splashes 18 chunky cartoon blue droplets onto the loser's face (cards stay dry), then turns to the winner with a happy clap + multi-colour confetti burst.
- `medal` (W5, p26): triggers when `view.phase === 'MATCH_END'`; walks out with a red velvet cushion (gold corner tassels) carrying a gold star medal on a blue V-ribbon, bows to present it, and hangs the gold medal around the overall winner's neck with golden confetti.

### Debug & test hook (`window.__mlWaiter`)
- `__mlWaiter.trigger(kind, { outfit?, winner?, loser?, progress? })` starts any sequence (and optionally locks normalized progress `0..1` for deterministic frame inspection).
- `__mlWaiter.setProgress(p)` / `__mlWaiter.stop()`.
