import sys
from PIL import Image
import numpy as np
src, out, zlo, zhi = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
im = Image.open(src).convert('RGBA'); a = np.array(im)[..., 3] > 10
ys, xs = np.where(a); y0, y1 = ys.min(), ys.max(); H = y1 - y0
top = int(y1 - H * zhi); bot = int(y1 - H * zlo)
band = a[top:bot]; bx = np.where(band.any(0))[0]; x0, x1 = bx.min(), bx.max()
# fit into 120x140 box (6:7), figure centred horizontally, bottom aligned
w = x1 - x0; h = bot - top; W = max(w * 1.04, h * 1.02 * 6 / 7); Hh = W * 7 / 6
cx = (x0 + x1) / 2
box = (int(cx - W / 2), int(bot - Hh), int(cx + W / 2), int(bot))
crop = Image.new('RGBA', (box[2] - box[0], box[3] - box[1]))
crop.paste(im.crop(box), (0, 0))
from PIL import ImageEnhance
if len(sys.argv) > 5:
    sat = float(sys.argv[5]); rgb = ImageEnhance.Color(crop.convert('RGB')).enhance(sat); rgb = ImageEnhance.Contrast(rgb).enhance(1.05); rgb.putalpha(crop.split()[3]); crop = rgb
crop.resize((360, 420), Image.LANCZOS).save(out, 'WEBP', quality=90)
print(out, crop.size)
