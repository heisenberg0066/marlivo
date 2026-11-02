# position map: per texel 3D position, normal, triangle id (-1 empty)
import numpy as np, sys
src, R, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
d = np.load(src); co, nr, T, tuv = d['co'], d['nr'], d['T'], d['tuv']
tid = -np.ones((R, R), np.int32); bc = np.zeros((R, R, 3), np.float32)
P = tuv * R; P[..., 1] = R - P[..., 1]  # image coords (y down)
for t in range(len(T)):
    p = P[t]; x0, y0 = np.floor(p.min(0)).astype(int); x1, y1 = np.ceil(p.max(0)).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, R - 1), min(y1, R - 1)
    if x1 < x0 or y1 < y0: continue
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    a, b, c = p; v0, v1 = b - a, c - a; den = v0[0] * v1[1] - v1[0] * v0[1]
    if abs(den) < 1e-12: continue
    wx, wy = xs - a[0], ys - a[1]
    l1 = (wx * v1[1] - v1[0] * wy) / den; l2 = (v0[0] * wy - wx * v0[1]) / den; l0 = 1 - l1 - l2
    e = -0.02 * max(1.0, 3.0 / max(abs(den) ** 0.5, 1e-3))
    m = (l0 >= e) & (l1 >= e) & (l2 >= e)
    if not m.any(): continue
    yy, xx = (ys[m] - 0.5).astype(int), (xs[m] - 0.5).astype(int)
    tid[yy, xx] = t; bc[yy, xx] = np.stack([l0[m], l1[m], l2[m]], 1)
ok = tid >= 0; tt = tid[ok]; w = bc[ok]
pos = np.zeros((R, R, 3), np.float32); nrm = np.zeros((R, R, 3), np.float32)
pos[ok] = (co[T[tt]] * w[..., None]).sum(1); n = (nr[T[tt]] * w[..., None]).sum(1); nrm[ok] = n / np.linalg.norm(n, axis=1, keepdims=True)
np.savez_compressed(out, tid=tid, pos=pos, nrm=nrm)
print('raster', R, ok.mean())
