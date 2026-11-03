# fit the face mirror plane on the frontmost face surface (depth map window around the nose)
import numpy as np, sys, os
from scipy.spatial import cKDTree
from scipy.optimize import minimize
d=np.load(sys.argv[1]); V=d['SRC_V']
E=lambda k,v: float(os.environ.get(k,v))
X0,Z0=E('NX',0.005),E('NZ',0.86)        # nose tip (front ortho)
ZA,ZB,HW=E('ZA',0.815),E('ZB',0.905),E('HW',0.04)
H=V[(V[:,2]>ZA-0.03)&(V[:,2]<ZB+0.05)&(np.abs(V[:,0]-X0)<0.11)]; tr=cKDTree(H)
w=(np.abs(H[:,0]-X0)<HW)&(H[:,2]>ZA)&(H[:,2]<ZB)
P=H[w]; g=0.0015; key=np.floor((P[:,0]-X0)/g).astype(int)*100000+np.floor((P[:,2])/g).astype(int)
o=np.lexsort((P[:,1],key)); ks=key[o]; first=np.r_[True,ks[1:]!=ks[:-1]]; F=P[o][first]   # frontmost per cell
nm=(np.hypot(H[:,0]-X0,H[:,2]-Z0)<0.006); ny=H[nm,1].min(); print('nose y',round(ny,4))
F=F[(F[:,1]>ny-E('FRONT',0.004))&(F[:,1]<ny+E('BACK',0.04))]
print('face pts',len(F))
def nrm(t,r):
    t,r=np.radians(t),np.radians(r); return np.array([np.cos(t)*np.cos(r),np.sin(t)*np.cos(r),np.sin(r)])
c0=np.array([X0,ny,Z0])
def err(p):
    t,r,of=p; n=nrm(t,r); c=c0+n*of; sd=(F-c)@n; M=F-2*sd[:,None]*n; dd,_=tr.query(M); return np.mean(np.minimum(dd,0.004))
G=[(err((t,r,of)),t,r,of) for t in np.arange(-30,31,3) for r in np.arange(-14,15,2) for of in np.arange(-0.012,0.0121,0.004)]
G.sort(); print('grid best',[tuple(np.round(x,4)) for x in G[:3]])
best=minimize(err,G[0][1:],method='Nelder-Mead',options={'xatol':0.01,'fatol':1e-9,'maxiter':400})
t,r,of=best.x; n=nrm(t,r); c=c0+n*of
print('PLANE yaw %.2f roll %.2f off %.4f err %.5f'%(t,r,of,best.fun),'c',c.round(4).tolist(),'n',n.round(4).tolist())
np.save(sys.argv[2],np.r_[c,n])
