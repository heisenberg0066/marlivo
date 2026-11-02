# EYE_SPEC / mouth for the client bind frame (bbox-normalised, x centred, y from the feet, z centred; front = +z)
import numpy as np, sys
from PIL import Image
from scipy import ndimage
tag=sys.argv[1] if len(sys.argv)>1 else 'hi'
C=np.asarray(Image.open(f'bk_{tag}_final.png').convert('RGB')).astype(float); P=np.load(f'bk_{tag}_pos.npy')
G=np.load(f'bk_{tag}_geo.npz')['V']
mn,mx=G.min(0),G.max(0); ctr=(mn+mx)/2; sc=1/(mx[2]-mn[2])
x,y,z=P[...,0],P[...,1],P[...,2]
valid=~((x==-0.5)&(y==-0.5))
Q0=(x-ctr[0])*sc; Q1=(z-mn[2])*sc; Q2=(-y-(-ctr[1]))*sc
r,g,b=C[...,0],C[...,1],C[...,2]; lum=C.mean(2); sat=C.max(2)-C.min(2)
face=valid&(z>0.585)&(z<0.76)&(y<-0.12)&(np.abs(x)<0.14)
iris=face&(b>r+25)
white=face&(lum>205)&(sat<45)
eye=iris|white
for nm,m in (('iris',iris),('eye',eye)):
    for sg in (-1,1):
        mm=m&(np.sign(Q0)==sg)
        print(nm,sg,'n',int(mm.sum()),'x %.3f..%.3f'%(np.percentile(np.abs(Q0[mm]),1),np.percentile(np.abs(Q0[mm]),99)),'y %.3f..%.3f'%(np.percentile(Q1[mm],1),np.percentile(Q1[mm],99)))
mouth=valid&(z>0.50)&(z<0.585)&(y<-0.12)&(np.abs(x)<0.08)&(((r>150)&(g<125)&(r-g>60))|((lum>200)&(sat<40)))
print('mouth n',int(mouth.sum()),'x %.3f'%np.percentile(np.abs(Q0[mouth]),99),'y %.3f..%.3f'%(np.percentile(Q1[mouth],1),np.percentile(Q1[mouth],99)),'z %.3f'%np.median(Q2[mouth]))
print('eye z', np.median(Q2[eye]).round(3), 'bbox', mn.round(3), mx.round(3))
skin=valid&(y<-0.12)&(np.abs(x)<0.11)&(r>170)&(r-b>25)&(r-b<110)&~eye
up=skin&(z>0.66)&(z<0.70); lo=skin&(z>0.53)&(z<0.60)&~mouth
hx=lambda c: '#%02x%02x%02x'%tuple(int(v) for v in c)
print('lid skin',hx(np.median(C[up],0)),int(up.sum()),'mouth skin',hx(np.median(C[lo],0)),int(lo.sum()))
