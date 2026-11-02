# v2: project the generated hi-res side head (ear, earring, cheek, tucked hair) onto both head sides
import numpy as np, sys, os
from PIL import Image
from scipy import ndimage
base_tex, out = sys.argv[1], sys.argv[2]
pm0 = np.load('pm_hi.npz'); pmg = np.load('pmg_hi.npz'); tid = pmg['tid']; R = tid.shape[0]
T = np.asarray(Image.open(base_tex).convert('RGB')).astype(np.float32)
ys, xs = np.nonzero(tid >= 0); p0 = pm0['pos'][ys, xs]; p = pmg['pos'][ys, xs]; n = pmg['nrm'][ys, xs]
br = np.load('brim.npy'); MA = np.load('projA.npy'); FA = np.load('faceA.npy'); dFA = ndimage.distance_transform_edt(~FA)
th0 = np.degrees(np.arctan2(p0[:, 0], -p0[:, 1])); brim = np.interp(th0, br[:, 0], br[:, 1])
# face-hull distance (orig positions, front visible)
a = np.c_[p0, np.ones(len(p0))] @ MA; ax = np.clip(a[:, 0].astype(int), 0, R - 1); ay = np.clip(a[:, 1].astype(int), 0, R - 1)
cs = 4; zb = np.full((R // cs + 1, R // cs + 1), 9.0); np.minimum.at(zb, (ay // cs, ax // cs), p0[:, 1]); zb = ndimage.minimum_filter(zb, 3)
visF = (p0[:, 1] <= zb[ay // cs, ax // cs] + 0.006) & (n[:, 1] < 0.35)
dface = np.where(visF, dFA[ay, ax], 999.0)
def sm(x, a0, a1): t = np.clip((x - a0) / (a1 - a0), 0, 1); return t * t * (3 - 2 * t)
S = np.asarray(Image.open('side_left_nf.png')).astype(np.float32); SH, SW = S.shape[:2]
# earring: the generated hoop mirrors the blue sky -> warm silver, so it is kept (not masked as scarf) and reads on any table
_yy, _xx = np.mgrid[0:S.shape[0], 0:S.shape[1]]
_box = (_xx > 524) & (_xx < 553) & (_yy > 577) & (_yy < 623)
_l = S[..., :3].mean(2); _sat = S[..., :3].max(2) - S[..., :3].min(2)
_ring = _box & (S[..., 0] - S[..., 2] < 14) & (S[..., 3] > 128)
EAR = _ring.copy()
_v = np.clip((_l - _l[_ring].min()) / max(1, np.ptp(_l[_ring])), 0, 1) if _ring.any() else _l
S[..., :3] = np.where(_ring[..., None], np.stack([60 + 175 * _v, 58 + 168 * _v, 55 + 150 * _v], -1), S[..., :3])
sr, sg, sb = S[..., 0], S[..., 1], S[..., 2]
cream = (sr > 200) & (sg > 190) & (sb > 160) & (sr - sb < 45)
blue = sb > sr + 20
camel = (sr > 150) & (sr - sb > 55) & (sr - sb < 110) & (sg < 175) & (sr < 225)  # coat: darker/browner than skin
Sb = ndimage.gaussian_filter(S[..., :3], (6, 6, 0)); creamB = (Sb.min(2) > 150) & (Sb[..., 0] - Sb[..., 2] < 50) & (S[..., 3] > 128)
creamB = ndimage.binary_fill_holes(ndimage.binary_closing(creamB, iterations=4))
lab, nl = ndimage.label(creamB); szs = ndimage.sum(creamB, lab, range(1, nl + 1)); creamB = np.isin(lab, 1 + np.where(szs > 20000)[0])
ok_src = (S[..., 3] > 128) & ~ndimage.binary_dilation(creamB | cream, iterations=10) & ~ndimage.binary_dilation(blue, iterations=3)
# coat only exists low in the picture (below the scarf); skin above it can look camel-ish in shadow
yy = np.mgrid[0:SH, 0:SW][0]; ok_src &= ~(camel & (yy > 700))
ok_src = ndimage.binary_erosion(ok_src, iterations=2) | EAR
ok_src = ok_src.astype(np.float32)
ok_src = ndimage.gaussian_filter(ok_src, 2.0)
Mk = (tid >= 0).astype(np.float32); Tb = ndimage.gaussian_filter(T * Mk[..., None], (10, 10, 0)) / np.maximum(ndimage.gaussian_filter(Mk, 10), 1e-3)[..., None]; tc = Tb[ys, xs]; tcream = (tc.min(1) > 120) & (tc[:, 0] - tc[:, 2] < 60) & (p0[:, 2] > 0.60)
np.save('tcream.npy', tcream)
# match the side picture's skin to the front face skin
fs = T[ys, xs][(dface == 0)]; fsk = fs[(fs[:, 0] > 190) & (fs[:, 0] - fs[:, 2] > 40) & (fs[:, 0] - fs[:, 2] < 100)]
Sk = S[..., :3][(S[..., 3] > 128) & (sr > 200) & (sr - sb > 40) & (sr - sb < 100) & (sg > 150)]
gain = np.median(fsk, 0) / np.median(Sk, 0); print('skin gain', gain.round(3), np.median(fsk, 0), np.median(Sk, 0))
skw = np.clip(((sr - sb) - 20) / 20, 0, 1) * np.clip((sr - 170) / 30, 0, 1)
S[..., :3] = S[..., :3] * (1 + (gain[None, None, :] - 1) * skw[..., None])
O = T[ys, xs].copy(); Wtot = np.zeros(len(p))
for side, sg_ in (('L', 1), ('R', -1)):
    s, cx, cy = np.load(f'sidefit_{side}.npy')
    Si = S[:, ::-1] if side == 'R' else S; okS = ok_src[:, ::-1] if side == 'R' else ok_src
    yv = p[:, 1] if side == 'L' else -p[:, 1]
    u = cx + yv * s; v = cy - p[:, 2] * s
    ui = np.clip(u.astype(int), 0, SW - 1); vi = np.clip(v.astype(int), 0, SH - 1)
    # side depth buffer (front-most along the view = largest sg*x)
    c2 = 2; db = np.full((SH // c2 + 1, SW // c2 + 1), -9.0); np.maximum.at(db, (vi // c2, ui // c2), sg_ * p[:, 0]); db = ndimage.maximum_filter(db, 3)
    vis = sg_ * p[:, 0] >= db[vi // c2, ui // c2] - float(os.environ.get('SVTOL', '0.02'))
    if os.environ.get('NOVIS'):
        w = okS[vi, ui] * (sg_ * p[:, 0] > 0.0) * ~tcream * (1 - sm(np.abs(th0), 105, 125))
    else:
      w = sm(np.abs(n[:, 0]), float(os.environ.get('NX0', '-0.05')), float(os.environ.get('NX1', '0.2'))) * (sg_ * p[:, 0] > 0.0) * vis * okS[vi, ui] * ~tcream
    # smooth the coverage over the surface (theta/z grid) so per-texel drop-outs (micro folds, mask edges) never leave cracks
    gi = np.clip(((th0 + 180) / 0.5).astype(int), 0, 719); gj = np.clip(((p0[:, 2] - 0.35) / 0.0025).astype(int), 0, 259)
    acc = np.zeros((720, 260)); cnt = np.zeros((720, 260)); np.add.at(acc, (gi, gj), w); np.add.at(cnt, (gi, gj), 1)
    acc = ndimage.gaussian_filter(acc, 2.0, mode='wrap'); cnt = ndimage.gaussian_filter(cnt, 2.0, mode='wrap')
    w = np.clip(np.maximum(w, acc[gi, gj] / np.maximum(cnt[gi, gj], 1e-6)) * 1.5, 0, 1) * ~tcream * (sg_ * p[:, 0] > 0.0)
    w *= (1 - sm(-n[:, 1], float(os.environ.get('FN0', '0.97')), float(os.environ.get('FN1', '1.0'))) * visF)
    w *= sm(dface, float(os.environ.get('DF0', '2')), float(os.environ.get('DF1', '14'))) * (1 - sm(p0[:, 2], brim - 0.004, brim + 0.004)) * sm(p0[:, 2], 0.52, 0.56)
    # bilinear sample
    fu, fv = u - 0.5, v - 0.5; u0 = np.clip(np.floor(fu).astype(int), 0, SW - 2); v0 = np.clip(np.floor(fv).astype(int), 0, SH - 2)
    du, dv = np.clip(fu - u0, 0, 1)[:, None], np.clip(fv - v0, 0, 1)[:, None]
    col = (Si[v0, u0, :3] * (1 - du) * (1 - dv) + Si[v0, u0 + 1, :3] * du * (1 - dv) + Si[v0 + 1, u0, :3] * (1 - du) * dv + Si[v0 + 1, u0 + 1, :3] * du * dv)
    O = O * (1 - w[:, None]) + col * w[:, None]; Wtot += w
    print(side, 'texels', int((w > 0.5).sum()))
Tn = T.copy(); Tn[ys, xs] = O
Image.fromarray(Tn.clip(0, 255).astype(np.uint8)).save(out)
np.save('side_w.npy', Wtot)
