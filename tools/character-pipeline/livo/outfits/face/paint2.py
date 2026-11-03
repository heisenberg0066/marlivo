# face paint pass in a front chart (u = distance to the face plane, v = height; frontmost texel per cell), after face.py
# usage: python paint2.py <tag>   (cwd = hyf/<o>; reads bk_<tag>_mir.png, writes bk_<tag>_final.png; landmarks ../<o>_lm.json)
import numpy as np, sys, os, json
from PIL import Image, ImageDraw
from scipy import ndimage
E=lambda k,v: float(os.environ.get(k,v))
tag=sys.argv[1]; pre=f'bk_{tag}'; o=os.path.basename(os.getcwd())
J=json.load(open(f'../{o}_warp.json')); c=np.array(J['c']); n=np.array(J['n'])
L=json.load(open(f'../{o}_lm.json')) if os.path.exists(f'../{o}_lm.json') else {}
g=lambda k,v: L.get(k,v)
def sm(x,a,b): t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)
C=np.asarray(Image.open(pre+'_mir.png').convert('RGB')).astype(np.float32); TH,TW=C.shape[:2]
P=np.load(pre+'_pos.npy'); w=np.load(pre+'_facew.npy')
valid=~((P[...,0]==-0.5)&(P[...,1]==-0.5))
fwd=np.cross([0,0,1.],n); fwd/=np.linalg.norm(fwd); fwd=-fwd if fwd[1]>0 else fwd
u=(P-c)@n; v=P[...,2]; f=(P-c)@fwd
R=E('R',0.0001); U0,V0=-0.075,0.79; NU,NV=int(0.15/R),int(0.19/R)
sel=valid&(w>0.01)&(f>-0.07)
ys,xs=np.nonzero(sel); iu=np.clip(((u[ys,xs]-U0)/R).astype(int),0,NU-1); iv=np.clip(((v[ys,xs]-V0)/R).astype(int),0,NV-1)
fd=f[ys,xs]; o_=np.argsort(fd)
Z=np.full((NV,NU),-9.,np.float32); Ch=np.zeros((NV,NU,3),np.float32)
Z[iv[o_],iu[o_]]=fd[o_]; Ch[iv[o_],iu[o_]]=C[ys,xs][o_]
have=Z>-9; _,(a,b)=ndimage.distance_transform_edt(~have,return_indices=True); Z=Z[a,b]; Ch=Ch[a,b]
# chart grids
VV,UU=np.mgrid[0:NV,0:NU]; Ug=U0+(UU+0.5)*R; Vg=V0+(VV+0.5)*R; Au=np.abs(Ug)
Wg=np.zeros((NV,NU),np.float32); np.maximum.at(Wg,(iv,iu),w[ys,xs]); Wg=ndimage.grey_dilation(Wg,size=5)
_sd=np.abs(Ch-Ch[:,::-1]).sum(2); _sa=(1-sm(_sd,25,45))[...,None]*0.5
Ch=Ch*(1-_sa)+Ch[:,::-1]*_sa      # the halves are mirrored already: averaging removes leftover layer specks
lum=Ch.mean(2); r,gg,bb=Ch[...,0],Ch[...,1],Ch[...,2]
out=Ch.copy()
# ---- 1. smooth skin (features kept where they differ from the smooth field)
skin=(r>145)&(r-bb>25)&(r-bb<115)&(gg>95)&(lum>115)
Sk=np.where(skin[...,None],Ch,0); wk=skin.astype(np.float32)
sg_=E('GS',22)
Gf=np.stack([ndimage.gaussian_filter(Sk[...,k],sg_) for k in range(3)],-1)/np.maximum(ndimage.gaussian_filter(wk,sg_),1e-4)[...,None]
diff=np.abs(Ch-Gf).sum(2)
vb=g('vbrow',0.917)
fore=sm(Vg,vb+E('FOREA',0.006),vb+E('FOREB',0.011))
keep=sm(diff,E('FT0',24),E('FT1',60))*(1-fore*(diff<80))
k=(1-keep)*skin
det=Ch-np.stack([ndimage.gaussian_filter(Ch[...,j],2.0) for j in range(3)],-1)
out=out*(1-k[...,None])+(Gf+det*E('DET',0.5)*(1-fore[...,None]))*k[...,None]
# ---- 2. blush + freckles
for s_ in (1,-1):
    bl=np.exp(-((Ug-s_*g('ublush',0.033))/0.010)**2-((Vg-g('vblush',0.873))/0.0065)**2)*skin
    out=out*(1-E('BLA',0.20)*bl[...,None])+np.array([236,140,128.])*E('BLA',0.20)*bl[...,None]
rng=np.random.default_rng(int(E('SEED',7))); im=Image.fromarray(np.zeros((NV,NU),np.uint8)); dr=ImageDraw.Draw(im)
for _ in range(int(E('NFR',28))):
    fu=rng.uniform(0.003,0.040); fv=rng.uniform(g('vfr0',0.872),g('vfr1',0.889))
    if fu>0.013 and fv>g('vfr1',0.889)-0.005: continue
    rr=rng.uniform(0.00045,0.00075)/R; al=int(rng.uniform(80,150))
    for s_,ju,jv in ((1,0,0),(-1,rng.normal(0,0.0012),rng.normal(0,0.001))):
        X=(s_*fu+ju-U0)/R; Y=(fv+jv-V0)/R; dr.ellipse([X-rr,Y-rr*0.9,X+rr,Y+rr*0.9],fill=al)
fm=ndimage.gaussian_filter(np.asarray(im,np.float32)/255,1.0)*skin*E('FRK',1.0)
out=out*(1-fm[...,None]*(1-np.array([0.80,0.64,0.55])))
# ---- 3. mouth: teeth region (light or recessed between the lips), symmetric, painted clean white
Zs=ndimage.gaussian_filter(Z,(30,60)); rec=Zs-Z
um,vm=g('um',0.027),g('vm',0.848)
box=(Au<um)&(np.abs(Vg-vm)<0.009)
boxw=(1-sm(Au,um*0.95,um*1.12))*(1-sm(np.abs(Vg-vm),0.007,0.0095))
lip=box&(r-gg>E('LIPT',55))&(r>140)
T=box&(((lum>150)&((Ch.max(2)-Ch.min(2))<75))|((rec>E('REC',0.0009))&~lip))
T=ndimage.binary_opening(T,iterations=2); T=ndimage.binary_closing(T,iterations=4); T=ndimage.binary_fill_holes(T)
T=(T.astype(np.float32)+T[:,::-1])/2>0.5
T=ndimage.gaussian_filter(T.astype(np.float32),E('TSM',6))>0.5
up=int(E('TUP',0.0010)/R); Tu=T.copy()
for k_ in range(1,up+1): Tu[k_:]|=T[:-k_]
T=Tu&box
lab,nl=ndimage.label(T)
if nl>1:
    sz=ndimage.sum(T,lab,range(1,nl+1)); T=lab==(1+int(np.argmax(sz)))
dt=ndimage.distance_transform_edt(T)*R
tc=np.array(g('teeth',[252,248,240]),float)
sh=(1-0.20*sm(Au,um*0.45,um*0.95))*(0.82+0.18*sm(dt,0.0,0.0012))
Tw=ndimage.gaussian_filter(T.astype(np.float32),1.2)
out=out*(1-Tw[...,None])+(tc[None,None]*sh[...,None])*Tw[...,None]
# lips: symmetric, smooth, a touch warmer
lipm=ndimage.gaussian_filter((lip&~T).astype(np.float32),1.5)*boxw
lc=np.array(g('lip',[222,120,112]),float)
lsm=np.stack([ndimage.gaussian_filter(out[...,j],3) for j in range(3)],-1)
out=out*(1-0.6*lipm[...,None])+(lsm*0.5+lc*0.5)*0.6*lipm[...,None]
# ---- 4. eyes: blue-grey iris with a dark rim, pupil and catch light
for s_ in (1,-1):
    eu,ev,er=s_*g('ue',0.0252),g('ve',0.901),g('er',0.0056)
    d=np.hypot(Ug-eu,Vg-ev)/er
    iris=(d<1.05)&(bb>r-8)&(lum<200)
    iris=ndimage.binary_closing(iris,iterations=2)
    base=np.array(g('iris',[108,132,148]),float)
    ic=base*(0.80+0.35*sm(d,0.3,0.85))[...,None]*(1-0.5*sm(d,0.80,1.0))[...,None]
    pup=d<0.40; ic[pup]=np.array([24,27,33.])
    a_=ndimage.gaussian_filter(iris.astype(np.float32),0.8)*E('IRK',0.9)
    out=out*(1-a_[...,None])+ic*a_[...,None]
    cl=np.hypot(Ug-(eu-0.30*er),Vg-(ev+0.32*er))/(er*0.22)
    cm=(cl<1)*a_; out=out*(1-cm[...,None])+252*cm[...,None]
# ---- write back: front-layer texels in the face window take the edited chart colour
E_=out-Ch
ti=np.clip(((u-U0)/R).astype(int),0,NU-1); tv=np.clip(((v-V0)/R).astype(int),0,NV-1)
inch=valid&(w>0.01)&(u>U0)&(u<U0+NU*R)&(v>V0)&(v<V0+NV*R)&(f>Z[tv,ti]-E('LAYER',0.0025))
Cn=C.copy(); wa=w[inch][:,None]
Cn[inch]=C[inch]*(1-wa)+out[tv[inch],ti[inch]]*wa
# gutters: texels without a position take the nearest valid texel colour (no old colour bleeding along chart seams)
_,(ga,gb)=ndimage.distance_transform_edt(~valid,return_indices=True); gut=~valid
Cn[gut]=Cn[ga[gut],gb[gut]]
Image.fromarray(Cn.clip(0,255).astype(np.uint8)).save(pre+'_final.png')
Image.fromarray(out[::-1].clip(0,255).astype(np.uint8)).save(f'/tmp/of/pchart_{o}_{tag}.png')
print('paint2',tag,'teeth px',int(T.sum()),'lip px',int(lip.sum()))

# normal map: flat over the face window (the mirrored half carried the other half's normal detail: dark specks, fangs)
nf=pre+'_nrmf.png'
if os.path.exists(nf):
    if not os.path.exists(pre+'_nrmf_orig.png'): Image.open(nf).save(pre+'_nrmf_orig.png')
    N=np.asarray(Image.open(pre+'_nrmf_orig.png').convert('RGB')).astype(np.float32)
    a=np.clip(w*E('NFLAT',1.0),0,1)[...,None]; N=N*(1-a)+np.array([128,128,255.])*a
    Image.fromarray(N.astype(np.uint8)).save(nf)
