# blender -b <name>.blend -P polish.py -- <name> '<json>' : shorten/tuck glasses temples, optional body chroma boost; saves blend + textures
import bpy, sys, json, numpy as np, mathutils
a = sys.argv[sys.argv.index('--') + 1:]; name = a[0]; C = json.loads(a[1])
import math
_src = open('/workspace/tools/bl/ears.py').read(); exec(_src[_src.index('def bake_pos'):_src.index('def paint')])
def unpaint_arm(tag, paths):  # remove the glasses arm painted into the texture from the side reference views
    ob = bpy.data.objects[f'{name}_{tag}']; mat = ob.data.materials[0]
    im = [n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and not n.image.name.endswith('_nrm')][0]
    res = im.size[0]; Pp, ok = bake_pos(ob, res); Mi = np.array(ob.matrix_world.inverted())
    px = np.array(im.pixels[:], np.float32).reshape(res, res, 4); rgb = px[:, :, :3]; lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    near = np.zeros((res, res), bool); Q = Pp.reshape(-1, 3)
    for W in paths:
        W = (np.c_[W, np.ones(len(W))] @ Mi.T)[:, :3]; W = W[np.argsort(W[:, 1])]
        y0, y1 = W[0, 1] + C.get('arm_skip', 0.01), W[-1, 1] + C.get('arm_back', 0.01)
        zc = np.interp(Q[:, 1], W[:, 1], W[:, 2]); xc = np.interp(Q[:, 1], W[:, 1], W[:, 0])
        d = np.sqrt(((Q[:, 2] - zc) / C.get('arm_tz', 0.016)) ** 2 + ((Q[:, 0] - xc) / C.get('arm_tx', 0.03)) ** 2)
        print('DBG W', W.min(0).round(3), W.max(0).round(3), 'Q', Q[ok.ravel()].min(0).round(3), Q[ok.ravel()].max(0).round(3), 'near_d', int((d<1).sum()), 'yrange', int(((Q[:, 1] > y0) & (Q[:, 1] < y1)).sum()))
        near |= ((d < 1) & (np.sign(Q[:, 0]) == np.sign(W[:, 0].mean())) & (Q[:, 1] > y0) & (Q[:, 1] < y1)).reshape(res, res)
    near &= ok; sig = C.get('arm_sig', 6) * res / 4096
    loc = gaussian_filter(lum * ok, sig * 3) / np.maximum(gaussian_filter(ok.astype(np.float32), sig * 3), 1e-3)
    dark = near & (lum < loc * C.get('arm_dark', 0.7))
    if 'arm_gray' in C:  # painted arm: dark, unsaturated (the fur round it is saturated brown/beige)
        sat = rgb.max(2) - rgb.min(2); dark |= near & (lum < C['arm_gray'][0]) & (sat < C['arm_gray'][1])
    m = gaussian_filter(dark.astype(np.float32), max(1.0, C.get('arm_grow', 1.2) * res / 4096 * 4)) > 0.1
    wgt = (ok & ~m).astype(np.float32); num = np.stack([gaussian_filter(rgb[:, :, c] * wgt, sig) for c in range(3)], 2)
    fill = num / np.maximum(gaussian_filter(wgt, sig), 1e-4)[..., None]; al = gaussian_filter(m.astype(np.float32), 1.0)[..., None]
    px[:, :, :3] = rgb * (1 - al) + fill * al
    im.pixels.foreach_set(px.ravel()); im.update(); im.filepath_raw = bpy.path.abspath(im.filepath); im.file_format = 'PNG'; im.save()
    print('POLISH unpaint arm', tag, int(near.sum()), 'near', int(m.sum()), 'filled')
for tag in ('hi', 'lo'):
    paths = []
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.name.startswith(f'{name}_{tag}_temple') or 'temple_vis' not in C: continue
        M = o.matrix_world; Mi = M.inverted(); W = np.array([M @ v.co for v in o.data.vertices]); paths.append(W.copy())
        y0 = W[:, 1].min(); L = C['temple_vis']; cx = C.get('cx', 0.0)
        for v, w in zip(o.data.vertices, W):
            dy = w[1] - y0
            if dy > L:  # tuck: past L the arm dives into the head (towards the centre line), hidden in the fur
                k = min(1.0, (dy - L) / C.get('dive', 0.02)); w = w.copy()
                w[0] = w[0] - np.sign(w[0] - cx) * C.get('inset', 0.03) * k
            v.co = Mi @ mathutils.Vector(w)
        o.data.update(); print('POLISH temple', o.name, len(W), 'len %.3f -> %.3f' % (W[:, 1].max() - y0, L))
    if C.get('unpaint_arm') and paths: unpaint_arm(tag, paths)
    if 'chroma' in C:
        ob = bpy.data.objects[f'{name}_{tag}']; mat = ob.data.materials[0]
        im = [n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and not n.image.name.endswith('_nrm')][0]
        res = im.size[0]; px = np.array(im.pixels[:], np.float32).reshape(-1, 4); rgb = px[:, :3]
        lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
        body = (rgb[:, 1] >= rgb[:, 0] - 0.01) & (lum > 0.25) & (lum < 0.9) & (rgb[:, 0] - rgb[:, 2] < 0.12)
        dev = rgb - lum[:, None]; new = lum[:, None] * C.get('dark', 1.0) + dev * C['chroma'] + np.array(C.get('tint', [0, 0, 0]), np.float32)
        rgb[body] = np.clip(new[body], 0, 1); px[:, :3] = rgb
        im.pixels.foreach_set(px.ravel()); im.update(); im.filepath_raw = bpy.path.abspath(im.filepath); im.file_format = 'PNG'; im.save()
        print('POLISH chroma', tag, int(body.sum()), 'of', len(body))
bpy.ops.wm.save_mainfile(); print('POLISH done')
