import sys, time, torch
sys.path.insert(0, '/workspace/tools/hy3d')
from PIL import Image
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
torch.set_num_threads(8)
name, out = sys.argv[1], sys.argv[2]
sub = sys.argv[3] if len(sys.argv) > 3 else 'hunyuan3d-dit-v2-mv-turbo'
steps = int(sys.argv[4]) if len(sys.argv) > 4 else 5
octree = int(sys.argv[5]) if len(sys.argv) > 5 else 256
views = {'front': 'front', 'left': 'sideL', 'back': 'back', 'right': 'sideR'}
img = {k: Image.open(f'/workspace/sb/gen5/cut/{name}_{v}.png').convert('RGBA') for k, v in views.items()}
t = time.time()
p = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2mv', subfolder=sub,
        use_safetensors=True, device='cpu', dtype=torch.float32)
if 'turbo' in sub:
    p.enable_flashvdm(mc_algo='mc')
p.vae.float(); p.model.float(); p.conditioner.float()
print('loaded', time.time() - t, flush=True)
with torch.autocast('cpu', dtype=torch.float32):
    mesh = p(image=img, num_inference_steps=steps, octree_resolution=octree, num_chunks=20000,
             generator=torch.manual_seed(12345), output_type='trimesh')[0]
mesh.export(out); print('done', time.time() - t, len(mesh.faces), flush=True)
