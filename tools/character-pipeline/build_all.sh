#!/bin/bash
# full pipeline for one character after carve: build LODs, rig, export, compress, preview
set -e
cd /workspace/tools
N=$1; shift
./run_build.sh $N "$@"
B=/workspace/tools/blender-4.2.3-linux-x64/blender
cd build
$B -b $N.blend -P ../bl/rig.py -- $N 2>&1 | grep -E "WEIGHTS"
[ -f ../spec_$N.json ] && $B -b $N.blend -P ../bl/detail.py -- $N ../spec_$N.json 2>&1 | grep -E "DETAIL|HAND|rror|Trace|line [0-9]"
for t in hi lo; do $B -b $N.blend -P ../bl/export.py -- ${N}_$t ${N}_$t.glb 2>&1 | grep -iE "rror" || true
  npx --prefix /workspace/tools/gp gltfpack -i ${N}_$t.glb -o ${N}_$t.c.glb -cc -kn 2>&1 | grep -v "^$" | tail -1 || true; done
ls -la ${N}_*.c.glb
