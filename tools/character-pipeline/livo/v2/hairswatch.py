# v2 hair: every hair texel not covered by the side picture gets the generated wavy-hair swatch (sharp, clean, dark brown),
# keeping the old texture's large-scale light/shadow. Also cleans the band under the beanie brim.
import numpy as np, sys, os
from PIL import Image
from scipy import ndimage
tin, tout = sys.argv[1], sys.argv[2]
T = np.asarray(Image.open(tin).convert('RGB')).astype(np.float32)
T0 = np.asarray(Image.open('/workspace/tools/hyb_beanie12/tex_hi.webp').convert('RGB')).astype(np.float32)
TH = np.asarray(Image.open('t_hair2.png').convert('RGB')).astype(np.float32)
pm0 = np.load('pm_hi.npz'); tid = np.load('pmg_hi.npz')['tid']; R = tid.shape[0]; ys, xs = np.nonzero(tid >= 0); p = pm0['pos'][ys, xs]
sw = np.load('side_w.npy')
br = np.load('brim.npy'); th = np.degrees(np.arctan2(p[:, 0], -p[:, 1])); z = p[:, 2]; brim = np.interp(th, br[:, 0], br[:, 1])
MA = np.load('projA.npy'); FA = np.load('faceA.npy'); dFA = ndimage.distance_transform_edt(~FA)
a = np.c_[p, np.ones(len(p))] @ MA; ax = np.clip(a[:, 0].astype(int), 0, R - 1); ay = np.clip(a[:, 1].astype(int), 0, R - 1)
inhull = (dFA[ay, ax] == 0) & (pm0['nrm'][ys, xs][:, 1] < -0.3)
def sm(x, a0, a1): t = np.clip((x - a0) / (a1 - a0), 0, 1); return t * t * (3 - 2 * t)
Mk = (tid >= 0).astype(np.float32)
Tb = ndimage.gaussian_filter(T * Mk[..., None], (6, 6, 0)) / np.maximum(ndimage.gaussian_filter(Mk, 6), 1e-3)[..., None]
c = Tb[ys, xs]; lum = c.mean(1)
hairish = sm(110 - lum, 0, 25) * (c[:, 0] >= c[:, 2] - 2) * (c[:, 2] < c[:, 0] + 10) * ((c[:, 0] - c[:, 2]) < 60)
fixed = (np.abs(TH[ys, xs] - T0[ys, xs]).sum(1) > 20).astype(np.float32)  # hairfix region
w = np.maximum(hairish, fixed) * (z > 0.40) * (z < brim + 0.002) * ~inhull * (1 - np.clip(sw, 0, 1))
# temples: hair frames the face down to about eye level (reference 5_head_closeup), not bare skin up to the brim
if os.environ.get('TEMPLE', '1') == '1':
    tc_ = np.load('tcream.npy'); at_ = np.abs(th)
    zl = np.interp(at_, [20, 40, 65, 90, 110], [0.67, 0.66, 0.665, 0.675, 0.68]) + float(os.environ.get('TZ', '0'))
    zl = zl + 0.006 * np.sin(np.radians(at_) * 9.0)
    tw_args = (at_, zl, tc_)
# swatch, mirror-tiled; u along theta (12.7 px/deg), v down from the brim
S = np.asarray(Image.open('hair_swatch.jpg').convert('RGB')).astype(np.float32)
S = np.concatenate([S, S[:, ::-1]], 1); S = np.concatenate([S, S[::-1]], 0); SH, SW = S.shape[:2]
u = ((th + 180) * 12.7).astype(int) % SW; v = (((brim - z) * 4300) + 40).astype(int) % SH
col = S[v, u]
if os.environ.get('TEMPLE', '1') == '1':
    at_, zl, tc_ = tw_args
    # strand-shaped lower edge: dark strands of the swatch reach further down than its highlights
    sl = col.mean(1); sl = (np.median(sl) - sl) / (np.std(sl) + 1e-6)
    ze = zl - 0.007 * np.clip(sl, -1.5, 1.5)
    tw = (~inhull) * sm(at_, 18, 26) * (1 - sm(at_, 115, 125)) * sm(z, ze - 0.002, ze + 0.002) * (z < brim + 0.002) * ~tc_
    w = np.maximum(w, tw)
# colour: reference hair (5_head_closeup) mid-tone, with the old texture's low-frequency shading
ref = np.array([float(x) for x in os.environ.get('HREF', '76,55,46').split(',')], np.float32); col = col * (ref / np.median(S.reshape(-1, 3), 0))
shade = np.clip((lum / np.median(lum[w > 0.5])) ** 0.35, 0.75, 1.2) if (w > 0.5).any() else 1
col = col * shade[:, None]
O = T.copy(); O[ys, xs] = T[ys, xs] * (1 - w[:, None]) + col * w[:, None]
# lower cheeks next to the chin that neither picture covers: take the nearest painted skin in 3D (no dark smudges)
if os.environ.get('CHIN', '1') == '1':
    from scipy.spatial import cKDTree
    Pg = np.load('pmg_hi.npz')['pos'][ys, xs]; Oc = O[ys, xs]; lu = Oc.mean(1)
    at2 = np.abs(th)
    bad = (~inhull) & (at2 > 18) & (at2 < 50) & (z > float(os.environ.get('CHZ0', '0.572'))) & (z < 0.625) & (sw < 0.5) & (lu < 165) & (Oc[:, 2] < Oc[:, 0] - 10) & (np.hypot(Pg[:, 0], Pg[:, 1]) > 0.150)
    good = ((sw > 0.9) | inhull) & (lu > 165) & (Oc[:, 0] - Oc[:, 2] > 40) & (z > 0.55) & (z < 0.64) & (at2 < 60)
    if bad.any() and good.any():
        _, j = cKDTree(Pg[good]).query(Pg[bad], k=8); gi_ = np.nonzero(good)[0]
        O[ys[bad], xs[bad]] = Oc[gi_[j]].mean(1)
    print('chin fill texels', int(bad.sum()))
# side skin clean-up: dark leftovers of the side picture's inpainted profile (mouth/nose) read as smudges; lift them to the local skin tone
if os.environ.get('SKCLEAN', '1') == '1':
    from scipy.spatial import cKDTree
    Pg = np.load('pmg_hi.npz')['pos'][ys, xs]; Oc = O[ys, xs]; lu = Oc.mean(1); at2 = np.abs(th)
    zone = (~inhull) & (at2 > 15) & (at2 < 75) & (z > 0.556) & (z < 0.64) & (sw > 0.3)
    skin = zone & (Oc[:, 0] - Oc[:, 2] > 45) & (lu > 150)
    if skin.any():
        d_, j = cKDTree(Pg[skin]).query(Pg[zone], k=24); tgt = Oc[np.nonzero(skin)[0][j]].mean(1)
        cur = Oc[zone]; ratio = cur.mean(1) / np.maximum(tgt.mean(1), 1)
        a_ = (np.clip((0.88 - ratio) / 0.12, 0, 1) * sm(z[zone], 0.556, 0.574) * (1 - sm(at2[zone], 62, 75)))[:, None]
        zi = np.nonzero(zone)[0]; O[ys[zi], xs[zi]] = cur * (1 - a_) + tgt * a_
        print('skin clean texels', int((a_ > 0.5).sum()))
# the front picture's hair edge leaves a dark rim just inside the face hull along the cheeks: inpaint it from the skin inside
if os.environ.get('RIM', '1') == '1':
    import cv2
    dIn = ndimage.distance_transform_edt(FA)[ay, ax]
    Ol = O[ys, xs].mean(1); zl2 = np.interp(np.abs(th), [20, 40, 65, 90], [0.67, 0.66, 0.665, 0.675])
    rim = inhull & (dIn < float(os.environ.get('RIMW', '9'))) & (z < zl2 - 0.004) & (z > 0.55) & (np.abs(th) > 20) & (Ol < 175)
    M = np.zeros(tid.shape, np.uint8); M[ys[rim], xs[rim]] = 255; M = cv2.dilate(M, np.ones((3, 3), np.uint8))
    O8 = O.clip(0, 255).astype(np.uint8); O = cv2.inpaint(O8, M, 6, cv2.INPAINT_TELEA).astype(np.float32)
    print('rim texels', int(rim.sum()))
Image.fromarray(O.clip(0, 255).astype(np.uint8)).save(tout)
print('hair swatch texels', int((w > 0.5).sum()))
