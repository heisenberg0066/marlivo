# blender -b -P facegrid.py -- model.glb out.png : ortho front render of the head band in the client bind frame (Q0 x centred, Q1 from feet)
import bpy, sys, math, mathutils
a=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=a[0])
ms=[o for o in bpy.data.objects if o.type=='MESH']
pts=[o.matrix_world@v.co for o in ms for v in o.data.vertices]
mn=mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); mx=mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
H=mx.z-mn.z; cx=(mn.x+mx.x)/2
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sh=sc.display.shading; sh.light='FLAT'; sh.color_type='TEXTURE'
sc.render.resolution_x=sc.render.resolution_y=1000
cam=bpy.data.cameras.new('c'); cam.type='ORTHO'; cam.ortho_scale=0.16*H; co=bpy.data.objects.new('c',cam); sc.collection.objects.link(co); sc.camera=co
q1c=float(a[2]) if len(a)>2 else 0.92
co.location=(cx,mn.y-1,mn.z+q1c*H); co.rotation_euler=(math.radians(90),0,0)
sc.render.filepath=a[1]; bpy.ops.render.render(write_still=True)
open(a[1]+'.json','w').write('{"H":%f,"q1c":%f,"span":0.16}'%(H,q1c))
