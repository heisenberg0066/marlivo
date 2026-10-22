import sys, torch, numpy as np
from PIL import Image
from spandrel import ModelLoader
m = ModelLoader().load_from_file('/workspace/tools/RealESRGAN_x4plus.pth').model.eval()
torch.set_num_threads(8)
src, dst, target = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert('RGB')
x = torch.from_numpy(np.asarray(im)).permute(2,0,1)[None].float()/255
T=256; P=16; _,_,H,W=x.shape; out=torch.zeros(1,3,H*4,W*4)
with torch.no_grad():
  for y0 in range(0,H,T):
    for x0 in range(0,W,T):
      ya,xa=max(0,y0-P),max(0,x0-P); yb,xb=min(H,y0+T+P),min(W,x0+T+P)
      o=m(x[:,:,ya:yb,xa:xb])
      oy,ox=(y0-ya)*4,(x0-xa)*4; h,w=min(T,H-y0)*4,min(T,W-x0)*4
      out[:,:,y0*4:y0*4+h,x0*4:x0*4+w]=o[:,:,oy:oy+h,ox:ox+w]
r = Image.fromarray((out[0].clamp(0,1).permute(1,2,0).numpy()*255).round().astype('uint8'))
s = target/max(r.size); r = r.resize((round(r.width*s), round(r.height*s)), Image.LANCZOS)
r.save(dst); print(dst, r.size)
