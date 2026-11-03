# install.sh <name> <assetbase> : gltfpack the rearmed hi/lo rigs and copy to the client assets
set -e
N=$1; A=/workspace/marlivo/apps/client/public/assets/characters; B=/workspace/sb/hands/build
for t in hi lo; do npx --prefix /workspace/tools/gp gltfpack -i $B/${N}_${t}_rig.glb -o $B/${N}_${t}_rig.c.glb -cc -kn -ke 2>&1 | tail -n 1; done
cp $B/${N}_hi_rig.c.glb $A/$2.glb; cp $B/${N}_lo_rig.c.glb $A/$2-low.glb; ls -la $A/$2.glb $A/$2-low.glb
