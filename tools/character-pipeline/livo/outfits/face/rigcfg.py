# RIGCFG for a warped outfit: the adult cfg heights mapped through the head scale and divided by the new height
import json, sys, numpy as np
J=json.load(open(f'/workspace/sb/hyf/{sys.argv[1]}_warp.json')); S,H=J['S'],J['H']; pz=J['piv'][2]; a,b=J['WZ0'],J['WZ1']
def sm(x): t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)
zm=lambda z: float(round((pz+(z-pz)*(1+(S-1)*sm(z)) if z>a else z)/H,4))
C={"hip":0.50,"neck":0.845,"neckBand":0.03,"hairFade":0.05,"knee":0.27,"ankle":0.05,"shoulder":0.795,"shLat":0.14,"slice0":0.55,"slice1":0.75,"cutY":0.0,"torsoY":[0.55,0.72],"headY":[0.87,0.99]}
for k in ('hip','neck','knee','ankle','shoulder','slice0','slice1'): C[k]=zm(C[k])
C['torsoY']=[zm(v) for v in C['torsoY']]; C['headY']=[zm(v) for v in C['headY']]
C['neckBand']=round(0.03*S/H,4); C['hairFade']=round(0.05*S/H,4); C['shLat']=round(0.14/H,4)
print(json.dumps(C))
