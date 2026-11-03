# zoomed ortho splat (front or side) of W with a fine grid: projz.py front|side z0 z1 out.png
import numpy as np, sys
from PIL import Image, ImageDraw
view,z0,z1,out=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]),sys.argv[4]
V=np.load('W.npz')['V']; C=np.load('W_col.npy').astype(np.uint8)
S=1000; sc=S/(z1-z0)
h=V[:,0] if view=='front' else V[:,1]; dep=-V[:,1] if view=='front' else V[:,0]*float(sys.argv[5] if len(sys.argv)>5 else 1)
h0=-(z1-z0)/2
px=((h-h0)*sc).astype(int); py=((z1-V[:,2])*sc).astype(int); o=np.argsort(dep)
img=np.full((S,S,3),90,np.uint8)
for dx in range(3):
    for dy in range(3):
        xx=np.clip(px+dx,0,S-1); yy=np.clip(py+dy,0,S-1); img[yy[o],xx[o]]=C[o]
im=Image.fromarray(img); dr=ImageDraw.Draw(im)
for g in np.arange(-0.5,0.5,0.02):
    X=int((g-h0)*sc)
    if 0<=X<S: dr.line([(X,0),(X,S)],fill=(255,255,0) if round(g*50)%5==0 else (110,110,40)); (round(g*50)%5==0) and dr.text((X+2,2),f'{g:+.2f}',fill=(255,255,0))
for g in np.arange(0,1.01,0.02):
    Y=int((z1-g)*sc)
    if 0<=Y<S: dr.line([(0,Y),(S,Y)],fill=(255,255,0) if round(g*50)%5==0 else (110,110,40)); (round(g*50)%5==0) and dr.text((2,Y+2),f'{g:.2f}',fill=(255,255,0))
im.save(out)
