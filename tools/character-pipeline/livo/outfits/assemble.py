# work.blend W -> delete sleeve faces, add wall patch (+ arms if arms.npz) -> object BODY; save asm.blend, optional glb preview
import bpy, bmesh, numpy as np, sys, os
a=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
w=bpy.data.objects['W']; me=w.data
fd=np.load('delF.npy')
me.calc_loop_triangles()
# delF is per loop-triangle; W is all triangles after decimate? map triangle->polygon
pi=np.zeros(len(me.loop_triangles),int); me.loop_triangles.foreach_get('polygon_index',pi)
dpoly=np.zeros(len(me.polygons),bool); dpoly[pi[fd]]=True
bm=bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[f for f in bm.faces if dpoly[f.index]],context='FACES')
# close the openings left by the removed sleeves (the patch covers them from outside; this stops see-through gaps)
nb=sum(1 for e in bm.edges if e.is_boundary)
r=bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=int(os.environ.get('HOLESIDES',40)))   # small holes only: a long loop filled as one n-gon fans across the body
pk=bmesh.ops.poke(bm,faces=r['faces'])
newv=set(v.index for v in pk['verts']) if 'verts' in pk else set()
bm.verts.ensure_lookup_table()
print('HOLES boundary edges',nb,'filled faces',len(r['faces']))
bm.to_mesh(me); bm.free()
import numpy as _np
_mk=_np.zeros((len(me.vertices),4),_np.float32); _mk[:,3]=1
for i in newv: _mk[i,0]=1
ca=me.color_attributes.new('MASK','FLOAT_COLOR','POINT'); ca.data.foreach_set('color',_mk.ravel()); print('POKE verts',len(newv))
def addmesh(name,npz,mat=None):
    d=np.load(npz); m=bpy.data.meshes.new(name); m.from_pydata(d['V'].tolist(),[],d['F'].tolist()); m.update()
    o=bpy.data.objects.new(name,m); bpy.context.scene.collection.objects.link(o)
    if 'UV' in d.files:
        uv=m.uv_layers.new(name='UVMap'); L=np.array([l.vertex_index for l in m.loops]); uv.data.foreach_set('uv',d['UV'][L].ravel())
    else: m.uv_layers.new(name='UVMap')
    for p in m.polygons: p.use_smooth=True
    m.materials.append(w.data.materials[0])
    return o
objs=[addmesh('PATCH','patch.npz')]
if os.path.exists('arms.npz'): objs.append(addmesh('ARMS','arms.npz'))
bpy.ops.wm.save_as_mainfile(filepath='asm.blend')
if len(a)>0:
    bpy.data.objects.remove(bpy.data.objects['SRC'])
    bpy.ops.export_scene.gltf(filepath=a[0],export_format='GLB',export_image_format='JPEG')
