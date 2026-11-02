# install_hy.sh : HY3D Livo -> rig (rig_livo.mjs, ARMATTR arm mask) -> webp base colour -> gltfpack -> client assets
set -e
D=/workspace/tools/hyb_hy31; A=/workspace/marlivo/apps/client/public/assets/characters; S=/workspace/sb/hy31
B=/workspace/tools/blender-4.2.3-linux-x64/blender; PY=/workspace/tools/venv_hy/bin/python
mkdir -p $D
for t in hi lo; do
  N=$S/bk_${t}_nrmf.png; [ "$t" = lo ] && N=-
  ARMATTR=1 IMGFMT=WEBP IMGQ=90 $B -b $S/bk_$t.blend -P $S/export_tex.py -- $S/bk_${t}_final.png $N $D/beanie_$t.glb skin 2>&1 | grep -iE "^error|Trace" || true
  cp $S/bk_${t}_final.png $D/beanie_$t.png
  $PY -c "from PIL import Image; Image.open('$D/beanie_$t.png').convert('RGB').save('$D/tex_$t.webp','WEBP',quality=$([ "$t" = lo ] && echo ${WQL:-78} || echo ${WQ:-90}))"
done
cd /workspace/animwork/gt && cp /workspace/marlivo/tools/character-pipeline/rig_livo.mjs .
ARMATTR=1 RIGOUT=$D/rig_hi.json TEXIN=$D/tex_hi.webp node rig_livo.mjs $D/beanie_hi.glb $D/beanie_hi.png $D/beanie_hi_rig.glb | cut -c1-600
ARMATTR=1 RIGFROM=$D/rig_hi.json TEXIN=$D/tex_lo.webp node rig_livo.mjs $D/beanie_lo.glb $D/beanie_lo.png $D/beanie_lo_rig.glb | cut -c1-300
for t in hi lo; do npx --prefix /workspace/tools/gp gltfpack -i $D/beanie_${t}_rig.glb -o $D/beanie_${t}_rig.c.glb -cc -kn 2>&1 | tail -n 1; done
cp $D/beanie_hi_rig.c.glb $A/livo.glb; cp $D/beanie_lo_rig.c.glb $A/livo-low.glb
ls -la $A/livo*.glb
