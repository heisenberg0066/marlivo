# EYE_SPEC (bind frame: bbox-normalised, x centred, y from feet, z centred, front +z) and BODY_SPECS (figure frame:
# height HT, baseY BY) for an adult outfit, from bk_hi_final.png + bk_hi_pos.npy + bk_hi_geo.npz
import numpy as np, os, json
from PIL import Image
E=lambda k,d: float(os.environ.get(k,d)); HT=E('HT',1.5); BY=E('BY',-0.88)
C=np.asarray(Image.open('bk_hi_final.png').convert('RGB')).astype(float); P=np.load('bk_hi_pos.npy'); G=np.load('bk_hi_geo.npz')['V']
mn,mx=G.min(0),G.max(0); ctr=(mn+mx)/2; sc=1/(mx[2]-mn[2])
x,y,z=P[...,0],P[...,1],P[...,2]; valid=~((x==-0.5)&(y==-0.5))
Q0=(x-ctr[0])*sc; Q1=(z-mn[2])*sc; Q2=(ctr[1]-y)*sc
lum=C.mean(2); sat=C.max(2)-C.min(2); r,g,b=C[...,0],C[...,1],C[...,2]
# face front: skin texels in the head band, frontmost
face=valid&(Q1>0.86)&(Q1<0.99)&(r-b>35)&(lum>130)
fz=np.percentile(Q2[face],97); fcx=np.median(Q0[face&(Q2>fz-0.02)])
print('face front Q2 %.3f cx %.3f'%(fz,fcx))
eyezone=valid&(Q1>0.90)&(Q1<0.955)&(Q2>fz-0.035)&(np.abs(Q0-fcx)<0.06)
white=eyezone&(lum>175)&(sat<45)
dark=eyezone&(lum<70)
out={}
for sg in (-1,1):
    w=white&(np.sign(Q0-fcx)==sg); d=dark&(np.sign(Q0-fcx)==sg)
    m=w|d
    print('eye',sg,'white n',int(w.sum()),'dark n',int(d.sum()))
    if w.sum()>5:
        print('  white x %.3f..%.3f y %.3f..%.3f'%(*np.percentile(np.abs(Q0[w]-fcx),[3,97]),*np.percentile(Q1[w],[3,97])))
    if d.sum()>5:
        print('  dark  x %.3f..%.3f y %.3f..%.3f'%(*np.percentile(np.abs(Q0[d]-fcx),[3,97]),*np.percentile(Q1[d],[3,97])))
lid=valid&(Q1>0.94)&(Q1<0.955)&(Q2>fz-0.03)&(np.abs(Q0-fcx)>0.015)&(np.abs(Q0-fcx)<0.05)&(lum>120)
print('lid skin #%02x%02x%02x'%tuple(np.median(C[lid],0).astype(int)) if lid.sum() else 'no lid')
lips=valid&(Q1>0.86)&(Q1<0.91)&(Q2>fz-0.03)&(np.abs(Q0-fcx)<0.03)&(r-g>60)&(lum<175)
if lips.sum(): print('lips y',np.percentile(Q1[lips],[3,50,97]).round(3),'x %.3f'%np.percentile(np.abs(Q0[lips]-fcx),97))
# vertex based body spec (figure frame)
V=G; vQ0=(V[:,0]-ctr[0])*sc; vQ1=(V[:,2]-mn[2])*sc; vQ2=(ctr[1]-V[:,1])*sc
F=lambda q0,q1,q2: (q0*HT, BY+q1*HT, q2*HT)
hd=vQ1>0.86; tor=(vQ1>0.57)&(vQ1<0.80)&(np.abs(vQ0)<0.14)
def vol(m):
    lo=np.percentile(np.c_[vQ0[m],vQ1[m],vQ2[m]],2,axis=0); hi=np.percentile(np.c_[vQ0[m],vQ1[m],vQ2[m]],98,axis=0)
    c=(lo+hi)/2; rr=(hi-lo)/2; return [round(v,3) for v in F(*c)][:1]+[round(BY+c[1]*HT,3),round(c[2]*HT,3)], [round(v*HT,3) for v in rr]
hc,hr=vol(hd); tc,tr=vol(tor)
print('BODY head c',hc,'r',hr,'torso c',tc,'r',tr)
print('faceZ %.3f faceLo %.3f browY %.3f'%(fz*HT, BY+0.86*HT, BY+0.955*HT))
