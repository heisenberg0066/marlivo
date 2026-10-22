from PIL import Image, ImageDraw, ImageFont
import numpy as np
O = '/workspace/sb/seat/live5/cmp'; G = '/workspace/sb/gen5/cut'
f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 26)
def gen(p):
    im = Image.open(p).convert('RGBA'); a = np.asarray(im)[:, :, 3]; ys, xs = np.where(a > 20)
    c = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)); s = 440 / c.height; c = c.resize((max(1, int(c.width * s)), 440), Image.LANCZOS)
    bg = Image.new('RGBA', (500, 500), (31, 31, 31, 255)); bg.alpha_composite(c, ((500 - c.width) // 2, 30)); return bg.convert('RGB')
for nm, key, a5 in (('ammar', 'a', [15, 60, 105, 195]), ('orange-guy', 'o', [6, 51, 96, 186])):
    g = 'ammar' if nm == 'ammar' else 'orange'
    rows = [('generated turnaround', [gen(f'{G}/{g}_{k}.png') for k in ['front', 'q34L', 'sideL', 'back']]),
            ('live4', [Image.open(f'{O}/{key}4_{a}.png').convert('RGB') for a in [0, 45, 90, 180]]),
            ('live5 (new)', [Image.open(f'{O}/{key}5_{a}.png').convert('RGB') for a in a5])]
    W = 4 * 500 + 40; out = Image.new('RGB', (W, 3 * 540 + 50), (20, 20, 20)); d = ImageDraw.Draw(out)
    for j, t in enumerate(['front', '3/4', 'side', 'back']): d.text((40 + j * 500 + 200, 10), t, fill=(230, 230, 230), font=f)
    for i, (lab, ims) in enumerate(rows):
        y = 50 + i * 540; d.text((10, y + 505), lab, fill=(255, 210, 120), font=f)
        for j, im in enumerate(ims): out.paste(im.resize((500, 500)), (40 + j * 500, y))
    out.save(f'/workspace/sb/seat/live5/compare-{nm}.png'); print(nm)
