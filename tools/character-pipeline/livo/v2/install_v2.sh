# install.sh <builddir> : rig hi/lo (same joints), clean skin-on-coat texels, meshopt-compress, copy into the client assets
set -e
D=$1; A=/workspace/marlivo/apps/client/public/assets/characters; PY=/workspace/tools/venv_hy/bin/python
cd /workspace/animwork/gt && cp /workspace/marlivo/tools/character-pipeline/rig_livo.mjs .
RIGOUT=$D/rig_hi.json DUMP=$D/dump_hi.json node rig_livo.mjs $D/beanie_hi.glb $D/beanie_hi.png $D/beanie_hi_rig.glb > /dev/null
RIGFROM=$D/rig_hi.json DUMP=$D/dump_lo.json node rig_livo.mjs $D/beanie_lo.glb $D/beanie_lo.png $D/beanie_lo_rig.glb > /dev/null
for t in hi lo; do $PY /workspace/sb/gen8/texfix.py $D/dump_$t.json $D/beanie_$t.png $D/tex_$t.webp; done
RIGFROM=$D/rig_hi.json TEXIN=$D/tex_hi.webp node rig_livo.mjs $D/beanie_hi.glb $D/beanie_hi.png $D/beanie_hi_rig.glb | cut -c1-300
RIGFROM=$D/rig_hi.json TEXIN=$D/tex_lo.webp node rig_livo.mjs $D/beanie_lo.glb $D/beanie_lo.png $D/beanie_lo_rig.glb | cut -c1-300
for t in hi lo; do npx --prefix /workspace/tools/gp gltfpack -i $D/beanie_${t}_rig.glb -o $D/beanie_${t}_rig.c.glb -cc -kn 2>&1 | tail -n 1; done
cp $D/beanie_hi_rig.c.glb $A/livo.glb; cp $D/beanie_lo_rig.c.glb $A/livo-low.glb
ls -la $A/livo*.glb
