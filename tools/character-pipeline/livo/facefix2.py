# Geometry repair v2: inside the front picture's face outline (facemask.py), replace the Hunyuan head surface
# (hair locks over forehead/cheeks, offset mouth) by a robust smooth surface x = f(y, z) (x = forward in the obj).
import numpy as np, sys, json
from scipy import ndimage
import objio
cfg = dict(cell=0.002, deg=4, fin=60, fout=25, inner=0.03, fill=0.03, smooth=12)
out = sys.argv[1]
if len(sys.argv) > 2: cfg.update(json.loads(sys.argv[2]))
V = np.load('/tmp/bV.npy'); F = np.load('/tmp/bF.npy'); N = np.load('/tmp/bN.npy'); PX = np.load('/tmp/b_fpx.npy'); M = np.load('/tmp/b_facemask.npy')
P = V[:, :3].copy(); C = V[:, 3:]; x, y, z = P[:, 0], P[:, 1], P[:, 2]
din = ndimage.distance_transform_edt(M); dout = ndimage.distance_transform_edt(~M); sd = din - dout  # px, + inside
ix = np.clip(PX[:, 0].astype(int), 0, M.shape[1] - 1); iy = np.clip(PX[:, 1].astype(int), 0, M.shape[0] - 1)
sdv = sd[iy, ix]
band = sdv > -cfg['fout'] - 5
# front-visible vertices: per (y,z) cell the front-most x
cs = cfg['cell']; key = np.floor(y / cs).astype(np.int64) * 100000 + np.floor(z / cs).astype(np.int64)
sel = np.where(band)[0]; order = sel[np.argsort(-x[sel])]
uk, first = np.unique(key[order], return_index=True); fmax = dict(zip(uk, x[order][first]))
vis = np.zeros(len(P), bool); vis[sel] = x[sel] > np.array([fmax[k] for k in key[sel]]) - 0.004
yc = np.median(y[vis & (sdv > 0)]); zc = np.median(z[vis & (sdv > 0)])
def basis(yy, zz):
    u = (yy - yc) / 0.15; v = (zz - zc) / 0.12
    return np.stack([u ** i * v ** j for i in range(cfg['deg'] + 1) for j in range(cfg['deg'] + 1 - i)], 1)
fi = np.where(vis & (sdv > 15) & (N[:, 0] > 0.3))[0]
A = basis(y[fi], z[fi]); w = np.ones(len(fi))
for it in range(15):
    sw = np.sqrt(w); coef = np.linalg.lstsq(A * sw[:, None], x[fi] * sw, rcond=None)[0]
    res = x[fi] - A @ coef; sc = 1.4826 * np.median(np.abs(res)) + 1e-4
    t = res / (3 * sc); w = np.where(np.abs(t) < 1, (1 - t * t) ** 2, 0.0)
    if it >= 8: w = np.where(res > 0.003, w * 0.2, w)
print('fit pts', len(fi), 'res', np.percentile(res, [5, 50, 95]).round(4), 'yc zc', round(yc, 3), round(zc, 3))
fit = basis(y, z) @ coef
wv = np.clip((sdv + cfg['fout']) / (cfg['fout'] + cfg['fin']), 0, 1); wv = wv * wv * (3 - 2 * wv)
E = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
deg_ = np.bincount(E[:, 0], minlength=len(P)) + np.bincount(E[:, 1], minlength=len(P))
def lap(q):
    acc = np.zeros_like(q); np.add.at(acc, E[:, 0], q[E[:, 1]]); np.add.at(acc, E[:, 1], q[E[:, 0]])
    return acc / np.maximum(deg_, 1)[:, None] - q
r, g, b = C[:, 0], C[:, 1], C[:, 2]; lum = C.mean(1)
prot = (((r - b) < 0.1) & (lum > 0.55) & (z > cfg.get('brimz', 0.28))) | ((b > r) & (z < cfg.get('scarfz', 0.13)))
keep = 1 - prot.astype(float)
for _ in range(6): keep = np.clip(keep + lap(keep[:, None])[:, 0] * 0.8, 0, 1)
wv = wv * keep
near = (x > fit - cfg['inner']) & (wv > 0)
nx = x.copy()
up = near & (x > fit); nx[up] = x[up] - wv[up] * (x[up] - fit[up])
dn = near & (x < fit) & (x > fit - cfg['fill']); nx[dn] = x[dn] + wv[dn] * (fit[dn] - x[dn])
moved = np.abs(nx - x) > 1e-5; print('moved', moved.sum(), 'max', np.abs(nx - x).max().round(4))
P[:, 0] = nx
reg = moved.astype(float)
for _ in range(3): reg = np.clip(reg + lap(reg[:, None])[:, 0] * 2, 0, 1)
for _ in range(cfg['smooth']): P = P + reg[:, None] * 0.5 * lap(P)
V2 = V.copy(); V2[:, :3] = P; objio.save(out, V2, F); print('wrote', out)
