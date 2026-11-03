# landmarks for paint2 from the mirrored texture's frontmost chart: eyes (iris centre/radius), mouth (teeth), brows
import numpy as np, sys, os, json
from PIL import Image
from scipy import ndimage
o=sys.argv[1]; J=json.load(open(f'{o}_warp.json')); c=np.array(J['c']); n=np.array(J['n'])
C=np.asarray(Image.open(f'{o}/bk_hi_mir.png').convert('RGB')).astype(np.float32); P=np.load(f'{o}/bk_hi_pos.npy'); w=np.load(f'{o}/bk_hi_facew.npy')
valid=~((P[...,0]==-0.5)&(P[...,1]==-0.5))
fwd=np.cross([0,0,1.],n); fwd/=np.linalg.norm(fwd); fwd=-fwd if fwd[1]>0 else fwd
u=(P-c)@n; v=P[...,2]; f=(P-c)@fwd
R=0.0002; U0,V0=-0.075,0.79; NU,NV=int(0.15/R),int(0.19/R)
sel=valid&(w>0.3)&(f>-0.07); ys,xs=np.nonzero(sel)
iu=np.clip(((u[ys,xs]-U0)/R).astype(int),0,NU-1); iv=np.clip(((v[ys,xs]-V0)/R).astype(int),0,NV-1); fd=f[ys,xs]; o_=np.argsort(fd)
Ch=np.zeros((NV,NU,3)); Hv=np.zeros((NV,NU),bool); Ch[iv[o_],iu[o_]]=C[ys,xs][o_]; Hv[iv,iu]=True
_,(a_,b_)=ndimage.distance_transform_edt(~Hv,return_indices=True); Ch=Ch[a_,b_]; Hv=ndimage.distance_transform_edt(~Hv)<4
VV,UU=np.mgrid[0:NV,0:NU]; Ug=U0+(UU+0.5)*R; Vg=V0+(VV+0.5)*R; Au=np.abs(Ug)
r,g,b=Ch[...,0],Ch[...,1],Ch[...,2]; lum=Ch.mean(2)
iris=Hv&(b>r-5)&(lum<150)&(Vg>0.87)&(Vg<0.93)&(Au>0.008)&(Au<0.045)
L={}
es=[]
for s_ in (1,-1):
    m=iris&(np.sign(Ug)==s_); lab,nl=ndimage.label(m)
    if nl==0: continue
    sz=ndimage.sum(m,lab,range(1,nl+1)); m=lab==(1+int(np.argmax(sz)))
    es.append((abs(Ug[m].mean()),Vg[m].mean(),np.sqrt(m.sum()*R*R/np.pi)))
es=np.array(es); L['ue'],L['ve'],L['er']=float(es[:,0].mean()),float(es[:,1].mean()),float(es[:,2].mean()*1.1)
teeth=Hv&(lum>195)&((Ch.max(2)-Ch.min(2))<55)&(Vg>0.825)&(Vg<L['ve']-0.03)&(Au<0.035)
lab,nl=ndimage.label(teeth); sz=ndimage.sum(teeth,lab,range(1,nl+1)); tm=lab==(1+int(np.argmax(sz)))
L['vm']=float(Vg[tm].mean()); L['um']=float(max(np.percentile(Au[tm],98)*1.15,0.02))
br=Hv&(lum<120)&(r-b>15)&(Vg>L['ve']+0.006)&(Vg<L['ve']+0.03)&(Au>0.01)&(Au<0.035)
L['vbrow']=float(Vg[br].mean()) if br.any() else L['ve']+0.016
L['vblush']=L['ve']-0.028; L['vfr0']=L['ve']-0.029; L['vfr1']=L['ve']-0.012; L['ublush']=L['ue']*1.3
json.dump(L,open(f'{o}_lm.json','w'),indent=1); print(o,{k:round(v,4) for k,v in L.items()})
