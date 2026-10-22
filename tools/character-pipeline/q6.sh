# Part C: Choco bar + Sparkle cube views -> cut -> Hunyuan -> align, after the animal builds are finished
cd /workspace/tools
while ! grep -q "BUILT pepper" q5.log 2>/dev/null; do sleep 15; done
. venv/bin/activate; GDIR=/workspace/sb/gen7 python cut6.py choco sugar > cut7.log 2>&1
for n in choco sugar; do
  . venv/bin/activate; GEN=/workspace/sb/gen7/cut python prep6.py $n >> q6.log 2>&1
  . venv_hy/bin/activate
  GEN=/workspace/sb/gen7/cut python hy_mv.py $n /workspace/tools/hy_${n}384.obj hunyuan3d-dit-v2-mv-turbo 8 384 4000 > hy_${n}384.log 2>&1
  python hy_decode.py hy_${n}384.obj.latent.pt hy_${n}512.obj 512 4000 > hy_${n}512.log 2>&1
  . venv/bin/activate; GEN=/workspace/sb/gen7/cut python align_hy.py $n hy_${n}512.obj hy_${n}512_al.obj > align_${n}.log 2>&1
  echo HY_DONE $n >> q6.log
done
echo Q6_DONE >> q6.log
