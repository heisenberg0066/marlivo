# BODY_SPECS entry for an adult outfit (figure frame: height HT, baseY BY, x/z centred on the bbox, front +z) from bk_hi_geo.npz
import numpy as np, os, json
E=lambda k,d: float(os.environ.get(k,d)); HT=E('HT',1.5); BY=E('BY',-0.88)
G=np.load('bk_hi_geo.npz'); V=G['V']; M=G['M']; arm=(M[:,1]+M[:,2])>0.5
mn,mx=V.min(0),V.max(0); ctr=(mn+mx)/2; sc=1/(mx[2]-mn[2])
X=(V[:,0]-ctr[0])*sc*HT; Y=BY+(V[:,2]-mn[2])*sc*HT; Z=(ctr[1]-V[:,1])*sc*HT; q1=(V[:,2]-mn[2])*sc
def vol(m,lo=2,hi=98):
    A=np.c_[X[m],Y[m],Z[m]]; a=np.percentile(A,lo,0); b=np.percentile(A,hi,0); return ((a+b)/2).round(3).tolist(),((b-a)/2).round(3).tolist()
hc,hr=vol((q1>0.915)&~arm)
tc,tr=vol((q1>0.58)&(q1<0.83)&~arm&(np.abs(X)<0.2))
face=(q1>0.915)&(q1<0.975)&~arm; fz=np.percentile(Z[face],99.5)
fm=face&(Z>fz-0.03); fhw=np.percentile(np.abs(X[fm]-np.median(X[fm])),95)
cx=float(np.median(X[(q1>0.6)&(q1<0.8)&~arm]))
spec=dict(cx=round(cx,3),head=dict(c=hc,r=hr,p=2),torso=dict(c=tc,r=tr,p=2),glove=0.03,faceLo=round(BY+0.915*HT,3),faceZ=round(float(fz),3),faceHalfW=round(float(fhw)+0.01,3),browY=round(BY+0.962*HT,3),floorY=0.0)
print(json.dumps(spec))
