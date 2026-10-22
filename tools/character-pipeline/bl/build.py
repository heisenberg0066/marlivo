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
# --- normalise: feet (min z) at 0, centred in x/y, height 1
bb = [mathutils.Vector(c) for c in src_o.bound_box]
mn = mathutils.Vector([min(c[i] for c in bb) for i in range(3)]); mx = mathutils.Vector([max(c[i] for c in bb) for i in range(3)])
h = mx.z - mn.z
src_o.location = (-(mn.x + mx.x) / 2 / h, -(mn.y + mx.y) / 2 / h, -mn.z / h); src_o.scale = (1 / h,) * 3
bpy.context.view_layer.update(); INV = src_o.matrix_world.inverted().copy()
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print('SRC tris', sum(len(p.vertices) - 2 for p in me.polygons), 'height', h)
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
    for v in me.vertices:
        p = inv @ v.co; d = p.y + 1.9
        px = (p.x / (d * tn) + 1) / 2 * 512; py = (1 - (p.z / (d * tn) + 1) / 2) * 512
        qx = 256 + sc * (px - 256) + tx; qy = 256 + sc * (py - 256) + ty
        vuv[v.index] = (qx / 512, 1 - qy / 512)
        facing = -nrm[v.index][1]
        w = min(1, max(0, (facing - f0) / (f1 - f0))); w = w * w * (3 - 2 * w)
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
    vc_name = [c.name for c in me.color_attributes if c.name != 'frontw'][0]

    # --- material: mix(back, projected image, w) -> emission (for baking)
    mat = bpy.data.materials.new('projmix'); mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'proj'
    img = nt.nodes.new('ShaderNodeTexImage'); img.image = bpy.data.images.load(proj); img.extension = 'EXTEND'; img.interpolation = 'Cubic'
    nt.links.new(uvn.outputs[0], img.inputs[0])
    wn = nt.nodes.new('ShaderNodeVertexColor'); wn.layer_name = 'frontw'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    if back == 'vc':
        bk = nt.nodes.new('ShaderNodeVertexColor'); bk.layer_name = vc_name; bcol = bk.outputs[0]
        if extra.get('vc_gain'):
            hsv = nt.nodes.new('ShaderNodeHueSaturation'); hsv.inputs['Saturation'].default_value = extra.get('vc_sat', 1.0); hsv.inputs['Value'].default_value = extra['vc_gain']
            nt.links.new(bcol, hsv.inputs['Color']); bcol = hsv.outputs[0]
    else:
        bimg = nt.nodes.new('ShaderNodeTexImage'); bimg.image = bpy.data.images.load(back); bimg.extension = 'EXTEND'
        nt.links.new(uvn.outputs[0], bimg.inputs[0]); bcol = bimg.outputs[0]
    nt.links.new(wn.outputs[0], mix.inputs['Factor']); nt.links.new(bcol, mix.inputs[6]); nt.links.new(img.outputs[0], mix.inputs[7])
    nt.links.new(mix.outputs[2], em.inputs[0]); nt.links.new(em.outputs[0], out.inputs[0])
    wm = nt.nodes.new('ShaderNodeMath'); wm.operation = 'MULTIPLY'; wm.use_clamp = True; wm.inputs[1].default_value = 2.0
    nt.links.new(wn.outputs[0], wm.inputs[0]); nt.links.new(wm.outputs[0], mix.inputs['Factor'])
    me.materials.clear(); me.materials.append(mat)
    return vw, vuv

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
    aw = min(0.62, sw / sh) if LAYOUT == 'col' else 1.0
    ah = 1.0 if LAYOUT == 'col' else min(0.62, sh / sw)
    def mapA(u, v):
        x = (u - bx0) / sw; y = ((1 - v) - by0) / sh  # 0..1 inside the subject box, y down
        return (x * aw, 1 - y * ah)
    uvd = uvb.data
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
    lo.data.uv_layers.remove(lo.data.uv_layers['proj'])
    for nm in [x.name for x in lo.data.color_attributes]:
        x = lo.data.color_attributes.get(nm)
        if x: lo.data.color_attributes.remove(x)
    bimg.filepath_raw = f'{outdir}/{name}_{tag}.png'; bimg.file_format = 'PNG'; bimg.save()
    print('LOD', tag, sum(len(p.vertices) - 2 for p in lo.data.polygons))
    return lo
hi = make_lod('hi', tris_hi, extra.get('tex_hi', 2048))
lo = make_lod('lo', tris_lo, extra.get('tex_lo', 1024))
src_o.hide_render = True
bpy.ops.wm.save_as_mainfile(filepath=f'{outdir}/{name}.blend')
