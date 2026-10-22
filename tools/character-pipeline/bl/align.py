import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, dist, fov = argv[0], argv[1], float(argv[2]), float(argv[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=src, forward_axis='Y', up_axis='Z')
o = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]
o.rotation_euler = (0, 0, math.radians(float(argv[4]) if len(argv) > 4 else -90))
sc = bpy.context.scene
cam = bpy.data.cameras.new('c'); cam.angle = math.radians(fov); cam.sensor_fit = 'HORIZONTAL'
co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
co.location = (0, -dist, 0); co.rotation_euler = (math.radians(90), 0, 0)
m = bpy.data.materials.new('e'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
em = nt.nodes.new('ShaderNodeEmission'); ou = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs[0], ou.inputs[0])
o.data.materials.clear(); o.data.materials.append(m)
sc.render.engine = 'CYCLES'; sc.cycles.samples = 1; sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = 512
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
