# Sculpted cartoon arms + hands (SDF -> marching cubes -> quadric decimation) for the HY3D Livo / Ammar rigs.
# Each arm: shoulder S -> elbow E -> wrist W -> knuckles K -> fingertips, hanging along `down`, palm facing back
# (so a forward reach lays the palm down on the table and the finger curl closes toward the palm).
# Parts: upper arm, elbow, forearm, wrist, palm (rounded, tapered), thenar pad, 2-segment thumb, 4 two-segment fingers
# (smooth-unioned into one skin surface) + clothing (coat sleeve with a turned-back cuff, or a T-shirt sleeve with a
# hem) hard-unioned on top, + an optional watch. Per-face materials, SDF-gradient normals and per-vertex skin weights
# for the 4-bone arm chain (armX, armX_fore, armX_hand, armX_curl).
# Usage: python mkarm.py cfg.json out_prefix   -> out_prefix_hi.npz / _lo.npz (+ _chain.json)
import sys, json, numpy as np
from skimage.measure import marching_cubes
import pymeshlab
cfg = json.load(open(sys.argv[1])); outp = sys.argv[2]
VOX = cfg.get('voxel', 0.0009)
nz = lambda v: v / np.linalg.norm(v)

def smin(a, b, k):
    if k <= 0: return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h)
def cone(p, a, b, ra, rb):
    ba = b - a; pa = p - a; h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return np.linalg.norm(pa - h[:, None] * ba, axis=1) - (ra + (rb - ra) * h)
def rbox(p, c, fr, he, rr, taper=None):
    q = (p - c) @ fr.T  # local (l, d, pn)
    if taper is not None:  # narrower toward the wrist (-d side): scale the lateral axis
        k = np.clip((q[:, 1] + he[1]) / (2 * he[1]), 0, 1); sc = taper + (1 - taper) * k; q = q.copy(); q[:, 0] /= sc
    else: sc = 1.0
    d = np.abs(q) - (he - rr)
    return (np.linalg.norm(np.maximum(d, 0), axis=1) + np.minimum(np.max(d, axis=1), 0) - rr) * np.minimum(sc, 1.0)
def rcyl(p, a, b, ra, rb, rr):
    ax = b - a; L = np.linalg.norm(ax); ax = ax / L; pa = p - a; y = pa @ ax
    x = np.linalg.norm(pa - y[:, None] * ax, axis=1); r = ra + (rb - ra) * np.clip(y / L, 0, 1)
    dx = x - (r - rr); dy = np.abs(y - L / 2) - (L / 2 - rr)
    return np.minimum(np.maximum(dx, dy), 0) + np.linalg.norm(np.stack([np.maximum(dx, 0), np.maximum(dy, 0)], 1), axis=1) - rr

def arm_parts(side):
    sg = -1 if side == 'armL' else 1
    S = np.array(cfg['shoulders'][side], float); d = nz(np.array(cfg['down'], float))
    pn = nz(np.array([0, 0, -1.]) - d * (d @ np.array([0, 0, -1.])))       # palm normal (backward)
    l = nz(np.cross(d, pn) * 0 + np.array([sg, 0, 0.]) - d * (d[0] * sg) - pn * (pn[0] * sg))  # outward
    E = S + d * cfg['upper']; W = E + d * cfg['fore']; K = W + d * cfg['palm']
    H = cfg['hand']; w, t, fr = H['w'], H['t'], H['fr']; AR = cfg['armR']
    P = []  # (name, kind, group, fn)   kind: arm|wrist|palm|thumb|finger|sleeve|cuff|watch ; group: skin|cloth|watch
    add = lambda nm, kind, grp, fn: P.append((nm, kind, grp, fn))
    coat = cfg['sleeve']['kind'] == 'coat'   # a coat sleeve hides the whole arm: only the wrist + hand are skin
    if not coat:
        add('upper', 'arm', 'skin', lambda p: cone(p, S + d * 0.012, E, AR[0], AR[1]))
        add('elbow', 'arm', 'skin', lambda p: np.linalg.norm(p - E, axis=1) - AR[1] * 0.97)
        add('fore', 'arm', 'skin', lambda p: cone(p, E, W - d * 0.014, AR[2], AR[3]))
    else:
        add('fore', 'arm', 'skin', lambda p: cone(p, W - d * 0.045, W - d * 0.014, AR[3] * 1.05, AR[3]))
    if cfg.get('bulge'):
        add('bulge', 'arm', 'skin', lambda p: cone(p, E + d * 0.012, E + d * 0.055, AR[2] * 1.08, AR[2] * 0.98))
    add('wrist', 'wrist', 'skin', lambda p: cone(p, W - d * 0.02, W + d * 0.012, AR[3], AR[3] * 0.95))
    FR = np.stack([l, d, pn])
    C = W + d * (cfg['palm'] * 0.52) + pn * (t * 0.05)
    add('palm', 'palm', 'skin', lambda p: rbox(p, C, FR, np.array([w / 2, cfg['palm'] / 2 + 0.002, t / 2]), t * 0.46, taper=0.78))
    TB = W + d * (cfg['palm'] * 0.22) - l * (w * 0.40) + pn * (t * 0.22)
    add('thenar', 'thumb', 'skin', lambda p: cone(p, W + d * 0.008 - l * w * 0.18 + pn * t * 0.15, TB, t * 0.40, H['thumbR'] * 1.05))
    td = nz(d * 0.72 - l * 0.42 + pn * 0.55); T1 = TB + td * H['thumb'][0]
    td2 = nz(td + pn * 0.35 + l * 0.25); T2 = T1 + td2 * H['thumb'][1]
    add('thumb1', 'thumb', 'skin', lambda p: cone(p, TB, T1, H['thumbR'], H['thumbR'] * 0.93))
    add('thumb2', 'thumb', 'skin', lambda p: cone(p, T1, T2, H['thumbR'] * 0.93, H['thumbR'] * 0.82))
    fl = cfg['finger']
    for j, (lf, up) in enumerate(zip([0.93, 1.0, 0.95, 0.78], [0, 0, 0.002, 0.006])):
        u = (-1.5 + j) * (w / 4) * cfg.get('fingerGap', 0.93)
        B = K + l * u - d * (0.006 + up) + pn * (t * 0.04)
        fd = nz(d + l * (u / w) * cfg.get('spread', 0.18)); L = fl * lf
        F1 = B + fd * L * 0.55; fd2 = nz(fd + pn * 0.28); F2 = F1 + fd2 * L * 0.45
        rf = fr * (0.92 if j == 3 else 1.0)
        add(f'f{j}a', 'finger', 'skin', (lambda B, F1, rf: lambda p: cone(p, B, F1, rf, rf * 0.95))(B, F1, rf))
        add(f'f{j}b', 'finger', 'skin', (lambda F1, F2, rf: lambda p: cone(p, F1, F2, rf * 0.95, rf * 0.84))(F1, F2, rf))
    sl = cfg['sleeve']
    if sl['kind'] == 'coat':
        cEnd = W + d * sl['cuffOut']; cSt = cEnd - d * sl['cuffLen']; sEnd = cSt + d * 0.006
        add('sl1', 'sleeve', 'cloth', lambda p: cone(p, S + d * sl['top'], E, sl['r'][0], sl['r'][1]))
        add('sl2', 'sleeve', 'cloth', lambda p: cone(p, E, sEnd, sl['r'][1], sl['r'][2]))
        add('cuff', 'cuff', 'cloth', lambda p: rcyl(p, cSt, cEnd, sl['cuffR'], sl['cuffR'] * 1.02, 0.006))
        ends = {'cuffEnd': cEnd}
    else:
        a = S + d * sl['top']; b = S + d * sl['end']
        add('tee', 'sleeve', 'cloth', lambda p: cone(p, a, b - d * 0.016, sl['r'][0], sl['r'][1]))
        add('hem', 'cuff', 'cloth', lambda p: rcyl(p, b - d * 0.022, b, sl['r'][1] + sl['hem'], sl['r'][1] + sl['hem'], 0.0035))
        ends = {'cuffEnd': b}
    if cfg.get('watch') == side:
        wc = W - d * 0.014
        add('band', 'watch', 'watch', lambda p: rcyl(p, wc - d * 0.0045, wc + d * 0.0045, AR[3] + 0.0028, AR[3] + 0.0028, 0.0015))
        add('dial', 'watch', 'watchface', lambda p: rbox(p, wc - pn * (AR[3] + 0.0028), FR, np.array([0.0075, 0.0075, 0.0022]), 0.0018))
    chain = dict(S=S, E=E, W=W, K=K, d=d, pn=pn, l=l, sg=sg, **ends)
    return P, chain

GROUPS = {'skin': ('skin',), 'cloth': ('cloth',), 'watch': ('watch', 'watchface')}
def field(P, p, parts=False, groups=('skin', 'cloth', 'watch', 'watchface')):
    vals = {nm: fn(p) for nm, kind, grp, fn in P if grp in groups}
    f = {}
    for nm, kind, grp, fn in P:
        if grp not in groups: continue
        g = 'skin' if grp == 'skin' else 'cloth' if grp == 'cloth' else 'watch'
        k = (0.0016 if kind == 'finger' else 0.004 if kind in ('arm', 'wrist') else 0.0028) if g == 'skin' else 0.002 if g == 'cloth' else 0
        f[g] = vals[nm] if g not in f else smin(f[g], vals[nm], k)
    out = None
    for v in f.values(): out = v if out is None else np.minimum(out, v)
    return (out, vals) if parts else out

def mesh_group(P, gname, vox, target, lo, hi):
    gs = GROUPS[gname]
    if not any(x[2] in gs for x in P): return None
    # tight bbox from a coarse pass
    c = 0.004; n = np.ceil((hi - lo) / c).astype(int) + 1
    G = np.stack(np.meshgrid(*[lo[k] + np.arange(n[k]) * c for k in range(3)], indexing='ij'), -1).reshape(-1, 3)
    inside = G[field(P, G, groups=gs) < 0.006]; lo2 = inside.min(0) - 0.006; hi2 = inside.max(0) + 0.006
    n = np.ceil((hi2 - lo2) / vox).astype(int) + 1
    G = np.stack(np.meshgrid(*[lo2[k] + np.arange(n[k]) * vox for k in range(3)], indexing='ij'), -1).reshape(-1, 3)
    vol = np.empty(len(G), np.float32)
    for i in range(0, len(G), 2_000_000): vol[i:i + 2_000_000] = field(P, G[i:i + 2_000_000], groups=gs)
    V, F, _, _ = marching_cubes(vol.reshape(n), 0.0, spacing=(vox,) * 3, gradient_direction='ascent'); V = V + lo2
    ms = pymeshlab.MeshSet(); ms.add_mesh(pymeshlab.Mesh(V, F)); ms.meshing_remove_duplicate_vertices()
    ms.meshing_decimation_quadric_edge_collapse(targetfacenum=target, preservenormal=True, qualitythr=0.6, optimalplacement=True, planarquadric=True)
    m = ms.current_mesh(); V = m.vertex_matrix().astype(np.float64); F = m.face_matrix()
    ff = lambda q: field(P, q, groups=gs)
    for _ in range(2):  # snap onto the surface
        f0 = ff(V); e = 1e-4
        g = np.stack([(ff(V + np.eye(3)[k] * e) - f0) / e for k in range(3)], 1); g /= np.linalg.norm(g, axis=1, keepdims=True) + 1e-12
        V = V - g * f0[:, None]
    g = np.stack([(ff(V + np.eye(3)[k] * 2e-4) - ff(V - np.eye(3)[k] * 2e-4)) for k in range(3)], 1)
    N = g / (np.linalg.norm(g, axis=1, keepdims=True) + 1e-12)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    if (fn * N[F].mean(1)).sum() < 0: F = F[:, ::-1].copy()   # counter-clockwise = outward (glTF front faces)
    return V, N, F

def build(side, lod):
    P, ch = arm_parts(side)
    S, d = ch['S'], ch['d']
    tip = ch['K'] + d * cfg['finger'] * 1.05
    pts = np.array([S + d * -0.07, tip + d * 0.01]); lo = pts.min(0) - 0.07; hi = pts.max(0) + 0.07
    B = cfg.get('budget', {}).get(lod) or ({'skin': 5200, 'cloth': 2400, 'watch': 360} if lod == 'hi' else {'skin': 1500, 'cloth': 700, 'watch': 120})
    VX = {'skin': VOX, 'cloth': VOX * 1.6, 'watch': VOX * 0.6}
    names = [x[0] for x in P]; kind = {x[0]: x[1] for x in P}; grp = {x[0]: x[2] for x in P}
    Vs, Ns, Fs, Ms, Ws = [], [], [], [], []; off = 0
    sm = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
    sE = (ch['E'] - S) @ d; sW = (ch['W'] - S) @ d; sK = (ch['K'] - S) @ d; s_end = (ch['cuffEnd'] - S) @ d
    for gname in ('skin', 'cloth', 'watch'):
        r = mesh_group(P, gname, VX[gname], B[gname], lo, hi)
        if r is None: continue
        V, N, F = r; gs = GROUPS[gname]
        sub = [nm for nm in names if grp[nm] in gs]
        Cc = V[F].mean(1); _, vals = field(P, Cc, parts=True, groups=gs)
        best = np.argmin(np.stack([vals[nm] for nm in sub], 1), 1)
        def matof(nm):
            g = grp[nm]
            return g if g != 'cloth' else ('cuff' if kind[nm] == 'cuff' else 'sleeve')
        mat = np.array([matof(sub[b]) for b in best], object)
        if gname == 'cloth':
            fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]); fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12
            mat[(fn @ d > 0.6) & (((Cc - S) @ d) > s_end - 0.004)] = 'inner'
        _, vv = field(P, V, parts=True, groups=gs); bv = np.argmin(np.stack([vv[nm] for nm in sub], 1), 1)
        kv = np.array([kind[sub[b]] for b in bv], object); s = (V - S) @ d
        g_e = sm((s - (sE - 0.028)) / 0.056)
        g_w = np.where(np.isin(kv, ['sleeve', 'cuff', 'watch', 'arm']), 0.0, sm((s - (sW - 0.012)) / 0.016))
        g_k = np.where(kv == 'finger', sm((s - (sK - 0.005)) / 0.010), 0.0)
        w = np.clip(np.stack([1 - g_e, g_e * (1 - g_w), g_e * g_w * (1 - g_k), g_e * g_w * g_k], 1), 0, 1); w /= w.sum(1, keepdims=True)
        Vs.append(V); Ns.append(N); Fs.append(F + off); Ms.append(mat); Ws.append(w); off += len(V)
    V = np.vstack(Vs); N = np.vstack(Ns)
    # SDF ambient occlusion over the whole arm (creases between fingers, under the cuff, thumb web)
    occ = np.zeros(len(V))
    for i, h in enumerate([0.002, 0.004, 0.007, 0.011, 0.016]):
        occ += (h - np.minimum(field(P, V + N * h), h)) / h * 0.5 ** i
    ao = np.clip(1 - 0.32 * occ, 0.62, 1.0)
    ch = {k: (v.tolist() if isinstance(v, np.ndarray) else v) for k, v in ch.items()}
    return dict(AO=ao, V=np.vstack(Vs), N=np.vstack(Ns), F=np.vstack(Fs), mat=np.concatenate(Ms), W=np.vstack(Ws), chain=ch)

out = {}
for lod in ('hi', 'lo'):
    pack = {}
    chains = {}
    for side in ('armL', 'armR'):
        r = build(side, lod); chains[side] = r['chain']
        for k in ('V', 'N', 'F', 'W', 'AO'): pack[f'{side}_{k}'] = r[k]
        pack[f'{side}_mat'] = r['mat'].astype(str)
        print(lod, side, len(r['V']), 'verts', len(r['F']), 'faces', {m: int((r['mat'] == m).sum()) for m in set(r['mat'])})
    np.savez(f'{outp}_{lod}.npz', **pack)
    json.dump({k: (v.round(6).tolist() if v.dtype.kind == 'f' else v.tolist()) for k, v in pack.items()}, open(f'{outp}_{lod}.json', 'w'))
json.dump(chains, open(f'{outp}_chain.json', 'w'), indent=1)
