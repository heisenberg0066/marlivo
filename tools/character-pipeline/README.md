# Character pipeline (Orange guy, Ammar)

How `apps/client/public/assets/characters/{orange-guy,ammar}{,-low}.glb` and the 2D portraits were made.
Only free/open-source tools, all on CPU: TripoSR (MIT) for image-to-3D, rembg (IS-Net) for the cut-out,
Real-ESRGAN (BSD) to sharpen the low-res avatar for texturing, Blender 4.2 (GPL) for clean-up, UVs, baking, rigging
and glTF export, gltfpack (MIT) for meshopt compression. The Ammar model is built only from his own cartoon avatar.

1. `prep.py` — cut-out, TripoSR input, projection texture, subject box.
2. `tsr_carve.py <name> <res>` — runs TripoSR, fits its silhouette to the reference mask, carves the density
   volume with that silhouette (visual hull, so gaps such as the one between Orange guy's legs open up),
   then marching cubes + vertex colours.
3. `build_all.sh <name> <vc|blur> '<json>'` — Blender (`bl/build.py`): keep the main part, Taubin smoothing (plus
   extra smoothing of the face for Ammar), decimate to the High (50k) / Low (12k) LODs, project the reference onto
   the front (occlusion-tested, normal-weighted), texture atlas with the front taken straight from the reference
   and the sides/back baked (TripoSR colours or a blurred projection), `bl/rig.py` auto-weighted bones
   (body/armL/armR or hips/spine/head), GLB export (WebP textures) and `gltfpack -cc`.
4. `bl/bust.py` + `bust_crop.py` — portraits for the 2D picker/seats.

5. `bl/detail.py <name> spec_<name>.json` (run by `build_all.sh` after rigging) — hand-modelled extras placed by casting
   rays from the reference camera through points picked on the reference picture, so they line up with the painted front:
   Ammar's wire glasses (rims, lenses, bridge, temples), silver chain, a tidy backpack with straps; Orange guy's
   palms with three pointed fingers. Each part is parented to a bone (head / spine / arms).

Build options (`settings_<name>.json`, passed to `bl/build.py`): `facing`/`facing_head` limit the projected picture to
front-facing areas; `paint` repaints sides/back with clean flat colours (clothes, hair, faded sides, skin);
`tint` colour-matches Orange guy's sides/back (body, arms, legs) to the front; `hair` squashes the bulky top, pulls the
sides in and sculpts curl clumps; `flatten` presses the old lumpy backpack onto the back; `shoes` paints white sneakers
with a grey stripe; `normal` bakes a tangent-space normal map (High only) from the full-resolution mesh plus a procedural
bump (curls, orange-peel dimples).

Run: `./build_all.sh ammar vc "$(cat settings_ammar.json)"`, `./build_all.sh orange vc "$(cat settings_orange.json)"`
(TripoSR carve at 512³ for Ammar, 384³ for Orange guy). Colours in the settings are linear.
