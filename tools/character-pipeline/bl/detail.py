# blender -b <name>.blend -P detail.py -- <name> <spec.json>
# Hand-modelled extras on top of the image-to-3D body, placed by casting rays from the reference camera through
# points picked on the reference picture (so they line up with the painted front exactly):
#   glasses (wire rims, lenses, bridge, temples), chain, backpack + straps, 3-finger hands.
import bpy, bmesh, sys, json, math, mathutils, numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
argv = sys.argv[sys.argv.index('--') + 1:]
name, spec = argv[0], json.load(open(argv[1]))
S = bpy.context.scene; INV = Matrix(S['INV']); M = INV.inverted(); sc, tx, ty = S['FIT']; TN = math.tan(math.radians(20))

def ray(u, v):
    px = 256 + (u * 512 - 256 - tx) / sc; py = 256 + (v * 512 - 256 - ty) / sc
    nx = px / 512 * 2 - 1; nz = 1 - 2 * py / 512
    o = Vector((0, -1.9, 0)); d = Vector((nx * TN, 1, nz * TN))
    O = M @ o; D = (M @ (o + d) - O).normalized(); return O, D

def mat(nm, col, metal=0.0, rough=0.5, alpha=1.0):
    m = bpy.data.materials.get(nm)
    if m: return m
    m = bpy.data.materials.new(nm); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND'; m.surface_render_method = 'BLENDED'
        b.inputs['Specular IOR Level'].default_value = 1.0
    return m

def curve_obj(nm, pts, radius, material, closed=False, radii=None, res=4, tag=''):
    cu = bpy.data.curves.new(nm, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = radius; cu.bevel_resolution = res; cu.resolution_u = 6
    cu.use_fill_caps = True
    sp = cu.splines.new('NURBS' if not closed else 'NURBS'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (*p, 1); sp.points[i].radius = radii[i] if radii else 1.0
    sp.use_cyclic_u = closed; sp.use_endpoint_u = not closed; sp.order_u = 3
    ob = bpy.data.objects.new(nm, cu); S.collection.objects.link(ob); cu.materials.append(material)
    return to_mesh(ob)

def to_mesh(ob):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH'); o = bpy.context.view_layer.objects.active
    for p in o.data.polygons: p.use_smooth = True
    return o

def attach(ob, rig, bone):
    mw = ob.matrix_world.copy(); ob.parent = rig; ob.parent_type = 'BONE'; ob.parent_bone = bone
    bpy.context.view_layer.update(); ob.matrix_world = mw

made = {}
for tag in ('hi', 'lo'):
    body = bpy.data.objects[f'{name}_{tag}']; rig = bpy.data.objects[f'{name}_{tag}_rig']
    dg = bpy.context.evaluated_depsgraph_get(); bvh = BVHTree.FromObject(body, dg)
    co = np.array([v.co[:] for v in body.data.vertices])
    res = 4 if tag == 'hi' else 2
    def hit(u, v):
        O, D = ray(u, v); loc, nrm, idx, dist = bvh.ray_cast(O, D, 10)
        return loc, D, O
    parts = []
    g = spec.get('glasses')
    if g:
        gold = mat('glasses_wire', tuple(g.get('color', (0.55, 0.38, 0.16))), metal=g.get('metal', 0.35), rough=0.3)
        lens = mat('glasses_lens', (0.85, 0.9, 1.0), rough=0.05, alpha=g.get('lens_alpha', 0.14))
        rims = []
        for rm in g['rims']:
            (cu_, cv_), (ru, rv) = rm['c'], rm['r']
            angs = np.linspace(0, 2 * math.pi, 36, endpoint=False)
            hits = [hit(cu_ + ru * math.cos(a), cv_ + rv * math.sin(a)) for a in angs] + [hit(cu_, cv_)]
            yp = min(h[0].y for h in hits if h[0] is not None) - g.get('off', 0.006)
            def at_y(u, v):
                O, D = ray(u, v); t = (yp - O.y) / D.y; return O + D * t
            pts = [at_y(cu_ + ru * math.cos(a), cv_ + rv * math.sin(a)) for a in angs]
            rims.append((pts, yp, angs))
            parts.append(curve_obj(f'{name}_{tag}_rim', pts, g.get('wire', 0.0014), gold, closed=True, res=res))
            bm = bmesh.new(); vs = [bm.verts.new(p + Vector((0, 0.0015, 0))) for p in pts]; bm.faces.new(vs)
            me = bpy.data.meshes.new(f'{name}_{tag}_lens'); bm.to_mesh(me); bm.free(); me.materials.append(lens)
            lo_ = bpy.data.objects.new(me.name, me); S.collection.objects.link(lo_); parts.append(lo_)
        ypm = min(r[1] for r in rims) - 0.004
        def at(u, v, yy):
            O, D = ray(u, v); t = (yy - O.y) / D.y; return O + D * t
        b = g['bridge']; parts.append(curve_obj(f'{name}_{tag}_bridge', [at(*b[0], rims[0][1]), at(*b[1], ypm), at(*b[2], rims[1][1])], g.get('wire', 0.0014), gold, res=res))
        for k, tp in enumerate(g['temples']):  # rim corner, then straight back along the side of the head to the ear
            p0 = at(*tp, rims[k][1]); side = -1 if p0.x < 0 else 1
            pts = [p0]
            for dy in np.linspace(0.02, g.get('temple_len', 0.15), 6):
                yy = p0.y + dy; sl = co[(np.abs(co[:, 2] - p0.z) < 0.012) & (np.abs(co[:, 1] - yy) < 0.012)]
                xs = (sl[:, 0].max() if side > 0 else sl[:, 0].min()) if len(sl) else p0.x
                x = xs + side * 0.004 if side * xs > side * p0.x - 0.004 else p0.x
                pts.append(Vector((x, yy, p0.z - (0.01 if dy > g.get('temple_len', 0.15) * 0.8 else 0))))
            parts.append(curve_obj(f'{name}_{tag}_temple', pts, g.get('wire', 0.0014), gold, res=res))
        for p in parts: attach(p, rig, g.get('bone', 'head'))
    c = spec.get('chain')
    if c:
        silver = mat('chain_silver', tuple(c.get('color', (0.75, 0.75, 0.78))), metal=c.get('metal', 0.4), rough=0.25)
        pts = []
        for (u, v) in c['points']:
            loc, D, O = hit(u, v)
            if loc is not None: pts.append(loc - D * c.get('off', 0.003))
        a, b_ = pts[0], pts[-1]; mid = (a + b_) / 2; back = max(a.y, b_.y) + c.get('depth', 0.07)
        arc = [Vector((mid.x + (b_.x - a.x) / 2 * math.cos(t), mid.y + (back - mid.y) * math.sin(t), mid.z + 0.01 * math.sin(t))) for t in np.linspace(0.25, math.pi - 0.25, 7)]
        loop = pts + arc
        ob = curve_obj(f'{name}_{tag}_chain', loop, c.get('wire', 0.0017), silver, closed=True, res=res); attach(ob, rig, c.get('bone', 'spine')); parts.append(ob)
    bp = spec.get('backpack')
    if bp:
        black = mat('pack_black', tuple(bp.get('color', (0.022, 0.022, 0.025))), rough=0.75)
        def rbox(nm, ctr, size, bev):
            bpy.ops.mesh.primitive_cube_add(size=1, location=ctr); o = bpy.context.active_object; o.name = nm; o.scale = size
            bpy.ops.object.transform_apply(scale=True)
            m = o.modifiers.new('b', 'BEVEL'); m.width = bev; m.segments = 4 if tag == 'hi' else 2; m.limit_method = 'NONE'
            s = o.modifiers.new('s', 'SUBSURF'); s.levels = 1 if tag == 'hi' else 0
            bpy.ops.object.convert(target='MESH'); o.data.materials.append(black)
            for p in o.data.polygons: p.use_smooth = True
            return o
        cx_, cy_, cz_ = bp['center']; w, d, h = bp['size']
        objs = [rbox(f'{name}_{tag}_pack', (cx_, cy_, cz_), (w, d, h), bp.get('bevel', 0.03)),
                rbox(f'{name}_{tag}_pocket', (cx_, cy_ + d / 2 + 0.012, cz_ - h * 0.18), (w * 0.72, 0.03, h * 0.42), 0.012)]
        objs.append(curve_obj(f'{name}_{tag}_handle', [Vector((cx_ - 0.03, cy_, cz_ + h / 2 - 0.004)), Vector((cx_, cy_ + 0.004, cz_ + h / 2 + 0.022)), Vector((cx_ + 0.03, cy_, cz_ + h / 2 - 0.004))], 0.004, black, res=res))
        for (u, v) in bp.get('straps', []):  # front strap top (from the picture) -> over the shoulder -> top of the pack
            loc, D, O = hit(u, v); f = loc - D * 0.004
            sl = co[(np.abs(co[:, 0] - f.x) < 0.012) & (np.abs(co[:, 1] - 0.0) < 0.06)]
            zt = sl[:, 2][sl[:, 2] < cz_ + h / 2 + 0.12].max() if len(sl) else f.z + 0.04
            ytop = float(np.median(sl[np.abs(sl[:, 2] - zt) < 0.01][:, 1])) if len(sl) else 0
            pts = [f + Vector((0, 0, -0.06)), f, Vector((f.x, (f.y + ytop) / 2 - 0.01, zt + 0.004)), Vector((f.x, ytop + 0.02, zt + 0.006)), Vector((f.x * 0.9, cy_ - d / 2 + 0.01, cz_ + h / 2 - 0.01))]
            objs.append(curve_obj(f'{name}_{tag}_strap', pts, 0.006, black, res=res))
        for o in objs: attach(o, rig, bp.get('bone', 'spine'))
        parts += objs
    hd = spec.get('hands')
    if hd:  # replace the blobby hand ends with a palm and three pointed fingers
        skin = mat('hand_skin', tuple(hd['color']), rough=0.55)
        rest = rig.data.bones
        for bn in hd['bones']:
            bone = rest[bn]; tip = Vector(bone.tail_local)
            near = co[np.linalg.norm(co - np.array(tip), axis=1) < 0.12]
            far = near[np.linalg.norm(near - np.array(tip), axis=1) > 0.08]
            adir = (tip - Vector(far.mean(0))).normalized() if len(far) else Vector((0, 0, -1))
            P = tip - adir * hd.get('palm_back', 0.05)
            slab = co[np.abs((co - np.array(P)) @ np.array(adir)) < 0.008]; slab = slab[np.linalg.norm(slab - np.array(P), axis=1) < 0.06]
            rad = float(np.median(np.linalg.norm(np.cross(slab - np.array(P), np.array(adir)), axis=1))) if len(slab) else 0.02
            # delete the old hand beyond the palm
            bm = bmesh.new(); bm.from_mesh(body.data)
            kill = [v for v in bm.verts if (v.co - P).dot(adir) > 0.002 and (v.co - P).length < 0.14]
            bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(body.data); bm.free()
            bpy.ops.mesh.primitive_uv_sphere_add(radius=rad * hd.get('palm_r', 1.0), location=P, segments=16 if tag == 'hi' else 10, ring_count=10 if tag == 'hi' else 6)
            palm = bpy.context.active_object; palm.name = f'{name}_{tag}_palm'; palm.data.materials.append(skin)
            palm.rotation_mode = 'QUATERNION'; palm.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(adir); palm.scale = (1, 1, hd.get('palm_len', 1.5)); [setattr(p, 'use_smooth', True) for p in palm.data.polygons]
            hand = [palm]
            front = Vector((0, -1, 0)); side = adir.cross(front).normalized()
            for k, ang in enumerate(hd.get('spread', [-28, 0, 28])):
                r = Matrix.Rotation(math.radians(ang), 3, front)
                fd = (r @ adir).normalized(); L = hd.get('len', 0.075) * (0.85 if ang == 0 else 1.0) if not hd.get('mid_long') else hd.get('len', 0.075) * (1.1 if ang == 0 else 0.9)
                base = P + fd * rad * 0.6
                curl = Vector((0, -0.25, 0)) * L
                pts = [base, base + fd * L * 0.5 + curl * 0.2, base + fd * L + curl * 0.6]
                hand.append(curve_obj(f'{name}_{tag}_finger', pts, rad * hd.get('finger_r', 0.45), skin, radii=[1.0, 0.75, 0.15], res=res))
            for o in hand: attach(o, rig, bn)
            parts += hand
            print('HAND', tag, bn, 'tip', tuple(round(x, 3) for x in tip), 'dir', tuple(round(x, 3) for x in adir), 'r', round(rad, 4))
    made[tag] = [p.name for p in parts]
    print('DETAIL', tag, len(parts), 'parts')
bpy.ops.wm.save_mainfile()
