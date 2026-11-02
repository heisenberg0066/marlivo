# v2 texture finish: sharpen, gutter fill, and the Low texture re-sampled from the High one by 3D nearest surface point
import numpy as np, sys
from PIL import Image, ImageFilter
from scipy import ndimage
from scipy.spatial import cKDTree
hi_in, hi_out, lo_out = sys.argv[1:4]
H = Image.open(hi_in).convert('RGB')
Ha = np.asarray(H)
ph = np.load('pmg_hi.npz'); tid = ph['tid']; ins = tid >= 0
# gutters next to side-painted texels take the painted colour first (so bilinear/mip sampling at island edges never shows hair)
import os
if os.path.exists('side_w.npy'):
    _ys, _xs = np.nonzero(ins); _sw = np.load('side_w.npy'); painted = np.zeros_like(ins); painted[_ys[_sw > 0.5], _xs[_sw > 0.5]] = True
    dP, (py_, px_) = ndimage.distance_transform_edt(~painted, return_indices=True)
    g = ((~ins) & (dP <= float(os.environ.get('GPAD', '4')))) | (ndimage.binary_closing(painted, iterations=2) & ~painted & ins); Ha = Ha.copy(); Ha[g] = Ha[py_[g], px_[g]]; ins2 = ins | g
else:
    ins2 = ins
_, (iy, ix) = ndimage.distance_transform_edt(~ins2, return_indices=True); Ha = Ha[iy, ix]
# sharpen only after the gutters are filled (sharpening against raw gutters left light halo lines at island seams)
Ha = np.asarray(Image.fromarray(Ha).filter(ImageFilter.UnsharpMask(radius=2, percent=55, threshold=2))).copy()
Ha = Ha[iy, ix]
Image.fromarray(Ha).save(hi_out)
ys, xs = np.nonzero(ins); P = ph['pos'][ys, xs]; N = ph['nrm'][ys, xs]
pl = np.load('pmg_lo.npz'); tl = pl['tid']; R = tl.shape[0]; ly, lx = np.nonzero(tl >= 0); Q = pl['pos'][ly, lx]; NQ = pl['nrm'][ly, lx]
tree = cKDTree(P); d, j = tree.query(Q, k=6)
score = d + 0.01 * (1 - np.einsum('nkc,nc->nk', N[j], NQ))
best = j[np.arange(len(Q)), np.argmin(score, 1)]
# average a small Ha patch (lo texel ~ 4x4 hi texels)
Hb = ndimage.uniform_filter(Ha.astype(np.float32), (3, 3, 1))
L = np.zeros((R, R, 3), np.float32); L[ly, lx] = Hb[ys[best], xs[best]]
_, (iy, ix) = ndimage.distance_transform_edt(~(tl >= 0), return_indices=True); L = L[iy, ix]
Image.fromarray(L.clip(0, 255).astype(np.uint8)).save(lo_out)
print('lo texels', len(Q), 'median dist', float(np.median(d[:, 0])))
