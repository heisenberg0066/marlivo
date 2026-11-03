# v0.10 face pass for the adult Livo outfits (work dir /workspace/sb/hyf/<o>, starts from hyo/<o>/asm.blend; originals untouched)
1. `blender -b hyo/<o>/asm.blend -P dumpasm.py -- <o>_asm.npz`; `NX= NZ= python symfit.py <o>_asm.npz <o>_plane.npy` (face mirror plane: yaw/roll).
2. `bash runf.sh <o>` (env envd_<o>.sh: SIDE = kept half, MV = mouth height): deform.py un-rolls the head fully and 60% of the yaw
   about the neck, mirrors the kept face half onto the other (SRC + W), pulls the recessed teeth onto a membrane behind the lips,
   scales the head x1.15 about the chin (HEADS); setverts.py writes asm.blend; rebuild_f.sh bakes hi/lo, post.py, face.py (texture
   mirror), paint2.py (front chart: skin smoothing, blush, freckles, clean teeth/lips, blue-grey irises, flat face normals).
3. `python lm.py <o>` -> <o>_lm.json landmarks (calibrated against streetwear), then rerun paint2.py hi/lo.
4. install: `S=/workspace/sb/hyf/<o> D=/workspace/tools/hyf_livo_<o> RIGCFG=$(python rigcfg.py <o>) bash ../install_outfit.sh <o>`.
   Manifest height = 1.5 x the new bbox height (body keeps its size).
