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
