// Upgrades all 7 MarLivo characters (14 GLBs: high + low for ammar, orange-guy, biscuit, mint, pepper, choco, sugar)
// from clean base GLBs with:
//  1. Unmistakable 4-bone articulated arms (armL -> armL_fore -> armL_hand -> armL_curl & armR -> armR_fore -> armR_hand -> armR_curl):
//     - For the 6 stylized characters (orange-guy, biscuit, mint, pepper, choco, sugar), tucks the old short/fused stubby side-arms
//       smoothly into the torso wall and generates full-length (0.37..0.40m), forward-shouldered (shZ = +0.11..+0.16) 4-bone arms
//       with a dark wristband cuff (UV_DARK) and expressive white cartoon glove/paw (UV_WHITE) so every arm reach, card hold,
//       swap, throw, and emote reads with 100% clarity and never gets swallowed by the belly sphere!
//     - For Ammar, preserves his natural human arms and ensures consistent L/R side mapping.
//  2. Unmistakable 3-bone articulated legs (legL -> legL_knee -> legL_foot & legR -> legR_knee -> legR_foot) extending
//     32% of standing height below the torso (hipY = 0.32, kneeY = 0.17, foot sole = 0.00), with:
//       - clean daylight between the bottom of the torso and the ground (torso bottom tucked up to y >= 0.315)
//       - clean daylight between left and right legs (separated horizontally at x = ±0.14..0.18 in normalized height units)
//       - high-contrast two-tone sneakers (dark upper + crisp white sole/toe cap) on legL_foot / legR_foot and well-defined
//         cylindrical thighs/shins so walking, lunging, jumping, and seated legs read 100% clearly from every camera angle!
//  3. 100% rigid head-bone weighting above the neck crease on Ammar (yNorm >= 0.708, plus updated hair-crown-protected
//     natural skin texture with sub-chin AO & crew-neck collar), Mint, Pepper, and Biscuit so faces, hair, and glasses never ghost, shear, or split.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
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
const invDir = (m, v) => {
  const c = [0, 1, 2].map((k) => [m[k * 4], m[k * 4 + 1], m[k * 4 + 2]]);
  const d = c.map((col) => col[0] * v[0] + col[1] * v[1] + col[2] * v[2]);
  const l = Math.hypot(...d) || 1;
  return d.map((x) => x / l);
};
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, t) => a + (b - a) * t;
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm3 = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};

const BASE_DIR = '/tmp/base_glbs';
const OUT_DIR = new URL('../../apps/client/public/assets/characters', import.meta.url).pathname;

// Verified uniform 5x5 texels in each character's own atlas (BODY, DARK, WHITE) so zero texture pixels are modified
const UV_PALETTES = {
  'orange-guy':     { body: [0.3009, 0.0743], dark: [0.9532, 0.0743], white: [0.2325, 0.1935] },
  'orange-guy-low': { body: [0.8755, 0.1938], dark: [0.8013, 0.3071], white: [0.3774, 0.1938] },
  'ammar':          { body: [0.8439, 0.2560], dark: [0.9318, 0.2443], white: [0.7775, 0.3693] },
  'ammar-low':      { body: [0.8950, 0.3052], dark: [0.4321, 0.5786], white: [0.8267, 0.3853] },
  'biscuit':        { body: [0.2520, 0.3027], dark: [0.2285, 0.2520], white: [0.3809, 0.2207] },
  'biscuit-low':    { body: [0.2520, 0.3027], dark: [0.2324, 0.2559], white: [0.3809, 0.2207] },
  'mint':           { body: [0.4728, 0.6954], dark: [0.1896, 0.2560], white: [0.1837, 0.2638] },
  'mint-low':       { body: [0.4849, 0.6665], dark: [0.1743, 0.2524], white: [0.3442, 0.2563] },
  'pepper':         { body: [0.9337, 0.5782], dark: [0.2189, 0.9825], white: [0.2482, 0.2345] },
  'pepper-low':     { body: [0.4634, 0.9595], dark: [0.2153, 0.9907], white: [0.4106, 0.2310] },
  'choco':          { body: [0.4082, 0.9551], dark: [0.2168, 0.3262], white: [0.4082, 0.3809] },
  'choco-low':      { body: [0.4863, 0.2012], dark: [0.3848, 0.3223], white: [0.4082, 0.3809] },
  'sugar':          { body: [0.7402, 0.3340], dark: [0.9238, 0.2793], white: [0.9629, 0.5723] },
  'sugar-low':      { body: [0.1270, 0.1035], dark: [0.6504, 0.2129], white: [0.6191, 0.8535] },
};

const CHAR_SPECS = [
  { name: 'orange-guy', legX: 0.155, legZ: -0.012, rThigh: 0.056, rShin: 0.046, shoeW: 0.064, shoeH: 0.068, shoeLen: 0.155, torsoMinY: 0.320, zMin: -0.22, headY: null, addLegMesh: true, addArmMesh: true, wallX: 0.332, armX: 0.295, armY: 0.605, armZ: 0.145, armLen: 0.39, rArm: 0.052 },
  { name: 'ammar',      legX: 0.078, legZ:  0.035, rThigh: 0.046, rShin: 0.040, shoeW: 0.056, shoeH: 0.060, shoeLen: 0.135, torsoMinY: 0.315, zMin: -0.16, headY: 0.708, neckBlend: 0.026, addLegMesh: false, addArmMesh: false },
  { name: 'biscuit',    legX: 0.150, legZ:  0.018, rThigh: 0.050, rShin: 0.042, shoeW: 0.064, shoeH: 0.066, shoeLen: 0.148, torsoMinY: 0.315, zMin: -0.05, headY: 0.62, neckBlend: 0.05, addLegMesh: true, addArmMesh: true, wallX: 0.238, armX: 0.218, armY: 0.555, armZ: 0.125, armLen: 0.37, rArm: 0.044 },
  { name: 'mint',       legX: 0.145, legZ:  0.055, rThigh: 0.046, rShin: 0.038, shoeW: 0.058, shoeH: 0.064, shoeLen: 0.142, torsoMinY: 0.315, zMin: -0.02, headY: 0.55, neckBlend: 0.05, addLegMesh: true, addArmMesh: true, centerX: -0.066, wallX: 0.148, armX: 0.148, armY: 0.535, armZ: 0.130, armLen: 0.36, rArm: 0.042 },
  { name: 'pepper',     legX: 0.150, legZ:  0.035, rThigh: 0.048, rShin: 0.040, shoeW: 0.062, shoeH: 0.065, shoeLen: 0.148, torsoMinY: 0.315, zMin: -0.04, headY: 0.60, neckBlend: 0.05, addLegMesh: true, addArmMesh: true, wallX: 0.222, armX: 0.205, armY: 0.555, armZ: 0.125, armLen: 0.37, rArm: 0.043 },
  { name: 'choco',      legX: 0.148, legZ:  0.015, rThigh: 0.046, rShin: 0.038, shoeW: 0.060, shoeH: 0.064, shoeLen: 0.145, torsoMinY: 0.315, zMin: -0.14, headY: null, addLegMesh: true, addArmMesh: true, wallX: 0.282, armX: 0.265, armY: 0.545, armZ: 0.120, armLen: 0.37, rArm: 0.043 },
  { name: 'sugar',      legX: 0.155, legZ:  0.025, rThigh: 0.046, rShin: 0.038, shoeW: 0.062, shoeH: 0.064, shoeLen: 0.145, torsoMinY: 0.315, zMin: -0.16, headY: null, addLegMesh: true, addArmMesh: true, wallX: 0.318, armX: 0.295, armY: 0.555, armZ: 0.135, armLen: 0.38, rArm: 0.044 },
];

const HIP_Y = 0.320;
const KNEE_Y = 0.170;
const FOOT_Y = 0.050;

const LEG_FRACS = [0.46, 0.80], LEG_HB = 0.055;
const legChainWeights = (s) => {
  const g = LEG_FRACS.map((b) => smooth((s - b + LEG_HB) / (2 * LEG_HB)));
  return [1 - g[0], g[0] - g[1], g[1]].map((x) => Math.max(0, x));
};

const ARM_FRACS = [0.46, 0.76, 0.89], ARM_HB = 0.075;
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
    parentNode.addChild(node);
    node.setRotation([0, 0, 0, 1]);
    node.setScale([1, 1, 1]);
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
    const key = `${spec.name}${suffix}`;
    const inFile = existsSync(`${BASE_DIR}/${key}.glb`) ? `${BASE_DIR}/${key}.glb` : `${OUT_DIR}/${key}.glb`;
    const outFile = `${OUT_DIR}/${key}.glb`;
    const doc = await io.read(inFile);
    const root = doc.getRoot();

    // If Ammar, update his colour texture with the hair-crown-protected natural skin texture
    if (spec.name === 'ammar' && existsSync(`/tmp/skin_${key}_natural.webp`)) {
      for (const tex of root.listTextures()) {
        if (!tex.getName().endsWith('_nrm')) {
          tex.setImage(new Uint8Array(readFileSync(`/tmp/skin_${key}_natural.webp`)));
        }
      }
    }

    const skin = root.listSkins()[0];
    let joints = skin.listJoints();
    const ibmA = skin.getInverseBindMatrices();
    const ibm = (i) => ibmA.getElement(i, new Array(16));
    const M0 = mul(joints[0].getWorldMatrix(), ibm(0));
    const toMesh = (q) => inv3(M0, q);
    const toMeshN = (n) => invDir(M0, n);

    const prim = root.listMeshes()[0].listPrimitives()[0];
    const ti = prim.getMaterial().getBaseColorTextureInfo()?.listExtensions()?.[0];
    const uvOff = ti ? ti.getOffset() : [0, 0];
    const uvSc = ti ? ti.getScale() : [1, 1];
    const toAttrUV = ([u, v]) => [(u - uvOff[0]) / uvSc[0], (v - uvOff[1]) / uvSc[1]];
    const pal = UV_PALETTES[key];
    const UV_BODY = toAttrUV(pal.body);
    const UV_DARK = toAttrUV(pal.dark);
    const UV_WHITE = toAttrUV(pal.white);

    const P = prim.getAttribute('POSITION');
    const N = prim.getAttribute('NORMAL');
    const U = prim.getAttribute('TEXCOORD_0');
    const J = prim.getAttribute('JOINTS_0');
    const W = prim.getAttribute('WEIGHTS_0');
    const IDX = prim.getIndices();
    const nV0 = P.getCount();

    const rest = new Array(nV0);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < nV0; i++) {
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

    joints = skin.listJoints();
    const oldArmJointSet = new Set(
      joints.map((j, idx) => (j.getName().startsWith('arm') ? idx : -1)).filter((idx) => idx >= 0)
    );
    const pelvisIdx = 0; // 'root' or 'hips'
    const pelvisNode = joints[pelvisIdx];
    const spineIdx = joints.findIndex((j) => j.getName() === 'spine' || j.getName() === 'body');
    const spineNode = joints[spineIdx >= 0 ? spineIdx : pelvisIdx];
    const spineJointIdx = spineIdx >= 0 ? spineIdx : pelvisIdx;
    const headIdx = joints.findIndex((j) => j.getName() === 'head');
    const cx = spec.centerX ?? 0;

    // Configure 4-bone articulated arms (armL -> armL_fore -> armL_hand -> armL_curl & armR -> armR_fore -> armR_hand -> armR_curl)
    const armDefs = {};
    if (spec.addArmMesh) {
      for (const [side, sgn] of [['armL', -1], ['armR', 1]]) {
        const shPos = [cx + sgn * spec.armX, spec.armY, spec.armZ];
        const dir = norm3([sgn * 0.34, -0.88, 0.34]);
        const forePos = shPos.map((v, k) => v + dir[k] * ARM_FRACS[0] * spec.armLen);
        const handPos = shPos.map((v, k) => v + dir[k] * ARM_FRACS[1] * spec.armLen);
        const curlPos = shPos.map((v, k) => v + dir[k] * ARM_FRACS[2] * spec.armLen);

        const jUp = ensureJoint(doc, skin, ibmA, spineNode, spineJointIdx, side, shPos);
        const jFore = ensureJoint(doc, skin, ibmA, jUp.node, jUp.idx, `${side}_fore`, forePos);
        const jHand = ensureJoint(doc, skin, ibmA, jFore.node, jFore.idx, `${side}_hand`, handPos);
        const jCurl = ensureJoint(doc, skin, ibmA, jHand.node, jHand.idx, `${side}_curl`, curlPos);
        armDefs[side] = { sgn, idx: [jUp.idx, jFore.idx, jHand.idx, jCurl.idx], shPos, dir, len: spec.armLen };
      }
    }

    // Add 3-bone leg joints (legL -> legL_knee -> legL_foot & legR -> legR_knee -> legR_foot)
    const legDefs = {};
    for (const [side, sgn] of [['legL', -1], ['legR', 1]]) {
      const lx = cx + sgn * spec.legX;
      const lz = spec.legZ;
      const hipPos = [lx, HIP_Y, lz];
      const kneePos = [lx, KNEE_Y, lz];
      const footPos = [lx, FOOT_Y, lz + 0.025];

      const jHip = ensureJoint(doc, skin, ibmA, pelvisNode, pelvisIdx, side, hipPos);
      const jKnee = ensureJoint(doc, skin, ibmA, jHip.node, jHip.idx, `${side}_knee`, kneePos);
      const jFoot = ensureJoint(doc, skin, ibmA, jKnee.node, jKnee.idx, `${side}_foot`, footPos);
      legDefs[side] = { sgn, idx: [jHip.idx, jKnee.idx, jFoot.idx], hipPos, kneePos, footPos };
    }

    joints = skin.listJoints();
    const legJointSet = new Set([...legDefs.legL.idx, ...legDefs.legR.idx]);

    // Step A:
    //  - For characters with addArmMesh = true: tuck the old short/fused stubby side-arm vertices smoothly onto the
    //    torso wall (wallX) and weight them to spine/pelvis so there are zero static paws or wing-stubs.
    //  - For characters with addLegMesh = true: lift & tuck the old lower belly/stub vertices (y < torsoMinY + 0.085)
    //    smoothly up into a clean lower-torso hemisphere ending at y = torsoMinY (0.315..0.320).
    const posOverrides = new Map();
    const jOverrides = new Map();
    const wOverrides = new Map();

    for (let i = 0; i < nV0; i++) {
      let [x, y, z] = rest[i];
      const yNorm = (y - minY) / H;

      const j4 = J.getElement(i, []), w4 = W.getElement(i, []);
      let armW = 0;
      for (let k = 0; k < 4; k++) {
        if (w4[k] > 0 && oldArmJointSet.has(j4[k])) armW += w4[k];
      }

      // 1. Rigid 100% head weighting above headY (and smooth neck transition below headY)
      if (spec.headY !== null && headIdx >= 0 && armW < 0.05 && yNorm >= spec.headY - (spec.neckBlend ?? 0.04)) {
        const hw = yNorm >= spec.headY ? 1.0 : smooth((yNorm - (spec.headY - spec.neckBlend)) / spec.neckBlend);
        jOverrides.set(i, hw >= 0.9999 ? [headIdx, 0, 0, 0] : [headIdx, spineJointIdx, 0, 0]);
        wOverrides.set(i, hw >= 0.9999 ? [1, 0, 0, 0] : [hw, 1 - hw, 0, 0]);
        continue;
      }

      let modifiedPos = false;

      // 2. If addArmMesh is true: smoothly tuck old side-arm protrusions back into the torso contour wallX
      //    and strip old arm joint weights so the torso wall is 100% clean!
      if (spec.addArmMesh) {
        const isMintTail = spec.name === 'mint' && z < -0.045 && x > 0.0;
        const dx = Math.abs(x - cx);
        const sgnX = x >= cx ? 1 : -1;
        const oldArmMask = spec.name === 'orange-guy'
          ? smooth((dx - 0.305) / 0.030) * smooth((y - 0.24) / 0.04) * smooth((0.61 - y) / 0.04)
          : isMintTail ? 0 : smooth((armW - 0.005) / 0.08);

        if (oldArmMask > 1e-4) {
          const baseWall = spec.wallX * 0.84;
          const clampedDx = dx <= baseWall
            ? dx
            : baseWall + (spec.wallX - baseWall) * Math.tanh((dx - baseWall) / (spec.wallX * 0.16));
          x = lerp(x, cx + sgnX * clampedDx, oldArmMask);
          // For Mint/Biscuit where old lower paws leaned slightly forward (+Z), tuck +Z flush into the front torso curve
          if (spec.name === 'mint' && z > 0.115 && y < 0.48) {
            const cz = 0.115 + 0.025 * Math.tanh((z - 0.115) / 0.035);
            z = lerp(z, cz, oldArmMask);
          }
          modifiedPos = true;
        }
      }

      // 3. If addLegMesh is true: tuck old stubby lower vertices (y < torsoMinY + 0.085) up into the bottom of the torso (y >= torsoMinY)
      if (spec.addLegMesh && y < spec.torsoMinY + 0.085) {
        const isMintTail = spec.name === 'mint' && z < -0.045 && x > 0.0;
        if (!isMintTail) {
          const yTop = spec.torsoMinY + 0.085;
          const u = Math.max(0, Math.min(1, (yTop - y) / yTop));
          const newY = yTop - Math.pow(u, 0.62) * (yTop - spec.torsoMinY);
          const pullIn = smooth((spec.torsoMinY + 0.03 - y) / 0.14);
          x = cx + (x - cx) * (1 - 0.52 * pullIn);
          z = spec.legZ + (z - spec.legZ) * (1 - 0.55 * pullIn);
          y = newY;
          modifiedPos = true;
        }
        const torsoJoint = y < 0.36 ? pelvisIdx : spineJointIdx;
        if (modifiedPos) {
          posOverrides.set(i, toMesh([x, y, z]).map((v) => Math.max(0, Math.min(65535, Math.round(v)))));
        }
        jOverrides.set(i, [torsoJoint, 0, 0, 0]);
        wOverrides.set(i, [1, 0, 0, 0]);
        continue;
      }

      if (modifiedPos) {
        posOverrides.set(i, toMesh([x, y, z]).map((v) => Math.max(0, Math.min(65535, Math.round(v)))));
      }

      // If addArmMesh is true, any vertex on the original mesh that had arm weights now belongs to the torso
      if (spec.addArmMesh && (armW > 0 || spec.name === 'orange-guy')) {
        const bodyJoint = y < 0.36 ? pelvisIdx : spineJointIdx;
        jOverrides.set(i, [bodyJoint, 0, 0, 0]);
        wOverrides.set(i, [1, 0, 0, 0]);
        continue;
      }

      // 4. For Ammar (who already has full-length cargo pants & white sneakers in his mesh):
      //    weight his existing legs to legL/R -> _knee -> _foot
      if (!spec.addLegMesh && armW < 0.5 && y <= HIP_Y + 0.025) {
        const wy = smooth((HIP_Y + 0.02 - y) / 0.055);
        const splitX = 0.008;
        const seam = y <= KNEE_Y ? 1.0 : smooth(Math.abs(x - splitX) / 0.012);
        const legMem = wy * seam * (1 - armW);
        if (legMem > 1e-4) {
          const L = x < splitX ? legDefs.legL : legDefs.legR;
          const s = Math.max(0, Math.min(1, (HIP_Y - y) / Math.max(0.05, HIP_Y - minY)));
          const lw = legChainWeights(s);
          const out = new Map();
          const rem = 1 - legMem;
          if (rem > 1e-4) out.set(pelvisIdx, rem);
          lw.forEach((f, n) => { if (f * legMem > 1e-4) out.set(L.idx[n], (out.get(L.idx[n]) ?? 0) + f * legMem); });
          const top = [...out.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
          const sum = top.reduce((a, b) => a + b[1], 0);
          const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
          top.forEach(([ji, yw], n) => { jj[n] = ji; ww[n] = yw / sum; });
          jOverrides.set(i, jj);
          wOverrides.set(i, ww);
          continue;
        }
      }
    }

    // Step B: For all 6 characters with addLegMesh = true, generate unmistakable 3-bone articulated legs + high-contrast sneakers!
    const newPos = [], newNrm = [], newUv = [], newJ = [], newW = [], newIdx = [];
    const isLow = suffix === '-low';
    const nSeg = isLow ? 12 : 18;

    if (spec.addLegMesh) {
      const nLegRings = isLow ? 14 : 22;
      const nShoeRings = isLow ? 10 : 14;

      for (const side of ['legL', 'legR']) {
        const L = legDefs[side];
        const sgn = L.sgn;
        const lx = L.hipPos[0];
        const lz = L.hipPos[2];
        const j4 = [L.idx[0], L.idx[1], L.idx[2], pelvisIdx];

        // Part 1: Cylindrical Thigh + Knee + Shin (y from 0.345 down to 0.055)
        const baseLegV = nV0 + newPos.length / 3;
        const yTop = 0.345, yBot = 0.055;
        for (let ir = 0; ir <= nLegRings; ir++) {
          const f = ir / nLegRings;
          const y = lerp(yTop, yBot, f);
          const s = Math.max(0, Math.min(1, (HIP_Y - y) / HIP_Y));
          const cw = legChainWeights(s);
          const pelW = f < 0.12 ? (1 - f / 0.12) * 0.35 : 0;
          const legW = 1 - pelW;
          const w4 = [cw[0] * legW, cw[1] * legW, cw[2] * legW, pelW];

          const kneeBulge = 1 + 0.08 * Math.exp(-(((f - 0.56) / 0.12) ** 2));
          const isSock = f >= 0.80;
          const sockExpand = isSock ? 1.08 : 1.0;
          const rx = lerp(spec.rThigh, spec.rShin, f) * kneeBulge * sockExpand;
          const rz = rx * 1.04;
          const uvChoice = isSock ? UV_WHITE : UV_BODY;

          for (let is = 0; is < nSeg; is++) {
            const ang = (is / nSeg) * Math.PI * 2;
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const q = [lx + rx * ca, y, lz + rz * sa];
            const nrm = [ca, 0, sa];
            const mp = toMesh(q).map((v) => Math.max(0, Math.min(65535, Math.round(v))));
            const mn = toMeshN(nrm);
            newPos.push(...mp);
            newNrm.push(...mn);
            newUv.push(...uvChoice);
            newJ.push(...j4);
            newW.push(...w4);
          }
        }
        for (let ir = 0; ir < nLegRings; ir++) {
          for (let is = 0; is < nSeg; is++) {
            const i0 = baseLegV + ir * nSeg + is;
            const i1 = baseLegV + ir * nSeg + ((is + 1) % nSeg);
            const i2 = baseLegV + (ir + 1) * nSeg + is;
            const i3 = baseLegV + (ir + 1) * nSeg + ((is + 1) % nSeg);
            newIdx.push(i0, i1, i2, i1, i3, i2);
          }
        }

        // Part 2: High-Contrast Sneaker / Shoe on leg_foot
        const baseShoeV = nV0 + newPos.length / 3;
        const shoeJ4 = [L.idx[2], L.idx[1], 0, 0];
        const shoeW4 = [0.95, 0.05, 0, 0];
        const zHeel = lz - 0.048;
        const zToe = lz + spec.shoeLen - 0.048;
        const zMid = 0.5 * (zHeel + zToe);
        const halfLen = 0.5 * (zToe - zHeel);

        for (let ir = 0; ir <= nShoeRings; ir++) {
          const f = ir / nShoeRings;
          let y, radScale;
          if (f === 0) {
            y = 0.001;
            radScale = 0.01;
          } else if (f <= 0.18) {
            y = 0.001 + ((f - 0.0) / 0.18) * 0.006;
            radScale = ((f - 0.0) / 0.18);
          } else if (f <= 0.86) {
            const u = (f - 0.18) / 0.68;
            y = 0.007 + u * (spec.shoeH - 0.007);
            radScale = 1.0 - 0.18 * (u ** 1.6);
          } else {
            const u = (f - 0.86) / 0.14;
            y = spec.shoeH + (1 - u) * 0.004;
            radScale = 0.82 * (1 - u * 0.98);
          }

          const isSole = y <= 0.025;
          for (let is = 0; is < nSeg; is++) {
            const ang = (is / nSeg) * Math.PI * 2;
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const toeDrop = sa > 0 && y > 0.022 ? sa * 0.014 * ((y - 0.022) / spec.shoeH) : 0;
            const py = Math.max(0.001, y - toeDrop);
            const wx = spec.shoeW * (1 + 0.10 * Math.max(0, sa)) * radScale;
            const wz = halfLen * radScale;
            const localX = wx * ca + sgn * 0.010 * Math.max(0, sa);
            const localZ = wz * sa;
            const q = [lx + localX, py, zMid + localZ];
            let nrm = [ca, f <= 0.18 ? -1 : f >= 0.86 ? 1 : 0.25, sa];
            const nl = Math.hypot(...nrm) || 1;
            nrm = nrm.map((v) => v / nl);

            const isToeCap = sa > 0.58 && py <= 0.046;
            const uvShoe = (isSole || isToeCap) ? UV_WHITE : UV_DARK;

            const mp = toMesh(q).map((v) => Math.max(0, Math.min(65535, Math.round(v))));
            const mn = toMeshN(nrm);
            newPos.push(...mp);
            newNrm.push(...mn);
            newUv.push(...uvShoe);
            newJ.push(...shoeJ4);
            newW.push(...shoeW4);
          }
        }
        for (let ir = 0; ir < nShoeRings; ir++) {
          for (let is = 0; is < nSeg; is++) {
            const i0 = baseShoeV + ir * nSeg + is;
            const i1 = baseShoeV + ir * nSeg + ((is + 1) % nSeg);
            const i2 = baseShoeV + (ir + 1) * nSeg + is;
            const i3 = baseShoeV + (ir + 1) * nSeg + ((is + 1) % nSeg);
            newIdx.push(i0, i2, i1, i1, i2, i3);
          }
        }
      }
    }

    // Step C: For all 6 characters with addArmMesh = true, generate unmistakable 4-bone articulated arms
    // (arm -> arm_fore -> arm_hand -> arm_curl) with a spherical shoulder cap, body-coloured upper/forearm,
    // dark wristband cuff (UV_DARK), and high-contrast white cartoon glove/paw (UV_WHITE)!
    if (spec.addArmMesh) {
      const nArmRings = isLow ? 16 : 24;
      for (const side of ['armL', 'armR']) {
        const A = armDefs[side];
        const sgn = A.sgn;
        const uVec = A.dir; // unit vector pointing down along the arm
        // Construct right-handed orthonormal basis (e1, e2, uVec) with e1 = cross(e2, uVec)
        const f0 = [0, 0, 1];
        const dotFU = f0[0] * uVec[0] + f0[1] * uVec[1] + f0[2] * uVec[2];
        const e2 = norm3(f0.map((v, k) => v - dotFU * uVec[k])); // points forward (+Z)
        const e1 = cross(e2, uVec); // points laterally (+X)

        const baseArmV = nV0 + newPos.length / 3;
        const j4 = A.idx; // [jUp, jFore, jHand, jCurl]

        for (let ir = 0; ir <= nArmRings; ir++) {
          const f = ir / nArmRings;
          // s goes from -0.06 (tucked spherical shoulder cap centered near shPos) to 1.00 (closed fingertip cap)
          const s = lerp(-0.06, 1.00, f);
          const cw = armChainWeights(Math.max(0, Math.min(1, s)));
          const sumW = cw.reduce((a, b) => a + b, 0) || 1;
          const w4 = cw.map((v) => v / sumW);

          const cPos = A.shPos.map((v, k) => v + uVec[k] * (s * A.len));
          let r1, r2, uvChoice;

          if (s < 0.0) {
            // Spherical shoulder ball cap tucked into the shoulder socket
            const uCap = Math.max(0, Math.min(1, (s + 0.06) / 0.06));
            const capScale = ir === 0 ? 0.02 : Math.sqrt(Math.max(0.01, 1 - (1 - uCap) ** 2));
            r1 = spec.rArm * capScale;
            r2 = spec.rArm * capScale;
            uvChoice = UV_BODY;
          } else if (s <= 0.66) {
            // Upper arm & forearm with subtle elbow contour at s=0.46
            const uArm = s / 0.66;
            const elbowBulge = 1 + 0.08 * Math.exp(-(((s - 0.46) / 0.08) ** 2));
            r1 = lerp(spec.rArm, spec.rArm * 0.88, uArm) * elbowBulge;
            r2 = r1 * 1.03;
            uvChoice = UV_BODY;
          } else if (s <= 0.76) {
            // Crisp Dark Wristband / Sleeve Cuff (UV_DARK)
            r1 = spec.rArm * 1.06;
            r2 = spec.rArm * 1.08;
            uvChoice = UV_DARK;
          } else {
            // Expressive White Cartoon Glove / Paw (UV_WHITE) on arm_hand -> arm_curl
            const uHand = (s - 0.76) / 0.24; // 0 at wrist cuff, 1 at fingertips
            const handEnv = ir === nArmRings ? 0.01 : Math.sin(Math.PI * Math.pow(uHand, 0.68));
            const baseScale = ir === nArmRings ? 0.02 : (1 - 0.88 * Math.pow(uHand, 2.8));
            r1 = spec.rArm * (0.95 * baseScale + 0.52 * handEnv);
            r2 = spec.rArm * (0.95 * baseScale + 0.36 * handEnv);
            uvChoice = UV_WHITE;
          }

          for (let is = 0; is < nSeg; is++) {
            const ang = (is / nSeg) * Math.PI * 2;
            const ca = Math.cos(ang), sa = Math.sin(ang);
            // Subtle thumb contour on the forward-inward side of the glove (s in 0.80..0.92)
            let thumbExtra2 = 0, thumbExtra1 = 0;
            if (s > 0.78 && s < 0.93) {
              const uT = Math.sin(Math.PI * ((s - 0.78) / 0.15));
              const inward = -sgn * ca;
              if (sa > 0.2 && inward > 0) {
                thumbExtra2 = spec.rArm * 0.32 * uT * sa * inward;
                thumbExtra1 = -sgn * spec.rArm * 0.22 * uT * sa * inward;
              }
            }
            const xOff = r1 * ca + thumbExtra1;
            const zOff = r2 * sa + thumbExtra2;
            const q = [
              cPos[0] + xOff * e1[0] + zOff * e2[0],
              cPos[1] + xOff * e1[1] + zOff * e2[1],
              cPos[2] + xOff * e1[2] + zOff * e2[2],
            ];
            const axialN = ir === 0 ? -1 : ir === nArmRings ? 1 : 0;
            const nrm = norm3([
              ca * e1[0] + sa * e2[0] + axialN * uVec[0],
              ca * e1[1] + sa * e2[1] + axialN * uVec[1],
              ca * e1[2] + sa * e2[2] + axialN * uVec[2],
            ]);
            const mp = toMesh(q).map((v) => Math.max(0, Math.min(65535, Math.round(v))));
            const mn = toMeshN(nrm);
            newPos.push(...mp);
            newNrm.push(...mn);
            newUv.push(...uvChoice);
            newJ.push(...j4);
            newW.push(...w4);
          }
        }
        for (let ir = 0; ir < nArmRings; ir++) {
          for (let is = 0; is < nSeg; is++) {
            const i0 = baseArmV + ir * nSeg + is;
            const i1 = baseArmV + ir * nSeg + ((is + 1) % nSeg);
            const i2 = baseArmV + (ir + 1) * nSeg + is;
            const i3 = baseArmV + (ir + 1) * nSeg + ((is + 1) % nSeg);
            newIdx.push(i0, i1, i2, i1, i3, i2);
          }
        }
      }
    }

    const totalV = nV0 + newPos.length / 3;
    function buildAttr(attr, extra, itemSize, overrides = null, ForceCtor = null) {
      const oldArr = attr.getArray();
      const Ctor = ForceCtor ?? oldArr.constructor;
      const out = new Ctor(totalV * itemSize);
      const next = doc.createAccessor()
        .setType(attr.getType())
        .setNormalized(ForceCtor ? false : attr.getNormalized())
        .setArray(out)
        .setBuffer(attr.getBuffer());
      for (let i = 0; i < nV0; i++) next.setElement(i, attr.getElement(i, []));
      if (overrides) {
        for (const [idx, val] of overrides) next.setElement(idx, val);
      }
      for (let i = 0; i < extra.length / itemSize; i++) {
        next.setElement(nV0 + i, extra.slice(i * itemSize, (i + 1) * itemSize));
      }
      return next;
    }

    prim.setAttribute('POSITION', buildAttr(P, newPos, 3, posOverrides));
    prim.setAttribute('NORMAL', buildAttr(N, newNrm, 3));
    prim.setAttribute('TEXCOORD_0', buildAttr(U, newUv, 2));
    prim.setAttribute('JOINTS_0', buildAttr(J, newJ, 4, jOverrides, Uint16Array));
    prim.setAttribute('WEIGHTS_0', buildAttr(W, newW, 4, wOverrides, Float32Array));

    if (newIdx.length > 0) {
      const oldIdx = IDX.getArray();
      const IdxCtor = totalV > 65535 ? Uint32Array : Uint16Array;
      const nextIdx = new IdxCtor(oldIdx.length + newIdx.length);
      nextIdx.set(oldIdx, 0);
      nextIdx.set(newIdx, oldIdx.length);
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(nextIdx).setBuffer(IDX.getBuffer()));
    }

    // Verify bind invariance B(j)*IBM(j) == M0 for all joints
    let maxBindErr = 0;
    joints.forEach((j, idx) => {
      const Mj = mul(j.getWorldMatrix(), ibm(idx));
      for (let k = 0; k < 16; k++) maxBindErr = Math.max(maxBindErr, Math.abs(Mj[k] - M0[k]));
    });

    for (const a of root.listAccessors()) if (!a.listParents().some((p) => p !== root)) a.dispose();
    await io.write(outFile, doc);
    console.log(
      `Rigged ${key}.glb: verts=${nV0}->${totalV}, joints=${joints.length} (${joints.map((j) => j.getName()).join(',')}), maxBindErr=${maxBindErr.toExponential(2)}`
    );
  }
}
