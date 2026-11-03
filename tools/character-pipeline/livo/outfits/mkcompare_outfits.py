# out/livo_outfits_compare.jpg: per outfit row = reference | model front | model 3/4 | model back | face close-up
from PIL import Image, ImageDraw, ImageFont
R='/workspace/marlivo_figure/outfits/'; refs={'streetwear':'02_streetwear.jpg','sporty':'05_sporty.jpg','denim':'07_denim.jpg','stockholm':'17_stockholm_city.jpg'}
H=520; font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',26)
def fit(p,w,h,crop=True):
    im=Image.open(p).convert('RGB')
    if crop:
        bb=Image.open(p).convert('RGBA').getbbox() if p.endswith('.png') else None
        bgv=im.convert('L').getpixel((2,2)); g=im.convert('L').point(lambda v:255 if abs(v-bgv)>8 else 0); bb=g.getbbox() or bb
        if bb: bb=(max(0,bb[0]-10),max(0,bb[1]-10),min(im.width,bb[2]+10),min(im.height,bb[3]+10))
        if bb: im=im.crop(bb)
    s=min(w/im.width,h/im.height); im=im.resize((int(im.width*s),int(im.height*s)),Image.LANCZOS)
    c=Image.new('RGB',(w,h),im.getpixel((1,1))); c.paste(im,((w-im.width)//2,(h-im.height)//2)); return c
cols=[('Reference',None),('Model front','v_0'),('3/4','v_45'),('Back','v_180'),('Face','f')]
W=[340,300,300,300,420]; S=Image.new('RGB',(sum(W),50+len(refs)*(H+40)),'white'); d=ImageDraw.Draw(S)
x=0
for (t,_),w in zip(cols,W): d.text((x+10,12),t,fill='black',font=font); x+=w
y=50
for o,rf in refs.items():
    d.text((10,y+6),o,fill='black',font=font); y+=40; x=0
    for (t,k),w in zip(cols,W):
        p=R+rf if k is None else (f'/tmp/of/fin_{o}/f_0.png' if k=='f' else f'/tmp/of/v6_{o}/{k}.png')
        S.paste(fit(p,w,H,crop=k!='f' and k is not None),(x,y)); x+=w
    y+=H
S.save('/workspace/marlivo_figure/out/livo_outfits_compare.jpg',quality=88); print(S.size)
