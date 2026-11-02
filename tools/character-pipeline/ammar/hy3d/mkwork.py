# original HY3D glb (read only) -> H=1 scaled source.blend (object SRC) + working decimated copy (object W, 250k tris)
import bpy, numpy as np
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/workspace/marlivo_figure/hy3d/ammar_hy3d_single.glb')
o=[o for o in bpy.data.objects if o.type=='MESH'][0]; o.name='SRC'
H=max((o.matrix_world@v.co).z for v in o.data.vertices); s=1.0/H
o.scale=(s,s,s); bpy.context.view_layer.objects.active=o; o.select_set(True)
bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
import bmesh
w=o.copy(); w.data=o.data.copy(); w.name='W'; bpy.context.scene.collection.objects.link(w)
bm=bmesh.new(); bm.from_mesh(w.data); nb0=sum(1 for e in bm.edges if e.is_boundary); bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=float(__import__('os').environ.get('WELD','1e-5'))); print('WELD', len(bm.verts), 'boundary', nb0, '->', sum(1 for e in bm.edges if e.is_boundary)); bm.to_mesh(w.data); bm.free()
m=w.modifiers.new('d','DECIMATE'); m.ratio=250000/len(o.data.polygons)
bpy.context.view_layer.objects.active=w; bpy.ops.object.modifier_apply(modifier='d')
print('W', len(w.data.vertices), len(w.data.polygons), 'H', H)
bpy.ops.wm.save_as_mainfile(filepath='/workspace/sb/hya/work.blend')
me=w.data; V=np.zeros(len(me.vertices)*3); me.vertices.foreach_get('co',V); me.calc_loop_triangles()
F=np.zeros(len(me.loop_triangles)*3,int); me.loop_triangles.foreach_get('vertices',F)
np.savez('/workspace/sb/hya/W.npz',V=V.reshape(-1,3),F=F.reshape(-1,3))
