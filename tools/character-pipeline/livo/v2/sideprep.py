import numpy as np, cv2
from PIL import Image
im = np.asarray(Image.open('side_left.jpg').convert('RGB')).astype(np.int32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
bg = (b > 200) & (b - r > 40) & (g > 170)  # light blue sky
fg = ~bg
fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
skin = (r > 200) & (g > 150) & (r - b > 25) & (r - b < 110) & (r - g < 70)
H, W = r.shape; yy, xx = np.mgrid[0:H, 0:W]
box = (((xx > 330) & (xx < 425) & (yy > 405) & (yy < 455)) | ((xx > 330) & (xx < 440) & (yy > 455) & (yy < 570)) | ((xx < 385) & (yy > 530) & (yy < 670))) & fg
bad = box & ~skin
bad = cv2.dilate(bad.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
bad &= box | (cv2.dilate(box.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0)
bad &= ~((b > r + 20) & (yy > 640))  # never paint over the scarf
out = cv2.inpaint(im.astype(np.uint8), bad.astype(np.uint8), 12, cv2.INPAINT_TELEA)
out = np.dstack([out, (fg * 255).astype(np.uint8)])
Image.fromarray(out).save('side_left_nf.png')
v = out[..., :3].copy(); v[bad] = (v[bad] * 0.5 + [0, 0, 120]).astype(np.uint8)
Image.fromarray(v).resize((512, 512)).save('/tmp/lk/sidenf.png')
