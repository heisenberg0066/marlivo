# v2 geometry + position maps + side fits.  usage: v2geo.sh '<geo json>'
set -e; cd /workspace/sb/gen9; B=/workspace/tools/blender-4.2.3-linux-x64/blender; PY=/workspace/tools/venv_hy/bin/python; D=/workspace/tools/hyb_beanie13
for t in hi lo; do $B -b -P geo2.py -- /workspace/tools/hyb_beanie12/beanie_$t.glb $D/geo_$t.glb "$1" 2>&1 | grep -E "GEO|Error"; $B -b -P exp.py -- $D/geo_$t.glb g_$t.npz 2>&1 | grep EXP; done
python3 raster.py g_hi.npz 4096 pmg_hi.npz; python3 raster.py g_lo.npz 1024 pmg_lo.npz
$PY sidefit.py L; $PY sidefit.py R
