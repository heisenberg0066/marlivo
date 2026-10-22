# python compare_partc.py <name> <render_prefix> <yaw> <out.png> : reference views (top) vs model renders (bottom) at front/sideL/sideR/back
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
n, pre, yaw, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
G = '/workspace/sb/gen7/cut'; f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 20)
views = [('front', 0), ('sideL', 90), ('sideR', -90), ('back', 180)]
def gen(p):
    im = Image.open(p).convert('RGBA'); a = np.asarray(im)[:, :, 3]; ys, xs = np.where(a > 20)
    c = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)); s = 440 / c.height; c = c.resize((max(1, int(c.width * s)), 440), Image.LANCZOS)
    bg = Image.new('RGBA', (500, 500), (31, 31, 31, 255)); bg.alpha_composite(c, ((500 - c.width) // 2, 30)); return bg.convert('RGB')
W = 4 * 500; o = Image.new('RGB', (W, 1040), (20, 20, 20)); d = ImageDraw.Draw(o)
for j, (v, a) in enumerate(views):
    o.paste(gen(f'{G}/{n}_{v}.png'), (j * 500, 30))
    o.paste(Image.open(f'{pre}_{int(round(a + yaw))}.png').convert('RGB').resize((500, 500)), (j * 500, 535))
    d.text((j * 500 + 10, 5), f'{n} {v}: reference (top) / model {int(a)} deg (bottom)', fill=(230, 230, 230), font=f)
o.save(out); print('CMP', out)
