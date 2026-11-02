# simulate the client mouth overlay (Figures.tsx) on the baked texture, for close-up checks
import numpy as np,sys
from PIL import Image
_a=sys.argv; sys.argv=["x","hi"]; exec(open("measure_eyes.py").read().split("for nm,m in")[0]); sys.argv=_a
my,mh,mw=0.569,0.022,0.041; mcol=np.array([0xde,0xb1,0x9e],float); mz=0.12
cw,ch,op,sm,wd,co,my=[float(v) for v in sys.argv[1:8]]; out=sys.argv[8]
sst=lambda a,b,v: (lambda t: t*t*(3-2*t))(np.clip((v-a)/(b-a),0,1))
D=C.copy(); gate=valid&(Q2>mz)&(np.abs(Q0)<0.14)
cx=Q0/(mw*cw); cy=(Q1-my-co)/(mh*ch); cr2=cx*cx+cy*cy
cm=(1-sst(.42,1,cr2))*gate*(cr2<1)
D=D*(1-cm[...,None]*.9)+mcol*cm[...,None]*.9
mx=Q0/(mw*max(.38,wd)); my0=(Q1-my)/mh; yRel=my0-sm*(mx*mx-.28); oh=max(.08,op)
topSc=1-(0.54*min(sm*1.6,1)) if sm>0 else 1.0; botSc=1.08
ey=np.where(yRel>0,yRel/(oh*topSc),yRel/(oh*botSc)); mr=np.sqrt(mx*mx+ey*ey)
oa=(1-sst(.92,1.08,mr))*gate*(mr<1.08); ia=1-sst(.75,.91,mr)
cav=np.array([.18,.04,.05])*255; lip=mcol*.24
fin=lip*(1-ia[...,None])+cav*ia[...,None]
D=D*(1-oa[...,None])+fin*oa[...,None]
Image.fromarray(np.clip(D,0,255).astype(np.uint8)).save(out)
