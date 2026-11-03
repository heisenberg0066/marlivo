import bpy, numpy as np
w=bpy.data.objects['W']; me=w.data
uv=np.zeros(len(me.loops)*2); me.uv_layers[0].data.foreach_get('uv',uv); uv=uv.reshape(-1,2)
lv=np.zeros(len(me.loops),int); me.loops.foreach_get('vertex_index',lv)
U=np.zeros((len(me.vertices),2)); U[lv]=uv
np.save('W_uv.npy',U)
for im in bpy.data.images:
    if im.size[0]>0:
        n=im.name.replace(' ','_'); im.filepath_raw='src_'+n+'.png'; im.file_format='PNG'; im.save(); print('IMG',n)
