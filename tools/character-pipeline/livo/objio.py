import numpy as np
def load(p):
    V=[];F=[];other=[]
    with open(p) as f:
        for ln in f:
            if ln.startswith('v '): V.append(ln[2:].split())
            elif ln.startswith('f '): F.append([int(x.split('/')[0]) - 1 for x in ln[2:].split()])
    return np.array(V, float), np.array(F, np.int64)
def save(p, V, F):
    with open(p, 'w') as f:
        np.savetxt(f, V, fmt='v ' + ' '.join(['%.8f'] * V.shape[1]))
        np.savetxt(f, F + 1, fmt='f %d %d %d')
