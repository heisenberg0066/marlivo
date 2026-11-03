# adult Livo outfits: straight hanging arms = full-length sleeve tube (rounded shoulder cap, cuff) + hand with thumb.
# Shoulder placed on the reconstructed torso (kept W verts + wall patch, hair excluded) at SHZ; wrist hangs straight below.
import numpy as np, json, os
E=lambda k,d: float(os.environ.get(k,d))
exec(open('arms.py').read().split("for side,sg in")[0])     # helpers: add/frame/tube/ellipsoid, Vs/Fs/Ms, cx
d=np.load('W.npz'); V=d['V']; F=d['F']; fd=np.load('delF.npy'); C=np.load('W_col.npy')
keep=np.zeros(len(V),bool); keep[F[~fd].ravel()]=True
lum=C.mean(1); hair=(C[:,0]-C[:,2]>E('HAIRRB',15))&(lum<E('HAIRL',115))&(C[:,0]>C[:,1])&(V[:,2]>E('HAIRZ0',0.62))
P=np.vstack([V[keep&~hair],np.load('patch.npz')['V']])
cx=E('CXG',float(np.median(V[(V[:,2]>0.3)&(V[:,2]<0.45),0])))
SHZ=E('SHZ',0.795); WRZ=E('WRZ',0.505)
info={}
for side,sg in (('R',1),('L',-1)):
    sl=P[(np.abs(P[:,2]-(SHZ-0.02))<0.006)&(sg*(P[:,0]-cx)>0)]
    lat=np.percentile(sg*(sl[:,0]-cx),99); yo=sl[sg*(sl[:,0]-cx)>lat-0.02,1]
    S=np.array([cx+sg*(lat-E('SHIN',0.022)),float(np.median(yo))+E('SHDY',0.0),SHZ])
    W=np.array([cx+sg*(lat-E('SHIN',0.022)+E('WROUT',0.022)),S[1]+E('WRDY',0.0),WRZ])
    d=(W-S)/np.linalg.norm(W-S)
    n=int(E("NRING",40)); path=np.array([S+(W-S)*t for t in np.linspace(0,1,n)])
    R0,R1=E('RS0',0.038),E('RS1',0.031)
    def rsl(t,a):
        r=R0+(R1-R0)*t
        if t<0.10: r*=0.62+0.38*np.sin(np.pi/2*t/0.10)        # rounded cap inside the shoulder
        r+=E('CUFF',0.003)*np.clip((t-0.90)/0.03,0,1)
        return (r,r*E('RY',1.06))
    Va,Fa=tube(path,rsl,nseg=int(E("NSEG",28)),cap0=True); add(Va,Fa,1)
    # cuff opening: short inward tube, closed (covered by the wrist)
    Vh,Fh=tube(np.array([W,W-d*0.012]),nseg=int(E("NSEG",28)),radf=lambda t,a:((R1+E('CUFF',0.003))*(1-0.3*t),)*2,cap1=True); Fh=Fh[:,::-1]; add(Vh,Fh,1)
    # wrist + hand (palm/fingers block) + thumb toward the front
    Vw,Fw=tube(np.array([W-d*0.01,W+d*0.02]),nseg=int(E("NSEG",28)),radf=lambda t,a:(E('WR',0.017),E('WR',0.017)*0.85)); add(Vw,Fw,2)
    hc=W+d*E('HD',0.050)
    add(*ellipsoid(hc,np.array([E("HX",0.016),E("HY",0.026),E("HZ",0.042)]),nu=int(E("NU",24)),nv=int(E("NV",16))),2)
    tc=hc+np.array([-sg*0.008,-0.020,0.016]); add(*ellipsoid(tc,np.array([0.008,0.009,0.020]),nu=int(E("NU",24)),nv=int(E("NV",16))),2)
    info[side]={'S':S.round(4).tolist(),'W':W.round(4).tolist()}
V=np.vstack(Vs);F=np.vstack(Fs);M=np.concatenate(Ms)
np.savez(os.environ.get('ARMOUT','arms.npz'),V=V,F=F,M=M); print('arms',len(V),len(F),json.dumps(info))
json.dump({'cx':cx,'arms':info,'SHZ':SHZ,'WRZ':WRZ},open('armsinfo.json','w'))
