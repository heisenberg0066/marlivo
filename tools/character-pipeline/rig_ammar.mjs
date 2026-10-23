// Frees Ammar's fused pocket hands/forearms, closes the pocket/flank openings cleanly in black cloth, models
// stylised short-sleeved arms + bare forearms + hands (with thumb) in his exact sleeve and skin texture colours,
// and rigs them with the 4-bone chain (armL/R -> _fore -> _hand -> _curl).
// Every vertex with y >= 0.625 (neck, head, face, hair, ears), the glasses/chain meshes, and the textures are
// kept 100% byte-identical so his face has zero pixel difference.
// Usage: node rig_ammar.mjs in.glb out.glb [low]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [, , inF, outF, lowFlag] = process.argv;
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inF);
const root = doc.getRoot();
const skin = root.listSkins()[0];
const joints = [...skin.listJoints()];
const ibmA = skin.getInverseBindMatrices();
const ibm = (i) => ibmA.getElement(i, new Array(16));
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const xf = (m, v) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r]);
const xfDir = (m, v) => { const d = [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2]); const l = Math.hypot(...d) || 1; return d.map((x) => x / l); };
const inv3 = (m, v) => {
  const t = [v[0] - m[12], v[1] - m[13], v[2] - m[14]];
  const c = [0, 1, 2].map((k) => [m[k * 4], m[k * 4 + 1], m[k * 4 + 2]]);
  return c.map((col) => (col[0] * t[0] + col[1] * t[1] + col[2] * t[2]) / (col[0] ** 2 + col[1] ** 2 + col[2] ** 2));
};
const invDir = (m, v) => {
  const c = [0, 1, 2].map((k) => [m[k * 4], m[k * 4 + 1], m[k * 4 + 2]]);
  const d = c.map((col) => col[0] * v[0] + col[1] * v[1] + col[2] * v[2]);
  const l = Math.hypot(...d) || 1; return d.map((x) => x / l);
};

// Armature-to-mesh and mesh-to-armature transforms
const M0 = mul(joints[0].getWorldMatrix(), ibm(0));
const toMesh = (q) => inv3(M0, q);
const toMeshN = (n) => invDir(M0, n);

const prim = root.listMeshes()[0].listPrimitives()[0];
const ti = prim.getMaterial().getBaseColorTextureInfo().listExtensions()[0];
const uvOff = ti ? ti.getOffset() : [0, 0];
const uvSc = ti ? ti.getScale() : [1, 1];
const toAttrUV = (u, v) => [(u - uvOff[0]) / uvSc[0], (v - uvOff[1]) / uvSc[1]];
// Verified flat-normal skin & dark-cloth texels on Ammar's atlas:
const UV_SKIN = toAttrUV((65 + 0.5) / 512, (107 + 0.5) / 512);
const UV_DARK = toAttrUV((412 + 0.5) / 512, (174 + 0.5) / 512);

const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), U = prim.getAttribute('TEXCOORD_0');
const J0 = prim.getAttribute('JOINTS_0'), W0 = prim.getAttribute('WEIGHTS_0'), IDX = prim.getIndices();
const vCount0 = P.getCount();
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// 1. Tuck the old fused forearm + outer sleeve bulge into a clean torso/closed-pocket wall for y in [0.365, 0.610]
//    Never touch any vertex with y >= 0.620 (collar/neck/head/face/hair/ears).
const rest = new Array(vCount0);
for (let i = 0; i < vCount0; i++) rest[i] = xf(M0, P.getElement(i, []));

let tucked = 0;
const tuckedPos = new Map(), tuckedUv = new Map();
for (let i = 0; i < vCount0; i++) {
  const q = rest[i];
  const y = q[1], ax = Math.abs(q[0]), z = q[2];
  if (y < 0.365 || y >= 0.615 || ax < 0.088 || z < -0.075 || z > 0.125) continue;
  const wy = smooth((y - 0.365) / 0.022) * smooth((0.615 - y) / 0.025);
  const wz = smooth((z + 0.075) / 0.025) * smooth((0.125 - z) / 0.025);
  const w = wy * wz;
  if (w <= 0) continue;
  const wall = 0.096 + 0.008 * smooth((y - 0.42) / 0.16) - 0.006 * Math.min(1, ((z - 0.015) / 0.08) ** 2);
  if (ax > wall) {
    const newAx = ax * (1 - w) + wall * w;
    q[0] = Math.sign(q[0]) * newAx;
    tuckedPos.set(i, toMesh(q).map((x) => Math.round(x)));
    if (y < 0.535 && w > 0.25) tuckedUv.set(i, UV_DARK);
    tucked++;
  }
}

// 2. Add 4-bone arm chains: armL -> armL_fore -> armL_hand -> armL_curl (and armR)
//    In Ammar's armature space, x > 0 is his left side (armL) and x < 0 is his right side (armR).
const spineIdx = joints.findIndex((j) => j.getName() === 'spine');
const spineNode = joints[spineIdx];
const B = (j) => j.getWorldMatrix();
const SPLIT = [0.46, 0.78, 0.90], HB = 0.065;
const NAMES = ['', '_fore', '_hand', '_curl'];
const chain = (s) => {
  const g = SPLIT.map((b) => smooth((s - b + HB) / (2 * HB)));
  return [1 - g[0], g[0] - g[1], g[1] - g[2], g[2]].map((x) => Math.max(0, x));
};

const armDefs = [
  { side: 'armL', sgn: 1, sh: [0.112, 0.585, 0.008], tip: [0.146, 0.325, 0.042] },
  { side: 'armR', sgn: -1, sh: [-0.112, 0.585, 0.018], tip: [-0.146, 0.325, 0.052] },
];

const newPos = [], newNrm = [], newUv = [], newJ = [], newW = [], newIdx = [];
const nSeg = lowFlag ? 10 : 16, nRings = lowFlag ? 16 : 28;

for (const def of armDefs) {
  const { side, sgn, sh, tip } = def;
  const ax = tip.map((x, n) => x - sh[n]);
  const L = Math.hypot(...ax);
  const dir = ax.map((x) => x / L);

  // Create root arm bone under spine
  const loc0 = inv3(B(spineNode), sh);
  const armNode = doc.createNode(side).setTranslation(loc0);
  spineNode.addChild(armNode);
  skin.addJoint(armNode);
  const ai = skin.listJoints().length - 1;
  const idx = [ai];
  const ibmList = [...ibmA.getArray()];
  const T0 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -loc0[0], -loc0[1], -loc0[2], 1];
  let prevIbm = mul(T0, ibm(spineIdx));
  ibmList.push(...prevIbm);

  let parent = armNode;
  for (let k = 0; k < SPLIT.length; k++) {
    const w = sh.map((x, n) => x + dir[n] * SPLIT[k] * L);
    const loc = inv3(B(parent), w);
    const n = doc.createNode(side + NAMES[k + 1]).setTranslation(loc);
    parent.addChild(n);
    skin.addJoint(n);
    idx.push(skin.listJoints().length - 1);
    const Tk = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -loc[0], -loc[1], -loc[2], 1];
    prevIbm = mul(Tk, prevIbm);
    ibmList.push(...prevIbm);
    parent = n;
  }
  ibmA.setArray(new Float32Array(ibmList));

  // Local frame perpendicular to arm axis: u = outward lateral (sgn * X), v = forward (+Z)
  let u = [sgn, -dir[0] * sgn / dir[1], 0];
  { const l = Math.hypot(...u); u = u.map((x) => x / l); }
  let v = [
    dir[1] * u[2] - dir[2] * u[1],
    dir[2] * u[0] - dir[0] * u[2],
    dir[0] * u[1] - dir[1] * u[0],
  ];
  if (v[2] < 0) v = v.map((x) => -x);

  // Build stylised sleeve + forearm + hand + thumb tube
  // s in [-0.08, 1.0]:
  //   [-0.08, 0.36]: black short sleeve (spherical shoulder cap at s<0.05, slight cuff flare at s=0.35)
  //   [0.36, 0.78]: warm tan bare forearm tapering to wrist
  //   [0.78, 1.00]: stylised hand & rounded fingers (oval palm + thumb bump on front-inner side)
  const baseVert = vCount0 + newPos.length / 3;
  for (let ir = 0; ir <= nRings; ir++) {
    const f = ir / nRings;
    const s = -0.08 + f * 1.08;
    const isSleeve = s <= 0.36;
    let rx, rz;
    if (s < 0.02) {
      // Spherical shoulder cap closing at s = -0.08
      const cap = Math.sqrt(Math.max(0.02, 1 - ((0.02 - s) / 0.105) ** 2));
      rx = 0.036 * cap; rz = 0.038 * cap;
    } else if (s <= 0.36) {
      // Short sleeve with subtle cuff flare
      const k = (s - 0.02) / 0.34;
      rx = 0.036 + 0.003 * Math.sin(Math.PI * k);
      rz = 0.038 + 0.003 * Math.sin(Math.PI * k);
    } else if (s <= 0.78) {
      // Forearm tapering from below cuff to wrist
      const k = (s - 0.36) / 0.42;
      rx = 0.027 * (1 - 0.25 * k);
      rz = 0.029 * (1 - 0.22 * k);
    } else {
      // Hand & fingers: slightly wider front-to-back, rounded fingertip cap at s = 1.0
      const k = (s - 0.78) / 0.22;
      const tipCap = k > 0.75 ? Math.sqrt(Math.max(0.04, 1 - ((k - 0.75) / 0.26) ** 2)) : 1;
      rx = 0.017 * (1 + 0.15 * Math.sin(Math.PI * k)) * tipCap;
      rz = 0.026 * (1 + 0.22 * Math.sin(Math.PI * k)) * tipCap;
    }

    const center = sh.map((x, n) => x + dir[n] * (s * L));
    const cw = chain(Math.max(0, s));
    const j4 = [idx[0], idx[1], idx[2], idx[3]];

    for (let is = 0; is < nSeg; is++) {
      const ang = (is / nSeg) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      // Subtle thumb bump on the front-inner side of the palm (s in [0.78, 0.90], sa > 0.5, ca < 0)
      let thumb = 1;
      if (s > 0.77 && s < 0.91 && sa > 0.35 && ca < 0.1) {
        thumb += 0.38 * Math.sin(Math.PI * ((s - 0.77) / 0.14)) * Math.max(0, sa - 0.35);
      }
      const px = rx * ca * thumb, pz = rz * sa * thumb;
      const q = [
        center[0] + u[0] * px + v[0] * pz,
        center[1] + u[1] * px + v[1] * pz,
        center[2] + u[2] * px + v[2] * pz,
      ];
      let nrm = [
        u[0] * ca + v[0] * sa,
        u[1] * ca + v[1] * sa,
        u[2] * ca + v[2] * sa,
      ];
      if (ir === 0) nrm = dir.map((x) => -x);
      if (ir === nRings) nrm = [...dir];

      const mp = toMesh(q), mn = toMeshN(nrm);
      newPos.push(...mp);
      newNrm.push(...mn);
      newUv.push(...(isSleeve ? UV_DARK : UV_SKIN));
      newJ.push(...j4);
      newW.push(...cw);
    }
  }

  for (let ir = 0; ir < nRings; ir++) {
    for (let is = 0; is < nSeg; is++) {
      const i0 = baseVert + ir * nSeg + is;
      const i1 = baseVert + ir * nSeg + ((is + 1) % nSeg);
      const i2 = baseVert + (ir + 1) * nSeg + is;
      const i3 = baseVert + (ir + 1) * nSeg + ((is + 1) % nSeg);
      if (sgn > 0) {
        newIdx.push(i0, i1, i3, i0, i3, i2);
      } else {
        newIdx.push(i0, i3, i1, i0, i2, i3);
      }
    }
  }
}

// 3. Append the new arm vertices & triangles to the mesh primitive, keeping all untouched original bytes bit-identical
const totalV = vCount0 + newPos.length / 3;
function expandAttr(attr, extra, itemSize, overrides = null, roundExtra = false) {
  const oldArr = attr.getArray();
  const Ctor = oldArr.constructor;
  const out = new Ctor(totalV * itemSize);
  out.set(oldArr, 0); // bit-for-bit copy of original vertex attributes
  const next = doc.createAccessor().setType(attr.getType()).setNormalized(attr.getNormalized()).setArray(out).setBuffer(attr.getBuffer());
  if (overrides) {
    for (const [idx, val] of overrides) next.setElement(idx, val);
  }
  for (let i = 0; i < extra.length / itemSize; i++) {
    const slice = extra.slice(i * itemSize, (i + 1) * itemSize);
    next.setElement(vCount0 + i, roundExtra ? slice.map((x) => Math.round(x)) : slice);
  }
  return next;
}

prim.setAttribute('POSITION', expandAttr(P, newPos, 3, tuckedPos, true));
prim.setAttribute('NORMAL', expandAttr(N, newNrm, 3));
prim.setAttribute('TEXCOORD_0', expandAttr(U, newUv, 2, tuckedUv));
prim.setAttribute('JOINTS_0', expandAttr(J0, newJ, 4));
prim.setAttribute('WEIGHTS_0', expandAttr(W0, newW, 4));

const oldIdx = IDX.getArray();
const nextIdx = new Uint16Array(oldIdx.length + newIdx.length);
nextIdx.set(oldIdx, 0);
nextIdx.set(newIdx, oldIdx.length);
prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(nextIdx).setBuffer(IDX.getBuffer()));

for (const a of root.listAccessors()) if (!a.listParents().some((p) => p !== root)) a.dispose();
for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
await io.write(outF, doc);
console.log(JSON.stringify({ in: inF, out: outF, tucked, addedVerts: newPos.length / 3, joints: skin.listJoints().map((j) => j.getName()) }));
