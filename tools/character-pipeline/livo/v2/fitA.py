import numpy as np
from PIL import Image
pm = np.load('pm_hi.npz'); tid, pos, nrm = pm['tid'], pm['pos'], pm['nrm']; R = 4096
ys, xs = np.nonzero(tid >= 0); A = xs < 0.40 * R
# front-facing only
p = pos[ys[A], xs[A]]; n = nrm[ys[A], xs[A]]; f = n[:, 1] < -0.5
X = np.c_[p[f], np.ones(f.sum())]; Y = np.c_[xs[A][f], ys[A][f]].astype(float)
sel = np.random.default_rng(0).choice(len(X), min(400000, len(X)), replace=False)
for it in range(3):
    M, *_ = np.linalg.lstsq(X[sel], Y[sel], rcond=None); res = np.linalg.norm(X[sel] @ M - Y[sel], axis=1)
    print('it', it, 'median res px', np.median(res), 'p90', np.percentile(res, 90)); sel = sel[res < max(3, np.percentile(res, 80))]
print(M); np.save('projA.npy', M)
