# python prep6.py <name>: treat the generated front cut (gen6/cut/<name>_front.png) as the reference image:
# writes in/<name>_mask.png, in/<name>_proj.png (edge-filled), in/<name>_projblur.png and the bbox.json entry (as prep.py does for photos)
import sys, json, os, numpy as np
sys.path.insert(0, '/workspace/tools/TripoSR')
from tsr.utils import resize_foreground
from PIL import Image, ImageFilter
from scipy import ndimage
n = sys.argv[1]; G = os.environ.get('GEN', '/workspace/sb/gen6/cut')
cut = Image.open(f'{G}/{n}_front.png').convert('RGBA'); cut = cut.resize((cut.width // 2, cut.height // 2), Image.LANCZOS)
arr = np.array(resize_foreground(cut, 0.85)).astype(np.float32); m = arr[..., 3] > 128
Image.fromarray(m.astype(np.uint8) * 255).save(f'in/{n}_mask.png')
core = ndimage.binary_erosion(m, iterations=3)
idx = ndimage.distance_transform_edt(~core, return_distances=False, return_indices=True)
fill = Image.fromarray(arr[..., :3][idx[0], idx[1]].astype(np.uint8)); fill.save(f'in/{n}_proj.png')
fill.filter(ImageFilter.GaussianBlur(28)).save(f'in/{n}_projblur.png')
ys, xs = np.where(m); H, W = m.shape; pad = 0.01
bb = json.load(open('bbox.json')); bb[n] = [max(0, xs.min() / W - pad), min(1, xs.max() / W + pad), max(0, ys.min() / H - pad), min(1, ys.max() / H + pad)]
json.dump(bb, open('bbox.json', 'w')); print('PREP', n, m.shape, bb[n])
