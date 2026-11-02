import bpy, sys, numpy as np
a = sys.argv[sys.argv.index('--') + 1:]; src, out = a[0], a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']; print([o.name for o in obs])
o = obs[0]; me = o.data; me.calc_loop_triangles()
M = np.array(o.matrix_world)
co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
co = co @ M[:3, :3].T + M[:3, 3]
nr = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', nr); nr = nr.reshape(-1, 3) @ M[:3, :3].T
lt = me.loop_triangles; T = np.zeros(len(lt) * 3, dtype=np.int64); lt.foreach_get('vertices', T)
L = np.zeros(len(lt) * 3, dtype=np.int64); lt.foreach_get('loops', L)
uv = np.zeros(len(me.loops) * 2); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
np.savez(out, co=co, nr=nr, T=T.reshape(-1, 3), tuv=uv[L].reshape(-1, 3, 2))
print('EXP', len(co), len(lt))
