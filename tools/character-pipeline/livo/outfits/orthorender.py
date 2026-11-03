# blender -b work.blend|asm.blend -P orthorender.py -- out_prefix z0 z1 [objects=W] : ortho front/left/right/back renders (workbench, texture) of a z band
import bpy, sys, math
a=sys.argv[sys.argv.index('--')+1:]; out=a[0]; z0=float(a[1]); z1=float(a[2]); objs=(a[3] if len(a)>3 else 'W').split(',')
sc=bpy.context.scene
for o in bpy.data.objects:
    if o.type=='MESH': o.hide_render = o.name not in objs
sc.render.engine='BLENDER_WORKBENCH'; sh=sc.display.shading; sh.light='STUDIO'; sh.color_type='TEXTURE'
sc.render.resolution_x=sc.render.resolution_y=1000; sc.render.film_transparent=False
cam=bpy.data.cameras.new('c'); cam.type='ORTHO'; cam.ortho_scale=z1-z0; co=bpy.data.objects.new('c',cam); sc.collection.objects.link(co); sc.camera=co
zc=(z0+z1)/2
for name,loc,rot in (('front',(0,-3,zc),(90,0,0)),('left',(3,0,zc),(90,0,90)),('right',(-3,0,zc),(90,0,-90)),('back',(0,3,zc),(90,0,180))):
    co.location=loc; co.rotation_euler=[math.radians(r) for r in rot]
    sc.render.filepath=f'{out}_{name}.png'; bpy.ops.render.render(write_still=True)
