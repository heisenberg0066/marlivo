# render helper: put a texture into a copy of the glb (Blender), for look.sh
import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=a[0])
img = bpy.data.images.load(a[1])
for m in bpy.data.materials:
    if not m.use_nodes: continue
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image and 'nrm' not in nd.image.name.lower() and nd.image.colorspace_settings.name != 'Non-Color': nd.image = img
bpy.ops.export_scene.gltf(filepath=a[2], export_format='GLB', export_image_format='JPEG', export_jpeg_quality=95)
