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
