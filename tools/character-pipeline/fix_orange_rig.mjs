// Upgrades all 7 MarLivo characters (14 GLBs: high + low for ammar, orange-guy, biscuit, mint, pepper, choco, sugar)
// with:
//  1. 4-bone articulated arms (armL -> armL_fore -> armL_hand -> armL_curl & armR -> armR_fore -> armR_hand -> armR_curl),
//     including Orange guy's outer-surface shoulder placement (|x| = 0.340, y = 0.510) and Ammar's consistent L/R side mapping.
//  2. 3-bone articulated legs (legL -> legL_knee -> legL_foot & legR -> legR_knee -> legR_foot) parented to root/hips,
//     weighted smoothly across thigh, knee, and ankle/shoe/paw with clean hip-crease blending and tail exclusion.
//  3. 100% rigid head-bone weighting above the neck crease on Ammar (yNorm >= 0.66), Mint, Pepper, and Biscuit so
//     faces and glasses never shear or split when the head turns on yaw/pitch/roll.
// Zero vertex positions, normals, UVs, or textures are altered.
import { createRequire } from 'node:module';
const req = createRequire('/workspace/animwork/gt/package.json');
const { NodeIO } = req('@gltf-transform/core');
const { ALL_EXTENSIONS } = req('@gltf-transform/extensions');
const { MeshoptDecoder, MeshoptEncoder } = req('meshoptimizer');

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const xf = (m, v) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r]);
const inv3 = (m, v) => {
  const t = [v[0] - m[12], v[1] - m[13], v[2] - m[14]];
  const c = [0, 1, 2].map((k) => [m[k * 4], m[k * 4 + 1], m[k * 4 + 2]]);
  return c.map((col) => (col[0] * t[0] + col[1] * t[1] + col[2] * t[2]) / (col[0] ** 2 + col[1] ** 2 + col[2] ** 2));
};
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

const CHAR_DIR = new URL('../../apps/client/public/assets/characters', import.meta.url).pathname;

const CHAR_SPECS = [
  { name: 'orange-guy', hipY: 0.295, kneeY: 0.155, footY: 0.050, zMin: -0.22, seamW: 0.004, headY: null, fixOrangeArms: true },
  { name: 'ammar',      hipY: 0.320, kneeY: 0.170, footY: 0.050, zMin: -0.16, seamW: 0.012, headY: 0.66, neckBlend: 0.04 },
  { name: 'biscuit',    hipY: 0.235, kneeY: 0.120, footY: 0.042, zMin: -0.05, seamW: 0.014, headY: 0.62, neckBlend: 0.05 },
  { name: 'mint',       hipY: 0.230, kneeY: 0.120, footY: 0.042, zMin: -0.03, seamW: 0.014, headY: 0.55, neckBlend: 0.05 },
  { name: 'pepper',     hipY: 0.205, kneeY: 0.105, footY: 0.042, zMin: -0.04, seamW: 0.014, headY: 0.60, neckBlend: 0.05 },
  { name: 'choco',      hipY: 0.165, kneeY: 0.095, footY: 0.038, zMin: -0.14, seamW: 0.005, headY: null },
  { name: 'sugar',      hipY: 0.285, kneeY: 0.155, footY: 0.045, zMin: -0.16, seamW: 0.005, headY: null },
];

const LEG_FRACS = [0.46, 0.80], LEG_HB = 0.045;
const legChainWeights = (s) => {
  const g = LEG_FRACS.map((b) => smooth((s - b + LEG_HB) / (2 * LEG_HB)));
  return [1 - g[0], g[0] - g[1], g[1]].map((x) => Math.max(0, x));
};

const ARM_FRACS = [0.46, 0.78, 0.90], ARM_HB = 0.08;
const armChainWeights = (s) => {
  const g = ARM_FRACS.map((b) => smooth((s - b + ARM_HB) / (2 * ARM_HB)));
  return [1 - g[0], g[0] - g[1], g[1] - g[2], g[2]].map((x) => Math.max(0, x));
};

function ensureJoint(doc, skin, ibmA, parentNode, parentIdx, name, wPos) {
  const joints = skin.listJoints();
  const ibm = (i) => ibmA.getElement(i, new Array(16));
  let idx = joints.findIndex((j) => j.getName() === name);
  const loc = inv3(parentNode.getWorldMatrix(), wPos);
  const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -loc[0], -loc[1], -loc[2], 1];
  const newIbm = mul(T, ibm(parentIdx));
  if (idx >= 0) {
    const node = joints[idx];
    node.setTranslation(loc);
    ibmA.setElement(idx, newIbm);
    return { node, idx };
  }
  const node = doc.createNode(name).setTranslation(loc);
  parentNode.addChild(node);
  skin.addJoint(node);
  idx = skin.listJoints().length - 1;
  const arr = [...ibmA.getArray(), ...newIbm];
  ibmA.setArray(new Float32Array(arr));
  return { node, idx };
}

for (const spec of CHAR_SPECS) {
  for (const suffix of ['', '-low']) {
    const file = `${CHAR_DIR}/${spec.name}${suffix}.glb`;
    const doc = await io.read(file);
    const root = doc.getRoot();
    const skin = root.listSkins()[0];
    let joints = skin.listJoints();
    const ibmA = skin.getInverseBindMatrices();
    const ibm = (i) => ibmA.getElement(i, new Array(16));
    const M0 = mul(joints[0].getWorldMatrix(), ibm(0));

    // Ensure float32 weights & uint16 joints so smooth blends are never quantized to 0/255 bytes
    const prim = root.listMeshes()[0].listPrimitives()[0];
    for (const [k, T] of [['WEIGHTS_0', Float32Array], ['JOINTS_0', Uint16Array]]) {
      const A = prim.getAttribute(k);
      if (!(A.getArray() instanceof T)) {
        const a = new T(A.getCount() * 4);
        const t = [];
        for (let i = 0; i < A.getCount(); i++) a.set(A.getElement(i, t), i * 4);
        prim.setAttribute(k, doc.createAccessor().setType('VEC4').setArray(a).setBuffer(A.getBuffer()));
      }
    }

    const P = prim.getAttribute('POSITION');
    const J = prim.getAttribute('JOINTS_0');
    const W = prim.getAttribute('WEIGHTS_0');
    const nV = P.getCount();
    const rest = new Array(nV);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < nV; i++) {
      const q = xf(M0, P.getElement(i, []));
      rest[i] = q;
      if (q[1] < minY) minY = q[1];
      if (q[1] > maxY) maxY = q[1];
    }
    const H = maxY - minY || 1;

    // For Ammar: ensure armL is on the -x side and armR is on the +x side (matching all other 6 characters)
    if (spec.name === 'ammar') {
      const aL = joints.find((j) => j.getName() === 'armL');
      if (aL && xf(aL.getWorldMatrix(), [0, 0, 0])[0] > 0) {
        for (const sfx of ['', '_fore', '_hand', '_curl']) {
          const nL = joints.find((j) => j.getName() === 'armL' + sfx);
          const nR = joints.find((j) => j.getName() === 'armR' + sfx);
          if (nL && nR) {
            nL.setName('armR' + sfx);
            nR.setName('armL' + sfx);
          }
        }
      }
    }

    // For Orange guy: ensure shoulder sits at outer surface of egg body (|x| = 0.340, y = 0.510)
    let orangeArmSides = null;
    if (spec.fixOrangeArms) {
      orangeArmSides = [];
      for (const side of ['armL', 'armR']) {
        const iUp = joints.findIndex((j) => j.getName() === side);
        const iFore = joints.findIndex((j) => j.getName() === side + '_fore');
        const iHand = joints.findIndex((j) => j.getName() === side + '_hand');
        const iCurl = joints.findIndex((j) => j.getName() === side + '_curl');
        const nUp = joints[iUp], nFore = joints[iFore], nHand = joints[iHand], nCurl = joints[iCurl];
        const B_old = nUp.getWorldMatrix();
        const oldHead = xf(B_old, [0, 0, 0]);
        const oldCurl = xf(nCurl.getWorldMatrix(), [0, 0, 0]);
        const fullVec = oldCurl.map((x, k) => x - oldHead[k]);
        const fullLen = Math.hypot(...fullVec);
        const dir = fullVec.map((x) => x / fullLen);
        // Only shift if shoulder is still inside the torso (|x| < 0.30)
        const shift = Math.abs(oldHead[0]) < 0.30 ? 0.34 * fullLen : 0;
        const newHead = oldHead.map((x, k) => x + dir[k] * shift);
        const extLen = shift > 0 ? (fullLen / 0.90) - shift : fullLen / 0.90;

        if (shift > 0) {
          const dLoc = inv3(B_old, newHead);
          const bodyNode = nUp.getParentNode();
          nUp.setTranslation(inv3(bodyNode.getWorldMatrix(), newHead));
          const Tup = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -dLoc[0], -dLoc[1], -dLoc[2], 1];
          let curIbm = mul(Tup, ibm(iUp));
          ibmA.setElement(iUp, curIbm);
          const subNodes = [nFore, nHand, nCurl];
          const subIdx = [iFore, iHand, iCurl];
          let prevNode = nUp;
          for (let k = 0; k < 3; k++) {
            const wPos = newHead.map((x, m) => x + dir[m] * ARM_FRACS[k] * extLen);
            const loc = inv3(prevNode.getWorldMatrix(), wPos);
            subNodes[k].setTranslation(loc);
            const Tk = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -loc[0], -loc[1], -loc[2], 1];
            curIbm = mul(Tk, curIbm);
            ibmA.setElement(subIdx[k], curIbm);
            prevNode = subNodes[k];
          }
        }
        orangeArmSides.push({ side, sgn: Math.sign(newHead[0]), idx: [iUp, iFore, iHand, iCurl], head: newHead, dir, len: extLen });
      }
    }

    // Identify arm joint indices (so we never treat low-hanging hands/fingers as leg vertices!)
    joints = skin.listJoints();
    const armJointSet = new Set(
      joints.map((j, idx) => (j.getName().startsWith('arm') ? idx : -1)).filter((idx) => idx >= 0)
    );

    // Find left & right foot clusters via 2-means on non-arm vertices near the ground
    const footPts = [];
    for (let i = 0; i < nV; i++) {
      const q = rest[i];
      const yNorm = (q[1] - minY) / H;
      if (yNorm > 0.085 || q[2] <= spec.zMin) continue;
      const j4 = J.getElement(i, []), w4 = W.getElement(i, []);
      let armW = 0;
      for (let k = 0; k < 4; k++) if (armJointSet.has(j4[k])) armW += w4[k];
      if (armW > 0.1) continue;
      footPts.push(q);
    }
    let cL = -0.12, cR = 0.12;
    for (let it = 0; it < 12; it++) {
      const gL = footPts.filter((p) => Math.abs(p[0] - cL) < Math.abs(p[0] - cR));
      const gR = footPts.filter((p) => Math.abs(p[0] - cL) >= Math.abs(p[0] - cR));
      if (gL.length) cL = gL.reduce((s, p) => s + p[0], 0) / gL.length;
      if (gR.length) cR = gR.reduce((s, p) => s + p[0], 0) / gR.length;
    }
    const splitX = 0.5 * (cL + cR);

    // Compute clean knee & ankle centers for left (x < splitX) and right (x >= splitX) legs
    const sliceCenter = (yTarget, isLeft) => {
      const sub = [];
      for (let i = 0; i < nV; i++) {
        const q = rest[i];
        if (Math.abs(q[1] - yTarget) > 0.032 || q[2] <= spec.zMin) continue;
        if (isLeft ? q[0] >= splitX : q[0] < splitX) continue;
        const j4 = J.getElement(i, []), w4 = W.getElement(i, []);
        let armW = 0;
        for (let k = 0; k < 4; k++) if (armJointSet.has(j4[k])) armW += w4[k];
        if (armW > 0.1) continue;
        sub.push(q);
      }
      if (!sub.length) return [isLeft ? cL : cR, yTarget, 0.03];
      return [
        sub.reduce((s, p) => s + p[0], 0) / sub.length,
        yTarget,
        sub.reduce((s, p) => s + p[2], 0) / sub.length,
      ];
    };

    const pelvisIdx = 0; // 'root' or 'hips'
    const pelvisNode = joints[pelvisIdx];
    const spineIdx = joints.findIndex((j) => j.getName() === 'spine' || j.getName() === 'body');
    const headIdx = joints.findIndex((j) => j.getName() === 'head');

    const legDefs = {};
    for (const [side, isLeft] of [['legL', true], ['legR', false]]) {
      const kneePos = sliceCenter(spec.kneeY, isLeft);
      const footPos = sliceCenter(spec.footY, isLeft);
      // Align hip joint directly above the knee so hip pitch swings straight forward/back
      const hipPos = [kneePos[0], spec.hipY, kneePos[2]];

      const jHip = ensureJoint(doc, skin, ibmA, pelvisNode, pelvisIdx, side, hipPos);
      const jKnee = ensureJoint(doc, skin, ibmA, jHip.node, jHip.idx, `${side}_knee`, kneePos);
      const jFoot = ensureJoint(doc, skin, ibmA, jKnee.node, jKnee.idx, `${side}_foot`, footPos);
      legDefs[side] = { idx: [jHip.idx, jKnee.idx, jFoot.idx], hipPos, kneePos, footPos };
    }

    joints = skin.listJoints();
    const legJointSet = new Set([...legDefs.legL.idx, ...legDefs.legR.idx]);

    // Update vertex weights across the mesh
    for (let i = 0; i < nV; i++) {
      const q = rest[i];
      const x = q[0], y = q[1], z = q[2];
      const yNorm = (y - minY) / H;

      // 1. Orange guy: rebuild full body + arm + leg weights cleanly
      if (spec.fixOrangeArms && orangeArmSides) {
        const ax = Math.abs(x);
        const armMem = smooth((ax - 0.338) / 0.032) * smooth((y - 0.24) / 0.04) * smooth((0.62 - y) / 0.04);
        if (armMem > 1e-4) {
          const S = orangeArmSides.find((s) => s.sgn === Math.sign(x)) ?? orangeArmSides[0];
          const s = Math.max(0, ((x - S.head[0]) * S.dir[0] + (y - S.head[1]) * S.dir[1] + (z - S.head[2]) * S.dir[2]) / S.len);
          const cw = armChainWeights(s);
          const out = new Map();
          const bodyJoint = y < 0.30 ? pelvisIdx : spineIdx;
          if (1 - armMem > 1e-4) out.set(bodyJoint, 1 - armMem);
          cw.forEach((f, n) => { if (f * armMem > 1e-4) out.set(S.idx[n], (out.get(S.idx[n]) ?? 0) + f * armMem); });
          const top = [...out.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
          const sum = top.reduce((a, b) => a + b[1], 0);
          const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
          top.forEach(([ji, yw], n) => { jj[n] = ji; ww[n] = yw / sum; });
          J.setElement(i, jj);
          W.setElement(i, ww);
          continue;
        }
      }

      const j4 = J.getElement(i, []), w4 = W.getElement(i, []);
      let armW = 0;
      const nonLegMap = new Map();
      for (let k = 0; k < 4; k++) {
        if (w4[k] <= 0) continue;
        if (armJointSet.has(j4[k])) armW += w4[k];
        if (!legJointSet.has(j4[k])) nonLegMap.set(j4[k], (nonLegMap.get(j4[k]) ?? 0) + w4[k]);
      }

      // 2. Enforce 100% head weighting above headY (and smooth neck transition below headY) so face/glasses never split
      if (spec.headY !== null && headIdx >= 0 && armW < 0.05 && yNorm >= spec.headY - (spec.neckBlend ?? 0.04)) {
        const hw = yNorm >= spec.headY ? 1.0 : smooth((yNorm - (spec.headY - spec.neckBlend)) / spec.neckBlend);
        if (hw >= 0.9999) {
          J.setElement(i, [headIdx, 0, 0, 0]);
          W.setElement(i, [1, 0, 0, 0]);
        } else {
          J.setElement(i, [headIdx, spineIdx, 0, 0]);
          W.setElement(i, [hw, 1 - hw, 0, 0]);
        }
        continue;
      }

      // 3. Leg weighting for non-arm vertices below hipY + 0.02
      if (armW < 0.5 && y <= spec.hipY + 0.025 && z > spec.zMin - 0.03) {
        const wy = smooth((spec.hipY + 0.02 - y) / 0.055);
        const wz = smooth((z - spec.zMin) / 0.035);
        // Below kneeY (calves/ankles/shoes/paws), left and right legs are completely separate; above kneeY, smooth seam at splitX
        const seam = y <= spec.kneeY ? 1.0 : smooth(Math.abs(x - splitX) / Math.max(0.002, spec.seamW));
        const legMem = wy * wz * seam * (1 - armW);
        if (legMem > 1e-4) {
          const L = x < splitX ? legDefs.legL : legDefs.legR;
          const s = Math.max(0, Math.min(1, (spec.hipY - y) / Math.max(0.05, spec.hipY - minY)));
          const lw = legChainWeights(s);
          const out = new Map();
          const torsoJoint = spec.fixOrangeArms ? (y < 0.29 ? pelvisIdx : spineIdx) : pelvisIdx;
          const rem = 1 - legMem;
          if (rem > 1e-4) {
            if (spec.fixOrangeArms || nonLegMap.size === 0) {
              out.set(torsoJoint, rem);
            } else {
              let sumNonLeg = 0;
              for (const v of nonLegMap.values()) sumNonLeg += v;
              for (const [ji, vw] of nonLegMap.entries()) out.set(ji, (vw / (sumNonLeg || 1)) * rem);
            }
          }
          lw.forEach((f, n) => {
            if (f * legMem > 1e-4) out.set(L.idx[n], (out.get(L.idx[n]) ?? 0) + f * legMem);
          });
          const top = [...out.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
          const sum = top.reduce((a, b) => a + b[1], 0);
          const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
          top.forEach(([ji, yw], n) => { jj[n] = ji; ww[n] = yw / sum; });
          J.setElement(i, jj);
          W.setElement(i, ww);
          continue;
        }
      }

      // For Orange guy upper torso vertices not in arms or legs: weight cleanly to body/root
      if (spec.fixOrangeArms) {
        const bodyJoint = y < 0.29 ? pelvisIdx : spineIdx;
        J.setElement(i, [bodyJoint, 0, 0, 0]);
        W.setElement(i, [1, 0, 0, 0]);
      }
    }

    // Verify bind invariance B(j)*IBM(j) == M0 for all joints
    let maxBindErr = 0;
    joints.forEach((j, idx) => {
      const Mj = mul(j.getWorldMatrix(), ibm(idx));
      for (let k = 0; k < 16; k++) maxBindErr = Math.max(maxBindErr, Math.abs(Mj[k] - M0[k]));
    });

    for (const a of root.listAccessors()) if (!a.listParents().some((p) => p !== root)) a.dispose();
    await io.write(file, doc);
    console.log(
      `Rigged ${spec.name}${suffix}.glb: joints=${joints.length} (${joints.map((j) => j.getName()).join(',')}), maxBindErr=${maxBindErr.toExponential(2)}`
    );
  }
}
