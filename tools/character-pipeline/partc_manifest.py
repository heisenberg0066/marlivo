# python partc_manifest.py : insert/update choco + sugar entries (before 'guest') without touching other characters
import json, sys
p = '/workspace/marlivo/apps/client/public/assets/characters/manifest.json'; m = json.load(open(p))
yaw = {n: json.load(open(f'/workspace/tools/hy_{n}_align.json'))['yaw'] for n in ('choco', 'sugar')}
E = {'choco': {'name': {'en': 'Choco bar', 'fr': 'Barre choco'}, 'model': 'choco.glb', 'placeholder': 'generic', 'pickable': True,
               'modelLow': 'choco-low.glb', 'height': 0.95, 'baseY': -0.32, 'motion': 'animal', 'glow': 0.2, 'rotationY': round(-yaw['choco'], 1)},
     'sugar': {'name': {'en': 'Sparkle cube', 'fr': 'Cube scintillant'}, 'model': 'sugar.glb', 'placeholder': 'generic', 'pickable': True,
               'modelLow': 'sugar-low.glb', 'height': 0.95, 'baseY': -0.32, 'motion': 'animal', 'glow': 0.2, 'rotationY': round(-yaw['sugar'], 1)}}
only = sys.argv[1:] or list(E)
c = m['characters']; new = {}
for k, v in c.items():
    if k == 'guest':
        for n in only: new[n] = E[n]
    if k not in only: new[k] = v
m['characters'] = new
open(p, 'w').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n'); print('MANIFEST', only)
