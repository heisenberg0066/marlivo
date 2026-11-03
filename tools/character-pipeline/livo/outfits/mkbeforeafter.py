# livo_face_before_after.jpg: per outfit (Livo 1-4) reference face | BEFORE model + in-game | AFTER model + in-game
# usage: python mkbeforeafter.py <out.jpg> <ingame_before_dir> <ingame_after_dir> [after_prefix]
import sys
from PIL import Image, ImageDraw, ImageFont
out, gb, ga = sys.argv[1], sys.argv[2], sys.argv[3]; ap = sys.argv[4] if len(sys.argv) > 4 else 'laptop'
R = '/workspace/marlivo_figure/outfits/'; FB = '/workspace/marlivo_figure/out/faceBefore/'; FA = '/workspace/marlivo_figure/out/faceAfter/'
O = [('streetwear', '02_streetwear.jpg', (427, 175)), ('sporty', '05_sporty.jpg', (416, 150)), ('denim', '07_denim.jpg', (432, 166)), ('stockholm', '17_stockholm_city.jpg', (413, 175))]
T = 300; LW = 150; HH = 40
try: F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22); f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
except Exception: F = f2 = ImageFont.load_default()
cols = ['reference', 'BEFORE model', 'BEFORE in game', 'AFTER model', 'AFTER in game']
S = Image.new('RGB', (LW + T * 5, HH + T * 4), (34, 30, 28)); d = ImageDraw.Draw(S)
for j, c in enumerate(cols): d.text((LW + j * T + 10, 10), c, fill=(255, 220, 150) if 'AFTER' in c else (230, 230, 230), font=f2)
box = (1030, 130, 1250, 350)   # right-hand seat head in the 1280x720 4p laptop view
for i, (o, ref, (cx, cy)) in enumerate(O):
    y = HH + i * T
    d.text((14, y + T // 2 - 24), f'Livo {i + 1}', fill=(255, 255, 255), font=F); d.text((14, y + T // 2 + 6), o, fill=(190, 190, 190), font=f2)
    r = Image.open(R + ref).convert('RGB').crop((cx - 115, cy - 115, cx + 115, cy + 115)).resize((T, T), Image.LANCZOS)
    def game(p):
        im = Image.open(p).convert('RGB')
        if im.width != 1280: im = im.resize((1280, 720), Image.LANCZOS)
        return im.crop(box).resize((T, T), Image.LANCZOS)
    ims = [r, Image.open(FB + f'm_{o}_0.png').convert('RGB').resize((T, T), Image.LANCZOS), game(f'{gb}/laptop-{o}-high-4p.jpg'),
           Image.open(FA + f'm_{o}_0.png').convert('RGB').resize((T, T), Image.LANCZOS), game(f'{ga}/{ap}-{o}-high-4p.jpg')]
    for j, im in enumerate(ims): S.paste(im, (LW + j * T, y))
S.save(out, quality=90); print(out, S.size)
