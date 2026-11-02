// Livo (chibi girl in a pompom beanie + camel coat): builds her whole skeleton and skin weights from geometry +
// texture on the Blender-exported GLB (build_hy.sh output), with every bone at identity rotation like the live rigs:
//   hips -> spine -> head ; spine -> armL/R -> _fore -> _hand -> _curl (4-bone arms) ; hips -> legL/R -> _knee -> _foot.
// Weights:
//  - torso: hips below the hip line, spine above, head above the chin (blend over a short band so the face never splits);
//  - hair: the wavy hair that hangs past the chin follows the head, fading out toward the tips (so it turns with her
//    head instead of tearing at the neck); the scarf, coat collar and buttons stay on the spine;
//  - arms: a capsule around each sleeve axis fitted to the free hanging sleeve/hand (lateral of the coat), cut on its
//    inner side so the coat wall next to the sleeve stays on the body; hair is never arm;
//  - legs: below the hip line, left/right by side with a soft midline seam, the coat's outer flaps only half on the leg.
// Usage: node rig_livo.mjs in.glb texture.png out.glb   (needs @gltf-transform/core+extensions v4, meshoptimizer, pngjs)
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [, , inF, texF, outF] = process.argv;
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inF);
const root = doc.getRoot();
const skin = root.listSkins()[0];
const oldJoints = [...skin.listJoints()];
const ibmA = skin.getInverseBindMatrices();
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const xf = (m, v) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r]);
const M0 = mul(oldJoints[0].getWorldMatrix(), ibmA.getElement(0, new Array(16))); // mesh -> armature (bind)
const parentNode = oldJoints[0].getParentNode();
const PW = parentNode ? parentNode.getWorldMatrix() : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const isIdent = PW.every((x, i) => Math.abs(x - (i % 5 === 0 ? 1 : 0)) < 1e-6);
if (!isIdent) throw new Error('rig parent is not identity');

const tex = PNG.sync.read(readFileSync(texF));
const colAt = (u, v) => {
  const x = Math.min(tex.width - 1, Math.max(0, Math.floor(u * tex.width))), y = Math.min(tex.height - 1, Math.max(0, Math.floor(v * tex.height)));
  const i = (y * tex.width + x) * 4; return [tex.data[i] / 255, tex.data[i + 1] / 255, tex.data[i + 2] / 255];
};

const prims = []; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) if (p.getAttribute('JOINTS_0')) prims.push(p);
if (prims.length !== 1) throw new Error('expected one skinned primitive, got ' + prims.length);
const prim = prims[0];
const P = prim.getAttribute('POSITION'), U = prim.getAttribute('TEXCOORD_0');
const n = P.getCount();
const q = new Float64Array(n * 3);
for (let i = 0; i < n; i++) q.set(xf(M0, P.getElement(i, [])), i * 3);
let ymin = Infinity, ymax = -Infinity; for (let i = 0; i < n; i++) { ymin = Math.min(ymin, q[i * 3 + 1]); ymax = Math.max(ymax, q[i * 3 + 1]); }
const H = ymax - ymin; const yN = (i) => (q[i * 3 + 1] - ymin) / H;
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
// torso centre (x, z) from the coat between the hip line and the chest
const tx = [], tz = []; for (let i = 0; i < n; i++) { const y = yN(i); if (y > 0.3 && y < 0.45) { tx.push(q[i * 3]); tz.push(q[i * 3 + 2]); } }
let cx = median(tx), cz = median(tz);
const hx = [], hz = []; for (let i = 0; i < n; i++) { const y = yN(i); if (y > 0.62 && y < 0.75) { hx.push(q[i * 3]); hz.push(q[i * 3 + 2]); } }
let hcx = median(hx), hcz = median(hz);
const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.set(colAt(...U.getElement(i, [])), i * 3);
const lum = (i) => 0.299 * col[i * 3] + 0.587 * col[i * 3 + 1] + 0.114 * col[i * 3 + 2];
const isHair = (i) => { const r = col[i * 3], g = col[i * 3 + 1], b = col[i * 3 + 2]; return lum(i) < 0.33 && r >= b - 0.01 && r - b < 0.22 && !(b > r); };

const C = { hip: 0.285, neck: 0.585, neckBand: 0.035, hairFade: 0.15, knee: 0.15, ankle: 0.065, ...JSON.parse(process.env.RIGCFG ?? '{}') };
// --- arm axes: centroids of the outermost sleeve cluster in clean slices (sleeve free of the coat and the hair),
//     a straight line fitted through them, extended up to the shoulder and down to the lowest hand point
const arms = [];
for (const [side, sg] of [['armL', -1], ['armR', 1]]) {
  const cs = [];
  for (let y0 = C.slice0 ?? 0.26; y0 < (C.slice1 ?? 0.40); y0 += 0.02) {
    const s = []; for (let i = 0; i < n; i++) { const y = yN(i); if (y >= y0 && y < y0 + 0.02) s.push(i); }
    let mx = -Infinity; for (const i of s) mx = Math.max(mx, sg * (q[i * 3] - cx));
    const o = s.filter((i) => sg * (q[i * 3] - cx) > mx - 0.06 * H);
    cs.push([0, 1, 2].map((k) => o.reduce((a, i) => a + q[i * 3 + k], 0) / o.length));
  }
  const fitLin = (k) => { const ys = cs.map((c) => c[1]), vs = cs.map((c) => c[k]); const my = ys.reduce((a, b) => a + b) / ys.length, mv = vs.reduce((a, b) => a + b) / vs.length; let num = 0, den = 0; ys.forEach((y, j) => { num += (y - my) * (vs[j] - mv); den += (y - my) ** 2; }); const b = num / den; return (y) => mv + b * (y - my); };
  const fx = fitLin(0), fz = fitLin(2);
  let ylow = Infinity; for (let i = 0; i < n; i++) { const y = yN(i); if (y < 0.3 && y > (C.handMin ?? 0.2) && sg * (q[i * 3] - cx) / H > (C.armFree ?? 0.19)) ylow = Math.min(ylow, q[i * 3 + 1]); }
  const yS = ymin + (C.shoulder ?? 0.48) * H;
  const shX = cx + sg * Math.min(sg * (fx(yS) - cx), (C.shLat ?? 0.165) * H);
  const sh = [shX, yS, fz(yS)], tip = [fx(ylow), ylow, fz(ylow)];
  const L = Math.hypot(tip[0] - sh[0], tip[1] - sh[1], tip[2] - sh[2]); const dir = [0, 1, 2].map((k) => (tip[k] - sh[k]) / L);
  arms.push({ side, sg, sh, tip, dir, L, nPts: cs.length });
}
const legs = [];
for (const [side, sg] of [['legL', -1], ['legR', 1]]) {
  const xs = [], zs = []; for (let i = 0; i < n; i++) { const y = yN(i); if (y > 0.02 && y < 0.1 && sg * (q[i * 3] - cx) > 0.01 * H) { xs.push(q[i * 3]); zs.push(q[i * 3 + 2]); } }
  legs.push({ side, sg, x: median(xs), z: median(zs) });
}
// RIGFROM=<json from RIGOUT of the High LOD>: reuse its joint placement so both LODs animate identically
if (process.env.RIGFROM) {
  const R = JSON.parse(fs.readFileSync(process.env.RIGFROM, 'utf8'));
  ({ cx, cz, hcx, hcz } = R); arms.splice(0, arms.length, ...R.arms); legs.splice(0, legs.length, ...R.legs);
}
if (process.env.RIGOUT) fs.writeFileSync(process.env.RIGOUT, JSON.stringify({ cx, cz, hcx, hcz, arms, legs }));
// --- skeleton (identity rotations, world translations)
const Y = (f) => ymin + f * H;
const spec = [
  ['hips', null, [cx, Y(0.2), cz]], ['spine', 'hips', [cx, Y(C.hip), cz]], ['head', 'spine', [hcx, Y(C.neck), hcz]],
];
const SPLIT = [0.46, 0.8, 0.9], NAMES = ['', '_fore', '_hand', '_curl'];
for (const a of arms) { let par = 'spine'; for (let k = 0; k < 4; k++) { const f = k === 0 ? 0 : SPLIT[k - 1]; const w = a.sh.map((x, j) => x + a.dir[j] * f * a.L); spec.push([a.side + NAMES[k], par, w]); par = a.side + NAMES[k]; } }
for (const l of legs) {
  spec.push([l.side, 'hips', [l.x, Y(C.hip - 0.005), cz]]);
  spec.push([l.side + '_knee', l.side, [l.x, Y(C.knee), l.z]]);
  spec.push([l.side + '_foot', l.side + '_knee', [l.x, Y(C.ankle), l.z]]);
}
const nodes = {}, world = {};
for (const [name, par, w] of spec) {
  const pw = par ? world[par] : [0, 0, 0];
  const nd = doc.createNode(name).setTranslation([w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]]);
  (par ? nodes[par] : parentNode).addChild(nd);
  nodes[name] = nd; world[name] = w;
}
for (const j of oldJoints) skin.removeJoint(j);
const order = spec.map((s) => s[0]);
const ibm = new Float32Array(order.length * 16);
order.forEach((name, k) => { skin.addJoint(nodes[name]); const w = world[name]; const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1]; ibm.set(mul(T, M0), k * 16); });
skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(ibmA.getBuffer()));
skin.setSkeleton(nodes.hips);
for (const j of oldJoints) j.dispose();
const J = Object.fromEntries(order.map((nm, k) => [nm, k]));

// --- weights
const jArr = new Uint16Array(n * 4), wArr = new Float32Array(n * 4);
const stats = { hairHead: 0, arm: 0, leg: 0, head: 0 };
const armR0 = (C.armR0 ?? 0.05) * H, armR1 = (C.armR1 ?? 0.068) * H;
for (let i = 0; i < n; i++) {
  const p = [q[i * 3], q[i * 3 + 1], q[i * 3 + 2]], y = yN(i);
  const W = new Map(); const add = (k, w) => { if (w > 1e-5) W.set(k, (W.get(k) ?? 0) + w); };
  // torso / head
  let headW = smooth((y - (C.neck - C.neckBand)) / C.neckBand);
  const hair = isHair(i);
  const lat = Math.abs(p[0] - cx) / H, back = (p[2] - cz) / H;
  if (hair && y < C.neck && y > 0.3 && (back < 0.03 || lat > 0.12)) { const hw = smooth((y - (C.neck - C.hairFade)) / C.hairFade); if (hw > headW) { headW = hw; stats.hairHead++; } }
  const hipW = 1 - smooth((y - (C.hip - 0.03)) / 0.06);
  const body = new Map([[J.head, headW], [J.spine, (1 - headW) * (1 - hipW)], [J.hips, (1 - headW) * hipW]]);
  // arms
  let armM = 0, A = null, sArm = 0;
  if (!hair && y < 0.53) for (const a of arms) {
    const r = [p[0] - a.sh[0], p[1] - a.sh[1], p[2] - a.sh[2]]; const t = r[0] * a.dir[0] + r[1] * a.dir[1] + r[2] * a.dir[2];
    const s = t / a.L; if (s < -0.15 || s > 1.15) continue;
    const tc = Math.max(0, Math.min(a.L, t)); const pr = [r[0] - a.dir[0] * tc, r[1] - a.dir[1] * tc, r[2] - a.dir[2] * tc];
    const dist = Math.hypot(...pr);
    const hb = (C.handBulge ?? 0.018) * H * smooth((s - 0.8) / 0.15); // the hand/cuff ball is wider than the sleeve
    let m = 1 - smooth((dist - armR0 - hb) / (armR1 - armR0));
    // inner cut: the coat wall on the body side of the sleeve stays on the body
    const axLat = a.sg * (a.sh[0] + a.dir[0] * tc - cx); const vLat = a.sg * (p[0] - cx);
    m *= smooth((vLat - (axLat - (C.armInner ?? 0.03) * H)) / (0.02 * H));
    m *= smooth((s + 0.02) / 0.14); // blend into the shoulder
    if (m > armM) { armM = m; A = a; sArm = Math.max(0, s); }
  }
  // legs
  let legM = 0, Lg = null;
  if (y < C.hip + 0.02) {
    const wy = smooth((C.hip + 0.015 - y) / 0.07);
    const sideX = p[0] - cx; const seam = y < 0.11 ? 1 : smooth(Math.abs(sideX) / (0.02 * H));
    Lg = sideX < 0 ? legs[0] : legs[1];
    const outer = Math.abs(p[0] - Lg.x) / H; const flap = 1 - 0.45 * smooth((outer - 0.06) / 0.07);
    legM = wy * flap * (1 - armM);
    // the midline seam: split evenly between both legs there
    if (seam < 1 && legM > 0) { const other = Lg === legs[0] ? legs[1] : legs[0]; const share = 0.5 * (1 - seam); Lg = { ...Lg, other, share }; }
  }
  const rest = 1 - armM - legM;
  for (const [k, w] of body) add(k, w * Math.max(0, rest));
  if (A && armM > 0) {
    const g = SPLIT.map((b) => smooth((sArm - b + 0.06) / 0.12));
    const ch = [1 - g[0], g[0] - g[1], g[1] - g[2], g[2]].map((x) => Math.max(0, x));
    ch.forEach((f, k) => add(J[A.side + NAMES[k]], f * armM)); stats.arm++;
  }
  if (Lg && legM > 0) {
    const s = Math.max(0, Math.min(1, (C.hip - y) / (C.hip - 0.0)));
    const kneeS = (C.hip - C.knee) / C.hip, footS = (C.hip - C.ankle) / C.hip;
    const g0 = smooth((s - kneeS + 0.08) / 0.16), g1 = smooth((s - footS + 0.05) / 0.10);
    const ch = [1 - g0, g0 - g1, g1].map((x) => Math.max(0, x));
    const share = Lg.share ?? 0;
    const sides = [[Lg.side, 1 - share]]; if (share > 0) sides.push([Lg.other.side, share]);
    for (const [sd, f] of sides) { add(J[sd], ch[0] * legM * f); add(J[sd + '_knee'], ch[1] * legM * f); add(J[sd + '_foot'], ch[2] * legM * f); }
    stats.leg++;
  }
  if (headW > 0.5) stats.head++;
  const top = [...W.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4); const sum = top.reduce((a, b) => a + b[1], 0) || 1;
  top.forEach(([k, w], m) => { jArr[i * 4 + m] = k; wArr[i * 4 + m] = w / sum; });
  if (!top.length) { jArr[i * 4] = J.spine; wArr[i * 4] = 1; }
}
// Cut the sleeve free of the coat below the armpit: Hunyuan fused the inner sleeve to the coat side, and those
// bridging triangles would stretch into fins whenever the arm moves. Triangles whose corners are split between an
// arm chain and the body are dropped (the material is made double-sided so the small openings read as cloth).
const armJ = new Set(order.filter((nm) => nm.startsWith('arm')).map((nm) => J[nm]));
const aw = new Float32Array(n); for (let i = 0; i < n; i++) for (let m = 0; m < 4; m++) if (armJ.has(jArr[i * 4 + m])) aw[i] += wArr[i * 4 + m];
// below the armpit an arm vertex belongs to the arm or to the body, never both (a blend would stretch)
for (let i = 0; i < n; i++) {
  if (yN(i) >= (C.cutY ?? 0.44)) continue;
  const toArm = aw[i] >= 0.5; let sum = 0;
  for (let m = 0; m < 4; m++) { const isA = armJ.has(jArr[i * 4 + m]); if (isA !== toArm) wArr[i * 4 + m] = 0; sum += wArr[i * 4 + m]; }
  if (sum <= 1e-6) { jArr[i * 4] = toArm ? J[(q[i * 3] < cx ? 'armL' : 'armR') + '_fore'] : J.spine; wArr[i * 4] = 1; sum = 1; for (let m = 1; m < 4; m++) wArr[i * 4 + m] = 0; }
  for (let m = 0; m < 4; m++) wArr[i * 4 + m] /= sum;
}
let cut = 0;
{
  const idx = prim.getIndices(); const ia = idx.getArray(); const keep = [];
  for (let t = 0; t < ia.length; t += 3) {
    const a = ia[t], b = ia[t + 1], c = ia[t + 2];
    const lo = Math.min(aw[a], aw[b], aw[c]), hi = Math.max(aw[a], aw[b], aw[c]);
    const yMax = Math.max(yN(a), yN(b), yN(c));
    if (hi > 0.5 && lo < 0.5 && yMax < (C.cutY ?? 0.44)) { cut++; continue; }
    keep.push(a, b, c);
  }
  idx.setArray(ia.length > 65535 * 3 || n > 65535 ? new Uint32Array(keep) : new Uint16Array(keep));
  prim.getMaterial()?.setDoubleSided(true);
}
if (process.env.DUMP) { // per-vertex uv / height / arm weight + triangles, for the texture clean-up (texfix.py)
  const uv = []; for (let i = 0; i < n; i++) uv.push(...U.getElement(i, []));
  fs.writeFileSync(process.env.DUMP, JSON.stringify({ uv, y: Array.from({ length: n }, (_, i) => +yN(i).toFixed(4)), aw: Array.from(aw, (v) => +v.toFixed(3)), tri: Array.from(prim.getIndices().getArray()) }));
}
if (process.env.TEXIN) { // replace the base colour image (cleaned texture, webp)
  const tex = prim.getMaterial().getBaseColorTexture(); tex.setImage(new Uint8Array(fs.readFileSync(process.env.TEXIN))).setMimeType('image/webp');
}
prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(jArr).setBuffer(P.getBuffer()));
prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(wArr).setBuffer(P.getBuffer()));
for (const a of root.listAccessors()) if (!a.listParents().some((p) => p !== root)) a.dispose();
await io.write(outF, doc);
const r3 = (v) => v.map((x) => +x.toFixed(3));
console.log(JSON.stringify({ out: outF, n, H: +H.toFixed(3), ymin: +ymin.toFixed(3), cx: +cx.toFixed(3), cz: +cz.toFixed(3), head: r3([hcx, hcz]),
  arms: arms.map((a) => ({ side: a.side, sh: r3(a.sh), tip: r3(a.tip), L: +(a.L / H).toFixed(3), pts: a.nPts })), legs: legs.map((l) => ({ side: l.side, x: +l.x.toFixed(3), z: +l.z.toFixed(3) })), stats, cut, joints: order.join(',') }));
