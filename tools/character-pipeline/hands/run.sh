# run.sh <name> <origrig-prefix> : mkarm + rearm hi/lo into /workspace/sb/hands/build (TEXFIX=1: <name>_tex_<lod>.png -> webp base colour)
set -e
N=$1; O=$2; H=/workspace/marlivo/tools/character-pipeline/hands; B=/workspace/sb/hands/build; PY=/workspace/tools/venv_hy/bin/python
cd $B && $PY $H/mkarm.py $H/cfg_$N.json $N | grep -v "^$"
cp $H/rearm.mjs /workspace/animwork/gt/ && cd /workspace/animwork/gt
for t in hi lo; do
  T=""; if [ -n "$TEXFIX" ]; then $PY -c "from PIL import Image; Image.open('$B/${N}_tex_$t.png').convert('RGB').save('$B/${N}_tex_$t.webp','WEBP',quality=$([ $t = lo ] && echo 78 || echo 90))"; T=$B/${N}_tex_$t.webp; fi
  TEXIN=$T node rearm.mjs ${ORIG:-/workspace/sb/hands/orig}/${O}_${t}_rig.glb $B/${N}_$t.json $B/${N}_chain.json $H/cfg_$N.json $B/${N}_${t}_rig.glb
done
