// Fixes Orange guy's (orange-guy.glb & orange-guy-low.glb) 4-bone arm rig so the shoulder joint (armL/armR) sits
// on the outer surface of his wide egg body (|x| = 0.340, y = 0.510) instead of 11 cm inside the torso (|x| = 0.245),
// and weights 100% of the egg body (|x| < 0.338) to body/root so his arms and hands never clip into his torso or head.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const xf = (m, v) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r]);
const inv3 = (m, v) => {
  const t = [v[0] - m[12], v[1] - m[13], v[2] - m[14]];
  const c = [0, 1, 2].map((k) => [m[k * 4], m[k * 4 + 1], m[k * 4 + 2]]);
  return c.map((col) => (col[0] * t[0] + col[1] * t[1] + col[2] * t[2]) / (col[0] ** 2 + col[1] ** 2 + col[2] ** 2));
};
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

const C = '/workspace/animwork/repo/apps/client/public/assets/characters';
for (const name of ['orange-guy', 'orange-guy-low']) {
  const doc = await io.read(`${C}/${name}.glb`);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const ibmA = skin.getInverseBindMatrices();
  const ibm = (i) => ibmA.getElement(i, new Array(16));
  const M0 = mul(joints[0].getWorldMatrix(), ibm(0));

  const prim = root.listMeshes()[0].listPrimitives()[0];
  const P = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const nV = P.getCount();
  const rest = new Array(nV);
  for (let i = 0; i < nV; i++) rest[i] = xf(M0, P.getElement(i, []));

  const FRACS = [0.46, 0.78, 0.90], HB = 0.08;
  const chain = (s) => {
    const g = FRACS.map((b) => smooth((s - b + HB) / (2 * HB)));
    return [1 - g[0], g[0] - g[1], g[1] - g[2], g[2]].map((x) => Math.max(0, x));
  };

  const sides = [];
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

    // Shift shoulder out to 34% of old full length (right where the arm exits the egg torso at |x| = 0.340, y = 0.510)
    const shift = 0.34 * fullLen;
    const newHead = oldHead.map((x, k) => x + dir[k] * shift);
    const extLen = (fullLen / 0.90) - shift;

    // Compute dLoc in B_old BEFORE updating nUp's translation!
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
      const wPos = newHead.map((x, m) => x + dir[m] * FRACS[k] * extLen);
      const loc = inv3(prevNode.getWorldMatrix(), wPos);
      subNodes[k].setTranslation(loc);
      const Tk = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -loc[0], -loc[1], -loc[2], 1];
      curIbm = mul(Tk, curIbm);
      ibmA.setElement(subIdx[k], curIbm);
      prevNode = subNodes[k];
    }

    const sgn = Math.sign(newHead[0]);
    sides.push({ side, sgn, idx: [iUp, iFore, iHand, iCurl], head: newHead, dir, len: extLen });
  }

  // Rebuild weights cleanly: only vertices outside the egg torso (|x| > 0.338, y in 0.24..0.62) belong to the arm!
  const rootI = 0, bodyI = 1;
  for (let i = 0; i < nV; i++) {
    const q = rest[i];
    const ax = Math.abs(q[0]), y = q[1];
    const mem = smooth((ax - 0.338) / 0.032) * smooth((y - 0.24) / 0.04) * smooth((0.62 - y) / 0.04);
    const bodyJoint = y < 0.30 ? rootI : bodyI;
    if (mem <= 1e-4) {
      J.setElement(i, [bodyJoint, 0, 0, 0]);
      W.setElement(i, [1, 0, 0, 0]);
      continue;
    }
    const S = sides.find((s) => s.sgn === Math.sign(q[0])) ?? sides[0];
    const s = Math.max(0, ((q[0] - S.head[0]) * S.dir[0] + (q[1] - S.head[1]) * S.dir[1] + (q[2] - S.head[2]) * S.dir[2]) / S.len);
    const cw = chain(s);
    const out = new Map();
    if (1 - mem > 1e-4) out.set(bodyJoint, 1 - mem);
    cw.forEach((f, n) => { if (f * mem > 1e-4) out.set(S.idx[n], (out.get(S.idx[n]) ?? 0) + f * mem); });
    const top = [...out.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, b) => a + b[1], 0);
    const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
    top.forEach(([x, yw], n) => { jj[n] = x; ww[n] = yw / sum; });
    J.setElement(i, jj);
    W.setElement(i, ww);
  }

  // Verify bind invariance B(j)*IBM(j) == M0 for all joints
  let maxBindErr = 0;
  joints.forEach((j, idx) => {
    const Mj = mul(j.getWorldMatrix(), ibm(idx));
    for (let k = 0; k < 16; k++) maxBindErr = Math.max(maxBindErr, Math.abs(Mj[k] - M0[k]));
  });

  await io.write(`${C}/${name}.glb`, doc);
  console.log('Re-rigged', name, 'maxBindErr:', maxBindErr.toExponential(2), 'shoulders:', sides.map((s) => [s.side, s.head.map((x) => +x.toFixed(3)), 'len=' + s.len.toFixed(3)]));
}
