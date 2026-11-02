# Ammar EYE_SPEC / mouth in the client bind frame (bbox-normalised, x centred, y from the feet, z centred; front = +z)
import numpy as np, sys
from PIL import Image
tag=sys.argv[1] if len(sys.argv)>1 else 'hi'
C=np.asarray(Image.open(f'bk_{tag}_final.png').convert('RGB')).astype(float); P=np.load(f'bk_{tag}_pos.npy')
G=np.load(f'bk_{tag}_geo.npz')['V']
mn,mx=G.min(0),G.max(0); ctr=(mn+mx)/2; sc=1/(mx[2]-mn[2])
x,y,z=P[...,0],P[...,1],P[...,2]
valid=~((x==-0.5)&(y==-0.5))
Q0=(x-ctr[0])*sc; Q1=(z-mn[2])*sc; Q2=(-y-(-ctr[1]))*sc
r,g,b=C[...,0],C[...,1],C[...,2]; lum=C.mean(2); sat=C.max(2)-C.min(2)
face=valid&(z>0.76)&(z<0.88)&(y<-0.12)&(np.abs(x)<0.12)
white=face&(lum>185)&(sat<40)
for sg in (-1,1):
    mm=white&(np.sign(Q0)==sg)
    if mm.sum()<10: print('none',sg); continue
    print('white',sg,'n',int(mm.sum()),'x %.3f..%.3f'%tuple(np.percentile(np.abs(Q0[mm]),[2,98])),'y %.3f..%.3f'%tuple(np.percentile(Q1[mm],[2,98])),'z %.3f'%np.median(Q2[mm]))
print('bbox',mn.round(3),mx.round(3))
for zz in np.arange(0.70,0.80,0.005):
    s=valid&(np.abs(z-zz)<0.0025)&(y<-0.10)&(np.abs(x)<0.05)
    if s.sum(): print('%.3f'%zz, 'Q1 %.3f'%np.median(Q1[s]), np.median(C[s],0).round(), 'Q2 %.3f'%np.median(Q2[s]))
dark=valid&(Q2>0.10)&(np.abs(Q0)>0.015)&(np.abs(Q0)<0.085)&(Q1>0.765)&(Q1<0.83)&(lum<95)
for sg in (-1,1):
    mm=dark&(np.sign(Q0)==sg)
    print('dark',sg,int(mm.sum()),'x %.3f..%.3f'%tuple(np.percentile(np.abs(Q0[mm]),[3,50,97])[[0,2]]),'y',np.percentile(Q1[mm],[3,25,50,75,97]).round(3))
    for yy in np.arange(0.765,0.83,0.005):
        s=mm&(np.abs(Q1-yy)<0.0025)
        if s.sum()>5: print('  %.3f n %d x %.3f..%.3f'%(yy,s.sum(),*np.percentile(np.abs(Q0[s]),[5,95])))
mo=valid&(Q2>0.10)&(np.abs(Q0)<0.05)&(Q1>0.725)&(Q1<0.755)&(r-g>70)&(lum<170)&(lum>90)
print('lips n',int(mo.sum()),'x %.3f'%np.percentile(np.abs(Q0[mo]),97),'y',np.percentile(Q1[mo],[3,50,97]).round(3),'z %.3f'%np.median(Q2[mo]))
sk=valid&(Q2>0.10)&(np.abs(Q0)>0.04)&(np.abs(Q0)<0.07)&(Q1>0.725)&(Q1<0.76)
print('mouth skin #%02x%02x%02x'%tuple(np.median(C[sk],0).astype(int)))
lid=valid&(Q2>0.10)&(np.abs(Q0)>0.03)&(np.abs(Q0)<0.08)&(Q1>0.815)&(Q1<0.835)&(lum>120)
print('lid skin #%02x%02x%02x'%tuple(np.median(C[lid],0).astype(int)))
