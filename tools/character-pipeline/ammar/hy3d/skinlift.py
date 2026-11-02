# Ammar: lighten/neutralise skin toward his avatar (portraits/ammar.webp cheek ~ #f49d75). In-place on bk_<tag>_final.png
import numpy as np,sys,os
from PIL import Image
t=sys.argv[1]; f=f'bk_{t}_final.png'
C=np.asarray(Image.open(f).convert('RGB')).astype(float); P=np.load(f'bk_{t}_pos.npy')
x,y,z=P[...,0],P[...,1],P[...,2]; valid=~((x==-0.5)&(y==-0.5))
r,g,b=C[...,0],C[...,1],C[...,2]; lum=C.mean(2); d=r-b
ss=lambda a,b_,v: np.clip((v-a)/(b_-a),0,1)**2*(3-2*np.clip((v-a)/(b_-a),0,1))
w=ss(85,125,lum)*ss(28,48,d)*(1-ss(150,180,d))*(r>g)*(g>b)*valid*(z>0.36)
G=np.array([float(v) for v in os.environ.get('SKG','1.13,1.12,1.16').split(',')])
out=C*(1+w[...,None]*(G-1))
Image.fromarray(np.clip(out,0,255).astype(np.uint8)).save(f)
print('skinlift',t,'texels',int((w>0.5).sum()))
