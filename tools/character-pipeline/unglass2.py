# python unglass2.py <in_fill.png> <out.png> <spec.json> <thick_frac> [dbg.png]
# Round dark rims (animals): per angle, take the darkest radius within +-18% of the fitted circle, smooth the trace,
# inpaint a band of the rim thickness (thick_frac = rim thickness / image width) plus margin; bridge + temple stubs too.
import sys, json, numpy as np, cv2
src, dst, spec, tf = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3]))['glasses'], float(sys.argv[4])
im = cv2.imread(src); H, W = im.shape[:2]; g = cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), W * tf * 0.25)
th = int(W * tf * 1.9) | 1; mask = np.zeros((H, W), np.uint8)
for rm in spec['rims']:
    cx, cy, rx, ry = rm['c'][0] * W, rm['c'][1] * H, rm['r'][0] * W, rm['r'][1] * H
    angs = np.linspace(0, 2 * np.pi, 240, endpoint=False); offs = np.linspace(-0.18, 0.18, 73); best = []
    for a in angs:
        sc = [g[int(np.clip(cy + (1 + o) * ry * np.sin(a), 0, H - 1)), int(np.clip(cx + (1 + o) * rx * np.cos(a), 0, W - 1))] for o in offs]
        best.append(offs[int(np.argmin(sc))])
    best = np.array(best); sm = np.array([np.median(np.take(best, range(i - 7, i + 8), mode='wrap')) for i in range(len(best))])
    pts = np.stack([cx + (1 + sm) * rx * np.cos(angs), cy + (1 + sm) * ry * np.sin(angs)], 1).astype(np.int32)
    cv2.polylines(mask, [pts], True, 255, th); print('rim', rm['c'], 'mean off', round(float(sm.mean()), 3))
b = spec['bridge']; cv2.polylines(mask, [np.array([[p[0] * W, p[1] * H] for p in b], np.int32)], False, 255, th)
for t, rm in zip(spec['temples'], spec['rims']):
    dx = 0.035 if t[0] < rm['c'][0] else -0.035
    cv2.line(mask, (int((t[0] - dx) * W), int(t[1] * H)), (int((t[0] + dx) * W), int(t[1] * H)), 255, th)
out = cv2.inpaint(im, mask, int(W * tf * 2), cv2.INPAINT_TELEA); cv2.imwrite(dst, out)
if len(sys.argv) > 5:
    y0, y1 = int(0.2 * H), int(0.38 * H); cv2.imwrite(sys.argv[5], cv2.resize(np.concatenate([im[y0:y1], out[y0:y1]], 0), None, fx=0.3, fy=0.3))
