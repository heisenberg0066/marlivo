# v2 hair: every head texel outside the front face hull, below the brim, gets clean hair mirrored from the side hair
import numpy as np, sys
from PIL import Image
from scipy import ndimage
texin, out = sys.argv[1], sys.argv[2]
pm = np.load('pm_hi.npz'); tid, pos, nrm = pm['tid'], pm['pos'], pm['nrm']; R = tid.shape[0]
T = np.asarray(Image.open(texin).convert('RGB')).astype(np.float32)
U = np.asarray(Image.open('uwS.png').convert('RGB')).astype(np.float32); uth0, uz1, uk = -180, 0.95, 10; upz = uk * np.degrees(1 / 0.18)
br = np.load('brim.npy'); MA = np.load('projA.npy'); FA = np.load('faceA.npy')
dFA = ndimage.distance_transform_edt(~FA)  # px outside the hull (A atlas px)
ys, xs = np.nonzero(tid >= 0); p = pos[ys, xs]; n = nrm[ys, xs]
th = np.degrees(np.arctan2(p[:, 0], -p[:, 1])); z = p[:, 2]
brim = np.interp(th, br[:, 0], br[:, 1])
a = np.c_[p, np.ones(len(p))] @ MA; ax = np.clip(a[:, 0].astype(int), 0, R - 1); ay = np.clip(a[:, 1].astype(int), 0, R - 1)
# visible from the front: depth buffer in A-atlas pixels (min y = front-most), at 4 px cells
cs = 4; gx, gy = ax // cs, ay // cs; zb = np.full((R // cs + 1, R // cs + 1), 9.0); np.minimum.at(zb, (gy, gx), p[:, 1])
zb = ndimage.minimum_filter(zb, 3)
vis = (p[:, 1] <= zb[gy, gx] + float(__import__('os').environ.get('VTOL', '0.006'))) & (n[:, 1] < 0.35)
dface = np.where(vis, dFA[ay, ax], 999.0)
c = T[ys, xs]; blue = (c[:, 2] > c[:, 0] + 25)
TM = float(sys.argv[3]) if len(sys.argv) > 3 else 78.0
cand = (np.abs(th) < 125) & (z > 0.585) & (z < brim + 0.002) & ~blue & (dface > 0)
def sm(x, a0, a1): t = np.clip((x - a0) / (a1 - a0), 0, 1); return t * t * (3 - 2 * t)
w = sm(dface, 0, 22) * sm(brim - z, -0.002, 0.008) * sm(z, 0.585, 0.60) * (1 - sm(np.abs(th), 110, 125))
w = np.where(cand, w, 0)
ths = np.where(np.abs(th) < TM, np.sign(th) * (2 * TM - np.abs(th)), th)
brs = np.interp(ths, br[:, 0], br[:, 1]); zs = brs - (brim - z)
ux = np.clip(((ths - uth0) * uk).astype(int), 0, U.shape[1] - 1); uy = np.clip(((uz1 - zs) * upz).astype(int), 0, U.shape[0] - 1)
src = U[uy, ux]
# empty unwrap cells: fall back to the darkest-hair tone
emp = src.sum(1) < 1; src[emp] = [62, 44, 36]
newc = c * (1 - w[:, None]) + src * w[:, None]
O = T.copy(); O[ys, xs] = newc
Image.fromarray(O.clip(0, 255).astype(np.uint8)).save(out)
print('recoloured texels', int((w > 0.5).sum()))
if __import__('os').environ.get('DBG'):
    D = T.copy() * 0.5
    D[ys, xs] = np.where((dface == 0)[:, None], D[ys, xs] + [0, 120, 0], D[ys, xs])
    D[ys, xs] = np.where((w > 0.5)[:, None], D[ys, xs] + [120, 0, 0], D[ys, xs])
    D[ys, xs] = np.where(((xs < 0.40 * R) & (w <= 0.5) & (dface > 0))[:, None], D[ys, xs] + [0, 0, 120], D[ys, xs])
    Image.fromarray(D.clip(0, 255).astype(np.uint8)).save(__import__('os').environ['DBG'])
