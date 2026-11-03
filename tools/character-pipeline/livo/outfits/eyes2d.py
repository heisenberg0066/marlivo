# eye centres/extents from the facegrid front render (fg_<o>.png + .json) -> EYE_SPEC numbers (bind frame Q0/Q1)
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage
p=sys.argv[1]; J=json.load(open(p+'.json')); im=np.asarray(Image.open(p).convert('RGB')).astype(float); W=im.shape[1]; k=W/J['span']
r,g,b=im[...,0],im[...,1],im[...,2]; lum=im.mean(2); sat=im.max(2)-im.min(2)
q0=lambda X:(X-W/2)/k; q1=lambda Y:J['q1c']+(W/2-Y)/k
YY,XX=np.mgrid[0:W,0:W]; QQ1=J['q1c']+(W/2-YY)/k; QQ0=(XX-W/2)/k
iris=(b>r+8)&(lum<120)&(QQ1>0.93)&(QQ1<0.975)&(np.abs(QQ0)<0.06)
lab,n=ndimage.label(iris); sz=ndimage.sum(iris,lab,range(1,n+1)); idx=np.argsort(sz)[::-1][:2]+1
eyes=[]
for i in idx:
    ys,xs=np.nonzero(lab==i); cy,cx=ys.mean(),xs.mean()
    # sclera+iris extent: light/iris pixels in a box around the iris
    R=int(max(np.ptp(xs),np.ptp(ys))*1.6)+4
    y0,y1,x0,x1=int(cy-R*0.8),int(cy+R*0.8),int(cx-R*1.4),int(cx+R*1.4)
    box=np.zeros_like(iris); box[y0:y1,x0:x1]=True
    eye=box&((iris)|((lum>185)&(sat<45)))
    ey_,ex_=np.nonzero(eye)
    eyes.append(dict(x=q0(cx),y=q1(cy),hw=(np.percentile(ex_,97)-np.percentile(ex_,3))/2/k,hh=(np.percentile(ey_,97)-np.percentile(ey_,3))/2/k,n=int(sz[i-1])))
eyes.sort(key=lambda e:e['x'])
L,Rr=eyes
ecx=(L['x']+Rr['x'])/2; ex=(Rr['x']-L['x'])/2; ey=(L['y']+Rr['y'])/2; etl=(Rr['y']-L['y'])/(Rr['x']-L['x'])
ew=max(L['hw'],Rr['hw'])*1.15; eh=max(L['hh'],Rr['hh'])*1.25
# lid colour: skin just above the eyes
Y=int(W/2-(ey+eh*2.2-J['q1c'])*k); X=int(W/2+ecx*k); sk=im[Y-3:Y+3,X-int(ex*k):X+int(ex*k)].reshape(-1,3); sk=sk[(sk[:,0]-sk[:,2]>25)&(sk.mean(1)>120)]
col='#%02x%02x%02x'%tuple(np.median(sk,0).astype(int)) if len(sk) else '#e8b49a'
print(json.dumps(dict(ey=round(ey,4),eh=round(eh,4),ex=round(ex,4),ew=round(ew,4),ecx=round(ecx,4),etl=round(etl,3),col=col,eyes=eyes)))
