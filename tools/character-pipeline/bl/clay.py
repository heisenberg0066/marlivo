import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, zf, sf, ang = argv[0], argv[1], float(argv[2]), float(argv[3]), float(argv[4]) if len(argv) > 4 else 0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
objs = [o for o in sc.objects if o.type == 'MESH']
m = bpy.data.materials.new('clay'); m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.7, 0.7, 0.7, 1)
for o in objs: o.data.materials.clear(); o.data.materials.append(m)
pts = [o.matrix_world @ mathutils.Vector(c) for o in objs for c in o.bound_box]
mn = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); mx = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
ctr = (mn + mx) / 2; ctr.z = mn.z + (mx.z - mn.z) * zf; size = max(mx - mn) * sf
sc.render.engine = 'CYCLES'; sc.cycles.samples = 16; sc.render.resolution_x = 600; sc.render.resolution_y = 700; sc.view_settings.view_transform = 'Standard'
l = bpy.data.lights.new('l', 'SUN'); l.energy = 3; lo = bpy.data.objects.new('l', l); sc.collection.objects.link(lo); lo.rotation_euler = (math.radians(50), 0, math.radians(-30))
cam = bpy.data.cameras.new('c'); cam.lens = 70; co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
a = math.radians(ang); co.location = ctr + mathutils.Vector((math.sin(a) * size * 3, -math.cos(a) * size * 3, 0))
co.rotation_euler = (ctr - co.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
