# front chart of the face texels: u = signed distance to the face plane (scaled head units), v = z.  writes <o>_chart.png
import numpy as np, sys, os, json
from PIL import Image, ImageDraw
o=sys.argv[1]; tag=sys.argv[2] if len(sys.argv)>2 else 'hi'; img=sys.argv[3] if len(sys.argv)>3 else f'{o}/bk_{tag}_final.png'
J=json.load(open(f'{o}_warp.json')); c=np.array(J['c']); n=np.array(J['n'])
C=np.asarray(Image.open(img).convert('RGB')); P=np.load(f'{o}/bk_{tag}_pos.npy')
fwd=np.cross([0,0,1.],n); fwd/=np.linalg.norm(fwd); fwd=-fwd if fwd[1]>0 else fwd
u=(P-c)@n; f=(P-c)@fwd; v=P[...,2]
U0,U1,V0,V1=-0.075,0.075,0.80,0.98; R=0.00012
W_=int((U1-U0)/R); H_=int((V1-V0)/R)
sel=(u>U0)&(u<U1)&(v>V0)&(v<V1)&(f>-0.075)
px=((u[sel]-U0)/R).astype(int); py=((V1-v[sel])/R).astype(int); dep=f[sel]
o_=np.argsort(dep)   # far first... f grows toward the front? fwd points to the face, so larger f = nearer
I=np.full((H_,W_,3),60,np.uint8); col=C[sel]
for dx in (0,1,2):
    for dy in (0,1,2):
        I[np.clip(py[o_]+dy,0,H_-1),np.clip(px[o_]+dx,0,W_-1)]=col[o_]
im=Image.fromarray(I); d=ImageDraw.Draw(im)
for g in np.arange(-0.07,0.071,0.01): X=(g-U0)/R; d.line([(X,0),(X,H_)],fill=(255,255,0) if abs(g)<1e-9 else (110,110,0)); d.text((X+2,2),'%.2f'%g,fill=(255,255,0))
for g in np.arange(0.80,0.981,0.01): Y=(V1-g)/R; d.line([(0,Y),(W_,Y)],fill=(110,110,0)); d.text((2,Y-11),'%.2f'%g,fill=(255,255,0))
im.save(os.environ.get('OUT',f'/tmp/of/chart_{o}.png')); print(im.size)
