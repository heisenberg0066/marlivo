import struct, math, numpy as np
from PIL import Image, ImageFilter

def load_mesh2(path):
    buf = open(path, 'rb').read()
    nV, nI = struct.unpack_from('<II', buf, 0)
    off = 8
    pos = np.frombuffer(buf, dtype=np.float32, count=nV*3, offset=off).reshape(nV, 3); off += nV*12
    nrm = np.frombuffer(buf, dtype=np.float32, count=nV*3, offset=off).reshape(nV, 3); off += nV*12
    uv = np.frombuffer(buf, dtype=np.float32, count=nV*2, offset=off).reshape(nV, 2); off += nV*8
    idx = np.frombuffer(buf, dtype=np.uint32, count=nI, offset=off).reshape(-1, 3)
    return pos, nrm, uv, idx

def ss(x, a, b):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)

def blur_rgb(arr, radius):
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode='RGB')
    return np.asarray(im.filter(ImageFilter.GaussianBlur(radius=float(radius))), dtype=np.float32)

yaw = math.radians(15.0)
FWD = np.array([math.sin(yaw), 0.0, math.cos(yaw)], dtype=np.float32)
RIGHT = np.array([math.cos(yaw), 0.0, -math.sin(yaw)], dtype=np.float32)

# Warm, natural light-tan / warm-olive palette matched to ref_ammar_avatar.png:
# Shadows are warm golden-tan (never grey/muddy/dark), midtones are warm light-tan, highlights are soft warm peach-tan.
SKIN_SHADOW = np.array([216.0, 146.0, 104.0], dtype=np.float32)
SKIN_MID    = np.array([233.0, 160.0, 115.0], dtype=np.float32)
SKIN_HIGH   = np.array([245.0, 173.0, 127.0], dtype=np.float32)
SKIN_OLD_FADE = np.array([188.0, 118.0, 83.0], dtype=np.float32)

for name in ['ammar', 'ammar-low']:
    pos, nrm, uv, idx = load_mesh2(f'/tmp/mesh2_{name}.bin')
    im = Image.open(f'/tmp/skin_{name}.webp').convert('RGB')
    W, H = im.size
    rgb = np.asarray(im, dtype=np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    rb = r - b
    rg = r - g

    # Tight UV mask ONLY on actual mustache, goatee, eyebrows, and lashes (so eye sockets, nose bridge, and jawline shadows are NOT blocked!)
    G = 512
    fh_map = np.zeros((G, G), dtype=np.float32)
    s_fwd = pos @ FWD
    s_lat = np.abs(pos @ RIGHT)
    y = pos[:, 1]
    v_fh = (s_fwd > 0.065) & (
        ((y > 0.704) & (y < 0.734) & (s_lat < 0.038)) |  # goatee
        ((y > 0.748) & (y < 0.768) & (s_lat < 0.036)) |  # mustache
        ((y > 0.836) & (y < 0.862) & (s_lat > 0.015) & (s_lat < 0.064)) |  # eyebrows
        ((y > 0.800) & (y < 0.828) & (s_lat > 0.018) & (s_lat < 0.058))    # eyelashes / iris / pupil
    )
    ux = np.clip((uv[v_fh, 0] * G).astype(int), 0, G - 1)
    uy = np.clip((uv[v_fh, 1] * G).astype(int), 0, G - 1)
    fh_map[uy, ux] = 1.0
    fh_im = Image.fromarray((fh_map * 255).astype(np.uint8), mode='L')
    fh_im = fh_im.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(radius=1.8))
    fh_im = fh_im.resize((W, H), Image.BILINEAR)
    w_fh = np.asarray(fh_im, dtype=np.float32) / 255.0

    # Use R and (R - B) to detect skin (since shadowed skin on the neck/jawline/eye-sockets has R = 145..185 and R-B = 75..110,
    # whereas dark hair/goatee/brows have R < 105 and R-B < 48):
    f_chroma = ss(rb, 16.0, 78.0) * ss(rg, 10.0, 48.0) * (1.0 - ss(b - (r - 28.0), 0.0, 22.0))
    r_lo = 62.0 + w_fh * 76.0   # outside facial hair: R > 62..125; inside mustache/goatee/brows: R > 138..178
    r_hi = 125.0 + w_fh * 53.0
    f_red = ss(r, r_lo, r_hi)
    f = f_chroma * f_red

    # Map skin onto [SKIN_SHADOW, SKIN_MID, SKIN_HIGH] with high-shadow lift so jawline, eye-sockets, and ears are warm & clean:
    u = np.clip((r - 140.0) / (230.0 - 140.0), 0.0, 1.0) ** 0.50
    w_hi = np.clip((u - 0.58) / 0.42, 0.0, 1.0)[..., None]
    w_mid = np.clip(u / 0.58, 0.0, 1.0)[..., None]
    skin_target = SKIN_SHADOW * (1.0 - w_mid) + SKIN_MID * w_mid
    skin_target = skin_target * (1.0 - w_hi) + SKIN_HIGH * w_hi

    # Preserve 25% of local fine detail
    sm_rgb = blur_rgb(rgb, 3.0 * (W / 1024.0))
    detail = np.clip((rgb - sm_rgb) * 0.25, -8.0, 8.0)
    skin_target = np.clip(skin_target + detail, 0.0, 255.0)

    w_pure = ss(f, 0.45, 0.85)[..., None]
    skin_old_est = SKIN_OLD_FADE[None, None, :] * (1.0 - w_pure) + rgb * w_pure

    f_eff = (f ** (0.72 + 0.20 * w_fh))[..., None]
    rgb_new = rgb + f_eff * (skin_target - skin_old_est)

    # Crispen mustache, goatee, and eyebrow dark cores so facial hair is rich dark brown-black
    w_dark_hair = (w_fh * ss(r, 25.0, 50.0) * (1.0 - ss(r, 115.0, 148.0)) * ss(rb, 10.0, 36.0) * 0.48)[..., None]
    rgb_new = rgb_new * (1.0 - w_dark_hair) + np.array([32.0, 22.0, 18.0], dtype=np.float32) * w_dark_hair

    rgb_out = np.clip(rgb_new, 0, 255).astype(np.uint8)
    Image.fromarray(rgb_out).save(f'/tmp/skin_{name}_natural.webp', format='WEBP', quality=95)
    print(f"Saved /tmp/skin_{name}_natural.webp")
