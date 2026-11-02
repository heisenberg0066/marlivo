# full HY3D Livo rebuild after asm.blend changes: decimate+UV+bake hi/lo, post, install
set -e
cd /workspace/sb/hy31; B=/workspace/tools/blender-4.2.3-linux-x64/blender; PY=/workspace/tools/venv_hy/bin/python
for spec in "hi 50000 2048" "lo 12000 1024"; do set -- $spec
  STAGE=prep $B -b asm.blend -P bake.py -- $1 $2 $3 2>&1 | grep -E "FACES|rror|Trace" || true
  $PY uvatlas.py $1 $3
  $B -b asm.blend -P bake.py -- $1 $2 $3 2>&1 | grep -E "BAKED|rror|Trace" || true
  $PY post.py $1 | tail -1
done
bash install_hy.sh 2>&1 | tail -2
