#!/bin/bash
# ears_run.sh <dir> <ears.json> : restore pre-ears state, run ears.py, export, meshopt, previews
D=$1; E=$2; B=/workspace/tools/blender-4.2.3-linux-x64/blender; T=/workspace/tools
cd $D; cp pre/ammar.blend pre/*.png .
$B -b ammar.blend -P $T/bl/ears.py -- ammar $E 2>&1 | grep -E "EARS|rror|Trace|line [0-9]"
for t in hi lo; do $B -b ammar.blend -P $T/bl/export.py -- ammar_$t $D/ammar_$t.glb 2>&1 | grep -iE "rror" || true
  npx --prefix $T/gp gltfpack -i ammar_$t.glb -o ammar_$t.c.glb -cc -kn 2>&1 | grep -v "^$" | tail -1 || true; done
cd $T; ELEV=12 $B -b -P bl/look.py -- $D/ammar_hi.glb /tmp/ears/$3.png 0.84 0.42 -80,-55,0,55,80,150 >/dev/null 2>&1; ELEV=30 $B -b -P bl/look.py -- $D/ammar_hi.glb /tmp/ears/s$3.png 0.72 0.6 -60,0,60,180 >/dev/null 2>&1
echo R_OK
