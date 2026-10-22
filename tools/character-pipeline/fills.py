# python fills.py <cut.png>...  -> <x>_fill.png (edge-extended colours, eroded fringe) and <x>_edge.png (px distance to the silhouette, /64 clipped)
import sys, numpy as np
from PIL import Image
from scipy import ndimage
for f in sys.argv[1:]:
    a = np.asarray(Image.open(f).convert('RGBA')).astype(np.uint8); H = a.shape[0]; k = max(2, int(round(7 * H / 1280)))
    m = ndimage.binary_erosion(a[:, :, 3] > 200, iterations=k)
    _, (iy, ix) = ndimage.distance_transform_edt(~m, return_indices=True)
    Image.fromarray(a[:, :, :3][iy, ix]).save(f.replace('.png', '_fill.png'))
    d = ndimage.distance_transform_edt(a[:, :, 3] > 127) * (1280 / H)  # in 1280-px-tall units
    Image.fromarray(np.clip(d / 64 * 255, 0, 255).astype(np.uint8)).save(f.replace('.png', '_edge.png')); print(f)
