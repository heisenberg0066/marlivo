# v2 head geometry: snap the face/cheek/temple/ear zone onto one smooth chubby shell (Hunyuan's face slab, hair wings
# and folds made the face read flat and boxy), inner layers tucked under it, ear bumps, sides narrowed.
import bpy, sys, numpy as np, json
a = sys.argv[sys.argv.index('--') + 1:]; src, out = a[0], a[1]; P = json.loads(a[2]) if len(a) > 2 else {}
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
o = [x for x in bpy.context.scene.objects if x.type == 'MESH' and x.name.startswith('beanie')][0]; me = o.data
co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
nr = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', nr); nr = nr.reshape(-1, 3)
br = np.load('/workspace/sb/gen9/brim.npy')
def sm(x, a0, a1): t = np.clip((x - a0) / (a1 - a0), 0, 1); return t * t * (3 - 2 * t)
th = np.degrees(np.arctan2(co[:, 0], -co[:, 1])); r = np.hypot(co[:, 0], co[:, 1]); z = co[:, 2]; at = np.abs(th)
brim = np.interp(th, br[:, 0], br[:, 1])
rad = np.c_[co[:, 0], co[:, 1]] / np.maximum(r, 1e-9)[:, None]; ndot = nr[:, 0] * rad[:, 0] + nr[:, 1] * rad[:, 1]
R1 = P.get('R1', 0.170)
zc, cc = P.get('zc', 0.665), P.get('cz', 0.27)
R = R1 * np.sqrt(np.clip(1 - ((z - zc) / cc) ** 2, 0.3, 1)) + P.get('cheek', 0.010) * np.exp(-((at - 38) / 20) ** 2 - ((z - 0.605) / 0.035) ** 2)
for ec in P.get('ears', [[97, 0.632], [-97, 0.632]]):
    R = R + P.get('ear', 0.013) * np.exp(-((th - ec[0]) / 6.5) ** 2 - ((z - ec[1]) / 0.024) ** 2)
Wt = 1 - sm(at, *P.get('t1', [100, 122])); Wz = sm(z, *P.get('z0', [0.535, 0.565])) * (1 - sm(z, brim - 0.007, brim - 0.0005))
W = Wt * Wz
# outermost layer: radial ray from outside toward the axis; a vertex is outer when that ray reaches it first
import bmesh, mathutils
from mathutils.bvhtree import BVHTree
bm = bmesh.new(); bm.from_mesh(me); bvh = BVHTree.FromBMesh(bm)
outer = np.zeros(len(r), bool)
for i in np.nonzero(W > 0.01)[0]:
    d = mathutils.Vector((-rad[i, 0], -rad[i, 1], 0.0)); o0 = mathutils.Vector((co[i, 0] + rad[i, 0] * (0.4 - r[i]), co[i, 1] + rad[i, 1] * (0.4 - r[i]), co[i, 2]))
    hit = bvh.ray_cast(o0, d, 1.0)
    outer[i] = hit[0] is not None and hit[3] >= (0.4 - r[i]) - P.get('ltol', 0.003)
target = np.where(outer, R, R - P.get('inner', 0.008))
rn = r + (target - r) * W
# smooth the snapped outer shell (welded across UV seams) so leftover fold edges do not shade as cracks
keyp = np.round(co * 1e5).astype(np.int64); _, grp = np.unique(keyp, axis=0, return_inverse=True); grp = grp.ravel(); ng = grp.max() + 1
E = np.array([[e.verts[0].index, e.verts[1].index] for e in bm.edges]); ga, gb = grp[E[:, 0]], grp[E[:, 1]]
gr = np.zeros(ng); np.add.at(gr, grp, rn); cnt = np.bincount(grp, minlength=ng); gr /= cnt
gout = np.zeros(ng); np.add.at(gout, grp, (outer & (W > 0.3)).astype(float)); gout = gout / cnt > 0.5
gW = np.zeros(ng); np.add.at(gW, grp, W); gW /= cnt
for _ in range(P.get('smooth', 12)):
    m = gout[ga] & gout[gb]
    acc = np.zeros(ng); c2 = np.zeros(ng); np.add.at(acc, ga[m], gr[gb[m]]); np.add.at(acc, gb[m], gr[ga[m]]); np.add.at(c2, ga[m], 1); np.add.at(c2, gb[m], 1)
    avg = np.where(c2 > 0, acc / np.maximum(c2, 1), gr); a_ = 0.5 * gW * gout
    gr = gr * (1 - a_) + avg * a_
rn = np.where(outer & (W > 0.3), gr[grp], rn)
s = rn / np.maximum(r, 1e-9); co[:, 0] *= s; co[:, 1] *= s
sq = P.get('sq', 0.14)
Ws = sm(at, 34, 60) * (1 - sm(at, 104, 135)) * sm(z, 0.53, 0.58) * (1 - sm(z, brim - 0.03, brim - 0.005))
co[:, 0] *= 1 - sq * Ws
# close open seams in the zone: boundary vertices of different sheets within ZIP distance meet at their midpoint
if P.get('zip', 0) > 0:
    from mathutils.kdtree import KDTree
    bmz = bmesh.new(); bmz.from_mesh(me); bmz.verts.ensure_lookup_table()
    bv = np.array(sorted({v.index for e in bmz.edges if e.is_boundary for v in e.verts}))
    bv = bv[(W[bv] > 0.3) & (co[bv, 2] < brim[bv] - 0.006)]
    gb_ = grp[bv]; Pb = co[bv]; kd = KDTree(len(Pb)); [kd.insert(mathutils.Vector(q), i) for i, q in enumerate(Pb)]; kd.balance()
    prs = np.array([(i, j) for i, q in enumerate(Pb) for (_, j, _) in kd.find_range(mathutils.Vector(q), P.get('zip', 0.003)) if j > i], int).reshape(-1, 2)
    prs = prs[gb_[prs[:, 0]] != gb_[prs[:, 1]]]
    acc = np.zeros((len(bv), 3)); cn = np.zeros(len(bv))
    np.add.at(acc, prs[:, 0], Pb[prs[:, 1]]); np.add.at(acc, prs[:, 1], Pb[prs[:, 0]]); np.add.at(cn, prs[:, 0], 1); np.add.at(cn, prs[:, 1], 1)
    m = cn > 0; newp = Pb.copy(); newp[m] = (Pb[m] + acc[m] / cn[m][:, None]) / 2
    # apply to every duplicate of the vertex (UV seam copies share the group)
    gnew = {}; [gnew.setdefault(g, []).append(q) for g, q, mm in zip(gb_, newp, m) if mm]
    for g, qs in gnew.items(): co[grp == g] = np.mean(qs, 0)
    print('GEO2 zipped', int(m.sum()), 'of', len(bv), 'boundary verts')
print('GEO2 moved', int((np.abs(rn - r) > 0.002).sum()), 'outer', int((outer & (W > 0.5)).sum()), 'inner', int((~outer & (W > 0.5)).sum()))
me.vertices.foreach_set('co', co.ravel()); me.update()
# drop the hidden inner layers inside the zone (they would z-fight once everything sits on the shell)
if P.get('drop_inner', True):
    bm2 = bmesh.new(); bm2.from_mesh(me); bm2.verts.ensure_lookup_table()
    dead = (~outer) & (W > 0.5)
    if P.get('keep_ring', 1):
        # keep the inner faces that touch the outer layer, so the crease where the layers meet never opens a crack
        ow = outer & (W > 0.3); gO = np.zeros(ng, bool); np.logical_or.at(gO, grp, ow)
        for _ in range(int(P.get('keep_ring', 1))):
            nb = gO.copy(); nb[ga[gO[gb]]] = True; nb[gb[gO[ga]]] = True; gO = nb
        dead &= ~gO[grp]
    kill = [f for f in bm2.faces if all(dead[v.index] for v in f.verts)]
    bmesh.ops.delete(bm2, geom=kill, context='FACES'); bm2.to_mesh(me); me.update(); print('GEO2 dropped inner faces', len(kill))
# skin-coloured backing shell just under the zone, so hairline seams between the snapped sheets never show the dark inside
if P.get('back', 0.003) > 0:
    bmb = bmesh.new(); bmb.from_mesh(me); bmb.verts.ensure_lookup_table(); bmb.faces.ensure_lookup_table()
    uvl = bmb.loops.layers.uv.active
    # UV of a clean cheek-skin texel: the loop nearest to a point on her left cheek
    tgt = np.array(P.get('skinpt', [0.075, -0.150, 0.600])); best = None; bd = 9
    for f in bmb.faces:
        for l in f.loops:
            d = np.linalg.norm(np.array(l.vert.co) - tgt)
            if d < bd: bd, best = d, tuple(l[uvl].uv)
    if P.get('skinuv'): best = tuple(P['skinuv'])
    def Rf(thd, zz):
        a_ = abs(thd); r_ = R1 * np.sqrt(np.clip(1 - ((zz - zc) / cc) ** 2, 0.3, 1)) + P.get('cheek', 0.010) * np.exp(-((a_ - 38) / 20) ** 2 - ((zz - 0.605) / 0.035) ** 2)
        for ec in P.get('ears', [[97, 0.632], [-97, 0.632]]): r_ += P.get('ear', 0.013) * np.exp(-((thd - ec[0]) / 6.5) ** 2 - ((zz - ec[1]) / 0.024) ** 2)
        return r_
    nt, nz = 90, 28; TH_ = np.r_[np.linspace(-108, -20, nt // 2), np.linspace(20, 108, nt // 2)]; grid = {}
    for i, t_ in enumerate(TH_):
        zt = float(np.interp(t_, br[:, 0], br[:, 1])) - 0.004; ZS = np.linspace(P.get('bz0', 0.565), zt, nz)
        for j, z_ in enumerate(ZS):
            r_ = Rf(t_, z_) - P.get('back', 0.003); x_ = r_ * np.sin(np.radians(t_)); y_ = -r_ * np.cos(np.radians(t_))
            a_ = abs(t_); ws_ = sm(a_, 34, 60) * (1 - sm(a_, 104, 135)) * sm(z_, 0.53, 0.58) * (1 - sm(z_, zt + 0.004 - 0.03, zt + 0.004 - 0.005))
            grid[i, j] = bmb.verts.new((x_ * (1 - sq * ws_), y_, z_))
    nf = 0
    for i in [k for k in range(nt - 1) if k != nt // 2 - 1]:
        for j in range(nz - 1):
            f = bmb.faces.new((grid[i, j], grid[i + 1, j], grid[i + 1, j + 1], grid[i, j + 1])); nf += 1
            for l in f.loops: l[uvl].uv = best
    bmesh.ops.recalc_face_normals(bmb, faces=bmb.faces[-nf:] if False else [f for f in bmb.faces if f.index < 0 or True][-nf:])
    bmb.to_mesh(me); me.update(); print('GEO2 backing faces', nf, 'skin uv', best, 'd', round(bd, 4))
    co_new = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co_new); co = co_new.reshape(-1, 3)
    W = np.concatenate([W, np.ones(len(co) - len(W))]); Ws = np.concatenate([Ws, np.zeros(len(co) - len(Ws))])
# shade the zone with the analytic shell normal so leftover folds and seams do not read as cracks
if P.get('anorm', True):
    zr = co[:, 2] - zc; sqf = 1 - sq * Ws
    an = np.c_[co[:, 0] / sqf / R1 ** 2, co[:, 1] / R1 ** 2, zr / cc ** 2]; an /= np.linalg.norm(an, axis=1, keepdims=True)
    nv = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', nv); nv = nv.reshape(-1, 3)
    b = np.clip(W[:len(nv)] * 1.6, 0, 1)[:, None] if len(W) == len(nv) else 0
    nn = nv * (1 - b) + an[:len(nv)] * b; nn /= np.linalg.norm(nn, axis=1, keepdims=True)
    me.normals_split_custom_set_from_vertices([tuple(v) for v in nn]); me.update(); print('GEO2 analytic normals')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_skins=True, export_image_format='AUTO')
