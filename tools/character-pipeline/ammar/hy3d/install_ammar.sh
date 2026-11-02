# install_ammar.sh : HY3D Ammar -> rig (rig_livo.mjs, ARMATTR arm mask, Ammar RIGCFG) -> webp base colour -> gltfpack -> client assets
set -e
D=/workspace/tools/hyb_ammar; A=/workspace/marlivo/apps/client/public/assets/characters; S=/workspace/sb/hya
B=/workspace/tools/blender-4.2.3-linux-x64/blender; PY=/workspace/tools/venv_hy/bin/python
export RIGCFG='{"hip":0.40,"neck":0.705,"neckBand":0.03,"hairFade":0.001,"knee":0.19,"ankle":0.06,"shoulder":0.655,"shLat":0.14,"slice0":0.47,"slice1":0.63,"cutY":0.0,"torsoY":[0.30,0.42],"headY":[0.72,0.92]}'
mkdir -p $D
for t in hi lo; do
  N=$S/bk_${t}_nrmf.png; [ "$t" = lo ] && N=-
  ARMATTR=1 IMGFMT=WEBP IMGQ=90 $B -b $S/bk_$t.blend -P $S/export_tex.py -- $S/bk_${t}_final.png $N $D/ammar_$t.glb skin 2>&1 | grep -iE "^error|Trace" || true
  cp $S/bk_${t}_final.png $D/ammar_$t.png
  $PY -c "from PIL import Image; Image.open('$D/ammar_$t.png').convert('RGB').save('$D/tex_$t.webp','WEBP',quality=$([ "$t" = lo ] && echo ${WQL:-78} || echo ${WQ:-90}))"
done
cd /workspace/animwork/gt && cp /workspace/marlivo/tools/character-pipeline/rig_livo.mjs .
ARMATTR=1 RIGOUT=$D/rig_hi.json TEXIN=$D/tex_hi.webp node rig_livo.mjs $D/ammar_hi.glb $D/ammar_hi.png $D/ammar_hi_rig.glb | cut -c1-700
ARMATTR=1 RIGFROM=$D/rig_hi.json TEXIN=$D/tex_lo.webp node rig_livo.mjs $D/ammar_lo.glb $D/ammar_lo.png $D/ammar_lo_rig.glb | cut -c1-300
for t in hi lo; do npx --prefix /workspace/tools/gp gltfpack -i $D/ammar_${t}_rig.glb -o $D/ammar_${t}_rig.c.glb -cc -kn 2>&1 | tail -n 1; done
[ -n "$NOINSTALL" ] && exit 0
cp $D/ammar_hi_rig.c.glb $A/ammar.glb; cp $D/ammar_lo_rig.c.glb $A/ammar-low.glb
ls -la $A/ammar*.glb
