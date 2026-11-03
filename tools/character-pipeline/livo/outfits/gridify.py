# overlay a coordinate grid on orthorender output: gridify.py prefix z0 z1  (front/back: x across, left/right: y across)
import sys
from PIL import Image, ImageDraw
p,z0,z1=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]); s=z1-z0
for v,ax,flip in (('front','x',1),('back','x',-1),('left','y',1),('right','y',-1)):
    im=Image.open(f'{p}_{v}.png').convert('RGB'); W=im.width; dr=ImageDraw.Draw(im); k=W/s
    for i in range(-50,51):
        g=i*0.01; X=int(W/2+flip*g*k) if v in('front',) else None
        # front: +x right; back: +x left; left view (cam at +x looking -x): -y (front) on the right? computed below
        if v=='front': X=int(W/2+g*k)
        elif v=='back': X=int(W/2-g*k)
        elif v=='left': X=int(W/2+g*k)    # cam at +x, rot z 90: image right = +y
        else: X=int(W/2-g*k)
        if 0<=X<W:
            major=i%5==0; dr.line([(X,0),(X,W)],fill=(255,255,0) if major else (150,150,60),width=1)
            if major: dr.text((X+2,2),f'{ax}{g:+.2f}',fill=(255,0,0))
    for i in range(0,101):
        g=i*0.01; Y=int((z1-g)*k)
        if 0<=Y<W:
            major=i%5==0; dr.line([(0,Y),(W,Y)],fill=(255,255,0) if major else (150,150,60),width=1)
            if major: dr.text((2,Y+2),f'z{g:.2f}',fill=(255,0,0))
    im.save(f'{p}_{v}_g.png')
