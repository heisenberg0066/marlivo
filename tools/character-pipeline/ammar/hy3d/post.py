# baked HY3D colour -> final base colour: sleeves/wall patch get coat cloth, hands skin, beanie recoloured to cream
import numpy as np, sys, os
from PIL import Image
from scipy.spatial import cKDTree
from scipy import ndimage
E=lambda k,d: float(os.environ.get(k,d))
tag=sys.argv[1]; pre=f'bk_{tag}'
C=np.asarray(Image.open(pre+'_col.png').convert('RGB')).astype(np.float32)
N=np.asarray(Image.open(pre+'_nrm.png').convert('RGB')).astype(np.float32)
M=np.asarray(Image.open(pre+'_mask.png').convert('RGB')).astype(np.float32)/255
P=np.load(pre+'_pos.npy'); H,W=C.shape[:2]
x,y,z=P[...,0],P[...,1],P[...,2]
valid=~((x==-0.5)&(y==-0.5))&(np.abs(x)<0.45)&(np.abs(y)<0.45)&(z>-0.01)&(z<1.01)
patch=(M[...,0]>E('PATCHT',0.03)); sleeve=(M[...,1]>0.5); hand=(M[...,2]>0.5)
# coat cloth source texels: camel, on the coat sides/back between hem and shoulder
r,g,b=C[...,0],C[...,1],C[...,2]; lum=C.mean(2)
camel=valid&~patch&~sleeve&~hand&(((r-b>35)&(r-b<95)&(lum>95)&(lum<200)) if os.environ.get('CLOTH','camel')=='camel' else ((lum>E('CL0',12))&(lum<E('CL1',75))&((C.max(2)-C.min(2))<E('CLS',28))))&(z>E('CZ0',0.08))&(z<E('CZ1',0.48))
print('camel texels',int(camel.sum()))
cp=P[camel]; cc=C[camel]; tr=cKDTree(cp)
cxg=E('CX',0.0103); ph=np.degrees(np.arctan2(y-E('CY',-0.055),x-cxg)); dl=np.maximum(46-np.abs(ph),46-np.abs(np.abs(ph)-180))
spike=valid&(dl>0)&(z>E('SPZ0',0.235))&(z<E('SPZ1',0.31))&(lum<E('SPL',85))&~hand
print('dark remnants',int(spike.sum()))
tgt=(patch|sleeve|spike)&valid
q=P[tgt]
# arm texels: query the coat at the same height on the body side (sleeves live next to the coat)
qq=q.copy()
d,ix=tr.query(qq,k=64,distance_upper_bound=0.08)
okk=np.isfinite(d); ix=np.where(okk,ix,0); wgt=np.where(okk,1.0/(d+0.01),0)
col=(cc[ix]*wgt[...,None]).sum(1)/np.maximum(wgt.sum(1),1e-6)[:,None]
far=wgt.sum(1)<1e-6; col[far]=np.median(cc,0)
# pull toward the median coat colour at that height (removes light/dark blotches from baked lighting)
zb=np.clip(((cp[:,2]-0.0)/0.02).astype(int),0,49); med=np.array([np.median(cc[zb==k],0) if (zb==k).sum()>50 else np.median(cc,0) for k in range(50)])
med=ndimage.gaussian_filter1d(med,3,axis=0,mode='nearest'); fq=np.clip(q[:,2]/0.02-0.5,0,48.999); q0=fq.astype(int); dq=(fq-q0)[:,None]
col=col*(1-E('MEDK',0.92))+(med[q0]*(1-dq)+med[q0+1]*dq)*E('MEDK',0.92)
# fine cloth grain: high-pass luminance of the coat texture (a coat swatch tiled by 3D position)
L=ndimage.gaussian_filter(lum,1.0)-ndimage.gaussian_filter(lum,6.0)
gr=np.clip(L[camel],-12,12)
d1,i1=tr.query(q*np.array([1,1,1])+np.array([0.013,0.021,0.0]),k=1)   # offset so the grain is not a smeared copy
col=col+gr[i1][:,None]*E('GRAIN',0.6)
out=C.copy(); out[tgt]=col
# sleeve shading: cuff band and a soft seam along the back of the sleeve
if sleeve.any():
    import json
    J=json.load(open('axes.json'))
    sl=sleeve&valid; ps=P[sl]
    # parametrise along the arm axis (shoulder z .475 -> wrist z .28)
    t=np.clip((E('ASZ',0.475)-ps[:,2])/(E('ASZ',0.475)-E('AWZ',0.28)),0,1)
    band=np.exp(-((t-0.90)/0.012)**2)*0.10+np.exp(-((t-0.985)/0.012)**2)*0.08
    out[sl]=out[sl]*(1-band[:,None])
# hands: skin from the cheeks
fx=np.abs(x)<0.12; cheek=valid&(z>E('SKZ0',0.62))&(z<E('SKZ1',0.70))&(y<E('SKY',-0.13))&(np.abs(x)<E('SKX',1))&(r>E('SKR',180))&(r-b>30)&(r-b<110)&~patch&~sleeve&~hand
skin=np.median(C[cheek],0) if cheek.sum()>100 else np.array([240,195,170.])
print('skin',skin.round(),int(cheek.sum()))
hm=hand&valid
if hm.any():
    hz=P[hm][:,2]; sh=1-0.10*np.clip((E('HZ0',0.245)-hz)/0.05,0,1)
    skin=skin*np.array([E('SKM_R',1),E('SKM_G',1),E('SKM_B',1)]); out[hm]=skin[None]*sh[:,None]*E('HANDK',0.97)
# beanie: grey knit -> reference cream
faceF=(y<-0.11)&(z<0.70)&(np.abs(x)<0.14)
bn=(valid if E('BEANIE',1)>0 else np.zeros_like(valid))&(((z>0.655)&~faceF&((C.max(2)-C.min(2))<34)&(lum>55))|((z>0.58)&(y>-0.02)&((C.max(2)-C.min(2))<22)&(lum>100)))&~hand&~sleeve
cream=np.array([float(v) for v in os.environ.get('CREAM','226,210,192').split(',')])
gref=np.median(lum[bn]) if bn.any() else 1; k=lum[bn]/gref
out[bn]=np.clip(cream[None]*k[:,None],0,255)
print('beanie',int(bn.sum()),'grey',gref)
# normal map: flat where the surface was synthesised
No=N.copy(); No[tgt|hm]=[128,128,255]
# dilate into gutters (bake margin already done; keep)
Image.fromarray(out.clip(0,255).astype(np.uint8)).save(pre+'_final.png')
Image.fromarray(No.astype(np.uint8)).save(pre+'_nrmf.png')
