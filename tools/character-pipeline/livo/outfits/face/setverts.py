import bpy, numpy as np, sys
a=sys.argv[sys.argv.index('--')+1:]; d=np.load(a[0])
for o in bpy.data.objects:
    if o.type=='MESH' and o.name in d.files:
        V=d[o.name]; assert len(V)==len(o.data.vertices),o.name; o.data.vertices.foreach_set('co',V.ravel()); o.data.update(); print('SET',o.name,len(V))
bpy.ops.wm.save_as_mainfile(filepath=a[1])
