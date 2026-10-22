# blender -b -P bust.py -- in.glb out.png zlo zhi
import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, zlo, zhi = argv[0], argv[1], float(argv[2]), float(argv[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
objs = [o for o in sc.objects if o.type == 'MESH']
bpy.context.view_layer.update()
# evaluated (skinned) bbox
dg = bpy.context.evaluated_depsgraph_get()
pts = []
for o in objs:
    e = o.evaluated_get(dg); m = e.to_mesh(); pts += [o.matrix_world @ v.co for v in m.vertices]; e.to_mesh_clear()
mn = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); mx = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
H = mx.z - mn.z; z0 = mn.z + H * zlo; z1 = mn.z + H * zhi
sel = [p for p in pts if z0 <= p.z <= z1]
x0 = min(p.x for p in sel); x1 = max(p.x for p in sel)
cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
sc.render.engine = 'CYCLES'; sc.cycles.samples = 64; sc.cycles.use_denoising = True; sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'
sc.render.resolution_x = 1400; sc.render.resolution_y = 1400
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
def light(loc, e, size=2):
    l = bpy.data.lights.new('l', 'AREA'); l.energy = e; l.size = size
    ob = bpy.data.objects.new('l', l); ob.location = mathutils.Vector(loc); sc.collection.objects.link(ob)
    ob.rotation_euler = (mathutils.Vector((cx, 0, cz)) - ob.location).to_track_quat('-Z', 'Y').to_euler()
cx, cz = 0, 0.5
light((0.8, -2.0, 1.5), 120); light((-1.5, -1.2, 0.7), 40); light((0, 1.5, 1.7), 60)
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = float(argv[4]) if len(argv) > 4 else 3.0
co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
co.location = (0, -4, float(argv[5]) if len(argv) > 5 else 0.5); co.rotation_euler = (math.radians(90), 0, 0)
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
