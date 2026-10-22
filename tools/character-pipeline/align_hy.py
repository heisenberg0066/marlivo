# python align_hy.py <name> <hy.obj> <out.obj>
# Puts a Hunyuan3D-2mv mesh into the TripoSR/carve frame used by bl/build.py (up +z, front +x), fits it to the
# reference silhouette in the reference camera, and gives it vertex colours from the generated turnaround views.
import sys, json, math, numpy as np, trimesh
from PIL import Image
from scipy import ndimage
name, src, dst = sys.argv[1:4]
m = trimesh.load(src, force='mesh', process=False)
v = m.vertices.copy(); v = np.stack([v[:, 2], v[:, 0], v[:, 1]], 1)  # hy (x, y up, z front) -> file (x front, y, z up)
car = trimesh.load(f'/workspace/tools/carve_{name}.obj', force='mesh', process=False).vertices
s0 = (car[:, 2].max() - car[:, 2].min()) / (v[:, 2].max() - v[:, 2].min())
v = (v - v.mean(0)) * s0; v += np.array([car[:, 0].mean(), car[:, 1].mean(), car[:, 2].min() - v[:, 2].min()])
mask = np.array(Image.open(f'/workspace/tools/in/{name}_mask.png').convert('L').resize((512, 512))) > 128
tn = math.tan(math.radians(20))
def sil(p):
    bx, by, bz = p[:, 1], -p[:, 0], p[:, 2]; d = by + 1.9
    px = (bx / (d * tn) + 1) / 2 * 512; py = (1 - (bz / (d * tn) + 1) / 2) * 512
    g = np.zeros((512, 512), bool); ok = (px >= 0) & (px < 512) & (py >= 0) & (py < 512)
    g[py[ok].astype(int), px[ok].astype(int)] = True
    return ndimage.binary_closing(g, iterations=2)
def xf(p, k):  # k = (scale, dy screen-x, dz up, dx depth, yaw deg)
    c = p.mean(0); a = math.radians(k[4]); R = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])
    q = ((p - c) @ R.T) * k[0] + c; return q + np.array([k[3], k[1], k[2]])
ycut = np.where(mask.any(1))[0].max() - 2; mask[ycut:] = False
def iou(k): g = sil(xf(v, k)); g[ycut:] = False; return (g & mask).sum() / (g | mask).sum()
best = [1.0, 0.0, 0.0, 0.0, 0.0]; bi = iou(best)
for st in (0.03, 0.01, 0.004):
    for _ in range(20):
        imp = False
        for j, dd in ((0, st), (0, -st), (1, st), (1, -st), (2, st), (2, -st), (3, 5 * st), (3, -5 * st), (4, 100 * st), (4, -100 * st)):
            k = list(best); k[j] = k[j] * (1 + dd) if j == 0 else k[j] + dd; ki = iou(k)
            if ki > bi: best, bi, imp = k, ki, True
        if not imp: break
v0 = v.copy(); v = xf(v, best); json.dump({'yaw': best[4]}, open(f'/workspace/tools/hy_{name}_align.json', 'w')); print('ALIGN iou', round(bi, 4), 'k', [round(x, 4) for x in best])
g = sil(v); dbg = np.zeros((512, 512, 3), np.uint8); dbg[mask] = (0, 120, 255); dbg[g] = dbg[g] // 2 + np.array([120, 60, 0], np.uint8)
Image.fromarray(dbg).save(f'/tmp/lab/align_{name}.png')
# --- vertex colours from the generated views (orthographic, z-buffered, facing-weighted)
mm = trimesh.Trimesh(v0, m.faces, process=False); nr = mm.vertex_normals
raw = np.stack([v0[:, 1], -v0[:, 0], v0[:, 2]], 1); rn = np.stack([nr[:, 1], -nr[:, 0], nr[:, 2]], 1)
views = {'front': 0, 'q34L': 45, 'q34R': -45, 'sideL': 90, 'sideR': -90, 'back': 180}
acc = np.zeros((len(v), 3)); wsum = np.zeros(len(v))
for k, deg in views.items():
    im = np.asarray(Image.open(f'/workspace/sb/gen5/cut/{name}_{k}.png').convert('RGBA')).astype(float) / 255
    H, W = im.shape[:2]; al = im[:, :, 3] > 0.5; ys, xs = np.where(al)
    th = math.radians(deg); d = np.array([-math.sin(th), math.cos(th), 0]); r = np.array([math.cos(th), math.sin(th), 0])
    u = raw @ r; z = raw[:, 2]; dep = raw @ d
    s = (ys.max() - ys.min()) / (z.max() - z.min()); cy = ys.max() + z.min() * s; cx = xs.mean() - u.mean() * s
    X = cx + u * s; Y = cy - z * s
    G = 3; gx = np.clip((X / G).astype(int), 0, W // G); gy = np.clip((Y / G).astype(int), 0, H // G)
    zb = np.full((H // G + 1, W // G + 1), np.inf); np.minimum.at(zb, (gy, gx), dep)
    zb = ndimage.minimum_filter(zb, 3)
    vis = dep <= zb[gy, gx] + 0.01 * (z.max() - z.min())
    fac = np.clip(rn @ -d, 0, 1)
    ix = np.clip(X.astype(int), 0, W - 1); iy = np.clip(Y.astype(int), 0, H - 1)
    w = fac ** 4 * vis * im[iy, ix, 3] * (2.0 if k == 'front' else 1.0)
    acc += w[:, None] * im[iy, ix, :3]; wsum += w
col = acc / np.maximum(wsum, 1e-6)[:, None]
miss = wsum < 1e-4
if miss.any():  # fill from nearest coloured vertex
    from scipy.spatial import cKDTree
    t = cKDTree(v[~miss]); _, j = t.query(v[miss]); col[miss] = col[~miss][j]
print('VC missing', int(miss.sum()), 'of', len(v))
out = trimesh.Trimesh(v, m.faces, vertex_colors=(np.clip(col, 0, 1) * 255).astype(np.uint8), process=False)
out.export(dst); print('wrote', dst, len(v), len(m.faces))
