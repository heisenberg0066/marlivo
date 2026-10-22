# python flatface_sugar.py in.obj out.obj : press Sparkle cube's modelled eye/mouth bumps flat onto the front face
# (the Hunyuan eye bulges/rings and mouth crease sit higher/larger than the painted eyes and mouth = doubled eye outline)
import sys, numpy as np, trimesh, scipy.sparse as sp
m = trimesh.load(sys.argv[1], process=False); v = m.vertices.copy(); y, z, x = v[:, 1], v[:, 2], v[:, 0]
rect = (y > -0.30) & (y < 0.31) & (z > -0.19) & (z < 0.47) & (x > 0.18)
fy, fz = (-0.27, 0.27), (-0.02, 0.32)  # feature box (eyes + mouth)
def soft(a, lo, hi, b): return np.clip(np.minimum(a - lo, hi - a) / b + 0.5, 0, 1)
w = soft(y, *fy, 0.04) * soft(z, *fz, 0.04) * rect
fit = rect & (w == 0)
A = lambda yy, zz: np.stack([np.ones_like(yy), yy, zz, yy * yy, zz * zz, yy * zz], 1)
c, *_ = np.linalg.lstsq(A(y[fit], z[fit]), x[fit], rcond=None); pl = A(y, z) @ c
print('fit rms', np.sqrt(np.mean((x[fit] - pl[fit]) ** 2)), 'moved', int((w > 0).sum()), 'max dev', np.abs(x - pl)[w > 0.5].max())
v[:, 0] = x + w * (pl - x)
# masked Laplacian relax (tangential) so collapsed ring/crease triangles even out
e = m.edges_unique; n = len(v); Adj = sp.coo_matrix((np.ones(len(e) * 2), (np.r_[e[:, 0], e[:, 1]], np.r_[e[:, 1], e[:, 0]])), shape=(n, n)).tocsr()
deg = np.asarray(Adj.sum(1)).ravel(); deg[deg == 0] = 1
ww = (w > 0).astype(float)[:, None]
for _ in range(15):
    avg = (Adj @ v) / deg[:, None]; v = v + 0.5 * ww * (avg - v); v[:, 0] = np.where(w > 0, v[:, 0] + w * (A(v[:, 1], v[:, 2]) @ c - v[:, 0]), v[:, 0])
m.vertices = v; m.export(sys.argv[2]); print('wrote', sys.argv[2])
