# single sequential queue (no two heavy jobs at once): builds as soon as meshes exist
cd /workspace/tools
while ! grep -q "HY_DONE mint" q4.log; do sleep 5; done
pkill -f q4.sh; pkill -f q5.sh; pkill -f q6.sh; sleep 1
hy() { n=$1; G=$2
  . venv/bin/activate; GEN=$G python prep6.py $n >> qq.log 2>&1
  . venv_hy/bin/activate
  GEN=$G python hy_mv.py $n /workspace/tools/hy_${n}384.obj hunyuan3d-dit-v2-mv-turbo 8 384 4000 > hy_${n}384.log 2>&1
  python hy_decode.py hy_${n}384.obj.latent.pt hy_${n}512.obj 512 4000 > hy_${n}512.log 2>&1
  . venv/bin/activate; GEN=$G python align_hy.py $n hy_${n}512.obj hy_${n}512_al.obj > align_${n}.log 2>&1
  echo HY_DONE $n >> qq.log; }
build() { n=$1
  y=$(python3 -c "import json;print(json.load(open('hy_${n}_align.json'))['yaw'])")
  python3 -c "
import json;s=json.load(open('settings_${n}_hy1.json'));s['front']['yaw']=$y;s['mv']['yaw0']=$y;json.dump(s,open('settings_${n}_hy1.json','w'))"
  ./build_hy.sh $n /workspace/tools/hy_${n}512_al.obj settings_${n}_hy1.json ${SPEC:--} /workspace/tools/hyb_$n > hyb_$n.log 2>&1
  echo BUILT $n >> qq.log; }
. venv/bin/activate; rm -f /workspace/sb/gen6/cut/biscuit_sideR_x4.png; python - <<'P'
import subprocess, numpy as np
from PIL import Image
from rembg import remove, new_session
G='/workspace/sb/gen6'; im0=Image.open(G+'/biscuit_sideR.jpg').convert('RGB'); im=im0.resize((im0.width*2,im0.height*2),Image.LANCZOS); im.save(G+'/cut/biscuit_sideR_x4.png')
a=np.array(remove(im,session=new_session('isnet-general-use'))); al=a[...,3]; a[...,3]=np.where(al>128,255,np.where(al>40,al,0)).astype(np.uint8)
Image.fromarray(a).save(G+'/cut/biscuit_sideR.png'); subprocess.run(['python','fills.py',G+'/cut/biscuit_sideR.png'])
P
echo RECUT biscuit_sideR >> qq.log
build biscuit
build mint
hy pepper /workspace/sb/gen6/cut
build pepper
GDIR=/workspace/sb/gen7 python cut6.py choco sugar > cut7.log 2>&1
hy choco /workspace/sb/gen7/cut
hy sugar /workspace/sb/gen7/cut
echo QQ_HY_DONE >> qq.log
