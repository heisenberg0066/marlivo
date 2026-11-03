# per side: lateral extent profile, skin points (hands), hair colour stats -> helps place shoulder/elbow/hand
import numpy as np
V=np.load('W.npz')['V']; C=np.load('W_col.npy'); x,y,z=V.T
lum=C.mean(1); r,g,b=C.T
skin=(r-b>40)&(lum>140)&(r>190)
hair=(r-b>15)&(lum<130)&(r>g)
cx=np.median(x[(z>0.5)&(z<0.75)])
print('cx %.4f'%cx, 'hair n',int(hair.sum()))
for sg,nm in ((1,'L(+x)'),(-1,'R(-x)')):
    print('side',nm)
    for zz in np.arange(0.50,0.84,0.02):
        m=(np.abs(z-zz)<0.005)&(sg*(x-cx)>0)&~hair
        if m.sum()==0: continue
        xm=np.max(sg*(x[m]-cx)); o=m&(sg*(x-cx)>xm-0.03)
        print('  z %.2f lat %.3f  outer-y %.3f..%.3f  hairlat %.3f'%(zz,xm,y[o].min(),y[o].max(), np.max(sg*(x[(np.abs(z-zz)<0.005)&hair&(sg*(x-cx)>0)]-cx),initial=0)))
    s=skin&(sg*(x-cx)>0.04)&(z>0.45)&(z<0.68)
    if s.sum(): print('  skin n %d mean %s'%(s.sum(),np.round([x[s].mean(),y[s].mean(),z[s].mean()],3)), 'z range %.3f..%.3f'%(z[s].min(),z[s].max()))
fz=skin&(z>0.85)&(y<0); print('face skin', int(fz.sum()), 'chin z %.3f'%np.percentile(z[fz],1) if fz.sum() else '')
