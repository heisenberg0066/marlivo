# flatten the fused sleeves (hands in pockets) into a smooth coat side wall; report sleeve axes
import numpy as np, json, sys, os
E=lambda k,d: float(os.environ.get(k,d))
d=np.load('W.npz'); V=d['V'].copy(); F=d['F']
x,y,z=V[:,0],V[:,1],V[:,2]
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
C=np.load('W_col.npy')
lumv=C.mean(1)
# outfits: chestnut hair = brownish dark (navy/black/denim cloth must not count as hair); KEEPDARK protects a black bag/strap
hairv=(C[:,0]-C[:,2]>E('HAIRRB',15))&(lumv<E('HAIRL',115))&(C[:,0]>C[:,1])&(V[:,2]>E('HAIRZ0',0.62))
if E('KEEPDARK',0)>0: hairv|=(lumv<E('KEEPDARK',0))&((C.max(1)-C.min(1))<25)&(V[:,2]<E('KEEPZ1',0.6))
if 'HAIRBOX' in os.environ:   # extra keep boxes x0,x1,y0,y1,z0,z1;...
    for bx in os.environ['HAIRBOX'].split(';'):
        a=[float(t) for t in bx.split(',')]; hairv|=(V[:,0]>a[0])&(V[:,0]<a[1])&(V[:,1]>a[2])&(V[:,1]<a[3])&(V[:,2]>a[4])&(V[:,2]<a[5])
Z0,Z1=E('Z0',0.265),E('Z1',0.50); LOB=E('LOB',42); LOBS=[(E('CL',0.0),E('LOBL',LOB)),(E('CR',180.0),E('LOBR',LOB))]   # per side lobe centre/half-width (deg)

cxg=E('CXG',np.median(x[(z>0.3)&(z<0.45)]))
zs=np.arange(Z0,Z1+1e-9,0.004); nb=180; phb=np.linspace(-180,180,nb+1)[:-1]+1
prof=[]; cys=[]
Fh=F[~hairv[F].any(1)]; tz=z[Fh]
def section(zz):
    m=(tz.min(1)<zz)&(tz.max(1)>zz); T=Fh[m]
    A=V[T]  # (n,3,3)
    pts=[]; 
    for i,j in ((0,1),(1,2),(2,0)):
        a,b=A[:,i],A[:,j]; za,zb=a[:,2],b[:,2]; c=(za-zz)*(zb-zz)<0
        s_=np.where(c,(zz-za)/np.where(c,zb-za,1),0)[:,None]; pts.append((a+(b-a)*s_,c))
    P=[]
    for k in range(len(T)):
        q=[p[k] for p,c in pts if c[k]]
        if len(q)==2:
            for t in np.linspace(0,1,9): P.append(q[0]*(1-t)+q[1]*t)
    return np.array(P)
for zz in zs:
    P=section(zz)
    # densify: midpoints of consecutive points are not ordered; use the points as they are (one per triangle edge)
    xm,ym=P[:,0],P[:,1]; core=np.abs(xm-cxg)<0.12
    cy=E('CY',-0.055)
    cys.append(cy)
    ph=np.degrees(np.arctan2(ym-cy,xm-cxg)); r=np.hypot(xm-cxg,ym-cy)
    b=((ph+180)/2).astype(int)%nb
    R=np.full(nb,np.nan); np.fmax.at(R,b,r)
    ok=~np.isnan(R); kk=np.arange(nb); R=np.interp(kk,kk[ok],R[ok],period=nb)
    prof.append(R)
prof=np.array(prof); cys=np.array(cys)
def lobe_ranges():
    return [(c-l,c+l) for c,l in LOBS]
def ang(a): return (a+180)%360-180
# replacement profile: periodic cubic Hermite across each lobe in phi, using edge radii & slopes from neighbours
Rn=prof.copy()
for i in range(len(zs)):
    R=prof[i]
    for (a0,a1) in lobe_ranges():
        k0=int(((ang(a0)+180)/2))%nb; k1=int(((ang(a1)+180)/2))%nb
        n=int(round((a1-a0)/2))
        r0=np.nanmedian([R[(k0-j)%nb] for j in range(0,3)]); r1=np.nanmedian([R[(k1+j)%nb] for j in range(0,3)])
        s0=(R[k0%nb]-R[(k0-4)%nb])/4; s1=(R[(k1+4)%nb]-R[k1%nb])/4
        s0=np.clip(s0,-0.004,0.004); s1=np.clip(s1,-0.004,0.004)
        for j in range(n+1):
            t=j/n; h00=2*t**3-3*t**2+1; h10=t**3-2*t**2+t; h01=-2*t**3+3*t**2; h11=t**3-t**2
            Rn[i,(k0+j)%nb]=h00*r0+h10*n*s0+h01*r1+h11*n*s1
from scipy import ndimage as _nd
Rn=_nd.gaussian_filter(Rn,(E('SGZ',5),E('SGP',2)),mode=('nearest','wrap'))
profS=_nd.gaussian_filter(prof,(E('SGZ',5),1),mode=('nearest','wrap'))
np.savez('prof.npz',zs=zs,prof=prof,Rn=Rn,cys=cys,cx=cxg)
# displace
ph=np.degrees(np.arctan2(y-np.interp(z,zs,cys),x-cxg)); r=np.hypot(x-cxg,y-np.interp(z,zs,cys))
def interp2(zv,pv,A):
    fi=np.clip((zv-Z0)/0.004,0,len(zs)-1.001); i0=fi.astype(int); di=fi-i0
    fk=(pv+180)/2-0.5; k0=np.floor(fk).astype(int); dk=fk-k0
    g=lambda i,k: A[i,k%nb]
    return (g(i0,k0)*(1-dk)+g(i0,k0+1)*dk)*(1-di)+(g(i0+1,k0)*(1-dk)+g(i0+1,k0+1)*dk)*di
inl=((np.abs(ph)<LOB)|(np.abs(np.abs(ph)-180)<LOB))&(z>Z0)&(z<Z1)
rn=interp2(z,ph,Rn)
wz=np.clip((Z1-z)/E('ZT',0.04),0,1); wz=wz*wz*(3-2*wz)*np.clip((z-Z0)/0.01,0,1)
# edge blend in phi (fade over the last 6 degrees of the lobe range)
dphi=np.maximum(LOB-np.abs(ph), LOB-np.abs(np.abs(ph)-180)); wp=np.clip(np.maximum(dphi,0)/6,0,1)
out=inl&(r>rn)&~hairv
w=wz*wp*out
rnew=r+(rn-r)*w
cyv=np.interp(z,zs,cys)
V2=V.copy(); V2[:,0]=cxg+np.cos(np.radians(ph))*np.where(out,rnew,r); V2[:,1]=cyv+np.sin(np.radians(ph))*np.where(out,rnew,r)
# relax the flattened wall: Laplacian smoothing of the moved vertices and a 2-ring around them (hair and far vertices fixed)
import scipy.sparse as sp
n=len(V); ii=np.concatenate([F[:,0],F[:,1],F[:,2],F[:,1],F[:,2],F[:,0]]); jj=np.concatenate([F[:,1],F[:,2],F[:,0],F[:,0],F[:,1],F[:,2]])
A=sp.csr_matrix((np.ones(len(ii)),(ii,jj)),shape=(n,n)); A.data[:]=1; deg=np.asarray(A.sum(1)).ravel()
sel=(np.linalg.norm(V2-V,axis=1)>1e-4).astype(float)
for _ in range(2): sel=np.maximum(sel,(A@sel>0).astype(float))
sel=(sel>0)&~hairv&(z>Z0+0.005)&(z<Z1)
for it in range(int(E('SMIT',30))):
    L=(A@V2)/np.maximum(deg,1)[:,None]
    V2[sel]=V2[sel]*0.5+L[sel]*0.5
mov=np.linalg.norm(V2-V,axis=1)
print('moved',int((mov>0.002).sum()),'max',mov.max().round(3))
np.savez('W2.npz',V=V2,F=F,mov=mov,V0=V)
# sleeve axes: centroid of the removed lobe material per slice
ax={}
for side,sg in (('R',1),('L',-1)):
    cs=[]
    for zz in np.arange(0.29,0.46,0.01):
        m=(np.abs(z-zz)<0.005)&(mov>0.004)&(np.sign(x-cxg)==sg)
        if m.sum()>10: cs.append([float(np.mean(V[m,0])),float(np.mean(V[m,1])),float(zz),float(np.percentile(np.abs(V[m,0]-cxg),98)),float(np.percentile(V[m,1],2)),float(np.percentile(V[m,1],98))])
    ax[side]=cs
json.dump(ax,open('axes.json','w'),indent=0)
