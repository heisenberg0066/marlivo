# head warp for the adult Livo outfits: (1) un-roll / un-yaw the head about the neck, (2) mirror the face (keep one
# half, SIDE=+1 keeps the +n side), (3) scale the head about the chin point.  in: <o>_asm.npz <o>_plane.npy
# out: <o>_warp.npz (new V per object) + <o>_warp.json (final plane, scale, height)
import numpy as np, sys, os, json
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation as Rot
o=sys.argv[1]; E=lambda k,v: float(os.environ.get(k,v))
d=np.load(f'{o}_asm.npz'); pl=np.load(f'{o}_plane.npy'); c,n=pl[:3],pl[3:]/np.linalg.norm(pl[3:])
def sm(x,a,b): t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)
fwd=np.cross(np.array([0,0,1.]),n); fwd/=np.linalg.norm(fwd)          # horizontal, roughly -y (face direction)
if fwd[1]>0: fwd=-fwd
PZ=E('PZ',0.81); piv=np.array([c[0],c[1]+E('PDEP',0.075),PZ])
WZ0,WZ1=E('WZ0',0.80),E('WZ1',0.87)
# rotation taking n to its target: roll removed fully, yaw removed by YAWK
yaw=np.degrees(np.arctan2(n[1],n[0])); roll=np.degrees(np.arcsin(np.clip(n[2],-1,1)))
nt=np.array([np.cos(np.radians(yaw*(1-E('YAWK',0.6)))),np.sin(np.radians(yaw*(1-E('YAWK',0.6)))),0.])
ax=np.cross(n,nt); s_=np.linalg.norm(ax); ang=np.arctan2(s_,n@nt); rv=ax/max(s_,1e-9)*ang
print(o,'yaw %.1f roll %.1f -> rotvec deg'%(yaw,roll),np.degrees(rv).round(2))
S=E('HEADS',1.15)
def warp(V):
    w=sm(V[:,2],WZ0,WZ1)
    R=Rot.from_rotvec(w[:,None]*rv[None]).as_matrix()
    Vr=piv+np.einsum('nij,nj->ni',R,V-piv)
    return Vr
def scale(V):
    w=sm(V[:,2],WZ0,WZ1); s=1+(S-1)*w; return piv+(V-piv)*s[:,None]
Rfull=Rot.from_rotvec(rv).as_matrix(); c1=piv+Rfull@(c-piv); n1=Rfull@n
out={}
for name in ('SRC','W','PATCH','ARMS'):
    out[name]=warp(d[name+'_V'])
# (2) mirror: face window in plane coords
def window(V):
    s=(V-c1)@n1; f=(V-c1)@(Rfull@fwd); z=V[:,2]
    sw0=np.interp(z,[E('SWZA',0.89),E('SWZB',0.905)],[E('SW0',0.042),E('SWT',0.026)])
    return s,(1-sm(np.abs(s),sw0,sw0+E('SWF',0.014)))*sm(z,E('MZ0',0.795),E('MZ0',0.795)+0.015)*(1-sm(z,E('MZ1',0.915),E('MZ1',0.915)+0.02))*sm(f,-E('FD',0.045),-E('FD',0.045)+0.02)
SIDE=E('SIDE',1)
Vs=out['SRC']; sS,wS=window(Vs)
good=(SIDE*sS>-0.004)&(wS>0)|(wS==0)
# vertex normals of SRC for point->surface projection
F=d['SRC_F']; fn=np.cross(Vs[F[:,1]]-Vs[F[:,0]],Vs[F[:,2]]-Vs[F[:,0]]); vn=np.zeros_like(Vs)
for k in range(3): np.add.at(vn,F[:,k],fn)
vn/=np.maximum(np.linalg.norm(vn,axis=1),1e-12)[:,None]
reg=np.linalg.norm(Vs-c1,axis=1)<0.16
gi=np.nonzero(good&reg)[0]; tr=cKDTree(Vs[gi])
def mirror_targets(V,s,w):
    bad=(SIDE*s<0.004)&(w>0)
    M=V[bad]-2*s[bad,None]*n1                      # mirrored point, lands near the good half
    dd,ii=tr.query(M,k=4); ii=gi[ii]; wt=1/(dd+1e-5); wt/=wt.sum(1,keepdims=True)
    q=(Vs[ii]*wt[...,None]).sum(1); qn=(vn[ii]*wt[...,None]).sum(1); qn/=np.linalg.norm(qn,axis=1)[:,None]
    q=M+qn*(((q-M)*qn).sum(1))[:,None]             # project onto the local tangent plane
    sq=(q-c1)@n1; P=q-2*sq[:,None]*n1             # back to the bad side
    # near the plane blend mirrored with the original so the centre line has no crease
    k=w[bad]*sm(-SIDE*s[bad],-0.004,0.004)
    Vn=V.copy(); Vn[bad]=V[bad]*(1-k[:,None])+P*k[:,None]; return Vn,int(bad.sum())
for name in ('SRC','W'):
    s,w=window(out[name]); out[name],nb=mirror_targets(out[name],s,w); print(name,'mirrored verts',nb)

# (2b) mouth fill: teeth/gums recessed behind the lips are pulled forward onto a membrane just behind the lip ring
from scipy import ndimage
fw1=Rfull@fwd
def mouth_fill(names):
    MV,MU=E('MV',0.843),E('MU',0.024); Rg=0.0002; Uw,Vw=0.032,0.012
    nu,nv=int(2*Uw/Rg),int(2*Vw/Rg)
    A=out['SRC']; s=(A-c1)@n1; f=(A-c1)@fw1; z=A[:,2]
    m=(np.abs(s)<Uw)&(np.abs(z-MV)<Vw)&(f>-0.03)
    iu=((s[m]+Uw)/Rg).astype(int).clip(0,nu-1); iv=((z[m]-MV+Vw)/Rg).astype(int).clip(0,nv-1)
    Z=np.full((nv,nu),-9.); np.maximum.at(Z,(iv,iu),f[m])
    have=Z>-9; _,(a,b)=ndimage.distance_transform_edt(~have,return_indices=True); Z=Z[a,b]
    Z=(Z+Z[:,::-1])/2
    Zs=ndimage.gaussian_filter(Z,(E('MSV',10),E('MSU',25)))
    VV,UU=np.mgrid[0:nv,0:nu]; ug=-Uw+(UU+0.5)*Rg; vg=MV-Vw+(VV+0.5)*Rg
    ell=((ug/MU)**2+((vg-MV)/E('MH',0.0065))**2)<1
    O=(Zs-Z>E('MREC',0.0010))&ell
    O=ndimage.binary_closing(O,iterations=3); O=ndimage.binary_opening(O,iterations=1); O=ndimage.binary_fill_holes(O)
    lab,nl=ndimage.label(O)
    if nl>1: sz=ndimage.sum(O,lab,range(1,nl+1)); O=lab==(1+int(np.argmax(sz)))
    M=Z.copy(); M[O]=Z[~O].mean() if False else Z[O].max()
    for _ in range(1500):
        Mn=0.25*(np.roll(M,1,0)+np.roll(M,-1,0)+np.roll(M,1,1)+np.roll(M,-1,1)); M[O]=Mn[O]
    T=M-E('MD',0.0012)
    Ob=ndimage.gaussian_filter(O.astype(float),1.0)
    print('mouth opening cells',int(O.sum()),'max recess %.4f'%float((M-Z)[O].max() if O.any() else 0))
    for name in names:
        V=out[name]; s=(V-c1)@n1; f=(V-c1)@fw1; z=V[:,2]
        ju=np.clip((s+Uw)/Rg-0.5,0,nu-1.001); jv=np.clip((z-MV+Vw)/Rg-0.5,0,nv-1.001)
        i0,j0=jv.astype(int),ju.astype(int); di,dj=jv-i0,ju-j0
        bil=lambda G: G[i0,j0]*(1-di)*(1-dj)+G[i0+1,j0]*di*(1-dj)+G[i0,j0+1]*(1-di)*dj+G[i0+1,j0+1]*di*dj
        inb=(np.abs(s)<Uw-0.0005)&(np.abs(z-MV)<Vw-0.0005)
        ob=np.where(inb,bil(Ob),0); tt=np.where(inb,bil(T),0)
        mv=(ob>0.5)&(f<tt)&(f>tt-E('MDEEP',0.02))
        V=V.copy(); V[mv]=V[mv]+((tt[mv]-f[mv]))[:,None]*fw1; out[name]=V; print(name,'mouth verts moved',int(mv.sum()))
if E('MFILL',1)>0: mouth_fill(('SRC','W'))
for name in out: out[name]=scale(out[name])
al=d['ARMS_V']
H=max(v[:,2].max() for v in out.values())
c2=piv+(c1-piv)*S
lo=f'/workspace/sb/hyo/{o}/arms_lo.npz'; A=dict(np.load(lo)); A['V']=scale(warp(A['V'])); np.savez(f'{o}/arms_lo.npz',**A)
np.savez(f'{o}_warp.npz',**out)
J=dict(o=o,c=c2.tolist(),n=n1.tolist(),piv=piv.tolist(),S=S,H=float(H),rv=rv.tolist(),WZ0=WZ0,WZ1=WZ1,SIDE=SIDE,yaw=yaw,roll=roll)
json.dump(J,open(f'{o}_warp.json','w'),indent=1); print('H',round(H,4),'plane',np.round(c2,4),np.round(n1,4))
