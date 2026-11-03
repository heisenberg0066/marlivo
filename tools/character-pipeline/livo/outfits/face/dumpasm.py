import bpy, numpy as np, sys
out=sys.argv[sys.argv.index('--')+1]
d={}
for o in bpy.data.objects:
    if o.type!='MESH': continue
    me=o.data; V=np.zeros(len(me.vertices)*3); me.vertices.foreach_get('co',V)
    me.calc_loop_triangles(); T=np.zeros(len(me.loop_triangles)*3,int); me.loop_triangles.foreach_get('vertices',T)
    d[o.name+'_V']=V.reshape(-1,3); d[o.name+'_F']=T.reshape(-1,3)
    print(o.name,len(me.vertices),np.array(o.matrix_world).round(3).tolist())
np.savez(out,**d)
