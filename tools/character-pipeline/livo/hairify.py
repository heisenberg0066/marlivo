# side views: cheek/ear behind x=745 (sideL coords) -> hair (the Hunyuan head has hair there). Sources: cut/orig/*_nf.png
import numpy as np
from PIL import Image
from scipy import ndimage
def hairify(src, dst, mirror=False, xs=745):
    im = np.asarray(Image.open(src).convert('RGBA')).copy()
    if mirror: im = im[:, ::-1].copy()
    H, W = im.shape[:2]; yy, xx = np.mgrid[0:H, 0:W]
    reg = (yy >= 700) & (yy < 965) & (xx >= xs) & (xx < 995)
    rgb = im[..., :3].astype(float); r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = rgb.mean(-1)
    hair = (lum < 105) & (r >= b) & (im[..., 3] > 200)
    scarf = (b > r + 20) & (yy > 880)
    brim = ndimage.binary_dilation((lum > 150) & (r - b < 45) & (yy < 820), iterations=3)
    m = reg & ~hair & (im[..., 3] > 100) & ~scarf & ~brim
    m = ndimage.binary_dilation(ndimage.binary_closing(m, iterations=3), iterations=4) & reg & ~scarf & ~brim
    acc = np.zeros_like(rgb); wt = np.zeros((H, W)); acc[hair] = rgb[hair]; wt[hair] = 1
    acc = np.stack([ndimage.gaussian_filter(acc[..., c], 30) for c in range(3)], -1); wt = ndimage.gaussian_filter(wt, 30)
    low = acc / np.maximum(wt[..., None], 1e-4)
    det = np.zeros_like(rgb)
    patch = rgb[860:1075, 1000:1250]; hf = patch - np.stack([ndimage.gaussian_filter(patch[..., c], 8) for c in range(3)], -1)
    det[700:700 + hf.shape[0], xs:xs + hf.shape[1]] = hf
    det[700 + hf.shape[0]:965, xs:xs + hf.shape[1]] = hf[:965 - 700 - hf.shape[0]]
    fill = np.clip(low + det, 0, 255)
    ramp = np.clip((xx - xs) / 25, 0, 1)
    soft = ndimage.gaussian_filter(m.astype(float), 3) * ramp
    out = rgb * (1 - soft[..., None]) + fill * soft[..., None]
    res = im.copy(); res[..., :3] = out.clip(0, 255).astype(np.uint8)
    if mirror: res = res[:, ::-1]
    Image.fromarray(res).save(dst)
C = '/workspace/sb/gen8/cut/'
hairify(C + 'orig/beanie_sideL_nf.png', C + 'beanie_sideL.png')
hairify(C + 'orig/beanie_sideR_nf.png', C + 'beanie_sideR.png', mirror=True, xs=690)
print('hairified')
