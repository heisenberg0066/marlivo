#!/bin/bash
# run_build.sh <name> <back: vc|blur> [extra-json]
set -e
cd /workspace/tools
B=/workspace/tools/blender-4.2.3-linux-x64/blender
read SC TX TY < <(python3 -c "import json;v=json.load(open('fit.json'))['$1'];print(*v)")
BACK=$2; [ "$BACK" = blur ] && BACK=/workspace/tools/in/$1_projblur.png
$B -b -P bl/build.py -- $1 /workspace/tools/carve_$1.obj /workspace/tools/in/$1_proj.png $BACK $SC $TX $TY ${HI:-50000} ${LO:-12000} /workspace/tools/build "${3:-{\}}" 2>&1 | grep -E "PARTS|SRC|LOD|FACE|SMOOTH|HAIR|FLAT|NORMAL|MV|rror|Trace"
cd build
for t in hi lo; do $B -b $1.blend -P ../bl/export.py -- $1_$t $1_$t.glb 2>&1 | grep -iE "rror" || true; done
ls -la $1_*.glb
$B -b -P ../bl/view.py -- $1_hi.glb /tmp/lab/v_$1 0 front,q34,back >/dev/null 2>&1
python3 -c "
from PIL import Image
ims=[Image.open(f'/tmp/lab/v_$1_{v}.png') for v in ['front','q34','back']]
k=Image.new('RGB',(1800,700)); [k.paste(i,(600*j,0)) for j,i in enumerate(ims)]; k.save('/tmp/lab/v_$1.png')"
