import numpy as np
from PIL import Image
from scipy import ndimage
im = np.asarray(Image.open('/workspace/sb/gen8/cut/beanie_front.png').convert('RGBA')).astype(float)
r, g, b, a = [im[..., k] for k in range(4)]
H, W = r.shape
skin = (r > 190) & (g > 130) & (r - b > 35) & (r - b < 120) & (r - g < 75) & (a > 200)
yy = np.arange(H)[:, None]
skin &= (yy > 1060) & (yy < 2000) & (r - b > 45)
skin = ndimage.binary_opening(skin, iterations=3)
lab, n = ndimage.label(skin); sz = ndimage.sum(skin, lab, range(1, n + 1)); M = lab == 1 + np.argmax(sz)
big = np.isin(lab, 1 + np.where(sz > 20000)[0])
from skimage.morphology import convex_hull_image
M = convex_hull_image(big)
M &= ~(ndimage.binary_opening((r + g + b) / 3 < 110, iterations=4) & ~ndimage.binary_erosion(M, iterations=60))  # trim hair at the hull border
ys, xs = np.nonzero(M); print('face mask bbox x', xs.min(), xs.max(), 'y', ys.min(), ys.max())
np.save('/tmp/b_facemask.npy', M)
v = (im[..., :3] * 0.6).astype(np.uint8); v[M] = (v[M] * 0.5 + np.array([0, 120, 0])).astype(np.uint8)
Image.fromarray(v).crop((600, 700, 2500, 2300)).resize((570, 480)).save('/tmp/lk/facemask1.png')
