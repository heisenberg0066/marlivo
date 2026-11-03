# install_outfit.sh <outfit> : baked hi/lo -> export (ARMATTR) -> rig_livo.mjs (adult RIGCFG) -> webp -> gltfpack -> client assets livo_<o>.glb / livo_<o>-low.glb
set -e; o=$1
D=/workspace/tools/hyb_livo_$o; A=/workspace/marlivo/apps/client/public/assets/characters; S=/workspace/sb/hyo/$o
B=/workspace/tools/blender-4.2.3-linux-x64/blender; PY=/workspace/tools/venv_hy/bin/python
export RIGCFG=${RIGCFG:-'{"hip":0.50,"neck":0.845,"neckBand":0.03,"hairFade":0.05,"knee":0.27,"ankle":0.05,"shoulder":0.795,"shLat":0.14,"slice0":0.55,"slice1":0.75,"cutY":0.0,"torsoY":[0.55,0.72],"headY":[0.87,0.99]}'}
mkdir -p $D
for t in hi lo; do
  N=$S/bk_${t}_nrmf.png; [ "$t" = lo ] && N=-
  ARMATTR=1 IMGFMT=WEBP IMGQ=90 $B -b $S/bk_$t.blend -P $S/export_tex.py -- $S/bk_${t}_final.png $N $D/livo_$t.glb skin 2>&1 | grep -iE "^error|Trace" || true
  cp $S/bk_${t}_final.png $D/livo_$t.png
  $PY -c "from PIL import Image; Image.open('$D/livo_$t.png').convert('RGB').save('$D/tex_$t.webp','WEBP',quality=$([ "$t" = lo ] && echo ${WQL:-78} || echo ${WQ:-90}))"
done
cd /workspace/animwork/gt && cp /workspace/marlivo/tools/character-pipeline/rig_livo.mjs .
ARMATTR=1 RIGOUT=$D/rig_hi.json TEXIN=$D/tex_hi.webp node rig_livo.mjs $D/livo_hi.glb $D/livo_hi.png $D/livo_hi_rig.glb | cut -c1-700
ARMATTR=1 RIGFROM=$D/rig_hi.json TEXIN=$D/tex_lo.webp node rig_livo.mjs $D/livo_lo.glb $D/livo_lo.png $D/livo_lo_rig.glb | cut -c1-300
for t in hi lo; do npx --prefix /workspace/tools/gp gltfpack -i $D/livo_${t}_rig.glb -o $D/livo_${t}_rig.c.glb -cc -kn 2>&1 | tail -n 1; done
[ -n "$NOINSTALL" ] && exit 0
cp $D/livo_hi_rig.c.glb $A/livo_$o.glb; cp $D/livo_lo_rig.c.glb $A/livo_$o-low.glb
ls -la $A/livo_$o*.glb
