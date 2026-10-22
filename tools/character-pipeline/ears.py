# blender -b <name>.blend -P ears.py -- <name> <ears.json>
# Modelled cartoon ears + skin-fade side texture + shirt/hair speck cleanup, on the final LOD meshes (after rig/detail, before export).
# Ear: local subdivision around each ear, the old nub smoothed away, then a sculpted height field (helix rim, scapha, antihelix,
# concha bowl, tragus, lobe) along the side normal. Texture: texel positions baked (EMIT of object position), then painted:
# ear skin with pink concha/shadow, fade gradient dark hair -> skin with stubble noise, crisp hairline/sideburn, skin margin round the ear.
import bpy, bmesh, sys, json, math, numpy as np
argv = sys.argv[sys.argv.index('--') + 1:]; name = argv[0]; C = json.load(open(argv[1]))
yaw = math.radians(C.get('yaw', 15.0)); F = np.array([math.sin(yaw), -math.cos(yaw), 0.0]); NP = np.array([math.cos(yaw), math.sin(yaw), 0.0])
EZ, EF = C['ear_z'], C.get('ear_f', 0.0); A, Bh = C['a'], C['b']
def ss(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def local(P):
    sg = np.where(P @ NP >= 0, 1.0, -1.0); s = P @ F - EF; t = P[:, 2] - EZ; l = sg * (P @ NP)
    return sg, s, t, l
def ear_r(S, T):
    w = 1 - 0.22 * np.clip(-T, 0, 1); return np.sqrt((S / w) ** 2 + T ** 2)
def height(S, T):
    r = ear_r(S, T); inside = ss(r, 1.0, 0.93)
    hp = C.get('h0', 0.011) * (0.25 + 0.75 * np.clip((0.8 - S) / 1.6, 0, 1))
    rimw = np.maximum(ss(S, 0.85, 0.2), ss(T, 0.45, 0.8)) * ss(T, -0.7, -0.45)
    rim = np.exp(-((r - 0.86) / 0.075) ** 2) * rimw * 0.0035
    up = ss(T, -0.25, 0.25)
    scapha = -0.002 * np.exp(-((r - 0.7) / 0.06) ** 2) * up * ss(S, 0.7, 0.2)
    anti = 0.0018 * np.exp(-((r - 0.56) / 0.06) ** 2) * ss(T, -0.35, -0.05) * ss(S, 0.75, 0.3)
    q = np.sqrt(((S - 0.2) / 0.45) ** 2 + ((T + 0.1) / 0.5) ** 2); concha = -0.0068 * np.where(q < 1, 0.5 + 0.5 * np.cos(np.pi * np.clip(q, 0, 1)), 0)
    lobe = 0.0015 * np.exp(-((T + 0.8) / 0.18) ** 2 - (S / 0.5) ** 2)
    tragus = 0.003 * np.exp(-(((S - 0.78) / 0.15) ** 2 + ((T + 0.12) / 0.2) ** 2))
    h = inside * (hp + rim + scapha + anti + lobe + concha) + tragus * ss(r, 1.15, 0.95)
    return np.maximum(h, -0.0008), r, q
def sculpt(ob, levels):
    me = ob.data; bm = bmesh.new(); bm.from_mesh(me)
    for _ in range(levels):
        bm.verts.ensure_lookup_table(); P = np.array([v.co[:] for v in bm.verts]); sg, s, t, l = local(P)
        sel = (ear_r(s / A, t / Bh) < 1.5) & (l > C.get('lat_min', 0.05))
        edges = [e for e in bm.edges if sel[e.verts[0].index] or sel[e.verts[1].index]]
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free(); me.update()
    nv = len(me.vertices); P = np.zeros(nv * 3); me.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    E = np.zeros(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2); deg = np.bincount(E.ravel(), minlength=nv).astype(float)
    sg, s, t, l = local(P); S, T = s / A, t / Bh; r = ear_r(S, T)
    ws = ss(r, 1.5, 1.1) * (l > C.get('lat_min', 0.05))
    for it in range(C.get('smooth_iters', 40) + C.get('smooth_extra_neg', 0)):  # smooth the old nub away (the base head surface)
        w_ = ws if it < C.get('smooth_iters', 40) else ss(r, C.get('smooth_r_neg', 1.5), C.get('smooth_r_neg', 1.5) - 0.4) * (l > C.get('lat_min', 0.05)) * (sg < 0)  # extra passes on his right (wider head, bigger old nub)
        acc = np.zeros_like(P); np.add.at(acc, E[:, 0], P[E[:, 1]]); np.add.at(acc, E[:, 1], P[E[:, 0]])
        P = P + w_[:, None] * 0.6 * (acc / np.maximum(deg, 1)[:, None] - P)
    sg, s, t, l = local(P); h, r, q = height(s / A, t / Bh)
    h = h * (l > C.get('lat_min', 0.05))
    P = P + (h * sg)[:, None] * NP[None, :]
    me.vertices.foreach_set('co', P.ravel()); me.update()
    for pl in me.polygons: pl.use_smooth = True
    print('EARS sculpt', ob.name, nv, 'verts, ear verts', int((r < 1).sum()))
def bake_pos(ob, res, what='pos'):
    me = ob.data; img = bpy.data.images.new(ob.name + '_pos', res, res, alpha=True, float_buffer=True); img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.zeros(res * res * 4, np.float32))
    mt = bpy.data.materials.new('posbake'); mt.use_nodes = True; nt = mt.node_tree; nt.nodes.clear(); N = nt.nodes.new; L = nt.links.new
    o = N('ShaderNodeOutputMaterial'); em = N('ShaderNodeEmission'); tc = N('ShaderNodeTexCoord'); ad = N('ShaderNodeVectorMath'); ad.operation = 'ADD'; ad.inputs[1].default_value = (0.5, 0.5, 0.5)
    if what == 'pos': L(tc.outputs['Object'], ad.inputs[0])
    else:
        geo = N('ShaderNodeNewGeometry'); vt = N('ShaderNodeVectorTransform'); vt.vector_type = 'NORMAL'; vt.convert_from = 'WORLD'; vt.convert_to = 'OBJECT'
        L(geo.outputs['Normal'], vt.inputs[0]); sc_ = N('ShaderNodeVectorMath'); sc_.operation = 'SCALE'; sc_.inputs['Scale'].default_value = 0.5; L(vt.outputs[0], sc_.inputs[0]); L(sc_.outputs[0], ad.inputs[0])
    L(ad.outputs[0], em.inputs[0]); L(em.outputs[0], o.inputs[0])
    tg = N('ShaderNodeTexImage'); tg.image = img; nt.nodes.active = tg
    old = list(me.materials); me.materials.clear(); me.materials.append(mt)
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 1; sc.render.bake.margin = 6; sc.render.bake.use_selected_to_active = False
    for x in bpy.context.view_layer.objects: x.select_set(False)
    ob.hide_set(False); ob.hide_render = False; ob.select_set(True); bpy.context.view_layer.objects.active = ob
    arm = [m for m in ob.modifiers if m.type == 'ARMATURE']
    for m in arm: m.show_render = False; m.show_viewport = False
    bpy.ops.object.bake(type='EMIT')
    for m in arm: m.show_render = True; m.show_viewport = True
    me.materials.clear()
    for x in old: me.materials.append(x)
    px = np.array(img.pixels[:], np.float32).reshape(res, res, 4); ok = px[:, :, 3] > 0.5
    return px[:, :, :3] - 0.5, ok
def hashnoise(P, cell):
    k = np.floor(P / cell).astype(np.int64); h = (k[..., 0] * 73856093) ^ (k[..., 1] * 19349663) ^ (k[..., 2] * 83492791)
    return ((h % 1000003) / 1000003.0).astype(np.float32)
def _box(a, r, ax):
    if r < 1: return a
    pad = [(0, 0)] * a.ndim; pad[ax] = (r + 1, r); c = np.cumsum(np.pad(a, pad, mode='edge'), axis=ax, dtype=np.float64)
    n = a.shape[ax]; hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=ax); lo = np.take(c, np.arange(0, n), axis=ax)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)
def gaussian_filter(a, sigma):  # 3 box passes per axis ~ gaussian (no scipy in Blender's python)
    r = max(0, int(round((math.sqrt(12 * sigma * sigma / 3 + 1) - 1) / 2))); a = a.astype(np.float32)
    for ax in (0, 1):
        for _ in range(3): a = _box(a, r, ax)
    return a
def srgb(c): return np.array(c, np.float32) / 255
def paint(ob, tag):
    mat = ob.data.materials[0]; tex = [n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE']
    base = [n.image for n in tex if not n.image.name.endswith('_nrm')][0]; nrm = [n.image for n in tex if n.image.name.endswith('_nrm')]
    res = base.size[0]; Pp, ok = bake_pos(ob, res); Nn, _ = bake_pos(ob, res, 'nrm'); Nn = Nn * 2; nz = Nn[:, :, 2]
    px = np.array(base.pixels[:], np.float32).reshape(res, res, 4); rgb = px[:, :, :3]
    sg, s, t, l = local(Pp.reshape(-1, 3)); sg, s, t, l = [x.reshape(res, res) for x in (sg, s, t, l)]; z = Pp[:, :, 2]
    S, T = s / A, t / Bh; h, r, q = height(S, T); lat = l > C.get('lat_min', 0.05)
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    n1 = hashnoise(Pp, C.get('stubble', 0.0009)); n2 = hashnoise(Pp + 0.37, C.get('stubble', 0.0009) * 2.7)
    skin = srgb(C.get('skin', [214, 150, 118])); hair = srgb(C.get('fade_hair', [38, 27, 21]))
    # ---- fade / sideburn on the head sides and back
    tc_ = C['t_curl']; tb = C['t_bottom']
    sh = np.where(t <= 0.04, C['sb_s'], C['sb_s'] + (np.clip(t, 0.04, 0.083) - 0.04) / 0.043 * (C['temple_s'] - C['sb_s'])) + np.clip(t - 0.083, 0, None) * 2
    behind = 1 - ss(s, sh - 0.0008, sh + 0.0008)  # crisp front hairline / sideburn edge
    vert = ss(t, tb - 0.004, tb + 0.004) * (1 - ss(t, tc_ - 0.004, tc_ + 0.008))
    reg = behind * vert * (z > C.get('z_min', 0.72)) * ok
    qq = np.clip((tc_ - t) / (tc_ - tb), 0, 1)
    dens = np.interp(qq, [0, 0.45, 1], C.get('density', [0.93, 0.72, 0.5])) + 0.30 * (n1 - 0.5) + 0.12 * (n2 - 0.5)
    margin = ss(r, 1.0, 1.02) * (1 - ss(r, C.get('margin_r', 1.12) - 0.015, C.get('margin_r', 1.12) + 0.015))
    dens = np.clip(dens, 0, 1) * (1 - margin * lat) * np.where(lat, ss(r, 0.98, 1.0), 1.0)
    loc_skin = skin[None, None, :] * (0.96 + 0.06 * n2[..., None])
    fade = loc_skin * (1 - dens[..., None]) + hair[None, None, :] * dens[..., None]
    a = reg[..., None]; rgb2 = rgb * (1 - a) + fade * a
    # ---- ear skin
    ein = (ss(r, 1.0, 0.97) * lat * ok)[..., None]
    ear = srgb(C.get('ear', [222, 150, 120]))[None, None, :] * np.ones_like(rgb)
    cq = np.where(q < 1, 0.5 + 0.5 * np.cos(np.pi * np.clip(q, 0, 1)), 0)[..., None]
    ear = ear * (1 - 0.55 * cq) + srgb(C.get('concha', [176, 96, 82]))[None, None, :] * 0.55 * cq
    rimhi = (np.exp(-((r - 0.88) / 0.06) ** 2) * ss(T, -0.6, -0.3))[..., None]; ear = ear * (1 + 0.07 * rimhi)
    sca = (np.exp(-((r - 0.7) / 0.07) ** 2) * ss(T, -0.25, 0.25))[..., None]; ear = ear * (1 - 0.12 * sca) + srgb([200, 110, 96]) * 0.0
    pink = (np.exp(-((T + 0.8) / 0.25) ** 2) + 0.5 * rimhi[..., 0])[..., None]; ear = ear * (1 - 0.15 * pink) + srgb(C.get('pink', [228, 136, 124])) * 0.15 * pink
    ear = ear * (0.97 + 0.04 * n2[..., None])
    rgb2 = rgb2 * (1 - ein) + ear * ein
    # ---- old painted-ear ghost in front of the new ear (face-skin zone): fill from the surrounding skin (normalized convolution)
    if 'ghost' in C:
        g = C['ghost']; gm = np.zeros((res, res), np.float32)
        for side in (1.0, -1.0):
            gs = g.get('s_%d' % side, g['s']); gt = g.get('t_%d' % side, g.get('t', 0.0))
            rho = np.sqrt(((s - gs) / g['rs']) ** 2 + ((t - gt) / g['rt']) ** 2)
            gm = np.maximum(gm, ss(rho, 1.0, 0.75) * (sg == side))
        gm = gm * lat * ok * (1 - ein[..., 0]) * (1 - reg)
        hard = gm > 0.02
        wgt = (~hard & ok & lat & (reg < 0.05) & (ein[..., 0] < 0.05) & (np.abs(t) < 0.08)).astype(np.float32) * (z > C.get('z_min', 0.72))
        sig = g.get('sig', 18) * res / 4096
        num = np.stack([gaussian_filter(rgb2[:, :, c] * wgt, sig) for c in range(3)], 2); den = gaussian_filter(wgt, sig)[..., None]
        fill = num / np.maximum(den, 1e-4); fill = fill * (0.98 + 0.03 * n2[..., None])
        a_ = gaussian_filter(gm, 1.5)[..., None] * (den > 0.02)
        rgb2 = rgb2 * (1 - a_) + fill * a_
        print('EARS ghost', tag, int(hard.sum()), 'texels')
    # ---- shirt blotches -> shirt black
    if 'shirt' in C:
        sc_ = C['shirt']; P3 = Pp; radial = np.sqrt((P3 @ NP) ** 2 + ((P3 @ F) - sc_.get('neck_f', 0.0)) ** 2)
        zone = ok & (z > sc_['z_min']) & (((z < sc_['z_max']) & ((radial > sc_['neck_r']) | (z < sc_['neck_z0']))) | ((z < sc_.get('z_top', 0.73)) & (nz > sc_.get('up_nz', 0.45)) & (radial > sc_.get('up_r', 0.06))))
        if 'arm_lat' in sc_: zone &= ~((np.abs(P3 @ NP) > sc_['arm_lat']) & (z < sc_['arm_z']))
        sk = (rgb2[:, :, 0] - rgb2[:, :, 2] > sc_.get('rb', 0.08)) & (rgb2 @ np.array([0.299, 0.587, 0.114]) > sc_.get('lum', 0.15))
        dark = zone & ~sk & (lum < 0.2)
        shirt_c = np.median(rgb2[dark], 0) if dark.any() else srgb([30, 28, 30])
        m = gaussian_filter((zone & sk).astype(np.float32), 1.0 * res / 4096 * 4) > 0.15
        m = m & zone; mm = gaussian_filter(m.astype(np.float32), 1.5)[..., None]
        rgb2 = rgb2 * (1 - mm) + (shirt_c * (0.9 + 0.2 * n2[..., None])) * mm
        print('EARS shirt', tag, int(m.sum()), 'texels, shirt colour', (shirt_c * 255).round())
    # ---- hair specks -> dark brown highlight
    if 'hair' in C:
        hc = C['hair']; lum2 = rgb2 @ np.array([0.299, 0.587, 0.114])
        darkm = (lum2 < hc.get('dark_lum', 0.2)).astype(np.float32); sig = hc.get('sig', 10) * res / 4096
        dfrac = gaussian_filter(darkm * ok, sig) / np.maximum(gaussian_filter(ok.astype(np.float32), sig), 1e-3)
        speck = ok & (z > hc['z_min']) & ((nz > hc.get('nz', 0.3)) | ((Pp.reshape(-1, 3) @ F).reshape(res, res) < hc.get('fw_max', 0.03))) & (rgb2[:, :, 0] - rgb2[:, :, 2] > hc.get('rb', 0.10)) & (lum2 > hc.get('speck_lum', 0.3)) & (dfrac > hc.get('dfrac', 0.5))
        sp = gaussian_filter(speck.astype(np.float32), 0.8 * max(1, res / 4096 * 2))
        sp = np.clip(sp * 2.5, 0, 1)[..., None] * (z > hc['z_min'])[..., None]
        hl = srgb(hc.get('color', [86, 56, 40])) * (0.8 + 0.4 * n1[..., None])
        rgb2 = rgb2 * (1 - sp) + hl * sp
        print('EARS hair specks', tag, int(speck.sum()), 'texels')
    px[:, :, :3] = np.clip(rgb2, 0, 1); base.pixels.foreach_set(px.ravel()); base.update()
    base.filepath_raw = bpy.path.abspath(base.filepath); base.file_format = 'PNG'; base.save()
    for ni in nrm:  # ear region: neutral normal map so the sculpted ear shades cleanly
        rn = ni.size[0]; npx = np.array(ni.pixels[:], np.float32).reshape(rn, rn, 4)
        e = ein[..., 0] if rn == res else None
        if e is not None:
            npx[:, :, :3] = npx[:, :, :3] * (1 - e[..., None]) + np.array([0.5, 0.5, 1.0], np.float32) * e[..., None]
            ni.pixels.foreach_set(npx.ravel()); ni.update(); ni.filepath_raw = bpy.path.abspath(ni.filepath); ni.file_format = 'PNG'; ni.save()
    if C.get('debug'):
        np.save(f'/tmp/ears/pos_{tag}.npy', Pp.astype(np.float16)); np.save(f'/tmp/ears/rgb_{tag}.npy', (rgb * 255).astype(np.uint8)); np.save(f'/tmp/ears/ok_{tag}.npy', ok)
        dbg = bpy.data.images.new('dbg', res, res); d = np.zeros((res, res, 4), np.float32); d[..., 3] = 1
        d[..., 0] = reg; d[..., 1] = ein[..., 0]; d[..., 2] = ok * 0.3
        dbg.pixels.foreach_set(d.ravel()); dbg.filepath_raw = f'/tmp/ears/dbg_{tag}.png'; dbg.file_format = 'PNG'; dbg.save()
    print('EARS painted', tag, res, 'fade texels', int((reg > 0.5).sum()), 'ear texels', int((ein[..., 0] > 0.5).sum()))
def clip_temples(tag):  # glasses arm must end at the front of the modelled ear, not run across it
    import mathutils
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.name.startswith(f'{name}_{tag}_temple'): continue
        M = o.matrix_world; Mi = M.inverted(); n = 0
        for v in o.data.vertices:
            w = np.array(M @ v.co); sv = w @ F - EF
            if sv < C['temple_s_min']:
                w = w + (C['temple_s_min'] - sv) * F; v.co = Mi @ mathutils.Vector(w); n += 1
        o.data.update(); print('EARS temple clip', o.name, n)
for tag, lev in (('hi', C.get('levels_hi', 2)), ('lo', C.get('levels_lo', 1))):
    ob = bpy.data.objects[f'{name}_{tag}']
    if 'temple_s_min' in C: clip_temples(tag)
    sculpt(ob, lev); paint(ob, tag)
bpy.ops.wm.save_mainfile()
print('EARS done')
