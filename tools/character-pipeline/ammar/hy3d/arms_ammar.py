# Ammar: hanging arms = short black T-shirt sleeve + bare forearm + hand with thumb (replaces the fused pocket arms)
import numpy as np, json, os
E=lambda k,d: float(os.environ.get(k,d))
exec(open('arms.py').read().split("for side,sg in")[0])     # helpers: add/frame/tube/ellipsoid, Vs/Fs/Ms, cx
for side,sg in (('R',1),('L',-1)):
    S=np.array([cx+sg*E('SHX',0.128),E('SHY',0.035),E('SHZ',0.655)])
    W=np.array([cx+sg*E('WRX',0.150),E('WRY',0.030),E('WRZ',0.445)])
    d=(W-S)/np.linalg.norm(W-S); L=np.linalg.norm(W-S)
    # skin arm (shoulder to wrist), slightly tapered
    n=int(E("NRING",36)); path=np.array([S+(W-S)*t for t in np.linspace(0,1,n)])
    def rarm(t,a):
        r=E('RA0',0.030)+(E('RA1',0.022)-E('RA0',0.030))*t
        if t<0.06: r*=0.7+0.3*np.sin(np.pi/2*t/0.06)
        return (r,r*1.05)
    V,F=tube(path,rarm,nseg=int(E("NSEG",28)),cap0=True,cap1=True); add(V,F,2)
    # short sleeve over the upper arm: wider tube ending in a hem at SLV of the arm length
    ts=E('SLV',0.45); ps=np.array([S-d*0.01+(W-S)*t for t in np.linspace(0,ts,int(E("NRS",14)))])
    def rsl(t,a):
        r=E('RS0',0.043)+(E('RS1',0.038)-E('RS0',0.043))*t
        if t<0.15: r*=0.8+0.2*np.sin(np.pi/2*t/0.15)
        return (r,r*1.08)
    V,F=tube(ps,rsl,nseg=int(E("NSEG",28)),cap0=True); add(V,F,1)
    # hem: inner wall of the sleeve opening (a short inward tube so the opening reads as cloth)
    e0=ps[-1]; Vh,Fh=tube(np.array([e0,e0-d*0.012]),nseg=int(E("NSEG",28)),radf=lambda t,a:((E('RS1',0.038)*(1-0.06*t)),)*2); Fh=Fh[:,::-1]; add(Vh,Fh,1)
    # hand: palm + fingers block + thumb
    hc=W+d*E('HD',0.026)
    add(*ellipsoid(hc,np.array([E("HX",0.019),E("HY",0.026),E("HZ",0.034)]),nu=int(E("NU",24)),nv=int(E("NV",16))),2)
    tc=hc+np.array([-sg*0.010,-0.020,0.010]); add(*ellipsoid(tc,np.array([0.009,0.009,0.016]),nu=int(E("NU",24)),nv=int(E("NV",16))),2)
V=np.vstack(Vs);F=np.vstack(Fs);M=np.concatenate(Ms)
np.savez(os.environ.get('ARMOUT','arms.npz'),V=V,F=F,M=M); print('arms',len(V),len(F))
