# pocketfix.py rig.glb tex.png out.png y0 y1 : the HY3D texture paints skin where the hands were tucked into the
# pockets; with the hands now out on the table those patches show. Repaints skin-coloured texels of the body triangles
# between heights y0..y1 with the median colour of the non-skin texels of the same triangles (pants/coat cloth).
import sys, numpy as np, trimesh
from PIL import Image, ImageDraw
g, tp, op, y0, y1 = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), float(sys.argv[5])
m = trimesh.load(g, force='mesh', process=False); V = m.vertices; F = m.faces; UV = m.visual.uv
im = np.array(Image.open(tp).convert('RGB')).astype(np.int32); H, W = im.shape[:2]
cy = V[F][:, :, 1].mean(1); sel = F[(cy > y0) & (cy < y1)]
mask = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(mask)
for f in sel: dr.polygon([(UV[v, 0] * W, (1 - UV[v, 1]) * H) for v in f], fill=255)
mk = np.array(mask) > 0
r, gg, b = im[..., 0], im[..., 1], im[..., 2]; lum = 0.299 * r + 0.587 * gg + 0.114 * b
skin = mk & (r - b > 45) & (r > gg) & (lum > 75)
cloth = mk & ~skin
fill = np.median(im[cloth], 0).astype(np.int32)
out = im.copy(); out[skin] = fill
# soften the patch edges a little
print('repainted', int(skin.sum()), 'texels with', fill.tolist())
Image.fromarray(out.astype(np.uint8)).save(op)
