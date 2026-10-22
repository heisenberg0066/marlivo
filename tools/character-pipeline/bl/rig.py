# blender -b <name>.blend -P rig.py -- <name>
import bpy, sys, numpy as np, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
name = argv[0]
def bones_for(co):
    if name == 'ammar':
        cx = 0.0; cy = float(np.median(co[(co[:, 2] > 0.75) & (co[:, 2] < 0.95)][:, 1]))
        return {'hips': ((cx, cy, 0.05), (cx, cy, 0.42), None), 'spine': ((cx, cy, 0.42), (cx, cy, 0.69), 'hips'), 'head': ((cx, cy, 0.69), (cx, cy, 1.0), 'spine')}
    # orange guy: body centre from the upper body slice; arms are the parts outside it
    up = co[(co[:, 2] > 0.72) & (co[:, 2] < 0.9)]
    bx0, bx1 = up[:, 0].min(), up[:, 0].max(); cx = (bx0 + bx1) / 2; cy = float(np.median(up[:, 1]))
    out = {'root': ((cx, cy, 0.0), (cx, cy, 0.3), None), 'body': ((cx, cy, 0.3), (cx, cy, 1.0), 'root')}
    for side, sel in (('armL', co[:, 0] < bx0 - 0.04), ('armR', co[:, 0] > bx1 + 0.04)):
        a = co[sel & (co[:, 2] > 0.2) & (co[:, 2] < 0.75)]
        tip = a[np.argmin(a[:, 2])]
        edge = bx0 + 0.06 if side == 'armL' else bx1 - 0.06
        out[side] = ((float(edge), float(np.median(a[:, 1])), 0.6), tuple(float(x) for x in tip), 'body')
    return out
for tag in ('hi', 'lo'):
    o = bpy.data.objects[f'{name}_{tag}']
    co = np.array([v.co[:] for v in o.data.vertices])
    spec = bones_for(co)
    print('BONES', tag, {k: (tuple(round(x, 3) for x in v[0]), tuple(round(x, 3) for x in v[1])) for k, v in spec.items()})
    arm = bpy.data.armatures.new(f'{name}_{tag}_rig'); ao = bpy.data.objects.new(f'{name}_{tag}_rig', arm); bpy.context.scene.collection.objects.link(ao)
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = ao; ao.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for bn, (h, t, par) in spec.items():
        b = arm.edit_bones.new(bn); b.head = h; b.tail = t
        if par: b.parent = arm.edit_bones[par]; b.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); ao.select_set(True); bpy.context.view_layer.objects.active = ao
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    vg = {g.index: g.name for g in o.vertex_groups}
    empty = sum(1 for v in o.data.vertices if not v.groups)
    print('WEIGHTS', tag, len(vg), 'groups; unweighted verts', empty)
    if empty:  # bone heat failed somewhere: give leftovers to the nearest bone by envelope
        root = list(spec)[0]; g = o.vertex_groups.get(root) or o.vertex_groups.new(name=root)
        g.add([v.index for v in o.data.vertices if not v.groups], 1.0, 'REPLACE')
bpy.ops.wm.save_mainfile()
