# Step 1: cut the reference out and make the TripoSR input + the projection texture.
#   python prep.py orange /path/ref_orange.jpg            (dark gap between the legs is removed from the mask)
#   python prep.py ammar  /path/ref_ammar_avatar.png --crop-bottom 0.955 --esrgan RealESRGAN_x4plus.pth
# Writes in/<name>_prep.png (TripoSR input, grey bg), in/<name>_mask.png, in/<name>_proj.png (edge-filled colours),
# in/<name>_projblur.png (for backs), and bbox.json (subject box in the projection image).
import sys, json, argparse, os, numpy as np
sys.path.insert(0, os.environ.get('TRIPOSR', '/workspace/tools/TripoSR'))
from tsr.utils import resize_foreground
from PIL import Image, ImageFilter
from scipy import ndimage
from rembg import remove, new_session
ap = argparse.ArgumentParser(); ap.add_argument('name'); ap.add_argument('ref'); ap.add_argument('--crop-bottom', type=float, default=1.0)
ap.add_argument('--esrgan'); ap.add_argument('--dark-gap', action='store_true'); a = ap.parse_args()
os.makedirs('in', exist_ok=True)
ref = Image.open(a.ref).convert('RGB'); w, h = ref.size; ref = ref.crop((0, 0, w, int(h * a.crop_bottom)))
up = 3 if max(ref.size) < 800 else 1
big = ref.resize((ref.width * up, ref.height * up), Image.LANCZOS)
cut = remove(big, session=new_session('isnet-general-use'))
arr = np.array(resize_foreground(cut, 0.85)).astype(np.float32); m = arr[..., 3] > 128
if a.dark_gap:  # Orange guy: the black background seen between the legs is not body
    rows = np.arange(m.shape[0])[:, None]; dark = (arr[..., :3].mean(-1) < 45) & (rows > 0.55 * m.shape[0])
    m &= ~ndimage.binary_dilation(dark, iterations=2); m = ndimage.binary_opening(m, iterations=1)
al = m[..., None].astype(np.float32)
Image.fromarray(((arr[..., :3] / 255 * al + (1 - al) * 0.5) * 255).astype(np.uint8)).save(f'in/{a.name}_prep.png')
Image.fromarray(m.astype(np.uint8) * 255).save(f'in/{a.name}_mask.png')
col = arr
if a.esrgan:  # sharper projection texture from a 4x Real-ESRGAN upscale of the reference
    import torch; from spandrel import ModelLoader
    net = ModelLoader().load_from_file(a.esrgan).model.eval()
    with torch.no_grad(): y = net(torch.from_numpy(np.array(ref)).permute(2, 0, 1)[None].float() / 255)
    x4 = Image.fromarray((y[0].permute(1, 2, 0).clamp(0, 1).numpy() * 255).astype(np.uint8))
    x4.putalpha(cut.split()[3].resize(x4.size, Image.BILINEAR)); col = np.array(resize_foreground(x4, 0.85)).astype(np.float32)
    m2 = col[..., 3] > 128
else: m2 = m
core = ndimage.binary_erosion(m2, iterations=2)
idx = ndimage.distance_transform_edt(~core, return_distances=False, return_indices=True)
fill = Image.fromarray(col[..., :3][idx[0], idx[1]].astype(np.uint8)); fill.save(f'in/{a.name}_proj.png')
fill.filter(ImageFilter.GaussianBlur(28)).save(f'in/{a.name}_projblur.png')
ys, xs = np.where(m); H, W = m.shape; pad = 0.01
bb = json.load(open('bbox.json')) if os.path.exists('bbox.json') else {}
bb[a.name] = [max(0, xs.min() / W - pad), min(1, xs.max() / W + pad), max(0, ys.min() / H - pad), min(1, ys.max() / H + pad)]
json.dump(bb, open('bbox.json', 'w'))
