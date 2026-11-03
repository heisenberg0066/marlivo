# W.npz + texture -> orthographic front (and side) splat images with a coordinate grid, for picking arm/pocket coordinates
import numpy as np, sys
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS=None
d=np.load('W.npz'); V=d['V']; U=np.load('W_uv.npy')
TX=np.asarray(Image.open('src_texture_pbr_20250901.png').convert('RGB')); th,tw=TX.shape[:2]
C=TX[np.clip(((1-U[:,1])*th).astype(int),0,th-1),np.clip((U[:,0]*tw).astype(int),0,tw-1)]
np.save('W_col.npy',C.astype(np.float32))
print('bbox',V.min(0).round(3),V.max(0).round(3))
S=900
def splat(ax_h,ax_d,front_sign,name):
    img=np.full((S,S,3),90,np.uint8); zb=np.full((S,S),1e9)
    h=V[:,ax_h]; v=V[:,2]; dep=front_sign*V[:,ax_d]
    px=((h+0.5)*S*0.85+S*0.075).astype(int); py=((1.05-v)*S*0.85).astype(int)
    o=np.argsort(dep)
    for r in (0,1):
        for i in o:
            pass
    # vectorised painter: sort far->near and assign
    for dx in (0,1):
        for dy in (0,1):
            xx=np.clip(px+dx,0,S-1); yy=np.clip(py+dy,0,S-1)
            img[yy[o],xx[o]]=C[o]
    im=Image.fromarray(img); dr=ImageDraw.Draw(im)
    for g in np.arange(-0.4,0.41,0.05):
        X=int((g+0.5)*S*0.85+S*0.075); dr.line([(X,0),(X,8)],fill=(255,255,0)); dr.text((X-8,10),f'{g:+.2f}'[:5],fill=(255,255,0))
    for g in np.arange(0,1.01,0.05):
        Y=int((1.05-g)*S*0.85); dr.line([(0,Y),(S,Y)],fill=(255,255,0) if abs(g*10-round(g*10))<1e-6 else (120,120,0)); dr.text((2,Y-12),f'{g:.2f}',fill=(255,255,0))
    im.save(name)
splat(0,1,-1,'proj_front.png')   # viewer at -Y looking +Y: near = small y -> dep=-y larger is near; sort by -dep => far first
splat(1,0,1,'proj_side.png')
