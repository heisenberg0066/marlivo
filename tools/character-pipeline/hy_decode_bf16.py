# python hy_decode.py <latent.pt> <out.obj> <octree> [chunks]  -- re-decode saved Hunyuan latents at another resolution
import sys, time, gc, torch
sys.path.insert(0, '/workspace/tools/hy3d')
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
torch.set_num_threads(8); t = time.time()
torch.set_default_dtype(torch.bfloat16)
p = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2mv', subfolder='hunyuan3d-dit-v2-mv-turbo', use_safetensors=True, device='cpu', dtype=torch.bfloat16)
p.model = None; p.conditioner = None; gc.collect(); p.enable_flashvdm(mc_algo='mc'); p.vae.float(); torch.set_default_dtype(torch.float32); gc.collect()
lat = torch.load(sys.argv[1]).float()
with torch.no_grad():
    mesh = p._export(lat, 'trimesh', 1.01, 0.0, int(sys.argv[4]) if len(sys.argv) > 4 else 4000, int(sys.argv[3]), 'mc')[0]
mesh.export(sys.argv[2]); print('done', time.time() - t, len(mesh.faces), flush=True)
