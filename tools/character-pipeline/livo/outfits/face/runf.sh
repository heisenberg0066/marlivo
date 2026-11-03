# runf.sh <o> : warp asm -> rebuild (bake/post/mirror/paint)
set -e; o=$1; cd /workspace/sb/hyf; cp /workspace/sb/hyo/$o/asm.blend $o/
[ -f envd_$o.sh ] && source envd_$o.sh
/workspace/tools/venv_hy/bin/python deform.py $o
/workspace/tools/blender-4.2.3-linux-x64/blender -b $o/asm.blend -P setverts.py -- ${o}_warp.npz $o/asm.blend 2>&1 | grep -c SET
rm -f $o/bk_*_nrmf_orig.png
bash rebuild_f.sh $o
echo RUNF_DONE $o
