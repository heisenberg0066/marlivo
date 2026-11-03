import sys, json
from PIL import Image, ImageDraw
p=sys.argv[1]; J=json.load(open(p+'.json')); im=Image.open(p).convert('RGB'); W=im.width; k=W/J['span']; dr=ImageDraw.Draw(im)
for i in range(-80,81):
    g=i*0.001; X=int(W/2+g*k)
    if i%5==0: dr.line([(X,0),(X,W)],fill=(255,255,0) if i%10==0 else (140,140,50)); i%10==0 and dr.text((X+1,1),f'{g:+.2f}',fill=(255,0,0))
for i in range(800,1001):
    g=i*0.001; Y=int(W/2-(g-J['q1c'])*k)
    if 0<=Y<W and i%5==0: dr.line([(0,Y),(W,Y)],fill=(255,255,0) if i%10==0 else (140,140,50)); i%10==0 and dr.text((1,Y+1),f'{g:.2f}',fill=(255,0,0))
im.save(p.replace('.png','_g.png'))
