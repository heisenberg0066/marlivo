# xatlas charts + packing; the front of the head is scaled up before charting so the face gets FACESCALE x texel density
import numpy as np, xatlas, sys, os
tag=sys.argv[1]; TS=int(sys.argv[2]); FS=float(os.environ.get('FACESCALE',2.2))
d=np.load(f'bk_{tag}_geo.npz'); V=d['V'].astype(np.float32); F=d['F'].astype(np.uint32)
c=np.array([0.0,-0.10,0.70]); Vs=V.copy()
# smooth weight: head front (face, fringe sides, ears) -> FS, rest 1
z=V[:,2]; w=np.clip((z-0.58)/0.04,0,1)*np.clip((0.84-z)/0.04,0,1)*np.clip((-0.02-V[:,1])/0.05,0,1)
s=1+(FS-1)*w
Vs=c+(V-c)*s[:,None]
atlas=xatlas.Atlas(); atlas.add_mesh(Vs,F)
co=xatlas.ChartOptions(); co.max_iterations=2
po=xatlas.PackOptions(); po.resolution=TS; po.padding=4; po.bilinear=True; po.rotate_charts=True; po.bruteForce=False
atlas.generate(co,po)
vm,idx,uv=atlas[0]
print('charts',atlas.chart_count,'atlas',atlas.width,atlas.height,'util',atlas.utilization if hasattr(atlas,'utilization') else '')
np.savez(f'bk_{tag}_uv.npz',uv=uv,idx=idx,vm=vm)
