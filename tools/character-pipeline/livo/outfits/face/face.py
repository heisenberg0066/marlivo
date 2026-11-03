# face texture pass (after post.py): mirror the kept face half onto the other half (geometry was mirrored in deform.py)
# usage: python face.py <tag>   (cwd = hyf/<o>, needs ../<o>_warp.json)
import numpy as np, sys, os, json
from PIL import Image
from scipy.spatial import cKDTree
E=lambda k,v: float(os.environ.get(k,v))
tag=sys.argv[1]; pre=f'bk_{tag}'; o=os.path.basename(os.getcwd())
J=json.load(open(f'../{o}_warp.json')); c=np.array(J['c']); n=np.array(J['n']); S=J['S']; piv=np.array(J['piv']); SIDE=J['SIDE']
def sm(x,a,b): t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)
src=pre+'_final.png'
if not os.path.exists(pre+'_post.png'): Image.open(src).save(pre+'_post.png')
C=np.asarray(Image.open(pre+'_post.png').convert('RGB')).astype(np.float32)
P=np.load(pre+'_pos.npy'); x,y,z=P[...,0],P[...,1],P[...,2]
valid=~((x==-0.5)&(y==-0.5))&(np.abs(x)<0.45)&(np.abs(y)<0.45)&(z>-0.01)
# window in unscaled head coordinates
P0=piv+(P-piv)/S
fwd=np.cross([0,0,1.],n); fwd/=np.linalg.norm(fwd); fwd=-fwd if fwd[1]>0 else fwd
c0=piv+(c-piv)/S
s=(P0-c0)@n; f=(P0-c0)@fwd; z0=P0[...,2]
sw0=np.interp(z0,[0.89,0.905],[0.042,0.026])
w=(1-sm(np.abs(s),sw0,sw0+0.014))*sm(z0,0.795,0.81)*(1-sm(z0,0.915,0.935))*sm(f,-0.045,-0.025)*valid
good=valid&(w>0)&(SIDE*s>-0.003)
bad=valid&(w>0)&(SIDE*s<0.003)
gi=np.argwhere(good); tr=cKDTree(P[good])
Q=P[bad]; sq=(Q-c)@n; M=Q-2*sq[:,None]*n
dd,ii=tr.query(M,k=3); wt=1/(dd+1e-5); wt/=wt.sum(1,keepdims=True)
G=C[good]; col=(G[ii]*wt[...,None]).sum(1)
k=(w[bad]*sm(-SIDE*s[bad],-0.003,0.003))[:,None]
out=C.copy(); out[bad]=C[bad]*(1-k)+col*k
print('face mirror texels',int(bad.sum()),'median dist',float(np.median(dd[:,0])))
Image.fromarray(out.clip(0,255).astype(np.uint8)).save(src)
np.save(pre+'_facew.npy',w.astype(np.float32))
