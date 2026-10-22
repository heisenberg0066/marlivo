# blender -b <file.blend> -P export.py -- <objname> <out.glb> [webp]
import bpy, sys
argv = sys.argv[sys.argv.index('--') + 1:]
obj, out = argv[0], argv[1]; fmt = argv[2] if len(argv) > 2 else 'WEBP'
bpy.ops.object.select_all(action='DESELECT')
o = bpy.data.objects[obj]; o.hide_set(False); o.hide_render = False; o.select_set(True)
for c in o.children_recursive: c.select_set(True)
if o.parent: o.parent.select_set(True)
bpy.context.view_layer.objects.active = o
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_image_format=fmt, export_image_quality=88, export_animations=True, export_skins=True, export_yup=True, export_texcoords=True, export_normals=True, export_attributes=False)
