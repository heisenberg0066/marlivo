import numpy as np
from PIL import Image
V = np.load('/tmp/bV.npy'); P = V[:, :3]
B = np.stack([P[:, 1], -P[:, 0], P[:, 2]], 1)
mn, mx = B.min(0), B.max(0); h = mx[2] - mn[2]
Bn = (B - np.array([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]])) / h
s, cx, cy = 3412.1, 1575.3, 3781.0; import sys; th = np.radians(float(sys.argv[1]) if len(sys.argv)>1 else -7.2)
u = Bn @ np.array([np.cos(th), np.sin(th), 0]); v = Bn[:, 2]
px = cx + u * s; py = cy - v * s
al = np.asarray(Image.open('/workspace/sb/gen8/cut/beanie_front.png'))[..., 3]
ix = np.clip(px.astype(int), 0, al.shape[1] - 1); iy = np.clip(py.astype(int), 0, al.shape[0] - 1)
print('inside alpha frac', (al[iy, ix] > 128).mean())
np.save('/tmp/b_fpx.npy', np.stack([px, py], 1))
