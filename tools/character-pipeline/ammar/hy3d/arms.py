# hanging arms (sleeve tube + cuff + mitten hand) for the HY3D Livo, placed along the removed fused sleeves
import numpy as np, json, os
E=lambda k,d: float(os.environ.get(k,d))
J=json.load(open('axes.json')); cx=J['cx']
Vs=[];Fs=[];Ms=[]
def add(V,F,m):
    b=sum(len(v) for v in Vs); Vs.append(V); Fs.append(F+b); Ms.append(np.full(len(V),m))
def frame(d):
    d=d/np.linalg.norm(d); a=np.array([0,1.,0]) if abs(d[1])<0.9 else np.array([1.,0,0])
    u=np.cross(d,a); u/=np.linalg.norm(u); v=np.cross(d,u); return d,u,v
def tube(path,radf,nseg=28,cap0=False,cap1=False,scale_uv=(1,1)):
    # path: (n,3) points; radf(t, ang)-> radius
    n=len(path); V=[]
    for i,p in enumerate(path):
        d=path[min(i+1,n-1)]-path[max(i-1,0)]; d,u,v=frame(d)
        t=i/(n-1)
        for k in range(nseg):
            a=2*np.pi*k/nseg; r=radf(t,a); V.append(p+r[0]*np.cos(a)*u+r[1]*np.sin(a)*v)
    V=np.array(V); F=[]
    for i in range(n-1):
        for k in range(nseg):
            a=i*nseg+k; b=i*nseg+(k+1)%nseg; F.append([a,b,b+nseg]); F.append([a,b+nseg,a+nseg])
    F=np.array(F)
    if cap0: c=len(V); V=np.vstack([V,path[0]]); F=np.vstack([F,[[c,(k+1)%nseg,k] for k in range(nseg)]])
    if cap1: c=len(V); V=np.vstack([V,path[-1]]); b=(n-1)*nseg; F=np.vstack([F,[[c,b+k,b+(k+1)%nseg] for k in range(nseg)]])
    return V,F
def ellipsoid(c,R,rot=np.eye(3),nu=24,nv=16):
    V=[];F=[]
    for i in range(nv+1):
        th=np.pi*i/nv
        for k in range(nu):
            ph=2*np.pi*k/nu; V.append(c+rot@(np.array([np.sin(th)*np.cos(ph),np.sin(th)*np.sin(ph),np.cos(th)])*R))
    for i in range(nv):
        for k in range(nu):
            a=i*nu+k; b=i*nu+(k+1)%nu; F.append([a,b+nu,b]); F.append([a,a+nu,b+nu])
    return np.array(V),np.array(F)
for side,sg in (('R',1),('L',-1)):
    S=np.array([cx+sg*E('SHX',0.160),E('SHY',-0.045),E('SHZ',0.475)])
    W=np.array([cx+sg*E('WRX',0.188),E('WRY',-0.060),E('WRZ',0.280)])
    n=40; path=np.array([S+(W-S)*t for t in np.linspace(0,1,n)])
    def radf(t,a):
        r=E('R0',0.046)+(E('R1',0.040)-E('R0',0.046))*t
        # cuff: a slightly wider band over the last 12%, rolled lip at the opening
        cuff=E('CUFF',0.004)*np.clip((t-0.86)/0.03,0,1)
        r=r+cuff
        if t<0.08: r=r*(0.75+0.25*np.sin(np.pi/2*t/0.08))   # rounded top (inside the shoulder)
        return (r*1.0, r*E('RY',1.08))
    V,F=tube(path,radf,cap0=True,cap1=False)
    add(V,F,1)
    # inner cuff wall (dark opening ring is covered by the hand), so close the end with an inset disc
    d=(W-S)/np.linalg.norm(W-S)
    c=W-d*0.002; Vc,Fc=tube(np.array([W,c]),lambda t,a:((E('R1',0.040)+E('CUFF',0.004))*(1-0.25*t),)*2,cap1=True)
    add(Vc,Fc,1)
    # mitten hand: palm ellipsoid hanging from the cuff, thumb toward the front/inside
    hc=W+d*E('HD',0.030)
    add(*ellipsoid(hc,np.array([E('HX',0.024),E('HY',0.030),E('HZ',0.036)])),2)
    tc=hc+np.array([-sg*E('TX',0.012),-E('TY',0.022),E('TZ',0.008)])
    add(*ellipsoid(tc,np.array([0.011,0.011,0.018])),2)
V=np.vstack(Vs);F=np.vstack(Fs);M=np.concatenate(Ms)
np.savez('arms.npz',V=V,F=F,M=M)
print('arms',len(V),len(F))
