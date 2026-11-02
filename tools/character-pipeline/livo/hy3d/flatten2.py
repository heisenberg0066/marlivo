# v3 (HY3D base): delete the fused sleeves (hands in pockets) from the coat and cover the opening with a smooth wall patch
import numpy as np, json, os
E=lambda k,d: float(os.environ.get(k,d))
exec(open('flatten.py').read().split('# displace')[0])     # profiles prof/Rn/cys/zs/cxg + vertex colours
cyv=np.interp(z,zs,cys)
ph=np.degrees(np.arctan2(y-cyv,x-cxg)); r=np.hypot(x-cxg,y-cyv)
def interp2(zv,pv,A):
    fi=np.clip((zv-Z0)/0.004,0,len(zs)-1.001); i0=fi.astype(int); di=fi-i0
    fk=(pv+180)/2-0.5; k0=np.floor(fk).astype(int); dk=fk-k0
    g=lambda i,k: A[i,k%nb]
    return (g(i0,k0)*(1-dk)+g(i0,k0+1)*dk)*(1-di)+(g(i0+1,k0)*(1-dk)+g(i0+1,k0+1)*dk)*di
def wzf(zv):
    t=np.clip((Z1-zv)/E('ZT',0.04),0,1); return t*t*(3-2*t)*np.clip((zv-Z0)/0.008,0,1)
def dlob(pv): return np.maximum(LOB-np.abs(pv), LOB-np.abs(np.abs(pv)-180))
rn=interp2(z,ph,Rn); R0=interp2(z,ph,prof)
rw=R0+(rn-R0)*wzf(z)*np.clip(dlob(ph)/6,0,1)      # wall radius
dele=(dlob(ph)>E('DMARG',1.5))&(z>Z0+0.004)&(z<Z1-0.004)&(r>rw-E('DIN',0.004))&~hairv&(wzf(z)>0.5)
fd=dele[F].any(1)
# also faces whose centroid / edge midpoints poke outside the wall (big triangles spanning the removed sleeve)
for bc in ([1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]):
    Q=(V[F]*np.array(bc)[None,:,None]).sum(1); qz=Q[:,2]; qcy=np.interp(qz,zs,cys)
    qph=np.degrees(np.arctan2(Q[:,1]-qcy,Q[:,0]-cxg)); qr=np.hypot(Q[:,0]-cxg,Q[:,1]-qcy)
    qrn=interp2(qz,qph,Rn); qR0=interp2(qz,qph,prof); qrw=qR0+(qrn-qR0)*wzf(qz)*np.clip(dlob(qph)/6,0,1)
    fd|=(dlob(qph)>E('DMARG',1.5))&(qz>Z0+0.004)&(qz<Z1-0.004)&(qr>qrw+E('DOUT',0.002))&(wzf(qz)>0.5)&~hairv[F].all(1)
print('delete verts',int(dele.sum()),'faces',int(fd.sum()))
np.save('delF.npy',fd)
# wall patches: grid over each lobe domain (+4 deg overlap), radius slightly inside the wall
pv=[];pf=[]
for c0 in (0.0,180.0):
    P=np.arange(-LOB-2,LOB+2.01,1.0)+c0; Zg=np.arange(Z0,Z1+1e-9,0.002)
    PP,ZZ=np.meshgrid(P,Zg,indexing='ij'); PP=(PP+180)%360-180
    rr=interp2(ZZ.ravel(),PP.ravel(),Rn); R00=interp2(ZZ.ravel(),PP.ravel(),profS)
    ww=wzf(ZZ.ravel())*np.clip(dlob(PP.ravel())/6,0,1)
    rr=R00+(rr-R00)*ww - E('INSET',0.0015)
    cy=np.interp(ZZ.ravel(),zs,cys)
    Q=np.c_[cxg+np.cos(np.radians(PP.ravel()))*rr, cy+np.sin(np.radians(PP.ravel()))*rr, ZZ.ravel()]
    b=len(sum(pv,[])) if False else sum(len(q) for q in pv)
    na,nz=PP.shape
    for i in range(na-1):
        for j in range(nz-1):
            a=b+i*nz+j; pf.append([a,a+nz,a+nz+1]); pf.append([a,a+nz+1,a+1])
    pv.append(Q)
pv=np.concatenate(pv); pf=np.array(pf)
# outward winding: check one normal
n0=np.cross(pv[pf[0,1]]-pv[pf[0,0]],pv[pf[0,2]]-pv[pf[0,0]]); c=pv[pf[0]].mean(0)
if np.dot(n0,[c[0]-cxg,c[1]-np.interp(c[2],zs,cys),0])<0: pf=pf[:,::-1]
np.savez('patch.npz',V=pv,F=pf)
# sleeve axis samples from the deleted material
ax={}
for side,sg in (('R',1),('L',-1)):
    cs=[]
    for zz in np.arange(0.28,0.47,0.01):
        m=(np.abs(z-zz)<0.005)&dele&(np.sign(x-cxg)==sg)
        if m.sum()>10: cs.append([round(float(v),4) for v in (np.mean(V[m,0]),np.mean(V[m,1]),zz,np.percentile(sg*(V[m,0]-cxg),98),np.percentile(V[m,1],2),np.percentile(V[m,1],98))])
    ax[side]=cs
json.dump({'cx':float(cxg),'axes':ax},open('axes.json','w'))
print(json.dumps(ax['R']))
