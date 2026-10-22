#!/bin/bash
# renders live4 vs live5 at front/3/4/side/back and builds the compare sheets
B=/workspace/tools/blender-4.2.3-linux-x64/blender; L=/workspace/tools/bl/look.py; O=/workspace/sb/seat/live5/cmp; mkdir -p $O
$B -b -P $L -- /workspace/tools/build_live4/ammar_hi.glb $O/a4.png 0.5 1.1 0,45,90,180 >/dev/null 2>&1
$B -b -P $L -- /workspace/tools/build_live5/ammar_hi.glb $O/a5.png 0.5 1.1 15,60,105,195 >/dev/null 2>&1
$B -b -P $L -- /workspace/tools/build_live4/orange_hi.glb $O/o4.png 0.5 1.1 0,45,90,180 >/dev/null 2>&1
$B -b -P $L -- /workspace/tools/build_live5/orange_hi.glb $O/o5.png 0.5 1.1 6,51,96,186 >/dev/null 2>&1
/workspace/tools/venv/bin/python /workspace/tools/compare5.py
echo CMP_DONE
