# livo_compare_v3.jpg: reference | HY3D-based model, front / 3/4 / side / back, a large face close-up, in-game shots
import sys
from PIL import Image, ImageDraw, ImageFont
R='/workspace/marlivo_figure/'; M='/tmp/lk/hy/'
W=1440; PW=720; PH=960
try: font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',30); fs=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22)
except Exception: font=fs=ImageFont.load_default()
def bg(w,h):
    im=Image.new('RGB',(w,h)); d=ImageDraw.Draw(im)
    for yy in range(h): t=yy/h; d.line([(0,yy),(w,yy)],fill=(int(160+40*t),int(205+20*t),int(240+5*t)))
    return im
def model(p,w,h):
    im=Image.open(p).convert('RGBA'); s=h/im.height; im=im.resize((int(im.width*s),h),Image.LANCZOS)
    if im.width>w: x0=(im.width-w)//2; im=im.crop((x0,0,x0+w,h))
    b=bg(w,h).convert('RGBA'); b.alpha_composite(im,((w-im.width)//2,0)); return b.convert('RGB')
def ref(p,w,h):
    im=Image.open(p).convert('RGB'); s=max(w/im.width,h/im.height); im=im.resize((int(im.width*s),int(im.height*s)),Image.LANCZOS)
    x0=(im.width-w)//2; y0=(im.height-h)//2; return im.crop((x0,y0,x0+w,y0+h))
rows=[('Front','1_front.jpg','cmp_front.png'),('3/4','2_three_quarter.jpg','cmp_tq.png'),('Side','3_side.jpg','cmp_side.png'),('Back','4_back.jpg','cmp_back.png')]
ing=sys.argv[1:]
H=60+len(rows)*(PH+50)+50+W//2+60+(50+300 if ing else 0)+20
S=Image.new('RGB',(W,H),'white'); d=ImageDraw.Draw(S)
d.text((20,15),'Livo v3 (Tencent HY 3D v3.1 base): reference (left) vs game model (right)',fill='black',font=font)
y=60
for t,rp,mp in rows:
    d.text((20,y+10),t,fill='black',font=font); y+=50
    S.paste(ref(R+rp,PW,PH),(0,y)); S.paste(model(M+mp,PW,PH),(PW,y)); y+=PH
d.text((20,y+10),'Face close-up (5_head_closeup.jpg vs model)',fill='black',font=font); y+=50
S.paste(ref(R+'5_head_closeup.jpg',PW,PW),(0,y)); S.paste(model(M+'cmp_face.png',PW,PW),(PW,y)); y+=PW+10
if ing:
    d.text((20,y+10),'In game',fill='black',font=font); y+=50
    n=len(ing); w=W//n
    for i,p in enumerate(ing):
        im=Image.open(p).convert('RGB'); s=w/im.width; im=im.resize((w,int(im.height*s)),Image.LANCZOS); S.paste(im.crop((0,0,w,min(300,im.height))),(i*w,y))
    y+=300
S=S.crop((0,0,W,y+20)); S.save(R+'out/livo_compare_v3.jpg',quality=88); print(S.size)
