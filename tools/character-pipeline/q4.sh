# Hunyuan3D-2mv for the animals, one at a time (sampling needs ~11.5 GB: nothing else heavy may run)
cd /workspace/tools
while pgrep -f cut6.py >/dev/null; do sleep 5; done
for n in biscuit mint pepper; do
  . venv/bin/activate; python prep6.py $n >> q4.log 2>&1
  . venv_hy/bin/activate
  GEN=/workspace/sb/gen6/cut python hy_mv.py $n /workspace/tools/hy_${n}384.obj hunyuan3d-dit-v2-mv-turbo 8 384 4000 > hy_${n}384.log 2>&1
  python hy_decode.py hy_${n}384.obj.latent.pt hy_${n}512.obj 512 4000 > hy_${n}512.log 2>&1
  . venv/bin/activate; GEN=/workspace/sb/gen6/cut python align_hy.py $n hy_${n}512.obj hy_${n}512_al.obj > align_${n}.log 2>&1
  echo HY_DONE $n >> q4.log
done
echo Q4_DONE >> q4.log
