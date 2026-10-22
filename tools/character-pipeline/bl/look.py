# blender -b -P look.py -- in.glb out.png cz size angles(comma) [cx] [clay]
import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, cz, size, angs = argv[0], argv[1], float(argv[2]), float(argv[3]), [float(a) for a in argv[4].split(',')]
cx = float(argv[5]) if len(argv) > 5 else 0.0; clay = len(argv) > 6 and argv[6] == 'clay'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
if clay:
    m = bpy.data.materials.new('clay'); m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.7, 0.7, 0.7, 1)
    for o in sc.objects:
        if o.type == 'MESH': o.data.materials.clear(); o.data.materials.append(m)
sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.render.resolution_x = 500; sc.render.resolution_y = 500; sc.view_settings.view_transform = 'Standard'
sc.render.film_transparent = False
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.12, 0.12, 0.12, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
l = bpy.data.lights.new('l', 'SUN'); l.energy = 2.5; lo = bpy.data.objects.new('l', l); sc.collection.objects.link(lo); lo.rotation_euler = (math.radians(55), 0, math.radians(-25))
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = size; co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
import os
base, ext = os.path.splitext(out)
for a in angs:
    r = math.radians(a); ctr = mathutils.Vector((cx, 0, cz))
    el = math.radians(float(os.environ.get('ELEV', 0)))  # camera elevation (seat views look down)
    co.location = ctr + mathutils.Vector((math.sin(r) * 3 * math.cos(el), -math.cos(r) * 3 * math.cos(el), 3 * math.sin(el)))
    co.rotation_euler = (ctr - co.location).to_track_quat('-Z', 'Y').to_euler()
    lo.rotation_euler = (math.radians(55), 0, r + math.radians(-25))
    sc.render.filepath = f'{base}_{int(a)}{ext}'; bpy.ops.render.render(write_still=True)
