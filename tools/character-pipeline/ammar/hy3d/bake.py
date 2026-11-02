# blender -b asm.blend -P bake.py -- tag nfaces texsize : join body+patch+arms, decimate, UV (face islands enlarged), bake from SRC
import bpy, bmesh, numpy as np, sys, os
tag, NF, TS = sys.argv[sys.argv.index('--')+1:][:3]; NF=int(NF); TS=int(TS)
OUT='/workspace/sb/hya/bk_'+tag
sc=bpy.context.scene; src=bpy.data.objects['SRC']
W=bpy.data.objects['W']; P=bpy.data.objects['PATCH']; A=bpy.data.objects['ARMS']
if os.environ.get('STAGE')=='prep':
    ANP=os.environ.get('ARMSNPZ','/workspace/sb/hya/arms.npz'); ad=np.load(ANP); am=ad['M']
    if 'ARMSNPZ' in os.environ:   # lower-poly arms for the low LOD (same placement)
        m2=bpy.data.meshes.new('ARMS_lo'); m2.from_pydata(ad['V'].tolist(),[],ad['F'].tolist()); m2.update()
        m2.uv_layers.new(name='UVMap'); m2.materials.append(W.data.materials[0])
        for p_ in m2.polygons: p_.use_smooth=True
        A.data=m2
    def setmask(o,vals):
        ca=o.data.color_attributes.new('MASK','FLOAT_COLOR','POINT')
        ca.data.foreach_set('color',vals.astype(np.float32).ravel())
    if 'MASK' not in W.data.color_attributes: setmask(W,np.tile([0,0,0,1.],(len(W.data.vertices),1)))
    setmask(P,np.tile([1,0,0,1.],(len(P.data.vertices),1)))
    setmask(A,np.array([[0,1,0,1.] if m==1 else [0,0,1,1.] for m in am]))
    # body + patch are decimated; the procedural arms are kept whole (a straight tube would lose its middle rings and
    # could not bend at the elbow), their faces come out of the budget
    nA=len(A.data.polygons)
    bpy.ops.object.select_all(action='DESELECT')
    for o in (W,P): o.select_set(True)
    bpy.context.view_layer.objects.active=W; bpy.ops.object.join(); B=W; B.name='BODY'
    me=B.data
    bm=bmesh.new(); bm.from_mesh(me); r=bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=2e-5); bm.to_mesh(me); bm.free(); print('WELD',len(me.vertices))
    n0=len(me.polygons)
    m=B.modifiers.new('d','DECIMATE'); m.ratio=min(1.0,(NF-nA)/n0); m.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier='d')
    bpy.ops.object.select_all(action='DESELECT'); A.select_set(True); B.select_set(True); bpy.context.view_layer.objects.active=B; bpy.ops.object.join()
    me=B.data; print('ARMS faces',nA)
    print('FACES',len(me.polygons))
    for p in me.polygons: p.use_smooth=True
else:
    bpy.ops.wm.open_mainfile(filepath=OUT+'_dec.blend'); sc=bpy.context.scene; src=bpy.data.objects['SRC']; B=bpy.data.objects['BODY']; me=B.data
if os.environ.get('STAGE')=='prep':
    bpy.ops.object.mode_set(mode='OBJECT')
    V=np.zeros(len(me.vertices)*3); me.vertices.foreach_get('co',V)
    Fp=np.zeros(len(me.polygons)*3,int); me.polygons.foreach_get('vertices',Fp)
    Mk=np.zeros(len(me.vertices)*4,np.float32); me.color_attributes['MASK'].data.foreach_get('color',Mk)
    np.savez(OUT+'_geo.npz',V=V.reshape(-1,3),F=Fp.reshape(-1,3),M=Mk.reshape(-1,4)[:,:3])
    bpy.ops.wm.save_as_mainfile(filepath=OUT+'_dec.blend'); print('PREP',tag); sys.exit(0)
# UVs from xatlas (uvatlas.py): per triangle corner
while me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
uvl=me.uv_layers.new(name='UVMap')
X=np.load(OUT+'_uv.npz'); cu=X['uv'][X['idx'].ravel()]
ls_=np.zeros(len(me.polygons),int); me.polygons.foreach_get('loop_start',ls_); li=(ls_[:,None]+np.arange(3)[None,:]).ravel()
U=np.zeros((len(me.loops),2)); U[li]=cu; uvl.data.foreach_set('uv',U.ravel())
# --- bakes
sc.render.engine='CYCLES'; sc.cycles.samples=1; sc.cycles.device='CPU'
bk=sc.render.bake
def newimg(name,fl=False):
    im=bpy.data.images.new(name,TS,TS,alpha=False,float_buffer=fl); return im
mat=me.materials[0].copy(); me.materials[0]=mat
nt=mat.node_tree
def target(im):
    for n in nt.nodes:
        if n.name=='BAKE_T': nt.nodes.remove(n)
    t=nt.nodes.new('ShaderNodeTexImage'); t.name='BAKE_T'; t.image=im; nt.nodes.active=t
def save(im,path,fmt='PNG'):
    im.filepath_raw=path; im.file_format=fmt; im.save()
bpy.ops.object.select_all(action='DESELECT'); src.select_set(True); B.select_set(True); bpy.context.view_layer.objects.active=B
bk.use_selected_to_active=True; bk.cage_extrusion=float(os.environ.get('CAGE',0.006)); bk.max_ray_distance=float(os.environ.get('MAXRAY',0.02)); bk.margin=6
col=newimg('col'); target(col); bk.use_pass_direct=False; bk.use_pass_indirect=False; bk.use_pass_color=True
(os.environ.get('ONLYSELF') or bpy.ops.object.bake(type='DIFFUSE',pass_filter={'COLOR'})); save(col,OUT+'_col.png') if not os.environ.get('ONLYSELF') else None
nrm=newimg('nrm'); target(nrm)
if not os.environ.get('ONLYSELF'): bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT'); save(nrm,OUT+'_nrm.png')
# self bakes: mask and position (emission)
bk.use_selected_to_active=False; bpy.ops.object.select_all(action='DESELECT'); B.select_set(True)
out=[n for n in nt.nodes if n.type=='OUTPUT_MATERIAL'][0]; old=out.inputs[0].links[0].from_socket
em=nt.nodes.new('ShaderNodeEmission'); nt.links.new(em.outputs[0],out.inputs[0])
ca=nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name='MASK'; nt.links.new(ca.outputs[0],em.inputs[0])
mk=newimg('mask'); target(mk); bk.margin=2; bpy.ops.object.bake(type='EMIT'); save(mk,OUT+'_mask.png')
ge=nt.nodes.new('ShaderNodeNewGeometry'); va=nt.nodes.new('ShaderNodeVectorMath'); va.operation='ADD'; va.inputs[1].default_value=(0.5,0.5,0.0)
nt.links.new(ge.outputs['Position'],va.inputs[0]); nt.links.new(va.outputs[0],em.inputs[0])
ps=newimg('pos',True); ps.colorspace_settings.name='Non-Color'; target(ps); sc.view_settings.view_transform='Standard'; bpy.ops.object.bake(type='EMIT'); save(ps,OUT+'_pos.exr','OPEN_EXR'); _p=np.array(ps.pixels[:],dtype=np.float32).reshape(TS,TS,4)[::-1,:,:3]-np.array([0.5,0.5,0.0],np.float32); np.save(OUT+'_pos.npy',_p)
nt.links.new(old,out.inputs[0])
for n in ('BAKE_T',): nt.nodes.remove(nt.nodes[n])
for nd in (em,ca,ge,va): nt.nodes.remove(nd)
bpy.data.objects.remove(src)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'.blend')
print('BAKED',tag)
