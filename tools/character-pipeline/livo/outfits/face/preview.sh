# preview.sh <o> <name> [cz size angles] : export+rig hi only (NOINSTALL) and render a face close-up to /tmp/of/pv/<name>_all.png
o=$1; nm=$2; cz=${3:-0.905}; sz=${4:-0.13}; an=${5:-0,25}
cd /workspace/marlivo; S=/workspace/sb/hyf/$o D=/workspace/tools/hyf_livo_$o NOINSTALL=1 RIGCFG=$(/workspace/tools/venv_hy/bin/python /workspace/sb/hyf/rigcfg.py $o) bash tools/character-pipeline/livo/outfits/install_outfit.sh $o >/dev/null 2>&1
mkdir -p /tmp/of/pv; bash /tmp/look.sh /workspace/tools/hyf_livo_$o/livo_hi_rig.glb /tmp/of/pv/$nm $cz $sz $an
