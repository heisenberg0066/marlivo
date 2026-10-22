# build each animal as soon as its Hunyuan mesh is aligned (yaw from the align json)
cd /workspace/tools
for n in biscuit mint pepper; do
  while ! grep -q "Q4_DONE" q4.log; do sleep 10; done
  y=$(python3 -c "import json;print(json.load(open('hy_${n}_align.json'))['yaw'])")
  python3 -c "
import json;s=json.load(open('settings_${n}_hy1.json'));s['front']['yaw']=$y;s['mv']['yaw0']=$y;json.dump(s,open('settings_${n}_hy1.json','w'))"
  # wait for the next Hunyuan sampling to pass its peak before starting Blender? no: run build only when no sampling is active
  while pgrep -f "hy_mv.py" >/dev/null; do sleep 10; done
  ./build_hy.sh $n /workspace/tools/hy_${n}512_al.obj settings_${n}_hy1.json - /workspace/tools/hyb_$n > hyb_$n.log 2>&1
  echo BUILT $n >> q5.log
done
