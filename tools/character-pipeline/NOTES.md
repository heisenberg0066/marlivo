# Character pipeline – problems and fixes log

Short log of the problems hit while building the Ammar and Orange guy models, what was tried and what was kept.

## live3 (single-view TripoSR + Blender projection)
- Dark/brown colours under the table light → per-character `glow` (emissive = base map) in the manifest.
- Shoulder skin streaks on Ammar → stricter facing ramp for the front projection.
- Lumpy backpack from TripoSR → flatten the back + a separately modelled pack (detail.py).

## live4 (hand-modelled detail, sharper High rendering)
- Eyes/glasses smeared onto the sides of the head → `facing_head` [0.6, 0.85] + flat painted sides.
- Painted colours too pale/grey → Blender node colours are linear; convert sampled sRGB (^2.2).
- Ghost eyes on Orange's back from blurred projection → positional `tint` (body/arm/leg colours).
- Dark seam on Orange's head top from the cut-out rim → `prep.py --erode 10`.
- Rim light washed out the head top → rim light lower (y 1.0) and weaker (0.75).
- Blender cannot import meshopt GLBs → render the uncompressed `build/*_hi.glb`.
- A closer camera did not enlarge faces (fit is width-bound by the card areas) → reverted.

## live5 (multi-view)
- Turnaround views generated with GenerateImage from the stylised references (front, 3/4 L/R, side L/R, back).
  Orange: right views are mirrors of the left views (the creature is symmetric) to keep them consistent.
  First Ammar front had a brand-like logo on the shoes → regenerated.
- Fronts upscaled to 2048 px with Real-ESRGAN x4plus (spandrel, tiled on CPU): `upscale.py`.
- Cut-outs with rembg `isnet-general-use`.
- Multi-view image-to-3D: researched Hunyuan3D-2mv (1–4 views: front/left/back/right), TRELLIS,
  InstantMesh, SF3D. TRELLIS/InstantMesh need CUDA; Hunyuan3D-2mv shape model runs on CPU in fp32
  (8 cores, ~25 s per step with the turbo checkpoint, 5 steps).
  - transformers ≥4.50 renamed the DINOv2 attention keys → pin transformers 4.49 + diffusers 0.32.2.
  - bf16 weights on CPU fail in layer_norm (mixed dtype) → fp32.
  - Result: Hunyuan3D-2mv (turbo, 5 steps, octree 256, ~4 min on CPU) gives a far better shape than TripoSR +
    carving: real curls, fade, ears, cargo pockets, sneakers and a proper backpack. Kept as the new base mesh.
  - Non-turbo 30-step runs were OOM-killed at 12 GB RSS while Blender ran too → stay on turbo, one job at a time.
- `align_hy.py`: puts the Hunyuan mesh into the build frame, fits scale/offset/yaw to the reference silhouette
  (IoU 0.80 → 0.87 once yaw was allowed; the reference is turned ~15°), vertex colours from the views.
- Multi-view projection in `bl/build.py` (`mv` option): each view gets an orthographic camera at its yaw, fitted
  to the mesh silhouette by IoU, occlusion-tested, blended by facing angle (power 3).
  - Bug: white blobs / wrong colours → the extra UV layers stayed in the GLB and Blender's `uvb` handle went stale
    after edit-mode toggles (layer data reallocated). Fixed: re-fetch the UV layer, remove all but `UVMap`.
  - Ref-front projection on the new mesh mismatched (different face proportions) → `front` option: project the
    generated 2k front with an orthographic camera instead (consistent with the mesh, IoU 0.93).
  - 3/4 generated views were not used to build the mesh and gave double features → only side/back views kept.
  - Per-view global gain hit its clamp (lighting differs per view) → local colour levelling: per-vertex gain
    measured on the overlap and diffused over the mesh (like "Let there be color!" seam levelling).
  - Painted glasses smeared/ghosted at grazing angles → `unglass.py`: trace the rims (superellipse + thin-line
    response), inpaint them out (OpenCV Telea); the 3D wire glasses (detail.py, now superellipse rims) replace them.
    Thick Hunyuan glasses geometry flattened with `front.flat`.
- Face-side ghosts (side view features landing on the cheek) → `mv.head_split`: the front half of the head
  (below the hairline, `split_ztop`) is painted from the front picture only, the back half from the side/back views.
  Hair keeps a narrower front ramp (`facing_hair`) so the front picture is not stretched over the hair sides.
  Moving the split forward (`head_split` -0.03 + `split_front`) put beard smudges on the cheeks → reverted.
- Orange side band: the positional `tint` (tuned for the old mesh's arm x) painted the new body sides → removed.
- In-game the new meshes keep the reference's turn → manifest `rotationY` (-15° Ammar, -6.4° Orange guy).
- Hunyuan octree 384 run also OOM-killed (11 GB) → octree 256 kept.
- 2D portraits re-cut from the 2k generated fronts (`bust_crop.py`): crisper than the old ones.
- live5 deployed (83faec8). Open issues: Orange guy has a faint grey band behind the eye on the sides and a darker
  stripe down the back (where the side and back views blend); Ammar has a faint painted ear in front of the real ear
  at the right profile; mesh face slightly noisy (octree 256). Next: level the views against each other, not just
  against the front; erode the Ammar fills like Orange; try a finer Hunyuan decode with the DiT unloaded first.

## live6 (2026-10-22) — smoother/sharper Ammar + Orange guy
- Meshes: 384-octree sampling (8 steps, latent saved) then a 512 re-decode from the latent after dropping the DiT (Ammar 659k faces, Orange 1.21M). Fits in 16 GB without swap when nothing else runs.
- Ammar (settings_ammar_hy9): skin-only Taubin (40 it) on the face, 4096 texture from the 4x ESRGAN unglassed front, front/mv edge falloff. Result: smoother face, painted-ear ghost gone, lenses clear (lens_alpha 0.05, spec 0.3). Still open: small peach specks on the hair crown, faint painted temple-arm line from the side views.
- Orange (settings_orange_hy4): root causes found for the three artefacts:
  - grey band behind the eyes = front picture's baked rim shading projected at grazing angles; front facing ramp raised [0,.25] -> [.3,.7] so the side views take over earlier.
  - back stripe = local gain field for the back view interpolating between disagreeing side overlaps; new `mv.level.global: ["back"]` uses one gain for that view.
  - dark marks near the feet = vertex colours of occluded inner-foot vertices; dark low (z<25%) vertex colours reset to the body median before the build (hy_orange512_alf.obj).
- Animals (Biscuit/Mint/Pepper): cut6.py (rembg, 4k ESRGAN front, 2x sides/back), prep6.py (front cut acts as the reference: mask/proj/bbox), align_hy.py falls back to a unit-height frame when there is no TripoSR carve, GEN env selects the view folder; rig.py reads rig_<name>.json (hips/spine/head + armL/armR); client motion 'animal'.
- Queue (box, nohup): q4.sh Hunyuan biscuit->mint->pepper (384 sample + 512 decode + align), q5.sh builds them after Q4_DONE (settings_<n>_hy1.json, yaw from hy_<n>_align.json), q6.sh then does Part C (Choco bar, Sparkle cube; views in /workspace/sb/gen7). Biscuit align IoU 0.968 (yaw 2.0).
- Generated views: gen6/<animal>_{front,sideL,back}.jpg (sideR = mirror of sideL; Mint back mirrored so the tail side matches the front). Sparkle cube: front/3/4/side/back with ivory limbs (gen7/sugar_*); Choco bar front/side/back regenerated at higher res from the 02 turnaround (gen7/choco_*).

## live6 part B/C log
- OOM lesson (again): Pepper's Hunyuan sampling was killed because unglass inpainting + Blender preview renders ran at the same time. qq3.sh now writes HY_RUN/HY_DONE markers; run nothing heavy between them.
- Biscuit v1 (live 08df203): dark grey smears on top of head/ears seen from the seat camera. Cause: barely-seen top vertices got their vertex colour from the cut-out's dark silhouette fringe (front view at grazing angle wins after normalisation). Fix in align_hy.py: view weight ramps up over 2..10 px from each silhouette (_edge.png) and vertices with < 3% of median weight are filled from well-seen neighbours, then diffused 30 rings. Rebuild queued.
- Biscuit side-right view regenerated (scarf end on the bear's right chest, peeking from behind) instead of the mirrored side-left.
- Mint/Pepper 3D glasses: rims found with HoughCircles on the generated fronts (spec_<n>_hy.json, dark wire, lens alpha 0.05), painted rims removed with unglass2.py (darkest-radius trace per angle +-18%, band = 1.9x rim thickness, Telea). build_hy.sh picks spec_<name>_hy.json automatically.
- High renderer: CAS-style sharpen (contrast-adaptive, clamped to the local min/max, amount 0.4) after a 4x MSAA HalfFloat render target, then OutputPass (tone map + sRGB). Only on graphics=high.
- look.py: ELEV env var for elevated (seat-like) previews.

## Ammar face regression (live6 55b15fa) and fix
- Versions compared at identical camera/light: /workspace/sb/seat/live6/ammar-face-versions.png (TripoSR 5469e07 decoded from meshopt with gltf-transform, Blender-detail 28ad524 = 3d7ac63, live5 83faec8, live6 55b15fa).
- What got worse in 55b15fa: not the skin smoothing (only ~8% of vertices, and a face-protect mask changed nothing visible) but the NEW MESH: the 384-octree re-sample is a different Hunyuan sample, with a wider, puffier lower face, a flatter nose and a narrower eye area, so the same texture reads as smaller eyes and a heavier face. Also a painted nose-pad smudge under the right lens.
- Fix (hyb12): live5 face/body geometry (hy_ammar_al.obj, yaw 15) + the live6 texture work (4k unglassed front, silhouette-edge falloff = no painted-ear smudge, clear lenses), nose-pad remnants inpainted (ammar_front4k_ng3_fill.png), 3D rims rounder (superellipse n 3 -> 2.5, closer to the reference). Skin Taubin reduced to 15 it with a face-protect zone.
- Lesson: a new Hunyuan sample is a new face; resolution changes must re-decode the SAME latent (hy_decode.py) rather than re-sample.

## Ghost head at the table (Ammar, cf69976) - root cause
- Reported: from a 3/4 seat a second, ghost-like face outline shows behind/left of Ammar's face.
- NOT geometry and NOT the renderer: the deployed ammar.glb / ammar-low.glb (md5 = repo) each hold exactly one body mesh (36595 / 10855 verts) + glasses, lens and chain; Figures.tsx draws the GLB once (the built-in figure is only a Suspense/load-failure fallback, never drawn alongside).
- It is in the TEXTURE. The front picture is drawn with a narrower face than the mesh, with its ears, sideburn fades, face-contour shading line and a leftover painted glasses-arm smudge just outside that contour. The front projection was allowed down to grazing angles on the head (facing_head [0, 0.25]) and the silhouette-edge falloff only covers the outer picture edge, so those picture pixels landed on the SIDE of the head behind the real face edge: a painted ear on the cheek plus a second face contour/sideburn = the "ghost head". Repro: ELEV=12 look.py at yaw -30/-55/-80 and +55 (/tmp/lab/gh/now_*.png).
- Tried and rejected: narrowing facing_head to [0.35, 0.65] (side views then paint their own eye/brow at the temple = a doubled eye); cleaning eye/brow/glasses arm out of the side views (kept: ammar_side{L,R}_nf_fill.png via mv.fill_tag) - but the hard edge remained until the exclusion covered the drawn contour line itself.
- Fix (hy21): settings front.exclude = UV boxes (picture coords, v top-down) that zero the front weight over the ears, sideburns, contour line and arm smudge on both sides; exclude_soft 0.008 so the edge does not eat the eyebrow/eye corner; side views (with painted eye/brow/arm removed) own that area. Face geometry unchanged (same hy_ammar_al.obj).
- Deployed 6396303 (live md5 verified). Live seat matrix (tools: /tmp/matrix.sh, seat.mjs): Ammar in every opponent seat at 2/3/4 players x High/Low x laptop/phone = 24 screenshots in /workspace/sb/seat/live6/seatcheck/, sheets ghosthead-seatcheck-contact.png and ghosthead-seatcheck-heads.png. No doubled face/ear anywhere. Remaining: a faint lighter skin-tone seam at the temple in pure profile seats (4p seats 1/3 on laptop), where side-view and front-picture skin colours meet - a colour seam, not a second outline. On phone at 4 players, seats 1 and 3 are outside the viewport (only the name tag shows), so Ammar is not visible there at all (layout, not the model).

## Ammar side-on skin seams (after the ghost fix)
- Symptom: patchy/blotchy skin tone on the temples and cheeks in side-on seats where the side views and the front picture meet (two different skin tones + registration noise).
- Fix (hy22): build.py `skin_even` post-pass per LOD. After the first bake the per-vertex colour is read back from the baked texture; on head skin vertices (lum/red-blue skin test, so hair, fade, brows and beard are untouched) a harmonic tone field is solved with the front-owned skin (frontw > 0.97) pinned, so the sides get one smooth tone that meets the front picture exactly; it is blended in with an 8-ring feathered mask that is zero on the front-owned face, then re-baked into the same texture. Geometry and front-view features unchanged (front render differs only on the cheek side zone).
- Pitfall: bimg.copy() of an unsaved generated image is black in a bake; build the source image from the pixel array instead.
- Deployed d716070 (live md5 verified); live 24-seat check in /workspace/sb/seat/live6/seatcheck_hy22_live/ (sheets ammar-seams-live-seatcheck-*.png): even temple/cheek tone at every seat, no doubled geometry. Biscuit rebuild (hyb_biscuit) verified smear-free in renders (biscuit-smear-before-after.png), not yet deployed.

## Ammar ears, side fade, shirt/hair cleanup (hy23/24)
- Ammar: "the ears? the sides look plain". bl/ears.py (run by build_hy.sh when EARS=<json> is set, after detail.py, on both LODs):
  - Ears modelled on the mesh: ear-local frame from the side turnaround (ear centre z 0.805, half size 0.026 x 0.038, yaw 15), 2 levels of local subdivision (hi; 1 on lo), the old nub smoothed away, then a sculpted height field: plate (sticks out more at the back), helix rim, scapha groove, antihelix, concha bowl, tragus, lobe. Normal map neutral in the ear so the sculpt shades cleanly.
  - Texture painted per texel from a baked object-space position + normal map: ear skin with pink lobe/rim and a darker concha; skin fade dark -> lighter brown down the sides and back with stubble noise (two hashed noise scales), crisp hairline/sideburn edge measured from the side turnaround, thin skin margin round each ear.
  - Shirt: skin-coloured texels on the shirt (below z 0.69 outside the neck, and up-facing shoulder tops) -> median shirt black. Hair: peach specks on up-facing/back hair with a mostly dark neighbourhood -> dark-brown highlight.
  - Pitfalls: no scipy inside Blender (box-blur gaussian); dens*(ss+~lat) overshot >1 on the back of the head = black block (fixed with np.where).
- Frame trace in the lenses: unframe.py on the 4k front (ammar_front4k_ng4_fill.png): skin in the lens/rim area replaced by a broad normalized-convolution blur, eyes/lashes/brows/whites kept (dilated mask).
- Live check of e7fbe9c: ears read pale/whitish next to the face at the table (ear/fade skin 214,146,114 vs face ~190,120,84 in the texture). Ear, concha, pink and fade-skin tones re-matched to the measured cheek skin (ears_ammar.json).
- dd21a58 live (md5 verified), 24-seat live check in /workspace/sb/seat/live6/seatcheck_ears2_live/: ears and fade visible side-on and 3/4, no ghost/doubled geometry, face unchanged; shirt shoulders black, hair specks gone. Pepper: mesh decoded at 512 with hy_decode_bf16.py once RAM was free (aligned IoU 0.959) and built (hyb_pepper), not deployed yet.

## Part B live (Oct 22, ~17:40 CEST) — Biscuit 0d39129, Mint dd8425a, Pepper 46c85a7
- Deployed: Biscuit rebuilt GLBs (smear fix); Mint and Pepper manifest entries (motion 'animal', height 0.95, baseY -0.32,
  rotationY = -align yaw: mint 9.8, pepper 0). Live GLB md5 == repo md5 for all three after run 88ddcfe.
- 24-seat live check per character (2/3/4 players x high/low x laptop/phone): /workspace/sb/seat/live6/seatcheck_<name>_live/.
  seat.mjs now takes ME=<id> for the player's own character (passed into page.evaluate as an argument; process.env is not
  visible inside the browser context).
- Seen in every phone 3p shot (all characters, pre-existing): a flat orange ellipse at the top of the screen (ceiling lamp
  shade seen from below at the phone camera). On phone 4p the side seats are off-screen (only name tags show) — layout, not model.
- Part C: cut6.py needs GDIR=/workspace/sb/gen7; Hunyuan must run with /workspace/tools/venv_hy/bin/python (system python
  has no diffusers). "Sparkle cube" id is `sugar`.

## Part C — Choco bar (`choco`) + Sparkle cube (`sugar`)
- Views: gen7 (choco front/sideL/sideR/back from the 02 turnaround, sugar front/side/back with ivory limbs), cut with cut6.py (GDIR=/workspace/sb/gen7), prep6.py.
- Hunyuan3D-2mv turbo, bf16 sampling (hy_mv_bf16.py, 8 steps, octree 384, latent saved), then the SAME latent re-decoded: choco at 512 (1.06M faces, align IoU 0.943, yaw -2.0); sugar's 512 decode was OOM-killed twice (other Blender jobs), so the 384 decode of the same sample is used (870k faces, align IoU 0.908, yaw 2.4) - a flat cube does not need more.
- Sparkle cube doubled eyes: Hunyuan modelled eye bulges + socket rings and a mouth crease larger/higher than the painted eyes -> crescent "second eye outline". flatface_sugar.py presses the eye/mouth box onto a quadratic fit of the front face (+ masked Laplacian relax) before build_hy.sh; the painted features from the 4k front then read clean.
- Builds: build_hy.sh with settings_<n>_hy1.json (front yaw = align yaw), rig_<n>.json, motion 'animal'. Portraits: bust_crop.py on the 4k front cuts. partc_manifest.py inserts only the two manifest entries (rotationY = -align yaw).
- Compare sheets: compare_partc.py (look.py renders at view yaw + align yaw).

## Ammar right ear (his right, picture-right in the side-on seat) regressed in dd21a58 — fixed in hyb29
- Compared symmetric views (look.py 105 vs mirrored -75 = equal angle from his facing direction, ELEV 0) of d716070 (hyb22),
  dd21a58 (hyb24) and fixes. Mirror-fit of the head (reflect + nearest-neighbour, yaw/offset grid search): yaw 15 is right, but
  the head's symmetry plane sits 8 mm toward his right and his right side is ~2 cm wider at ear height, with a bigger old nub
  (lateral 0.127 vs 0.103). The ear placement in s/t is symmetric, so the bad look came from:
  1) the old nub not smoothed away on his right -> "ear inside an ear" crescent at the ear front;
  2) his right glasses temple runs ~1.5 cm further back and crossed the new ear.
- Fix (ears.py, ears_ammar2.json): `smooth_extra_neg` 160 more Laplacian passes on his right only, over a wider radius
  (`smooth_r_neg` 1.9 ear radii); `temple_s_min` 0.03 clamps the temple tips to end at the ear front (his left temple already
  ended there: 0 verts moved). His left ear, the face and the front view are byte-identical in the texture/mesh outside that side.
- Still visible up close on his right: two small speckled slivers at the lower front of the ear (also in dd21a58); not readable at seat distance.
- A `ghost` normalized-convolution fill option is in ears.py (unused: the "ghost" was geometry, not paint).
