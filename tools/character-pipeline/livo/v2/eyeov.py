# paint the EYE_SPEC blink ellipses (and mouth ellipse) onto the texture, in the client's bind frame, to check alignment
import numpy as np, sys
from PIL import Image
ey, eh, ex, ew, my, mh, mw = map(float, sys.argv[1:8]); out = sys.argv[8]
T = np.asarray(Image.open('tex_hi_v2.png').convert('RGB')).astype(np.float32)
tid = np.load('pmg_hi.npz')['tid']; ys, xs = np.nonzero(tid >= 0)
V = np.load('g_hi.npz')['co']; tf = lambda P: np.c_[P[:, 0], P[:, 2], -P[:, 1]]
Vb = tf(V); mn, mx = Vb.min(0), Vb.max(0); ctr = (mn + mx) / 2; sc = 1 / (mx[1] - mn[1])
a = np.radians(7.2); Ry = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
Q = ((tf(np.load('pmg_hi.npz')['pos'][ys, xs]) - np.array([ctr[0], mn[1], ctr[2]])) * sc) @ Ry.T
dx = (np.abs(Q[:, 0]) - ex) / ew; dy = (Q[:, 1] - ey) / eh; e = (dx * dx + dy * dy < 1) & (Q[:, 2] > 0.02)
cx = Q[:, 0] / mw; cy = (Q[:, 1] - my) / mh; m = (cx * cx + cy * cy < 1) & (Q[:, 2] > 0.16)
O = T.copy(); O[ys[e], xs[e]] = O[ys[e], xs[e]] * 0.4 + np.array([0, 255, 0]) * 0.6; O[ys[m], xs[m]] = O[ys[m], xs[m]] * 0.4 + np.array([255, 0, 255]) * 0.6
Image.fromarray(O.astype(np.uint8)).save(out)
