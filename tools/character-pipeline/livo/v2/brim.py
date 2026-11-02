import numpy as np
from PIL import Image
from scipy import ndimage
im = np.asarray(Image.open('/tmp/lk/uwF.png')).astype(float)  # full -180..180 unwrap, 4 px/deg, z 0.45..0.95
th0, z1, k = -180, 0.95, 4; pz = k * np.degrees(1 / 0.18)
r, g, b = im[..., 0], im[..., 1], im[..., 2]; lum = (r + g + b) / 3
cream = (lum > 165) & (r - b < 50) & (r - b > -5)
cream = ndimage.binary_closing(cream, iterations=2)
H, W = cream.shape; zb = np.full(W, np.nan)
for x in range(W):
    col = cream[:, x]; filled = (im[:, x].sum(1) > 0)
    # walk down from the top while cream (allow small gaps)
    y = np.argmax(filled); gap = 0; last = None
    while y < H:
        if col[y]: last = y; gap = 0
        elif filled[y]: gap += 1
        if gap > 6: break
        y += 1
    if last is not None: zb[x] = z1 - last / pz
th = th0 + (np.arange(W) + 0.5) / k
ok = ~np.isnan(zb); zbf = np.interp(np.arange(W), np.where(ok)[0], zb[ok], period=W)
med = ndimage.median_filter(zbf, size=int(24 * k), mode='wrap')
sm = ndimage.uniform_filter1d(med, int(8 * k), mode='wrap')
np.save('brim.npy', np.stack([th, sm, zbf], 1))
for t in range(-180, 181, 20): i = min(W - 1, int((t - th0) * k)); print(t, round(zbf[i], 3), round(sm[i], 3))
