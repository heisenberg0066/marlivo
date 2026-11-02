# Clean the texture of skin painted onto the coat (the hands of the front picture landing on the coat beside the
# real hands): texels of body (non-arm) triangles below the chin that are skin-coloured -> inpainted with the coat.
# python texfix.py dump.json tex.png out.webp [debug.png]
import sys, json, numpy as np, cv2
from PIL import Image
d = json.load(open(sys.argv[1])); uv = np.array(d['uv']).reshape(-1, 2); y = np.array(d['y']); aw = np.array(d['aw']); tri = np.array(d['tri']).reshape(-1, 3)
im = np.asarray(Image.open(sys.argv[2]).convert('RGB')); H, W = im.shape[:2]
body = (aw[tri].max(1) < 0.5) & (y[tri].max(1) < 0.50) & (y[tri].min(1) > 0.06)
mask = np.zeros((H, W), np.uint8)
pts = (uv[tri[body]] * [W, H]).astype(np.int32)
cv2.fillPoly(mask, list(pts), 1)
r, g, b = [im[..., k].astype(int) for k in range(3)]
lum = (r + g + b) / 3
skin = (r > 170) & (lum > 130) & (r - b > 40) & ((g - b) / np.maximum(r - b, 1) < 0.39) & (r - g < 70)
bad = (mask > 0) & skin
bad = cv2.dilate(bad.astype(np.uint8), np.ones((5, 5), np.uint8))
bad &= cv2.dilate(mask, np.ones((3, 3), np.uint8))
print('body texels', int(mask.sum()), 'skin texels fixed', int(bad.sum()))
bgr = cv2.cvtColor(im, cv2.COLOR_RGB2BGR)
out = cv2.cvtColor(cv2.inpaint(bgr, bad * 255, 9, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)
Image.fromarray(out).save(sys.argv[3], 'WEBP', quality=88)
if len(sys.argv) > 4:
    dbg = im.copy(); dbg[bad > 0] = [255, 0, 255]; Image.fromarray(dbg).resize((1024, 1024)).save(sys.argv[4])
