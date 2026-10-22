#!/bin/bash
# build_hy.sh <name> <src.obj> <settings.json> <spec.json|-> <outdir> [hi] [lo]
# Full build on a (Hunyuan) base mesh: LODs + projection + normal map, rig, accessories, GLBs, meshopt copies, previews.
set -e
N=$1; SRC=$2; SET=$3; SPEC=$4; [ "$SPEC" = "-" ] && [ -f /workspace/tools/spec_${N}_hy.json ] && SPEC=/workspace/tools/spec_${N}_hy.json; OUT=$5; HI=${6:-50000}; LO=${7:-12000}
B=/workspace/tools/blender-4.2.3-linux-x64/blender; T=/workspace/tools
mkdir -p $OUT; cd $T
$B -b -P bl/build.py -- $N $SRC in/${N}_proj.png vc 1 0 0 $HI $LO $OUT "$(cat $SET)" 2>&1 | grep -E "PARTS|SRC|PROTECT|SKINSMOOTH|LOD|FRONT|FLAT|MV|A faces|NORMAL|SKIN_EVEN|rror|Trace|line [0-9]"
cd $OUT
$B -b $N.blend -P $T/bl/rig.py -- $N 2>&1 | grep -E "WEIGHTS|rror"
[ "$SPEC" != "-" ] && $B -b $N.blend -P $T/bl/detail.py -- $N $SPEC 2>&1 | grep -E "DETAIL|HAND|rror|Trace|line [0-9]"
[ -n "$EARS" ] && $B -b $N.blend -P $T/bl/ears.py -- $N $EARS 2>&1 | grep -E "EARS|rror|Trace|line [0-9]"
for t in hi lo; do $B -b $N.blend -P $T/bl/export.py -- ${N}_$t $OUT/${N}_$t.glb 2>&1 | grep -iE "rror" || true
  npx --prefix $T/gp gltfpack -i ${N}_$t.glb -o ${N}_$t.c.glb -cc -kn 2>&1 | grep -v "^$" | tail -1 || true; done
ls -la ${N}_*.glb
echo BUILD_DONE
