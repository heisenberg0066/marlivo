# rebuild.sh <outfit> : decimate+UV+bake hi/lo from asm.blend, post (cloth/skin/stripes). env from env_<outfit>.sh
set -e; o=$1; P=/workspace/marlivo/tools/character-pipeline/livo/outfits
cd /workspace/sb/hyo/$o; cp $P/*.py .; B=/workspace/tools/blender-4.2.3-linux-x64/blender; PY=/workspace/tools/venv_hy/bin/python
source $P/env_$o.sh; source $P/envpost_$o.sh
NRING=18 NSEG=14 NU=14 NV=10 ARMOUT=arms_lo.npz $PY arms_outfit.py | cut -c1-40
for spec in "hi ${NFHI:-60000} 2048" "lo ${NFLO:-14000} 1024"; do set -- $spec
  if [ $1 = lo ]; then export ARMSNPZ=arms_lo.npz; else unset ARMSNPZ; fi
  STAGE=prep $B -b asm.blend -P bake.py -- $1 $2 $3 2>&1 | grep -E "FACES|ARMS|rror|Trace" || true
  $PY uvatlas.py $1 $3
  $B -b asm.blend -P bake.py -- $1 $2 $3 2>&1 | grep -E "BAKED|rror|Trace" || true
  $PY post.py $1 | tail -3
done
