# hands/ — real arms and hands for the HY3D figures (Livo, Ammar), Phase 5 (v0.12)

The HY3D rigs had stubby tube arms with no hands. This pipeline replaces them:

1. `mkarm.py cfg_<name>.json <name>` builds an SDF arm per side (upper arm, elbow, forearm, wrist, palm, thenar pad,
   2-segment thumb, four 2-segment fingers) plus clothing (`coat` sleeve + cuff, or `tee` sleeve + hem) and an optional
   watch, meshes skin/cloth/watch separately (marching cubes -> quadric decimation -> SDF normals + AO), skins it to
   the 4-bone arm chain (arm -> fore -> hand -> curl), and writes `<name>_{hi,lo}.npz/json` and `<name>_chain.json`.
2. `rearm.mjs rig.glb arm.json chain.json cfg.json out.glb` drops the old arm triangles (arm weight > 0.5), re-places
   the arm bones and inverse bind matrices, adds the arm primitive with an 8x8-patch colour atlas material `arms`, and
   sets `extras.curlSign = -1` on armX_hand (read by actors.ts findArms/curlArm: these fingers curl the other way).
3. `pocketfix.py` repaints the old skin-coloured hands-in-pockets texels on Ammar's body texture with the cloth colour.
4. `run.sh <name> <origprefix>` (TEXFIX=1 for Ammar) then `install.sh <name> <asset>` (gltfpack -cc -kn -ke) installs
   to apps/client/public/assets/characters/<asset>{,-low}.glb.

Inputs are the uncompressed Phase-4 rigs (beanie_{hi,lo}_rig.glb, ammar_{hi,lo}_rig.glb, set ORIG=dir); the original
HY3D downloads are never modified. Client side: TABLE_REST in actors.ts (forearms resting on the table edge, elbows
bent) and createHumanFpHand in backend3d.ts (fingered first-person hand for Livo/Ammar). scripts/hands-check.mjs
plays a practice game and records elbow angles and fingertip heights.
