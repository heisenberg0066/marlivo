# blender -b -P view.py -- in.(obj|glb) out_prefix [rotx_deg]
import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
rotx = float(argv[2]) if len(argv) > 2 else 0
bpy.ops.wm.read_factory_settings(use_empty=True)
if src.endswith('.obj'): bpy.ops.wm.obj_import(filepath=src)
else: bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in objs:
    if rotx: o.rotation_euler.x += math.radians(rotx)
    if src.endswith('.obj') and o.data.color_attributes and not o.data.materials:
        m = bpy.data.materials.new('vc'); m.use_nodes = True
        nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']; ca = nt.nodes.new('ShaderNodeVertexColor')
        ca.layer_name = o.data.color_attributes[0].name
        nt.links.new(ca.outputs['Color'], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.7
        o.data.materials.append(m)
bpy.context.view_layer.update()
pts = [o.matrix_world @ mathutils.Vector(c) for o in objs for c in o.bound_box]
mn = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); mx = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
ctr = (mn + mx) / 2; size = max(mx - mn)
print('BBOX', tuple(round(v, 3) for v in mn), tuple(round(v, 3) for v in mx))
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.device = 'CPU'; sc.cycles.use_denoising = True
sc.render.resolution_x = 600; sc.render.resolution_y = 700; sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.11, 0.11, 0.11, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.5
def light(loc, e):
    l = bpy.data.lights.new('l', 'AREA'); l.energy = e; l.size = 3
    ob = bpy.data.objects.new('l', l); ob.location = ctr + mathutils.Vector(loc) * size; sc.collection.objects.link(ob)
    ob.rotation_euler = (ctr - ob.location).to_track_quat('-Z', 'Y').to_euler()
light((0.6, -2, 1.2), 160 * size * size); light((-1.5, -1, 0.5), 50 * size * size); light((0, 2, 1), 60 * size * size)
cam = bpy.data.cameras.new('c'); cam.lens = 70; co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
views = argv[3].split(',') if len(argv) > 3 else ['front', 'q34']
if len(argv) > 4:  # zoom: centre z fraction, size fraction
    zf, sf = map(float, argv[4].split(':')); ctr = mathutils.Vector((ctr.x, ctr.y, mn.z + (mx.z - mn.z) * zf)); size = size * sf
for v in views:
    ang = {'front': 0, 'q34': 35, 'side': 90, 'back': 180}[v]
    d = size * 3.0; a = math.radians(ang)
    co.location = ctr + mathutils.Vector((math.sin(a) * d, -math.cos(a) * d, size * 0.15))
    co.rotation_euler = (ctr - co.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}_{v}.png'; bpy.ops.render.render(write_still=True)
