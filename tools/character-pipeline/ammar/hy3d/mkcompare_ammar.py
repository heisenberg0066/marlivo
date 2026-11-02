# ammar_compare_hy3d.jpg: reference (avatar views) | HY3D-based game model, front / 3/4 / side / back, face close-up, in-game shots
import sys
from PIL import Image, ImageDraw, ImageFont
R='/workspace/sb/gen5/cut/'; M='/tmp/lk/hy/'
W=1440; PW=720; PH=960
try: font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',30)
except Exception: font=ImageFont.load_default()
def bg(w,h):
    im=Image.new('RGB',(w,h)); d=ImageDraw.Draw(im)
    for yy in range(h): t=yy/h; d.line([(0,yy),(w,yy)],fill=(int(200+30*t),int(205+25*t),int(212+25*t)))
    return im
def fit(p,w,h,crop=None):
    im=Image.open(p).convert('RGBA')
    if crop: im=im.crop(crop)
    bb=im.getbbox(); im=im.crop(bb)
    s=min(w*0.94/im.width,h*0.96/im.height); im=im.resize((int(im.width*s),int(im.height*s)),Image.LANCZOS)
    b=bg(w,h).convert('RGBA'); b.alpha_composite(im,((w-im.width)//2,(h-im.height)//2)); return b.convert('RGB')
rows=[('Front','ammar_front.png','acmp_front.png'),('3/4','ammar_q34L.png','acmp_tq.png'),('Side','ammar_sideL.png','acmp_side.png'),('Back','ammar_back.png','acmp_back.png')]
ing=sys.argv[1:]
H=60+len(rows)*(PH+50)+50+PW+10+(50+380 if ing else 0)+20
S=Image.new('RGB',(W,H),'white'); d=ImageDraw.Draw(S)
d.text((20,15),'Ammar (Tencent HY 3D base): reference (left) vs game model (right)',fill='black',font=font)
y=60
for t,rp,mp in rows:
    d.text((20,y+10),t,fill='black',font=font); y+=50
    S.paste(fit(R+rp,PW,PH),(0,y)); S.paste(fit(M+mp,PW,PH),(PW,y)); y+=PH
d.text((20,y+10),'Face close-up (avatar portrait vs model)',fill='black',font=font); y+=50
fr=Image.open(R+'ammar_front.png'); bb=fr.getbbox(); hh=bb[3]-bb[1]
S.paste(fit(R+'ammar_front.png',PW,PW,crop=(bb[0]+int((bb[2]-bb[0])*0.18),bb[1],bb[2]-int((bb[2]-bb[0])*0.18),bb[1]+int(hh*0.34))),(0,y))
S.paste(fit(M+'acmp_face.png',PW,PW),(PW,y)); y+=PW+10
if ing:
    d.text((20,y+10),'In game',fill='black',font=font); y+=50
    n=len(ing); w=W//n
    for i,(p) in enumerate(ing):
        p,_,box=p.partition('@'); im=Image.open(p).convert('RGB')
        if box: im=im.crop(tuple(int(v) for v in box.split(',')))
        s=380/im.height; im=im.resize((int(im.width*s),380),Image.LANCZOS)
        x0=max(0,(im.width-w)//2); S.paste(im.crop((x0,0,x0+w,380)),(i*w,y))
    y+=380
S=S.crop((0,0,W,y+20)); S.save('/workspace/marlivo_figure/out/ammar_compare_hy3d.jpg',quality=88); print(S.size)
