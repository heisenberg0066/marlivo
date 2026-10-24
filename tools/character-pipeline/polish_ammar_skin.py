import numpy as np
from PIL import Image, ImageFilter

im = Image.open('/tmp/ammar_base_tex.webp').convert('RGB')
arr = np.array(im, dtype=np.float32)
H, W, _ = arr.shape

clean = arr.copy()

# Reference clean chin skin colour around (py=1165, px=635) and shirt colour around (py=1370, px=635)
skin_ref = np.median(arr[1155:1172, 590:680], axis=(0, 1))
shirt_ref = np.median(arr[1365:1395, 580:690], axis=(0, 1))

# 1. Clean the under-chin & neck region (py=1176..1278, px=495..775)
y0, y1 = 1176, 1278
for py in range(y0, y1 + 1):
    t = (py - y0) / float(y1 - y0)
    ts = t * t * (3.0 - 2.0 * t)
    # Natural warm sub-chin shadow right under the 3D chin overhang (py=1196..1245)
    sub_chin = np.exp(-((py - 1216) / 22.0) ** 2)
    shade_rgb = np.array([1.0 - 0.16 * sub_chin, 1.0 - 0.19 * sub_chin, 1.0 - 0.22 * sub_chin], dtype=np.float32)
    for px in range(495, 776):
        px_top = min(725, max(545, px))
        top_val = arr[y0, px_top]
        # Blend smoothly from chin skin into shaded neck skin
        base_skin = (1.0 - 0.5 * ts) * top_val + (0.5 * ts) * skin_ref
        clean[py, px] = base_skin * shade_rgb

# 2. Bring the crew-neck dark t-shirt collar cleanly up to py=1268..1355 (y3D=0.692)
#    with a gentle curved crew-neck arc so no bright V-patch plunges into the chest
for py in range(1258, 1358):
    for px in range(495, 776):
        dx = (px - 635.0) / 115.0
        # Curved collar line: higher on the sides (py=1262), slightly lower at center (py=1278)
        collar_y = 1278.0 - 16.0 * min(1.0, dx * dx)
        u = np.clip((py - (collar_y - 8.0)) / 16.0, 0.0, 1.0)
        us = u * u * (3.0 - 2.0 * u)
        if us > 0.0:
            clean[py, px] = (1.0 - us) * clean[py, px] + us * shirt_ref

mask = np.zeros((H, W), dtype=np.float32)
for py in range(1182, 1352):
    for px in range(505, 766):
        mask[py, px] = 1.0

mask_img = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius=9))
mask_smooth = np.array(mask_img, dtype=np.float32)[:, :, None] / 255.0

out = (1.0 - mask_smooth) * arr + mask_smooth * clean
out_u8 = np.clip(out, 0, 255).astype(np.uint8)
im_out = Image.fromarray(out_u8)
im_out.save('/tmp/skin_ammar_natural.webp', 'WEBP', quality=95)
im_out.resize((1024, 1024), Image.Resampling.LANCZOS).save('/tmp/skin_ammar-low_natural.webp', 'WEBP', quality=95)
print("Updated /tmp/skin_ammar_natural.webp and /tmp/skin_ammar-low_natural.webp with clean sub-chin shade and crew-neck collar")
