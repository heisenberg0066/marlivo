# blender -b bk_<tag>.blend -P export_tex.py -- col.png nrm.png|- out.glb [skin]
import bpy, sys, os
a=sys.argv[sys.argv.index('--')+1:]; colp,nrmp,out=a[:3]; skin=len(a)>3 and a[3]=='skin'
B=bpy.data.objects['BODY']; me=B.data
import numpy as np
if 'MASK' in me.color_attributes:
    mk=np.zeros(len(me.vertices)*4,np.float32); me.color_attributes['MASK'].data.foreach_get('color',mk); mk=mk.reshape(-1,4)
    if os.environ.get('ARMATTR'):
        at=me.attributes.new('_ARM','FLOAT','POINT'); at.data.foreach_set('value',((mk[:,1]+mk[:,2])>0.5).astype(np.float32))
    me.color_attributes.remove(me.color_attributes['MASK'])
mat=bpy.data.materials.new('livo'); mat.use_nodes=True; nt=mat.node_tree; bs=nt.nodes['Principled BSDF']
t=nt.nodes.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(colp); nt.links.new(t.outputs[0],bs.inputs['Base Color'])
bs.inputs['Roughness'].default_value=0.8; bs.inputs['Metallic'].default_value=0.0
if nrmp!='-':
    tn=nt.nodes.new('ShaderNodeTexImage'); tn.image=bpy.data.images.load(nrmp); tn.image.colorspace_settings.name='Non-Color'
    nm=nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs[0],nm.inputs['Color']); nt.links.new(nm.outputs[0],bs.inputs['Normal'])
me.materials.clear(); me.materials.append(mat)
for o in list(bpy.data.objects):
    if o!=B: bpy.data.objects.remove(o)
if skin:
    arm=bpy.data.armatures.new('rig'); ao=bpy.data.objects.new('rig',arm); bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active=ao; bpy.ops.object.mode_set(mode='EDIT'); b=arm.edit_bones.new('root'); b.head=(0,0,0); b.tail=(0,0,0.2); bpy.ops.object.mode_set(mode='OBJECT')
    B.parent=ao; md=B.modifiers.new('arm','ARMATURE'); md.object=ao
    g=B.vertex_groups.new(name='root'); g.add(list(range(len(me.vertices))),1.0,'REPLACE')
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',export_image_format=os.environ.get('IMGFMT','JPEG'),export_image_quality=int(os.environ.get('IMGQ',90)),export_skins=skin,export_yup=True,export_attributes=bool(os.environ.get('ARMATTR')),export_animations=False)
