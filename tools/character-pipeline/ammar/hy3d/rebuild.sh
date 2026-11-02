# full HY3D Ammar rebuild after asm.blend changes: decimate+UV+bake hi/lo, post, skin lift (env from env.sh)
set -e
cd /workspace/sb/hya; B=/workspace/tools/blender-4.2.3-linux-x64/blender; PY=/workspace/tools/venv_hy/bin/python
source ./env.sh
for spec in "hi 60000 2048" "lo 14000 1024"; do set -- $spec
  if [ $1 = lo ]; then export ARMSNPZ=/workspace/sb/hya/arms_lo.npz; else unset ARMSNPZ; fi
  STAGE=prep $B -b asm.blend -P bake.py -- $1 $2 $3 2>&1 | grep -E "FACES|ARMS|rror|Trace" || true
  $PY uvatlas.py $1 $3
  $B -b asm.blend -P bake.py -- $1 $2 $3 2>&1 | grep -E "BAKED|rror|Trace" || true
  $PY post.py $1 | tail -1
  $PY skinlift.py $1
done
