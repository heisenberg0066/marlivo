# fl.sh <outfit> : flatten2 + assemble (no arms) + ortho renders for inspection; env from env_<outfit>.sh
set -e; o=$1; P=/workspace/marlivo/tools/character-pipeline/livo/outfits; W=/workspace/sb/hyo/$o
cd $W; cp $P/*.py .; source $P/env_$o.sh
/workspace/tools/venv_hy/bin/python flatten2.py | head -2
rm -f arms.npz; [ -n "$WITHARMS" ] && /workspace/tools/venv_hy/bin/python arms_outfit.py
/workspace/tools/blender-4.2.3-linux-x64/blender -b work.blend -P assemble.py 2>&1 | grep -E "HOLES|POKE|rror"
/workspace/tools/blender-4.2.3-linux-x64/blender -b asm.blend -P orthorender.py -- /tmp/of/as_$o 0.42 0.92 BODY,W,PATCH,ARMS >/dev/null 2>&1
python3 gridify.py /tmp/of/as_$o 0.42 0.92
