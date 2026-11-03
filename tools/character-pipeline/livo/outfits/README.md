# Adult Livo outfits (HY 3D V3.1 single image -> game model)
Per outfit `<o>` (work dir /workspace/sb/hyo/<o>, originals in marlivo_figure/hy3d/outfit_<o>.glb are read only):
1. `SRCGLB=... blender -b -P mkwork.py` (H=1, weld, 250k W) then `blender -b work.blend -P dumpuv.py`, `python proj.py` (W_col.npy).
2. `WITHARMS=1 bash fl.sh <o>`: flatten2 (per-side lobes CL/CR/LOBL/LOBR, HAIRBOX keeps bag/backpack, SKINDEL drops the old hands)
   + arms_outfit.py (straight sleeve + hand) + assemble.py (small holes only) + ortho renders (orthorender.py/gridify.py).
3. `bash rebuild.sh <o>`: decimate/UV/bake hi 60k/2048 + lo 14k/1024, post.py (CLOTH=ref cloth colour, STRIPES, DESAT).
4. `bash install_outfit.sh <o>`: export (ARMATTR) -> rig_livo.mjs (adult RIGCFG) -> gltfpack -> livo_<o>.glb / livo_<o>-low.glb.
5. Specs: eyes2d.py on a facegrid.py render (EYE_SPEC livo@<o>), bodyspec.py in the work dir (BODY_SPECS livo@<o>).
Env per outfit: env_<o>.sh (geometry) and envpost_<o>.sh (texture). Compare sheet: mkcompare_outfits.py.
