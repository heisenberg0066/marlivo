# python unglass.py <in_fill.png> <out.png> <spec.json> [dbg.png]
# Paints the thin glasses rims out of a frontal picture (the 3D glasses are modelled separately):
# trace each rim radially around its fitted ellipse (thin-line response), smooth the trace, inpaint a thin band.
import sys, json, numpy as np, cv2
src, dst, spec = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3]))
spec = spec.get('unglass', spec['glasses']); BAND = spec.get('band', 1.0)
im = cv2.imread(src); H, W = im.shape[:2]; F = W / 1152; g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(9 * F) | 1, int(9 * F) | 1))
resp = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, k) + 0.7 * cv2.morphologyEx(g, cv2.MORPH_TOPHAT, k)
resp = cv2.GaussianBlur(resp, (3, 3), 0)
mask = np.zeros((H, W), np.uint8)
for rm in spec['rims']:
    (cu, cv_), (ru, rv) = rm['c'], rm['r']; cx, cy, rx, ry = cu * W, cv_ * H, ru * W, rv * H
    ne = rm.get('n', 2.0)  # superellipse exponent (2 = ellipse, ~3 = rounded square)
    angs = np.linspace(0, 2 * np.pi, 180, endpoint=False); offs = np.arange(-0.1, 0.105, 0.005); best = []
    ca, sa = np.cos(angs), np.sin(angs); rr = 1 / (np.abs(ca) ** ne + np.abs(sa) ** ne) ** (1 / ne)
    for a, c_, s_, r_ in zip(angs, ca, sa, rr):
        sc = [resp[int(np.clip(cy + (1 + o) * r_ * ry * s_, 0, H - 1)), int(np.clip(cx + (1 + o) * r_ * rx * c_, 0, W - 1))] for o in offs]
        best.append(offs[int(np.argmax(sc))])
    best = np.array(best); n = len(best)
    sm = np.array([np.median(np.take(best, range(i - 9, i + 10), mode='wrap')) for i in range(n)])
    pts = np.stack([cx + (1 + sm) * rr * rx * ca, cy + (1 + sm) * rr * ry * sa], 1).astype(np.int32)
    cv2.polylines(mask, [pts], True, 255, int(11 * F * BAND))
b = spec['bridge']; cv2.polylines(mask, [np.array([[p[0] * W, p[1] * H] for p in b], np.int32)], False, 255, int(13 * F * BAND))
for t, rm in zip(spec['temples'], spec['rims']):  # short piece from the rim to the temple end
    c = rm['c']; dx = 0.03 if t[0] < c[0] else -0.03
    cv2.line(mask, (int(t[0] * W), int(t[1] * H)), (int((t[0] + dx) * W), int(t[1] * H)), 255, int(13 * F))
for pd in spec.get('pads', []): cv2.circle(mask, (int(pd[0] * W), int(pd[1] * H)), int(9 * F), 255, -1)
out = cv2.inpaint(im, mask, int(5 * F), cv2.INPAINT_TELEA)
cv2.imwrite(dst, out)
if len(sys.argv) > 4:
    x0, x1, y0, y1 = int(0.32 * W), int(0.68 * W), int(0.17 * H), int(0.27 * H)
    dbg = np.concatenate([im[y0:y1, x0:x1], cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)[y0:y1, x0:x1], out[y0:y1, x0:x1]], 0)
    cv2.imwrite(sys.argv[4], dbg)
