import numpy as np, cv2, itertools, sys
from PIL import Image
d = np.load('g_hi.npz'); co, T = d['co'], d['T']
rng = np.random.default_rng(0); t = rng.integers(0, len(T), 3000000); w = rng.dirichlet([1, 1, 1], len(t)); p = (co[T[t]] * w[..., None]).sum(1)
side = sys.argv[1] if len(sys.argv) > 1 else 'L'
img = np.asarray(Image.open('side_left_nf.png'))[..., 3] > 128
if side == 'R': img = img[:, ::-1]
H, W = img.shape
z0, z1 = 0.56, 0.83
pz = p[(p[:, 2] > z0) & (p[:, 2] < z1)]
yv = pz[:, 1] if side == 'L' else -pz[:, 1]
def iou(s, cx, cy):
    u = (cx + yv * s).astype(int); v = (cy - pz[:, 2] * s).astype(int)
    ok = (u >= 0) & (u < W) & (v >= 0) & (v < H)
    m = np.zeros((H, W), np.uint8); m[v[ok], u[ok]] = 1; m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)) > 0
    band = np.zeros((H, W), bool); band[int(cy - z1 * s):int(cy - z0 * s)] = True
    g = img & band
    return (m & g).sum() / max(1, (m | g).sum())
best = (0, None)
for s in np.arange(1150, 1450, 25):
    for cx in np.arange(480, 640, 10):
        for cy in np.arange(cy0 if False else 1200, 1400, 10) if False else np.arange(1150, 1500, 10):
            # quick reject: eye height ~ image y 512 should map near z 0.652
            if abs((cy - 0.652 * s) - 512) > 60: continue
            v = iou(s, cx, cy)
            if v > best[0]: best = (v, (s, cx, cy))
print('coarse', best)
s0, cx0, cy0 = best[1]
for s in np.arange(s0 - 25, s0 + 26, 5):
    for cx in np.arange(cx0 - 10, cx0 + 11, 2):
        for cy in np.arange(cy0 - 10, cy0 + 11, 2):
            v = iou(s, cx, cy)
            if v > best[0]: best = (v, (s, cx, cy))
print('fine', best); np.save(f'sidefit_{side}.npy', np.array(best[1]))
s, cx, cy = best[1]
u = (cx + yv * s).astype(int); v = (cy - pz[:, 2] * s).astype(int); ok = (u >= 0) & (u < W) & (v >= 0) & (v < H)
vis = np.asarray(Image.open('side_left_nf.png').convert('RGB')).copy()
if side == 'R': vis = vis[:, ::-1].copy()
vis[v[ok][::20], u[ok][::20]] = [255, 0, 0]
Image.fromarray(vis).resize((512, 512)).save(f'/tmp/lk/sidefit_{side}.png')
