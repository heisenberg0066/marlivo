import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import convex_hull_image
T = np.asarray(Image.open('/workspace/tools/hyb_beanie12/beanie_hi.png').convert('RGB')).astype(float)
tid = np.load('pm_hi.npz')['tid']; R = 4096; A = np.zeros((R, R), bool); A[:, :int(0.40 * R)] = True; A &= tid >= 0
r, g, b = T[..., 0], T[..., 1], T[..., 2]
skin = A & (r > 190) & (g > 130) & (r - b > 45) & (r - b < 120) & (r - g < 75)
yy = np.arange(R)[:, None]
# head band in atlas A: z in 0.55..0.80 -> ay = -4033 z + 4046
skin &= (yy > -4033 * 0.80 + 4046) & (yy < -4033 * 0.55 + 4046)
skin = ndimage.binary_opening(skin, iterations=3)
lab, n = ndimage.label(skin); sz = ndimage.sum(skin, lab, range(1, n + 1))
big = np.isin(lab, 1 + np.where(sz > 0.3 * sz.max())[0])
M = convex_hull_image(big)
ys, xs = np.nonzero(M); print('face hull x', xs.min(), xs.max(), 'y', ys.min(), ys.max(), 'z', (4046 - ys.max()) / 4033, (4046 - ys.min()) / 4033)
np.save('faceA.npy', M)
v = (T * 0.6).astype(np.uint8); v[M] = (v[M] * 0.5 + np.array([0, 120, 0])).astype(np.uint8)
Image.fromarray(v).crop((400, 600, 1700, 1900)).resize((650, 650)).save('/tmp/lk/faceA.png')
