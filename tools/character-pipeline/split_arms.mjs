// Re-rigs the arms of an exported character GLB: each one-bone arm becomes upper arm -> forearm -> hand -> curl
// (paw/fingers close), and the arm weights are rebuilt from geometry. Mesh, UVs and textures are untouched and the
// rest pose is identical (new joints get matching inverse binds), so faces and bodies cannot change at rest.
// Why rebuild: bone heat in rig.py gave the arms big parts of the body, a leg and (Mint) the tail, so any arm motion
// dragged them along. Now only the arm itself (lateral of the torso, between the rig's arm heights) follows the
// arm chain; everything else that used to follow an arm follows the spine (or hips below the hip line).
// The upper bone keeps its name (armL/armR); new bones armL_fore, armL_hand, armL_curl (same for R).
// Usage: node split_arms.mjs in.glb out.glb <name>   (rig_<name>.json next to this file, optional "split"
// overrides {cx, armX, zmin} in model heights; orange guy: name 'orange', no json)
// Needs @gltf-transform/core + /extensions (v4) and meshoptimizer installed next to the script.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const [, , inF, outF, name] = process.argv;
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inF);
const root = doc.getRoot(); const skin = root.listSkins()[0];
if (!skin) throw new Error('no skin');
const joints = [...skin.listJoints()]; const ibmA = skin.getInverseBindMatrices();
const ibm = (i) => ibmA.getElement(i, new Array(16));
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; }; // column-major
const xf = (m, v) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r]);
const inv3 = (m, v) => { // inverse of a rotation(+scale) 4x4 applied to a point
  const t = [v[0] - m[12], v[1] - m[13], v[2] - m[14]]; const c = [0, 1, 2].map((k) => [m[k * 4], m[k * 4 + 1], m[k * 4 + 2]]);
  return c.map((col) => (col[0] * t[0] + col[1] * t[1] + col[2] * t[2]) / (col[0] ** 2 + col[1] ** 2 + col[2] ** 2));
};
const prims = []; const seen = new Set();
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) { const J = p.getAttribute('JOINTS_0'); if (J && !seen.has(J)) { seen.add(J); prims.push(p); } }
// float weights + 16-bit joints while editing (byte weights would round the blends)
for (const p of prims) {
  for (const [k, T] of [['WEIGHTS_0', Float32Array], ['JOINTS_0', Uint16Array]]) {
    const A = p.getAttribute(k); if (A.getArray() instanceof T) continue;
    const a = new T(A.getCount() * 4); const t = []; for (let i = 0; i < A.getCount(); i++) a.set(A.getElement(i, t), i * 4);
    p.setAttribute(k, doc.createAccessor().setType('VEC4').setArray(a).setBuffer(A.getBuffer()));
  }
}
// rest positions in armature space (same for any joint: Bj * IBMj is the mesh bind)
const B = (j) => j.getWorldMatrix();
const M0 = mul(B(joints[0]), ibm(0));
const rest = prims.map((p) => { const P = p.getAttribute('POSITION'); const v = []; const out = new Float32Array(P.getCount() * 3); for (let i = 0; i < P.getCount(); i++) out.set(xf(M0, P.getElement(i, v)), i * 3); return out; });
const all = rest.flatMap((r) => Array.from({ length: r.length / 3 }, (_, i) => [r[i * 3], r[i * 3 + 1], r[i * 3 + 2]]));
let ymin = Infinity, ymax = -Infinity; for (const q of all) { ymin = Math.min(ymin, q[1]); ymax = Math.max(ymax, q[1]); }
const Hh = ymax - ymin; const Y = (z) => ymin + z * Hh;
const here = dirname(fileURLToPath(import.meta.url));
const rc = join(here, `rig_${name}.json`);
let cfg;
if (existsSync(rc)) {
  const c = JSON.parse(readFileSync(rc, 'utf8'));
  const tor = all.filter((q) => q[1] > Y(c.hip) && q[1] < Y(c.neck)); const xs = tor.map((q) => q[0]).sort((a, b) => a - b);
  cfg = { cx: xs[Math.floor(xs.length / 2)], armX: c.arm_x * Hh, y0: Y(c.arm_z[0]) - 0.06 * Hh, y1: Y(c.arm_z[1]) + 0.04 * Hh, hip: Y(c.hip), zmin: -Infinity };
  if (c.split) { if (c.split.cx !== undefined) cfg.cx = c.split.cx * Hh; if (c.split.armX !== undefined) cfg.armX = c.split.armX * Hh; if (c.split.zmin !== undefined) cfg.zmin = c.split.zmin * Hh; }
} else { // orange guy: the arms are whatever is outside the upper body slice (as rig.py)
  const up = all.filter((q) => q[1] > Y(0.72) && q[1] < Y(0.9)); let x0 = Infinity, x1 = -Infinity; for (const q of up) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); }
  cfg = { cx: (x0 + x1) / 2, armX: (x1 - x0) / 2 + 0.02 * Hh, y0: Y(0.15), y1: Y(0.78), hip: Y(0.3), zmin: -Infinity };
}
const band = 0.035 * Hh;
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const SPLIT = [0.46, 0.8, 0.9], HB = 0.06; // joints along the arm (fraction of its length), blend half-width
const NAMES = ['', '_fore', '_hand', '_curl'];
const chain = (s) => { const g = SPLIT.map((b) => smooth((s - b + HB) / (2 * HB))); return [1 - g[0], g[0] - g[1], g[1] - g[2], g[2]].map((x) => Math.max(0, x)); };
const spineI = joints.findIndex((j) => j.getName() === 'spine' || j.getName() === 'body');
const hipsI = joints.findIndex((j) => j.getName() === 'hips' || j.getName() === 'root');
const report = { name, H: +Hh.toFixed(3), cfg: Object.fromEntries(Object.entries(cfg).filter(([, v]) => isFinite(v)).map(([k, v]) => [k, +v.toFixed(3)])) };
const sides = [];
for (const side of ['armL', 'armR']) {
  const ai = joints.findIndex((j) => j.getName() === side); if (ai < 0) continue;
  const arm = joints[ai]; const head = xf(B(arm), [0, 0, 0]);
  const sgn = Math.sign(head[0] - cfg.cx) || 1;
  const member = (q) => smooth((sgn * (q[0] - cfg.cx) - cfg.armX + band) / (2 * band)) * smooth((q[1] - cfg.y0) / band) * smooth((cfg.y1 - q[1]) / band) * (cfg.zmin === -Infinity ? 1 : smooth((q[2] - cfg.zmin) / band));
  const pts = all.filter((q) => member(q) > 0.5);
  if (pts.length < 30) { report[side] = 'too few arm vertices'; continue; }
  // tip: mean of the 3% of arm points farthest from the shoulder
  const d = pts.map((q) => Math.hypot(q[0] - head[0], q[1] - head[1], q[2] - head[2]));
  const order = d.map((x, i) => i).sort((a, b) => d[a] - d[b]); const far = order.slice(Math.floor(order.length * 0.97));
  const tip = [0, 1, 2].map((n) => far.reduce((a, i) => a + pts[i][n], 0) / far.length);
  const ax = tip.map((x, n) => x - head[n]); const L = Math.hypot(...ax); const dir = ax.map((x) => x / L);
  // new joints: children along the axis (local translation in the parent's frame), identity local rotation
  const idx = [ai]; let parent = arm;
  const list = [...ibmA.getArray()]; let prevIbm = ibm(ai);
  for (let k = 0; k < SPLIT.length; k++) {
    const w = head.map((x, n) => x + dir[n] * SPLIT[k] * L);
    const loc = inv3(B(parent), w);
    const n = doc.createNode(side + NAMES[k + 1]).setTranslation(loc);
    parent.addChild(n); skin.addJoint(n); idx.push(skin.listJoints().length - 1);
    const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -loc[0], -loc[1], -loc[2], 1]; prevIbm = mul(T, prevIbm); list.push(...prevIbm);
    parent = n;
  }
  ibmA.setArray(new Float32Array(list));
  sides.push({ side, ai, idx, head, dir, L, member });
  report[side] = { len: +(L / Hh).toFixed(3), tip: tip.map((x) => +x.toFixed(3)), arm: pts.length };
}
// rebuild the weights of everything that touched an arm or lies in an arm region
const armSet = new Set(sides.flatMap((s) => s.idx));
let changed = 0;
prims.forEach((p, pi) => {
  const J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'); const j = [], w = [];
  for (let i = 0; i < J.getCount(); i++) {
    J.getElement(i, j); W.getElement(i, w);
    const q = [rest[pi][i * 3], rest[pi][i * 3 + 1], rest[pi][i * 3 + 2]];
    const m = new Map(); let armW = 0;
    j.forEach((x, n) => { if (w[n] <= 0) return; if (armSet.has(x)) armW += w[n]; else m.set(x, (m.get(x) ?? 0) + w[n]); });
    let mem = 0, S = null; for (const s of sides) { const v = s.member(q); if (v > mem) { mem = v; S = s; } }
    if (!armW && !mem) continue;
    // body share: the non-arm weights it had, plus its old arm share moved to the spine (hips below the hip line)
    const fallback = q[1] < cfg.hip ? hipsI : spineI;
    const body = new Map(m); if (armW > 0) body.set(fallback, (body.get(fallback) ?? 0) + armW);
    let bt = 0; for (const v of body.values()) bt += v; if (bt <= 0) { body.set(fallback, 1); bt = 1; }
    const out = new Map(); for (const [x, y] of body) out.set(x, (y / bt) * (1 - mem));
    if (S && mem > 0) { const s = Math.max(0, ((q[0] - S.head[0]) * S.dir[0] + (q[1] - S.head[1]) * S.dir[1] + (q[2] - S.head[2]) * S.dir[2]) / S.L); chain(s).forEach((f, n) => { if (f > 1e-4) out.set(S.idx[n], (out.get(S.idx[n]) ?? 0) + f * mem); }); }
    const top = [...out.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4); const sum = top.reduce((a, b) => a + b[1], 0);
    const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0]; top.forEach(([x, y], n) => { jj[n] = x; ww[n] = y / sum; });
    J.setElement(i, jj); W.setElement(i, ww); changed++;
  }
});
for (const a of root.listAccessors()) if (!a.listParents().some((p) => p !== root)) a.dispose();
await io.write(outF, doc);
console.log(JSON.stringify({ ...report, changed, joints: skin.listJoints().map((j) => j.getName()).join(',') }));
