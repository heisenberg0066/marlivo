# python cut6.py <name>... : gen6/<name>_<view>.jpg -> ESRGAN x4 (2048 tall) -> rembg cut -> gen6/cut/<name>_<view>.png (+ _fill/_edge via fills.py)
import sys, os, subprocess, numpy as np
from PIL import Image
from rembg import remove, new_session
S = new_session('isnet-general-use'); G = '/workspace/sb/gen6'
for n in sys.argv[1:]:
    for v in ['sideL', 'sideR', 'back', 'front']:
        src = f'{G}/{n}_{v}.jpg'; up = f'{G}/cut/{n}_{v}_x4.png'; dst = f'{G}/cut/{n}_{v}.png'
        if not os.path.exists(up):
            if v == 'front': subprocess.run(['python', 'upscale.py', src, up, '4096'], check=True)  # sharp 4k front for the projection
            else: im0 = Image.open(src).convert('RGB'); im0.resize((im0.width * 2, im0.height * 2), Image.LANCZOS).save(up)
        im = Image.open(up).convert('RGB')
        c = remove(im, session=S); a = np.array(c); al = a[..., 3]
        a[..., 3] = np.where(al > 128, 255, np.where(al > 40, al, 0)).astype(np.uint8)
        Image.fromarray(a).save(dst); print(dst, c.size, flush=True)
        subprocess.run(['python', 'fills.py', dst], check=True)
