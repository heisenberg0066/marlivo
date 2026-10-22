import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
objn, out, zf, sf = argv[0], argv[1], float(argv[2]), float(argv[3])
sc = bpy.context.scene
for o in sc.objects: o.hide_render = (o.name != objn)
o = bpy.data.objects[objn]
pts = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
mn = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); mx = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
ctr = (mn + mx) / 2; ctr.z = mn.z + (mx.z - mn.z) * zf; size = max(mx - mn) * sf
sc.render.engine = 'CYCLES'; sc.cycles.samples = 8; sc.render.resolution_x = 600; sc.render.resolution_y = 700; sc.view_settings.view_transform = 'Standard'
cam = bpy.data.cameras.new('c'); cam.lens = 70; co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
co.location = ctr + mathutils.Vector((0, -size * 3, 0)); co.rotation_euler = (math.radians(90), 0, 0)
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
