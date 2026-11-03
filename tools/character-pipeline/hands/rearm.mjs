// Replaces the procedural tube arms of a rigged HY3D character (rig_livo.mjs output) with the sculpted arms from
// mkarm.py: drops the old arm triangles from the body, re-places the 4-bone arm chains (armX at the shoulder, _fore at
// the elbow, _hand at the wrist, _curl at the knuckles) with fresh inverse bind matrices, and adds the new arms as a
// second skinned primitive (own material: a small colour atlas so the client's map/glow handling applies, vertex AO).
// The hand bones get extras.curlSign = -1: the palm faces back in the bind pose, so the client curls fingers toward -z.
// Usage: node rearm.mjs rig.glb arms_<lod>.json chain.json cfg.json out.glb
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';
const [, , inF, armF, chainF, cfgF, outF] = process.argv;
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inF); const root = doc.getRoot();
const A = JSON.parse(fs.readFileSync(armF, 'utf8')), CH = JSON.parse(fs.readFileSync(chainF, 'utf8')), cfg = JSON.parse(fs.readFileSync(cfgF, 'utf8'));
const skin = root.listSkins()[0]; const joints = skin.listJoints(); const J = Object.fromEntries(joints.map((j, k) => [j.getName(), k]));
const meshNode = root.listNodes().find((n) => n.getMesh() && n.getSkin());
const mesh = meshNode.getMesh(); const body = mesh.listPrimitives()[0];
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const ibmA = skin.getInverseBindMatrices();
const M0 = mul(joints[0].getWorldMatrix(), ibmA.getElement(0, new Array(16)));
if (!M0.every((x, i) => Math.abs(x - (i % 5 === 0 ? 1 : 0)) < 1e-5)) throw new Error('mesh->armature bind is not identity');
// 1) drop the old arm triangles (vertices mostly on arm joints)
const armJ = new Set(joints.filter((j) => j.getName().startsWith('arm')).map((j) => J[j.getName()]));
const BJ = body.getAttribute('JOINTS_0'), BW = body.getAttribute('WEIGHTS_0'); const nB = BJ.getCount();
const aw = new Float32Array(nB); for (let i = 0; i < nB; i++) { const j = BJ.getElement(i, []), w = BW.getElement(i, []); for (let m = 0; m < 4; m++) if (armJ.has(j[m])) aw[i] += w[m]; }
const ia = body.getIndices().getArray(); const keep = []; let dropped = 0;
for (let t = 0; t < ia.length; t += 3) { if (aw[ia[t]] > 0.5 || aw[ia[t + 1]] > 0.5 || aw[ia[t + 2]] > 0.5) { dropped++; continue; } keep.push(ia[t], ia[t + 1], ia[t + 2]); }
body.getIndices().setArray(nB > 65535 ? new Uint32Array(keep) : new Uint16Array(keep));
// 2) re-place the arm chains
const NAMES = ['', '_fore', '_hand', '_curl'], KEYS = ['S', 'E', 'W', 'K'];
for (const side of ['armL', 'armR']) {
  NAMES.forEach((nm, k) => {
    const node = joints[J[side + nm]]; const par = node.getParentNode(); const pw = par.getWorldTranslation(); const w = CH[side][KEYS[k]];
    node.setTranslation([w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]]).setRotation([0, 0, 0, 1]);
  });
  joints[J[side + '_hand']].setExtras({ curlSign: -1 });
}
const ibm = new Float32Array(joints.length * 16);
joints.forEach((j, k) => { const w = j.getWorldTranslation(); ibm.set(mul([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1], M0), k * 16); });
skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(ibmA.getBuffer()));
// 3) arm material: colour atlas (one 8x8 patch per material, UV at the patch centre)
const MATS = ['skin', 'sleeve', 'cuff', 'inner', 'watch', 'watchface'];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const png = new PNG({ width: 8 * MATS.length, height: 8 });
MATS.forEach((m, k) => { const c = hex(cfg.colors[m] ?? cfg.colors.sleeve); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const i = (y * png.width + k * 8 + x) * 4; png.data.set([...c, 255], i); } });
const img = doc.createTexture('arms').setImage(PNG.sync.write(png)).setMimeType('image/png');
const bm = body.getMaterial();
const mat = doc.createMaterial('arms').setBaseColorTexture(img).setRoughnessFactor(cfg.roughness ?? 0.78).setMetallicFactor(0);
mat.getBaseColorTextureInfo().setMinFilter(9728).setMagFilter(9728);
// 4) arm primitive (vertices duplicated per material so colours stay crisp)
const pos = [], nrm = [], uv = [], col = [], jj = [], ww = [], idx = [];
for (const side of ['armL', 'armR']) {
  const V = A[side + '_V'], N = A[side + '_N'], F = A[side + '_F'], W = A[side + '_W'], M = A[side + '_mat'], AO = A[side + '_AO'];
  const jid = NAMES.map((nm) => J[side + nm]); const map = new Map();
  F.forEach((f, fi) => {
    const m = MATS.indexOf(M[fi]); if (m < 0) throw new Error('mat ' + M[fi]);
    for (const v of f) {
      const key = v * 8 + m; let o = map.get(key);
      if (o === undefined) {
        o = pos.length / 3; map.set(key, o);
        pos.push(...V[v]); nrm.push(...N[v]); uv.push((m * 8 + 4) / png.width, 0.5);
        const a = AO[v]; col.push(a, a, a, 1); jj.push(...jid); ww.push(...W[v]);
      }
      idx.push(o);
    }
  });
}
const buf = body.getAttribute('POSITION').getBuffer();
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
const prim = doc.createPrimitive().setMaterial(mat)
  .setAttribute('POSITION', acc('VEC3', new Float32Array(pos))).setAttribute('NORMAL', acc('VEC3', new Float32Array(nrm)))
  .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv))).setAttribute('COLOR_0', acc('VEC4', new Float32Array(col)))
  .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array(jj))).setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(ww)))
  .setIndices(acc('SCALAR', pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx)));
mesh.addPrimitive(prim);
if (process.env.TEXIN && process.env.TEXIN.length) { const tx = body.getMaterial().getBaseColorTexture(); tx.setImage(new Uint8Array(fs.readFileSync(process.env.TEXIN))).setMimeType('image/webp'); }
for (const a of root.listAccessors()) if (!a.listParents().some((p) => p !== root)) a.dispose();
await io.write(outF, doc);
console.log(JSON.stringify({ out: outF, dropped, armVerts: pos.length / 3, armTris: idx.length / 3, bodyMat: bm?.getName() }));
