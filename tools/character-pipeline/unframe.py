# unframe.py in.png out.png : remove the faint trace of the old painted frames around the lenses (skin pixels in a band around
# each superellipse rim are replaced by a normalized-convolution blur of the band-free surroundings; dark lines/eyes kept)
import sys, json, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
src, dst = sys.argv[1], sys.argv[2]
spec = json.load(open('/workspace/tools/spec_ammar_hy12.json'))['unglass']
im = np.asarray(Image.open(src).convert('RGBA')).astype(np.float32) / 255; H, W = im.shape[:2]
rgb = im[:, :, :3]; lum = rgb @ np.array([0.299, 0.587, 0.114])
yy, xx = np.mgrid[0:H, 0:W]; u = (xx + 0.5) / W; v = (yy + 0.5) / H
band = np.zeros((H, W), np.float32)
for rm in spec['rims']:
    (cu, cv), (ru, rv), n = rm['c'], rm['r'], rm['n']
    rho = (np.abs((u - cu) / ru) ** n + np.abs((v - cv) / rv) ** n) ** (1 / n)
    band = np.maximum(band, np.clip((1.32 - rho) / 0.12, 0, 1))
skin_ref = np.median(rgb[(band > 0.5)], 0)
sk_l = skin_ref @ np.array([0.299, 0.587, 0.114])
from scipy.ndimage import binary_dilation
    
keep = binary_dilation((lum < sk_l * 0.8) | (rgb[:, :, 2] > rgb[:, :, 0] * 0.8), iterations=14)  # eyes/lashes/brows/whites (+margin): keep
m = (band > 0) & ~keep
wgt = (~m).astype(np.float32) * (lum > sk_l * 0.72)
sig = 34
num = np.stack([gaussian_filter(rgb[:, :, c] * wgt, sig) for c in range(3)], 2); den = gaussian_filter(wgt, sig)[:, :, None]
blur = num / np.maximum(den, 1e-4)
a = gaussian_filter((band * m).astype(np.float32), 4)[:, :, None]
out = rgb * (1 - a) + blur * a
o = im.copy(); o[:, :, :3] = out
Image.fromarray((np.clip(o, 0, 1) * 255 + 0.5).astype(np.uint8)).save(dst); print('unframe', int(m.sum()), skin_ref)
