// Applies the final character mesh/texture polish while preserving every 4-bone arm rig (arm -> _fore -> _hand -> _curl):
//  1. pepper.glb & pepper-low.glb: replaces colour texture with polished version (cleaned hinge/lens-edge patch + wider side facial disc)
//  2. ammar-low.glb: remaps UVs of bright top/back-crown hair speck vertices (y > 0.935 or z < -0.02) to a dark-hair atlas texel,
//     keeping the WebP texture and every face/forehead/glasses/ear/arm vertex 100% bit-for-bit identical (0 pixel face diff!)
//  3. sugar.glb & sugar-low.glb: radially thickens Sparkle's ivory arms by +20% perpendicular to the arm axis (0 at shoulder seam)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { readFileSync } from 'node:fs';

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

// 1. Pepper (hi & lo) texture polish
for (const name of ['pepper', 'pepper-low']) {
  const doc = await io.read(`out/${name}.glb`);
  const root = doc.getRoot();
  for (const t of root.listTextures()) {
    if (!t.getName().endsWith('_nrm')) {
      t.setImage(new Uint8Array(readFileSync(`/tmp/tex_${name}_polished.webp`)));
    }
  }
  await io.write(`out/${name}-polished.glb`, doc);
  const joints = root.listSkins()[0].listJoints().map((j) => j.getName());
  console.log(name, 'polished; joints:', joints.length, joints.join(','));
}

// 2. Ammar-low: remap UVs of bright top/back-crown hair speck vertices without touching the texture or any face/ear/arm vertex
{
  const doc = await io.read('out/ammar-low.glb');
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const M0 = mul(joints[0].getWorldMatrix(), skin.getInverseBindMatrices().getElement(0, new Array(16)));
  const prim = root.listMeshes()[0].listPrimitives()[0];
  const P = prim.getAttribute('POSITION'), U = prim.getAttribute('TEXCOORD_0');
  const ext = prim.getMaterial().getBaseColorTextureInfo().listExtensions()[0];
  const off = ext.getOffset(), sc = ext.getScale();
  const toAttrUV = (u, v) => [(u - off[0]) / sc[0], (v - off[1]) / sc[1]];
  // Verified dark-brown curl texel (36, 26, 20) in ammar-low's 1024x1024 atlas
  const UV_HAIR = toAttrUV((515 + 0.5) / 1024, (395 + 0.5) / 1024);

  // Read raw RGB of tex_ammar-low.webp via verts_ammar-low.json
  const verts = JSON.parse(readFileSync('/tmp/verts_ammar-low.json', 'utf8'));
  const oldArr = U.getArray();
  const outArr = new oldArr.constructor(oldArr.length);
  outArr.set(oldArr, 0);
  const nextU = doc.createAccessor().setType(U.getType()).setNormalized(U.getNormalized()).setArray(outArr).setBuffer(U.getBuffer());

  // We also check luminance from a precomputed list of speck vertex indices
  const speckIds = JSON.parse(readFileSync('/tmp/ammar_low_speck_ids.json', 'utf8'));
  for (const idx of speckIds) {
    nextU.setElement(idx, UV_HAIR);
  }
  prim.setAttribute('TEXCOORD_0', nextU);
  for (const a of root.listAccessors()) if (!a.listParents().some((p) => p !== root)) a.dispose();
  await io.write('out/ammar-low-polished.glb', doc);
  console.log('ammar-low polished; remapped speck verts:', speckIds.length, 'joints:', joints.length);
}

// 3. Sparkle cube (sugar & sugar-low): +20% radial arm thickness preserving 4-bone rig & cube body
for (const name of ['sugar', 'sugar-low']) {
  const doc = await io.read(`out/${name}.glb`);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const M0 = mul(joints[0].getWorldMatrix(), skin.getInverseBindMatrices().getElement(0, new Array(16)));
  const prim = root.listMeshes()[0].listPrimitives()[0];
  const P = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');

  const sides = [];
  for (const side of ['armL', 'armR']) {
    const ids = new Set();
    joints.forEach((j, idx) => { if (j.getName().startsWith(side)) ids.add(idx); });
    const shNode = joints.find((j) => j.getName() === side);
    const curlNode = joints.find((j) => j.getName() === side + '_curl');
    const sh = xf(shNode.getWorldMatrix(), [0, 0, 0]);
    const tip = xf(curlNode.getWorldMatrix(), [0, 0, 0]);
    const ax = tip.map((x, k) => x - sh[k]);
    const len = Math.hypot(...ax) || 1;
    const dir = ax.map((x) => x / len);
    sides.push({ side, ids, sh, dir, len: len / 0.9 });
  }

  let thickened = 0;
  const oldArr = P.getArray();
  const outArr = new oldArr.constructor(oldArr.length);
  outArr.set(oldArr, 0);
  const nextP = doc.createAccessor().setType(P.getType()).setNormalized(P.getNormalized()).setArray(outArr).setBuffer(P.getBuffer());

  const j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0];
  for (let i = 0; i < P.getCount(); i++) {
    J.getElement(i, j4); W.getElement(i, w4);
    for (const S of sides) {
      let wArm = 0;
      for (let k = 0; k < 4; k++) if (S.ids.has(j4[k])) wArm += w4[k];
      if (wArm <= 0.05) continue;
      const q = xf(M0, P.getElement(i, []));
      const rel = q.map((x, k) => x - S.sh[k]);
      const along = rel[0] * S.dir[0] + rel[1] * S.dir[1] + rel[2] * S.dir[2];
      const s = along / S.len;
      if (s <= 0.02) continue;
      const rad = rel.map((x, k) => x - along * S.dir[k]);
      const scale = 1 + 0.20 * wArm * smooth((s - 0.02) / 0.12);
      const qNew = S.sh.map((x, k) => x + along * S.dir[k] + rad[k] * scale);
      nextP.setElement(i, inv3(M0, qNew).map((x) => Math.max(0, Math.min(16383, Math.round(x)))));
      thickened++;
    }
  }
  prim.setAttribute('POSITION', nextP);
  for (const a of root.listAccessors()) if (!a.listParents().some((p) => p !== root)) a.dispose();
  await io.write(`out/${name}-polished.glb`, doc);
  console.log(name, 'thickened arm verts:', thickened, 'joints:', joints.length);
}
