# Full re-prep after a wipe: side views -> fills -> align (vc) -> npy caches -> face mask -> facefix2 -> face2.obj
set -e
mkdir -p /tmp/lab /tmp/lk
cd /workspace/sb/gen8; PY=/workspace/tools/venv_hy/bin/python
$PY hairify.py
cd /workspace/tools; $PY fills.py /workspace/sb/gen8/cut/beanie_sideL.png /workspace/sb/gen8/cut/beanie_sideR.png
GEN=/workspace/sb/gen8/cut $PY align_hy.py beanie hy_beanie512.obj hy_beanie512_al.obj > align_beanie.log 2>&1; tail -n 2 align_beanie.log
cd /workspace/sb/gen8
$PY -c "
import objio, numpy as np
V,F=objio.load('/workspace/tools/hy_beanie512_al.obj'); np.save('/tmp/bV.npy',V); np.save('/tmp/bF.npy',F)
P=V[:,:3]; fn=np.cross(P[F[:,1]]-P[F[:,0]],P[F[:,2]]-P[F[:,0]]); N=np.zeros_like(P)
for k in range(3): np.add.at(N,F[:,k],fn)
N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-12; np.save('/tmp/bN.npy',N); print('npy ok')"
$PY frontproj.py -7.2
$PY facemask.py
$PY facefix2.py /workspace/tools/hy_beanie512_face2.obj
echo PREP_DONE
