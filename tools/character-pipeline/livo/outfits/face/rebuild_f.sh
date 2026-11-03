# rebuild_f.sh <o> : bake hi/lo from the warped hyf/<o>/asm.blend, post, face pass
set -e; o=$1; P=/workspace/marlivo/tools/character-pipeline/livo/outfits; F=/workspace/sb/hyf
cd $F/$o; cp $P/*.py .; cp $F/face.py .; B=/workspace/tools/blender-4.2.3-linux-x64/blender; PY=/workspace/tools/venv_hy/bin/python
source $P/env_$o.sh; source $P/envpost_$o.sh; export FZ0=0.80 FZ1=1.06 FACESCALE=2.2; [ -f $F/envf_$o.sh ] && source $F/envf_$o.sh
for spec in "hi ${NFHI:-60000} 2048" "lo ${NFLO:-14000} 1024"; do set -- $spec
  if [ $1 = lo ]; then export ARMSNPZ=arms_lo.npz; else unset ARMSNPZ; fi
  STAGE=prep $B -b asm.blend -P bake.py -- $1 $2 $3 2>&1 | grep -E "FACES|ARMS|rror|Trace" || true
  $PY uvatlas.py $1 $3
  $B -b asm.blend -P bake.py -- $1 $2 $3 2>&1 | grep -E "BAKED|rror|Trace" || true
  $PY post.py $1 | tail -3
  rm -f bk_$1_post.png; $PY face.py $1; cp bk_$1_final.png bk_$1_mir.png; $PY $F/paint2.py $1
done
