# blender -b -P build.py -- <name> <src.obj> <proj.png> <back.png|vc> <sc> <tx> <ty> <tris_hi> <tris_lo> <outdir>
import bpy, bmesh, sys, math, json, mathutils, numpy as np
from mathutils.bvhtree import BVHTree
argv = sys.argv[sys.argv.index('--') + 1:]
name, src, proj, back = argv[0:4]; sc, tx, ty = map(float, argv[4:7]); tris_hi, tris_lo = int(argv[7]), int(argv[8]); outdir = argv[9]
extra = json.loads(argv[10]) if len(argv) > 10 else {}
BBOX = json.load(open('/workspace/tools/bbox.json'))[name]
LAYOUT = 'col' if (BBOX[1] - BBOX[0]) < (BBOX[3] - BBOX[2]) else 'row'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=src, forward_axis='Y', up_axis='Z')
src_o = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]
src_o.name = name + '_src'
src_o.rotation_euler = (0, 0, math.radians(-90))
bpy.context.view_layer.objects.active = src_o; src_o.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
me = src_o.data
# --- keep the biggest connected piece(s)
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
seen = set(); parts = []
for v in bm.verts:
    if v.index in seen: continue
    stack = [v]; comp = []; seen.add(v.index)
    while stack:
        x = stack.pop(); comp.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen: seen.add(y.index); stack.append(y)
    parts.append(comp)
parts.sort(key=len, reverse=True)
keep_frac = extra.get('keep_frac', 0.5)
kill = [v for p in parts[1:] if len(p) < keep_frac * len(parts[0]) for v in p]
print('PARTS', [len(p) for p in parts[:6]], 'removing', len(kill))
# optional: delete verts by a box (e.g. a ground blob) [xmin,xmax,ymin,ymax,zmin,zmax]
for bx in extra.get('cut_boxes', []):
    kill += [v for v in bm.verts if bx[0] <= v.co.x <= bx[1] and bx[2] <= v.co.y <= bx[3] and bx[4] <= v.co.z <= bx[5]]
bmesh.ops.delete(bm, geom=list(set(kill)), context='VERTS')
bm.to_mesh(me); bm.free()
if extra.get('smooth', 0):
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    E = np.zeros(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
    deg = np.bincount(E.ravel(), minlength=len(co)).astype(float)[:, None] + 1e-9
    def lap(c):
        acc = np.zeros_like(c); np.add.at(acc, E[:, 0], c[E[:, 1]]); np.add.at(acc, E[:, 1], c[E[:, 0]])
        return acc / deg - c
    lam, mu = extra.get('smooth_l', 0.5), -0.53
    for _ in range(extra['smooth']):
        co = co + lam * lap(co); co = co + mu * lap(co)
    me.vertices.foreach_set('co', co.ravel()); me.update()
    print('SMOOTHED', extra['smooth'])
if extra.get('face'):
    fz = extra['face']  # {"z": [z0, z1] in fraction of height, "iters": n}
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    nr = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', nr); nr = nr.reshape(-1, 3)
    E = np.zeros(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
    deg = np.bincount(E.ravel(), minlength=len(co)).astype(float)[:, None] + 1e-9
    def lap(c):
        acc = np.zeros_like(c); np.add.at(acc, E[:, 0], c[E[:, 1]]); np.add.at(acc, E[:, 1], c[E[:, 0]])
        return acc / deg - c
    im = bpy.data.images.load(proj); W, H = im.size; px = np.array(im.pixels[:]).reshape(H, W, 4)[::-1]
    tn = math.tan(math.radians(20)); d = co[:, 1] + 1.9
    qx = 256 + sc * ((co[:, 0] / (d * tn) + 1) / 2 * 512 - 256) + tx; qy = 256 + sc * ((1 - (co[:, 2] / (d * tn) + 1) / 2) * 512 - 256) + ty
    ix = np.clip((qx / 512 * W).astype(int), 0, W - 1); iy = np.clip((qy / 512 * H).astype(int), 0, H - 1)
    c = px[iy, ix, :3]
    skin = (c[:, 0] > 0.55) & (c[:, 0] - c[:, 2] > 0.12) & (c[:, 1] > 0.35)
    zmin, zmax = co[:, 2].min(), co[:, 2].max(); zf = (co[:, 2] - zmin) / (zmax - zmin)
    sel = skin & (zf > fz['z'][0]) & (zf < fz['z'][1]) & (-nr[:, 1] > 0.0)
    wgt = sel.astype(float)[:, None]
    for _ in range(4): wgt = np.clip(wgt + lap(wgt) * 0.8, 0, 1)
    print('FACE verts', int(sel.sum()))
    for _ in range(fz.get('lap', 0)): co = co + wgt * 0.5 * lap(co)
    for _ in range(fz.get('iters', 40)):
        co = co + wgt * 0.5 * lap(co); co = co + wgt * -0.52 * lap(co)
    me.vertices.foreach_set('co', co.ravel()); me.update()
def vlap_setup(me):
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    E = np.zeros(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
    deg = np.bincount(E.ravel(), minlength=len(co)).astype(float)[:, None] + 1e-9
    def lap(c):
        acc = np.zeros_like(c); np.add.at(acc, E[:, 0], c[E[:, 1]]); np.add.at(acc, E[:, 1], c[E[:, 0]])
        return acc / deg - c
    return co, lap
def vcol_np(me):
    ca = [c for c in me.color_attributes if c.domain == 'POINT']
    if not ca: return np.full((len(me.vertices), 3), 0.5)
    a = np.zeros(len(me.vertices) * 4); ca[0].data.foreach_get('color', a); return a.reshape(-1, 4)[:, :3]
if extra.get('hair'):
    hz = extra['hair']  # {"z": zfrac where hair starts, "lum": max vc luminance, "top": [z0, k], "curl": [radius, amp, n]}
    co, lap = vlap_setup(me); zmin, zmax = co[:, 2].min(), co[:, 2].max(); H_ = zmax - zmin; zf = (co[:, 2] - zmin) / H_
    vc = vcol_np(me); lum = vc @ np.array([0.3, 0.59, 0.11])
    hw = ((zf > hz['z']) & (lum < hz.get('lum', 0.3))).astype(float)[:, None]
    for _ in range(6): hw = np.clip(hw + lap(hw) * 0.8, 0, 1)
    if 'top' in hz:  # a less bulky top: squash everything above z0
        z0, k = hz['top']; above = np.clip((zf - z0) / (1 - z0), 0, 1)
        co[:, 2] = np.where(zf > z0, zmin + (z0 + (zf - z0) * k) * H_, co[:, 2])
    if 'side' in hz:  # tidy faded sides: pull the lower hair in toward the head's vertical axis
        s0, s1, k = hz['side']; cxh = np.median(co[zf > 0.8, 0]); cyh = np.median(co[zf > 0.8, 1])
        band = np.clip((s1 - zf) / (s1 - s0), 0, 1) * (zf > s0 - 0.02) * hw[:, 0]
        co[:, 0] = cxh + (co[:, 0] - cxh) * (1 - k * band); co[:, 1] = cyh + (co[:, 1] - cyh) * (1 - 0.5 * k * band)
    if 'curl' in hz:  # curl clumps: a dome per random seed on the hair surface
        r, amp, n = hz['curl']; r *= H_; amp *= H_
        me.vertices.foreach_set('co', co.ravel()); me.update()
        nr = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', nr); nr = nr.reshape(-1, 3)
        cz0 = hz.get('curl_z', 0.0); cw = hw[:, 0] * np.clip((zf - cz0) / 0.03, 0, 1) if cz0 else hw[:, 0]
        rng = np.random.default_rng(7); idx = np.where(cw > 0.5)[0]
        seeds = co[rng.choice(idx, size=min(n, len(idx)), replace=False)]
        kd = mathutils.kdtree.KDTree(len(seeds))
        for i, p in enumerate(seeds): kd.insert(p, i)
        kd.balance(); disp = np.zeros(len(co))
        for i in np.where(cw > 0.01)[0]:
            _, _, dist = kd.find(co[i]); t = dist / r
            disp[i] = amp * max(0.0, 1 - t * t) ** 0.5 * cw[i]
        co = co + nr * disp[:, None]
        for _ in range(2): co = co + 0.3 * lap(co) * hw
    me.vertices.foreach_set('co', co.ravel()); me.update()
    ha = me.color_attributes.new('hairw', 'FLOAT_COLOR', 'POINT')
    hv = np.repeat(hw, 4, axis=1); hv[:, 3] = 1; ha.data.foreach_set('color', hv.ravel())
    print('HAIR verts', int((hw > 0.5).sum()))
# --- normalise: feet (min z) at 0, centred in x/y, height 1
bb = [mathutils.Vector(c) for c in src_o.bound_box]
mn = mathutils.Vector([min(c[i] for c in bb) for i in range(3)]); mx = mathutils.Vector([max(c[i] for c in bb) for i in range(3)])
h = mx.z - mn.z
src_o.location = (-(mn.x + mx.x) / 2 / h, -(mn.y + mx.y) / 2 / h, -mn.z / h); src_o.scale = (1 / h,) * 3
bpy.context.view_layer.update(); INV = src_o.matrix_world.inverted().copy()
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.context.scene['INV'] = [list(r) for r in INV]; bpy.context.scene['FIT'] = [sc, tx, ty]
for fl in extra.get('flatten', []):  # push a lump back onto a wall: {"z": [a, b], "x": [a, b], "ymax": y}
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    m = (co[:, 2] > fl['z'][0]) & (co[:, 2] < fl['z'][1]) & (co[:, 0] > fl['x'][0]) & (co[:, 0] < fl['x'][1])
    co[:, 1] = np.where(m, np.minimum(co[:, 1], fl['ymax']), co[:, 1]); me.vertices.foreach_set('co', co.ravel()); me.update()
    print('FLATTENED', int((m & (co[:, 1] >= fl['ymax'] - 1e-6)).sum()))
print('SRC tris', sum(len(p.vertices) - 2 for p in me.polygons), 'height', h)
def load_px(path):
    im = bpy.data.images.load(path, check_existing=True); W, H = im.size
    px = np.empty(W * H * 4, dtype=np.float32); im.pixels.foreach_get(px); return px.reshape(H, W, 4)[::-1], W, H
def fit_view(co, path, deg):
    """Orthographic camera at yaw deg (0 = front, +90 = character faces image-left); fit scale/offset by silhouette IoU."""
    th = math.radians(deg); d = np.array([-math.sin(th), math.cos(th), 0.0]); r = np.array([math.cos(th), math.sin(th), 0.0])
    px, W, H = load_px(path); al = px[:, :, 3] > 0.5; ys, xs = np.where(al)
    u = co @ r; v = co[:, 2]
    top, bot = ys.min(), ys.max(); s = (bot - top) / (v.max() - v.min()); cy = bot + v.min() * s; cx = xs.mean() - u.mean() * s
    G = 4; mh, mw = H // G, W // G; m = al[:mh * G, :mw * G].reshape(mh, G, mw, G).any(axis=(1, 3))
    def sil(s_, cx_, cy_):
        gx = ((cx_ + u * s_) / G).astype(int); gy = ((cy_ - v * s_) / G).astype(int); ok = (gx >= 0) & (gx < mw) & (gy >= 0) & (gy < mh)
        g = np.zeros((mh, mw), bool); g[gy[ok], gx[ok]] = True
        g = g | np.roll(g, 1, 0) | np.roll(g, -1, 0); g = g | np.roll(g, 1, 1) | np.roll(g, -1, 1); return g
    def iou(p): g = sil(*p); return (g & m).sum() / max(1, (g | m).sum())
    best = (s, cx, cy); bi = iou(best)
    for step in (0.04, 0.02, 0.01, 0.005):
        for _ in range(8):
            imp = False
            for dd in [(1 + step, 0, 0), (1 - step, 0, 0), (1, step, 0), (1, -step, 0), (1, 0, step), (1, 0, -step)]:
                cand = (best[0] * dd[0], best[1] + dd[1] * W, best[2] + dd[2] * H); ci = iou(cand)
                if ci > bi: best, bi, imp = cand, ci, True
            if not imp: break
    s, cx, cy = best
    return dict(d=d, r=r, s=s, cx=cx, cy=cy, W=W, H=H, px=px, iou=bi)
def view_uv(F, co):
    return np.stack([(F['cx'] + (co @ F['r']) * F['s']) / F['W'], 1 - (F['cy'] - co[:, 2] * F['s']) / F['H']], 1)
FRONT = None
if 'front' in extra:  # front projection from a frontal (generated) view with an orthographic camera instead of the reference camera
    fo = extra['front']; co_ = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co_); co_ = co_.reshape(-1, 3)
    FRONT = fit_view(co_, fo['alpha'], fo.get('yaw', 0.0)); proj = fo['image']
    print('FRONT iou', round(FRONT['iou'], 3), 'fit', round(FRONT['s'], 1), round(FRONT['cx'], 1), round(FRONT['cy'], 1))
    bpy.context.scene['ORTHO'] = [fo.get('yaw', 0.0), FRONT['s'], FRONT['cx'], FRONT['cy'], FRONT['W'], FRONT['H']]
    al = FRONT['px'][:, :, 3] > 0.5; ys, xs = np.where(al)
    BBOX = [xs.min() / FRONT['W'], (xs.max() + 1) / FRONT['W'], ys.min() / FRONT['H'], (ys.max() + 1) / FRONT['H']]; LAYOUT = 'col'
    ASPECT = FRONT['W'] / FRONT['H']
    if fo.get('flat'):  # flatten modelled bumps (e.g. thick glasses) in a front box: strong local smoothing of front-facing verts
        fl = fo['flat']; co, lap = vlap_setup(me)
        nr = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', nr); nr = nr.reshape(-1, 3)
        uvf = view_uv(FRONT, co); u0, u1, v0, v1 = fl['uv']; vv = 1 - uvf[:, 1]
        dep = co @ FRONT['d']; inb = (uvf[:, 0] > u0) & (uvf[:, 0] < u1) & (vv > v0) & (vv < v1)
        front_most = dep < np.percentile(dep[inb], 50) if inb.any() else inb
        box = inb & (nr @ -FRONT['d'] > 0.0) & front_most
        wgt = box.astype(float)[:, None]
        for _ in range(6): wgt = np.clip(wgt + lap(wgt) * 0.8, 0, 1)
        for _ in range(fl.get('iters', 60)): co = co + wgt * 0.5 * lap(co)
        me.vertices.foreach_set('co', co.ravel()); me.update(); print('FLATFRONT', int(box.sum()))
else:
    ASPECT = 1.0
def project(ob, inv):
    me = ob.data
    bvh = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    cam = mathutils.Vector((0, -1.9, 0)); camL = inv.inverted() @ cam; tn = math.tan(math.radians(20))
    me.calc_loop_triangles()
    vw = np.zeros(len(me.vertices)); vuv = np.zeros((len(me.vertices), 2))
    adj = [[] for _ in me.vertices]
    for e in me.edges: a, b = e.vertices; adj[a].append(b); adj[b].append(a)
    nrm = np.array([v.normal[:] for v in me.vertices])
    for _ in range(extra.get('nsmooth', 6)): nrm = np.array([nrm[i] + nrm[adj[i]].sum(0) if adj[i] else nrm[i] for i in range(len(nrm))]); nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
    f0, f1 = extra.get('facing', [0.05, 0.35])
    if FRONT is not None:
        co = np.array([v.co[:] for v in me.vertices]); vuv[:] = view_uv(FRONT, co); fd = FRONT['d']
        a0, a1 = f0, f1
        for v in me.vertices:
            facing = float(nrm[v.index] @ -fd)
            if 'facing_hair' in extra and v.co.z > extra['facing_hair'][0]: a0, a1 = extra['facing_hair'][1:]
            elif 'facing_head' in extra and v.co.z > extra.get('head_z', 0.7): a0, a1 = extra['facing_head']
            else: a0, a1 = f0, f1
            w = min(1, max(0, (facing - a0) / (a1 - a0))); w = w * w * (3 - 2 * w)
            if w > 0 and bvh.ray_cast(v.co - mathutils.Vector(fd) * 0.003, mathutils.Vector(-fd), 10.0)[0] is not None: w = 0
            vw[v.index] = w
        mo_ = extra.get('mv', {})
        if mo_.get('head_split') is not None and mo_.get('split_front'):  # behind the split plane the side views own the head
            hz = (co[:, 2] > extra.get('head_z', 0.7)) & (co[:, 2] < mo_.get('split_ztop', 9)); dep = co @ fd; ymid = np.median(dep[hz]) + mo_['head_split']
            vw[:] = np.where(hz, vw * (1 - smoothstep(dep, ymid - 0.015 + mo_['split_front'], ymid + 0.015 + mo_['split_front'])), vw)
    for v in (me.vertices if FRONT is None else []):
        p = inv @ v.co; d = p.y + 1.9
        px = (p.x / (d * tn) + 1) / 2 * 512; py = (1 - (p.z / (d * tn) + 1) / 2) * 512
        qx = 256 + sc * (px - 256) + tx; qy = 256 + sc * (py - 256) + ty
        vuv[v.index] = (qx / 512, 1 - qy / 512)
        facing = -nrm[v.index][1]
        a0, a1 = (extra['facing_head'] if 'facing_head' in extra and v.co.z > extra.get('head_z', 0.7) else (f0, f1))
        w = min(1, max(0, (facing - a0) / (a1 - a0))); w = w * w * (3 - 2 * w)
        if w > 0:
            pw = v.co; dirc = (camL - pw); dist = dirc.length; dirc.normalize()
            hit = bvh.ray_cast(pw + dirc * 0.003, dirc, dist)
            if hit[0] is not None: w = 0
        vw[v.index] = w
    for _ in range(3): vw = np.array([(vw[i] * 2 + sum(vw[j] for j in adj[i])) / (2 + len(adj[i])) for i in range(len(vw))])
    uvl = me.uv_layers.new(name='proj')
    for l in me.loops: uvl.data[l.index].uv = vuv[l.vertex_index]
    wa = me.color_attributes.new('frontw', 'FLOAT_COLOR', 'POINT')
    for i, w in enumerate(vw): wa.data[i].color = (w, w, w, 1)
    vc_name = [c.name for c in me.color_attributes if c.name not in ('frontw', 'hairw') and not c.name.startswith('mvw')][0]
    mvinfo = multiview(ob, me, bvh, nrm, adj, vw, vuv) if 'mv' in extra else []

    # --- material: mix(back, projected image, w) -> emission (for baking)
    mat = bpy.data.materials.new('projmix'); mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'proj'
    img = nt.nodes.new('ShaderNodeTexImage'); img.image = bpy.data.images.load(proj); img.extension = 'EXTEND'; img.interpolation = 'Cubic'
    nt.links.new(uvn.outputs[0], img.inputs[0])
    wn = nt.nodes.new('ShaderNodeVertexColor'); wn.layer_name = 'frontw'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    N = nt.nodes.new; L = nt.links.new
    def mth(op, a, b=None, clamp=False):
        n = N('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for k, x in enumerate((a, b)):
            if x is None: continue
            if isinstance(x, (int, float)): n.inputs[k].default_value = x
            else: L(x, n.inputs[k])
        return n.outputs[0]
    def mixc(f, a, b):
        n = N('ShaderNodeMix'); n.data_type = 'RGBA'
        for sock, x in ((n.inputs['Factor'], f), (n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(x, (int, float)): sock.default_value = x
            elif isinstance(x, (list, tuple)): sock.default_value = (*x, 1)
            else: L(x, sock)
        return n.outputs[2]
    def ramp(x, a, b):  # smoothstep(a, b, x)
        n = N('ShaderNodeMapRange'); n.interpolation_type = 'SMOOTHSTEP'; L(x, n.inputs[0]); n.inputs[1].default_value = a; n.inputs[2].default_value = b
        return n.outputs[0]
    def hsv(c, sat, val):
        n = N('ShaderNodeHueSaturation'); n.inputs['Saturation'].default_value = sat; n.inputs['Value'].default_value = val; L(c, n.inputs['Color']); return n.outputs[0]
    vcn = N('ShaderNodeVertexColor'); vcn.layer_name = vc_name
    lumn = N('ShaderNodeRGBToBW'); L(vcn.outputs[0], lumn.inputs[0]); lum = lumn.outputs[0]
    tc = N('ShaderNodeTexCoord'); sxyz = N('ShaderNodeSeparateXYZ'); L(tc.outputs['Object'], sxyz.inputs[0]); Z = sxyz.outputs[2]; Y = sxyz.outputs[1]
    if back == 'vc':
        bcol = vcn.outputs[0]
        if extra.get('vc_gain'): bcol = hsv(bcol, extra.get('vc_sat', 1.0), extra['vc_gain'])
    else:
        bimg = N('ShaderNodeTexImage'); bimg.image = bpy.data.images.load(back); bimg.extension = 'EXTEND'
        L(uvn.outputs[0], bimg.inputs[0]); bcol = bimg.outputs[0]
    if 'back_hsv' in extra: bcol = hsv(bcol, *extra['back_hsv'])
    if 'paint' in extra:  # sides/back painted with clean flat colours: dark (clothes below split_z, hair above) or skin, chosen by TripoSR brightness
        pt = extra['paint']
        dark = mixc(ramp(Z, pt['split_z'] - 0.01, pt['split_z'] + 0.01), pt['dark_lo'], pt['dark_hi'])
        if 'fade' in pt:  # lighter faded hair low on the sides of the head
            f0, f1, fc = pt['fade']; band = mth('MULTIPLY', ramp(Z, f0 - 0.01, f0 + 0.01), mth('SUBTRACT', 1.0, ramp(Z, f1 - 0.015, f1 + 0.015)))
            dark = mixc(band, dark, fc)
        skinm = ramp(lum, *pt['lum'])
        if 'hairw' in [c.name for c in me.color_attributes]:
            hwn = N('ShaderNodeVertexColor'); hwn.layer_name = 'hairw'; skinm = mth('MULTIPLY', skinm, mth('SUBTRACT', 1.0, hwn.outputs[0]))
        shade = mth('ADD', 0.85, mth('MULTIPLY', lum, 0.3))
        painted = mixc(skinm, dark, pt['skin'])
        sh = N('ShaderNodeMix'); sh.data_type = 'RGBA'; sh.blend_type = 'MULTIPLY'; sh.inputs['Factor'].default_value = 1.0; L(painted, sh.inputs[6]); L(shade, sh.inputs[7])
        bcol = mixc(pt.get('mix', 1.0), bcol, sh.outputs[2])
    if 'tint' in extra:  # flat colours matched to the front: body, arms (|x| > arm_x above leg_z), legs (below leg_z)
        ti = extra['tint']; X = sxyz.outputs[0]
        tcol = ti['color']
        if 'leg' in ti: tcol = mixc(mth('SUBTRACT', 1.0, ramp(Z, ti['leg_z'] - 0.03, ti['leg_z'] + 0.03)), tcol, ti['leg'])
        if 'arm' in ti:
            am = mth('MULTIPLY', ramp(mth('ABSOLUTE', X), ti['arm_x'] - 0.02, ti['arm_x'] + 0.02), ramp(Z, ti['leg_z'] - 0.02, ti['leg_z'] + 0.02))
            tcol = mixc(am, tcol, ti['arm'])
        if ti.get('shade'):
            sh = N('ShaderNodeMix'); sh.data_type = 'RGBA'; sh.blend_type = 'MULTIPLY'; sh.inputs['Factor'].default_value = 1.0; L(tcol, sh.inputs[6]); L(mth('ADD', 1 - ti['shade'] * 0.5, mth('MULTIPLY', lum, ti['shade'])), sh.inputs[7]); tcol = sh.outputs[2]
        bcol = mixc(ti['mix'], bcol, tcol)
    if mvinfo:  # multi-view: blend the generated side/back views by facing angle on top of the painted fallback
        mo = extra['mv']; acc = None; cov = None
        for k, path, gain in mvinfo:
            u = N('ShaderNodeUVMap'); u.uv_map = 'mv_' + k
            t = N('ShaderNodeTexImage'); t.image = bpy.data.images.load(path); t.extension = 'EXTEND'; t.interpolation = 'Cubic'; L(u.outputs[0], t.inputs[0])
            g = N('ShaderNodeMix'); g.data_type = 'RGBA'; g.blend_type = 'MULTIPLY'; g.inputs['Factor'].default_value = 1.0; L(t.outputs[0], g.inputs[6]); g.inputs[7].default_value = (*gain, 1)
            if ('mvg_' + k) in me.color_attributes:
                gv = N('ShaderNodeVertexColor'); gv.layer_name = 'mvg_' + k; L(gv.outputs[0], g.inputs[7])
            wv = N('ShaderNodeVertexColor'); wv.layer_name = 'mvw_' + k
            sc2 = N('ShaderNodeVectorMath'); sc2.operation = 'SCALE'; L(g.outputs[2], sc2.inputs[0]); L(wv.outputs[0], sc2.inputs['Scale'])
            if acc is None: acc = sc2.outputs[0]
            else:
                ad = N('ShaderNodeVectorMath'); ad.operation = 'ADD'; L(acc, ad.inputs[0]); L(sc2.outputs[0], ad.inputs[1]); acc = ad.outputs[0]
        cv = N('ShaderNodeVertexColor'); cv.layer_name = 'mvcov'
        bcol = mixc(mth('MULTIPLY', cv.outputs[0], mo.get('mix', 1.0), clamp=True), bcol, acc)
    fcol = img.outputs[0]
    if 'front_hsv' in extra: fcol = hsv(fcol, *extra['front_hsv'])
    nt.links.new(wn.outputs[0], mix.inputs['Factor']); nt.links.new(bcol, mix.inputs[6]); nt.links.new(fcol, mix.inputs[7])
    final = mix.outputs[2]
    if 'shoes' in extra:  # clean white sneakers, light grey sole, a grey swoosh-like stripe on the outer/inner sides
        shz = extra['shoes']; m = mth('SUBTRACT', 1.0, ramp(Z, shz['z'] - 0.004, shz['z'] + 0.004))
        geo = N('ShaderNodeNewGeometry'); gn = N('ShaderNodeSeparateXYZ'); L(geo.outputs['Normal'], gn.inputs[0])
        side = ramp(mth('ABSOLUTE', gn.outputs[0]), 0.45, 0.65)
        sl = mth('SUBTRACT', Z, mth('ADD', shz.get('stripe_z', 0.02), mth('MULTIPLY', Y, shz.get('slope', -0.2))))
        stripe = mth('MULTIPLY', mth('MULTIPLY', ramp(sl, -0.001, 0.001), mth('SUBTRACT', 1.0, ramp(sl, shz.get('stripe_w', 0.008) - 0.001, shz.get('stripe_w', 0.008) + 0.001))), side)
        sole = mth('SUBTRACT', 1.0, ramp(Z, shz.get('sole', 0.011) - 0.002, shz.get('sole', 0.011) + 0.002))
        shoe = mixc(stripe, (0.92, 0.92, 0.9), (0.25, 0.26, 0.28)); shoe = mixc(sole, shoe, (0.72, 0.72, 0.72))
        final = mixc(m, final, shoe)
    nt.links.new(final, em.inputs[0]); nt.links.new(em.outputs[0], out.inputs[0])
    wm = nt.nodes.new('ShaderNodeMath'); wm.operation = 'MULTIPLY'; wm.use_clamp = True; wm.inputs[1].default_value = 2.0
    nt.links.new(wn.outputs[0], wm.inputs[0]); nt.links.new(wm.outputs[0], mix.inputs['Factor'])
    me.materials.clear(); me.materials.append(mat)
    return vw, vuv

def smoothstep(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def load_px(path):
    im = bpy.data.images.load(path, check_existing=True); W, H = im.size
    px = np.empty(W * H * 4, dtype=np.float32); im.pixels.foreach_get(px); return px.reshape(H, W, 4)[::-1], W, H
def multiview(ob, me, bvh, nrm, adj, vw, vuv):
    mo = extra['mv']; co = np.array([v.co[:] for v in me.vertices]); nv = len(co)
    E_ = np.zeros(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get('vertices', E_); E_ = E_.reshape(-1, 2)
    deg_ = np.bincount(E_.ravel(), minlength=nv).astype(float)
    fpx, FW, FH = load_px(proj)
    def samp(px, W, H, uv):
        ix = np.clip((uv[:, 0] * W).astype(int), 0, W - 1); iy = np.clip(((1 - uv[:, 1]) * H).astype(int), 0, H - 1); return px[iy, ix]
    known = np.where((vw > 0.6)[:, None], samp(fpx, FW, FH, vuv)[:, :3], np.nan)
    order = mo.get('order', ['q34L', 'q34R', 'sideL', 'sideR', 'back'])
    W_ = {}; out = []; f0, f1 = mo.get('facing', [0.25, 0.7])
    for k in order:
        path = f"{mo['dir']}/{name}_{k}.png"
        Fv = fit_view(co, path, mo['views'][k] + mo.get('yaw0', 0)); d, r, px, W, H = Fv['d'], Fv['r'], Fv['px'], Fv['W'], Fv['H']
        al = px[:, :, 3] > 0.5; u = co @ r; v = co[:, 2]
        s, cx, cy, bi = Fv['s'], Fv['cx'], Fv['cy'], Fv['iou']; best = (s, cx, cy)
        if mo.get('fill'): path = path.replace('.png', '_fill.png')
        uvk = np.stack([(cx + u * s) / W, 1 - (cy - v * s) / H], 1)
        facing = nrm @ -d; w = smoothstep(facing, f0, f1)
        if 'facing_head' in mo: w = np.where(co[:, 2] > extra.get('head_z', 0.7), smoothstep(facing, *mo['facing_head']), w)
        if mo.get('head_split') and FRONT is not None:  # face (front half of the head) only from the front picture
            hz = (co[:, 2] > extra.get('head_z', 0.7)) & (co[:, 2] < mo.get('split_ztop', 9)); dep = co @ FRONT['d']; ymid = np.median(dep[hz]) + mo['head_split']
            w = np.where(hz, w * smoothstep(dep, ymid - 0.015, ymid + 0.015), w)
        w = w * samp(px, W, H, uvk)[:, 3]
        for i in np.where(w > 0)[0]:
            p = mathutils.Vector(co[i]); hit = bvh.ray_cast(p - mathutils.Vector(d) * 0.003, mathutils.Vector(-d), 10.0)
            if hit[0] is not None: w[i] = 0
        for _ in range(2): w = np.array([(w[i] * 2 + w[adj[i]].sum()) / (2 + len(adj[i])) for i in range(nv)])
        col = samp(px, W, H, uvk)[:, :3]
        ov = (w > 0.3) & ~np.isnan(known[:, 0]); gain = [1.0, 1.0, 1.0]
        if mo.get('level'):  # local colour levelling: per-vertex gain known/col on the overlap, diffused over the mesh
            lv_ = mo['level']; okc = ov & (col.mean(1) > lv_.get('min_lum', 0.06)) & (known.mean(1) > lv_.get('min_lum', 0.06))
            g = np.ones((nv, 3)); fixed = okc.copy()
            g[okc] = np.clip(known[okc] / (col[okc] + 1e-6), *lv_.get('clip', [0.6, 1.6]))
            gsm = g.copy()
            for _ in range(lv_.get('pre', 8)):  # soften the measured ratios (registration noise)
                acc = np.zeros_like(gsm); np.add.at(acc, E_[:, 0], gsm[E_[:, 1]]); np.add.at(acc, E_[:, 1], gsm[E_[:, 0]])
                gsm = np.where(fixed[:, None], (gsm + acc) / (1 + deg_[:, None]), gsm)
            g = gsm; base = np.median(g[okc], 0) if okc.any() else np.ones(3); g[~fixed] = base
            for _ in range(lv_.get('iters', 300)):
                acc = np.zeros_like(g); np.add.at(acc, E_[:, 0], g[E_[:, 1]]); np.add.at(acc, E_[:, 1], g[E_[:, 0]])
                g = np.where(fixed[:, None], g, acc / np.maximum(deg_[:, None], 1))
            a_ = me.color_attributes.new('mvg_' + k, 'FLOAT_COLOR', 'POINT'); gl = np.concatenate([g ** 2.2, np.ones((nv, 1))], 1)
            a_.data.foreach_set('color', gl.ravel()); g_v = g
        else:
            if ov.sum() > 50:
                gain = np.clip(known[ov].sum(0) / (col[ov].sum(0) + 1e-6), *mo.get('gain_clip', [0.75, 1.33]))
                gain = list(gain ** 2.2)  # node colours are linear
            g_v = np.tile(np.array(gain) ** (1 / 2.2), (nv, 1))
        fill = (w > 0.5) & np.isnan(known[:, 0]); known[fill] = col[fill] * g_v[fill]
        print('MV', k, 'iou', round(bi, 3), 'fit', [round(x, 1) for x in best], 'overlap', int(ov.sum()), 'gain med', [round(x, 3) for x in np.median(g_v[w > 0.5], 0)] if (w > 0.5).any() else '-', 'cover', int((w > 0.5).sum()))
        W_[k] = w; out.append((k, path, gain))
        if mo.get('debug'):
            dbg = px.copy(); ii = np.clip(((cy - v * s)).astype(int), 0, H - 1); jj = np.clip((cx + u * s).astype(int), 0, W - 1)
            dbg[ii, jj] = np.where((w > 0.5)[:, None], [1, 0, 0, 1], [0, 0, 1, 1]); dbg[~al] *= 0.5
            di = bpy.data.images.new('dbg_' + k, W, H); di.pixels.foreach_set(dbg[::-1].ravel()); di.filepath_raw = f'/tmp/lab/mvdbg_{name}_{k}.png'; di.file_format = 'PNG'; di.save()
        uvl = me.uv_layers.new(name='mv_' + k)
        lv = np.zeros(len(me.loops), dtype=np.int64); me.loops.foreach_get('vertex_index', lv); uvl.data.foreach_set('uv', uvk[lv].ravel().astype(np.float32))
    p_ = mo.get('power', 3.0); stack = np.stack([W_[k] for k in order], 1) ** p_; tot = stack.sum(1) + 1e-9
    cov = np.clip(np.stack([W_[k] for k in order], 1).max(1) * (1 - vw * mo.get('front_cut', 0.0)), 0, 1)
    for j, k in enumerate(order):
        a = me.color_attributes.new('mvw_' + k, 'FLOAT_COLOR', 'POINT'); x = stack[:, j] / tot
        a.data.foreach_set('color', np.repeat(x[:, None], 4, 1).ravel())
    a = me.color_attributes.new('mvcov', 'FLOAT_COLOR', 'POINT'); a.data.foreach_set('color', np.repeat(cov[:, None], 4, 1).ravel())
    return out
def bump_material(nopt):
    m = bpy.data.materials.new('bumpsrc'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes.new; L = nt.links.new
    bsdf = nt.nodes['Principled BSDF']; tc = N('ShaderNodeTexCoord')
    hsum = None
    def add(x):
        nonlocal hsum
        if hsum is None: hsum = x; return
        a = N('ShaderNodeMath'); a.operation = 'ADD'; L(hsum, a.inputs[0]); L(x, a.inputs[1]); hsum = a.outputs[0]
    for layer in nopt['layers']:
        vo = N('ShaderNodeTexVoronoi'); vo.voronoi_dimensions = '3D'; vo.inputs['Scale'].default_value = layer['scale']
        vo.inputs['Randomness'].default_value = layer.get('rand', 0.9); L(tc.outputs['Object'], vo.inputs['Vector'])
        if layer.get('smooth'): vo.feature = 'SMOOTH_F1'
        h = N('ShaderNodeMapRange'); h.interpolation_type = 'SMOOTHSTEP'; L(vo.outputs['Distance'], h.inputs[0])
        h.inputs[1].default_value = layer.get('lo', 0.0); h.inputs[2].default_value = layer.get('hi', 0.6)
        if layer['kind'] == 'dome':  # 1 at the cell centre: curls
            h.inputs[3].default_value = 1.0; h.inputs[4].default_value = 0.0
        mk = N('ShaderNodeVertexColor'); mk.layer_name = layer['mask']
        if layer['mask'] == 'vc':
            mk.layer_name = [c.name for c in src_o.data.color_attributes if c.name not in ('hairw', 'frontw')][0]
            sp = N('ShaderNodeSeparateColor'); L(mk.outputs[0], sp.inputs[0]); d = N('ShaderNodeMath'); d.operation = 'SUBTRACT'
            L(sp.outputs[0], d.inputs[0]); L(sp.outputs[2], d.inputs[1])
            r = N('ShaderNodeMapRange'); L(d.outputs[0], r.inputs[0]); r.inputs[1].default_value = layer.get('m0', 0.12); r.inputs[2].default_value = layer.get('m1', 0.25); mval = r.outputs[0]
        else: mval = mk.outputs[0]
        mul = N('ShaderNodeMath'); mul.operation = 'MULTIPLY'; L(h.outputs[0], mul.inputs[0]); L(mval, mul.inputs[1])
        w = N('ShaderNodeMath'); w.operation = 'MULTIPLY'; L(mul.outputs[0], w.inputs[0]); w.inputs[1].default_value = layer.get('w', 1.0)
        add(w.outputs[0])
    if hsum is None: return m
    bp = N('ShaderNodeBump'); bp.inputs['Strength'].default_value = nopt.get('strength', 0.5); bp.inputs['Distance'].default_value = nopt.get('dist', 0.004)
    L(hsum, bp.inputs['Height']); L(bp.outputs['Normal'], bsdf.inputs['Normal'])
    return m
def bake_normal(lo, nopt, res, bsdf, n2):
    if 'bumpsrc' not in bpy.data.materials:
        src_o.data.materials.clear(); src_o.data.materials.append(bump_material(nopt))
        for pl in src_o.data.polygons: pl.use_smooth = True
    nimg = bpy.data.images.new(lo.name + '_nrm', res, res); nimg.colorspace_settings.name = 'Non-Color'
    tmp = bpy.data.materials.new('nb'); tmp.use_nodes = True; t = tmp.node_tree.nodes.new('ShaderNodeTexImage'); t.image = nimg; tmp.node_tree.nodes.active = t
    keep = list(lo.data.materials); lo.data.materials.clear(); lo.data.materials.append(tmp)
    src_o.hide_render = False; src_o.hide_set(False)
    bpy.ops.object.select_all(action='DESELECT'); src_o.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
    b = sc_.render.bake; b.use_selected_to_active = True; b.cage_extrusion = nopt.get('cage', 0.01); b.max_ray_distance = nopt.get('ray', 0.03); b.normal_space = 'TANGENT'; b.margin = 8
    bpy.ops.object.bake(type='NORMAL')
    b.use_selected_to_active = False
    lo.data.materials.clear(); [lo.data.materials.append(m) for m in keep]
    nimg.filepath_raw = f'{outdir}/{lo.name}_nrm.png'; nimg.file_format = 'PNG'; nimg.save()
    tn = n2.nodes.new('ShaderNodeTexImage'); tn.image = nimg; nm = n2.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = nopt.get('map_strength', 1.0)
    n2.links.new(tn.outputs[0], nm.inputs['Color']); n2.links.new(nm.outputs[0], bsdf.inputs['Normal'])
    print('NORMAL', lo.name, res)
sc_ = bpy.context.scene; sc_.render.engine = 'CYCLES'; sc_.cycles.device = 'CPU'; sc_.cycles.samples = 4
def make_lod(tag, tris, texres):
    bpy.ops.object.select_all(action='DESELECT')
    lo = src_o.copy(); lo.data = src_o.data.copy(); lo.name = f'{name}_{tag}'; sc_.collection.objects.link(lo)
    cur = sum(len(p.vertices) - 2 for p in lo.data.polygons)
    dm = lo.modifiers.new('dec', 'DECIMATE'); dm.ratio = min(1, tris / cur)
    bpy.context.view_layer.objects.active = lo; lo.select_set(True)
    bpy.ops.object.modifier_apply(modifier='dec')
    for pl in lo.data.polygons: pl.use_smooth = True
    vw, vuv = project(lo, INV)
    uvb = lo.data.uv_layers.new(name='UVMap'); lo.data.uv_layers.active = uvb
    lme = lo.data
    isA = np.array([all(vw[i] >= 0.5 for i in p.vertices) for p in lme.polygons])
    for p, a in zip(lme.polygons, isA): p.select = not a
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=0.003)
    bpy.ops.uv.pack_islands(margin=0.003, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    # region A (front, straight from the reference) and region B (sides/back, baked)
    bx0, bx1, by0, by1 = BBOX
    sw, sh = bx1 - bx0, by1 - by0
    aw = min(0.62, sw * ASPECT / sh) if LAYOUT == 'col' else 1.0
    ah = 1.0 if LAYOUT == 'col' else min(0.62, sh / (sw * ASPECT))
    def mapA(u, v):
        x = (u - bx0) / sw; y = ((1 - v) - by0) / sh  # 0..1 inside the subject box, y down
        return (x * aw, 1 - y * ah)
    uvb = lme.uv_layers['UVMap']; uvd = uvb.data  # re-fetch: edit-mode toggles reallocate the layer data
    for p, a in zip(lme.polygons, isA):
        for li in p.loop_indices:
            if a:
                uvd[li].uv = mapA(*vuv[lme.loops[li].vertex_index])
            else:
                u, v = uvd[li].uv
                uvd[li].uv = (aw + u * (1 - aw), v) if LAYOUT == 'col' else (u, v * (1 - ah))
    print('A faces', int(isA.sum()), 'of', len(isA), 'aw', round(aw, 3), 'ah', round(ah, 3))
    bimg = bpy.data.images.new(f'{name}_{tag}_tex', texres, texres)
    pm = lo.data.materials[0].copy(); lo.data.materials[0] = pm
    tgt = pm.node_tree.nodes.new('ShaderNodeTexImage'); tgt.image = bimg; pm.node_tree.nodes.active = tgt
    bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True); bpy.context.view_layer.objects.active = lo
    sc_.render.bake.use_selected_to_active = False; sc_.render.bake.margin = 8
    bpy.ops.object.bake(type='EMIT')
    bm_ = bpy.data.materials.new(f'{name}_{tag}_mat'); bm_.use_nodes = True; n2 = bm_.node_tree
    tn_ = n2.nodes.new('ShaderNodeTexImage'); tn_.image = bimg
    bsdf = n2.nodes['Principled BSDF']; n2.links.new(tn_.outputs[0], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = extra.get('rough', 0.6)
    lo.data.materials.clear(); lo.data.materials.append(bm_)
    for nm in [x.name for x in lo.data.uv_layers if x.name != 'UVMap']: lo.data.uv_layers.remove(lo.data.uv_layers[nm])
    lo.data.uv_layers['UVMap'].active_render = True
    for nm in [x.name for x in lo.data.color_attributes]:
        x = lo.data.color_attributes.get(nm)
        if x: lo.data.color_attributes.remove(x)
    bimg.filepath_raw = f'{outdir}/{name}_{tag}.png'; bimg.file_format = 'PNG'; bimg.save()
    nopt = extra.get('normal')
    if nopt and tag in nopt.get('lods', ['hi']):
        bake_normal(lo, nopt, texres if 'res' not in nopt else nopt['res'], bsdf, n2)
    print('LOD', tag, sum(len(p.vertices) - 2 for p in lo.data.polygons))
    return lo
hi = make_lod('hi', tris_hi, extra.get('tex_hi', 2048))
lo = make_lod('lo', tris_lo, extra.get('tex_lo', 1024))
src_o.hide_render = True
bpy.ops.wm.save_as_mainfile(filepath=f'{outdir}/{name}.blend')
