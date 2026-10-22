# python tsr_carve.py <name> <res> [dilate_px]
import sys, json, math, numpy as np, torch, mcubes, trimesh
sys.path.insert(0, '/workspace/tools/TripoSR')
from tsr.system import TSR
from tsr.utils import scale_tensor
from PIL import Image
from scipy import ndimage
name, res = sys.argv[1], int(sys.argv[2]); dil = int(sys.argv[3]) if len(sys.argv) > 3 else 3
sc, tx, ty = json.load(open('/workspace/tools/fit.json'))[name]
model = TSR.from_pretrained('stabilityai/TripoSR', config_name='config.yaml', weight_name='model.ckpt')
model.renderer.set_chunk_size(8192); model.to('cpu')
img = Image.open(f'/workspace/tools/in/{name}_prep.png').convert('RGB')
with torch.no_grad(): codes = model([img], device='cpu')
R = model.renderer.cfg.radius
lin = np.linspace(-R, R, res, dtype=np.float32)
X, Y, Z = np.meshgrid(lin, lin, lin, indexing='ij')
pts = np.stack([X, Y, Z], -1).reshape(-1, 3)
dens = []
with torch.no_grad():
    for i in range(0, len(pts), 2_000_000):
        dens.append(model.renderer.query_triplane(model.decoder, torch.from_numpy(pts[i:i + 2_000_000]), codes[0])['density_act'].numpy().reshape(-1))
dens = np.concatenate(dens)
# visual-hull carve with the reference silhouette
mask = np.array(Image.open(f'/workspace/tools/in/{name}_mask.png').convert('L').resize((512, 512))) > 128
clo = int(sys.argv[4]) if len(sys.argv) > 4 else 0
if clo: mask = ndimage.binary_closing(np.pad(mask, clo), iterations=clo)[clo:-clo, clo:-clo]
if dil > 0: mask = ndimage.binary_dilation(mask, iterations=dil)
tn = math.tan(math.radians(20))
bx, by, bz = pts[:, 1], -pts[:, 0], pts[:, 2]
d = by + 1.9
px = (bx / (d * tn) + 1) / 2 * 512; py = (1 - (bz / (d * tn) + 1) / 2) * 512
occ = dens > 25
sil = np.zeros((512, 512), bool)
sil[np.clip(py[occ].astype(int), 0, 511), np.clip(px[occ].astype(int), 0, 511)] = True
sil = ndimage.binary_closing(sil, iterations=2)
m0 = np.array(Image.open(f'/workspace/tools/in/{name}_mask.png').convert('L').resize((512, 512))) > 128
best = (0, None)
for sc_ in np.linspace(0.8, 1.25, 46):
    for tx_ in range(-6, 7, 2):
        for ty_ in range(-6, 7, 2):
            mat = np.eye(2) / sc_; off = np.array([256, 256]) - mat @ (np.array([256, 256]) + np.array([ty_, tx_]))
            w = ndimage.affine_transform(sil.astype(float), mat, offset=off, order=0) > 0.5
            iou = (w & m0).sum() / (w | m0).sum()
            if iou > best[0]: best = (iou, (sc_, tx_, ty_))
print('FIT', best)
sc, tx, ty = best[1]
fits = json.load(open('/workspace/tools/fit.json')); fits[name] = [float(x) for x in best[1]]; json.dump(fits, open('/workspace/tools/fit.json', 'w'))
qx = np.clip(np.round(256 + sc * (px - 256) + tx), 0, 511).astype(int); qy = np.clip(np.round(256 + sc * (py - 256) + ty), 0, 511).astype(int)
sd = ndimage.distance_transform_edt(mask) - ndimage.distance_transform_edt(~mask)  # signed px distance, + inside
fac = 1 / (1 + np.exp(-(sd[qy, qx] + 0.5) / 1.2))
print('carved', (dens > 25).sum(), '->', ((dens * fac) > 25).sum())
dens = (dens * fac).reshape(res, res, res)
dens = ndimage.gaussian_filter(dens, 0.9)
v, f = mcubes.marching_cubes(dens, 25.0)
v = v / (res - 1) * 2 * R - R
with torch.no_grad():
    col = model.renderer.query_triplane(model.decoder, torch.from_numpy(v.astype(np.float32)), codes[0])['color'].numpy()
m = trimesh.Trimesh(vertices=v, faces=f, vertex_colors=(np.clip(col, 0, 1) * 255).astype(np.uint8), process=False)
m.export(f'/workspace/tools/carve_{name}.obj')
print('verts', len(v), 'faces', len(f))
