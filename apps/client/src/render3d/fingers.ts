import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Cartoon fingers for the mascot rigs (orange guy, biscuit, mint, pepper, choco, sugar; also the waiter and the
 * badminton players, which are orange-guy clones). Their GLBs end each arm in a round mitten with no fingers, so at
 * load time we measure that mitten in the curl bone's bind space and attach four 2-segment fingers plus a thumb to
 * the curl bone (they bend with the existing grip/curl animation). Livo and Ammar have modelled fingers (their hand
 * bones carry `curlSign` extras) and are skipped.
 */
export interface FingerSpec { r: number; c: THREE.Vector3; d: THREE.Vector3; x: THREE.Vector3; n: THREE.Vector3; medial: number }

const V = () => new THREE.Vector3();

function segment(a: THREE.Vector3, b: THREE.Vector3, r: number, radial: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, Math.max(1e-4, len), 3, radial);
  g.deleteAttribute('uv');
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Geometry (in curl-bone space) of four fingers + thumb growing out of a mitten of radius r centred at c. */
export function fingerGeometry(s: FingerSpec, lowDetail = false): THREE.BufferGeometry {
  const radial = lowDetail ? 6 : 10;
  const { r, c, d, x, n } = s; // d: along the arm (toward the fingertips), x: across the knuckles, n: palm normal
  const parts: THREE.BufferGeometry[] = [];
  const fr = r * 0.23;
  const lens = [1.0, 1.15, 1.1, 0.88];
  for (let j = 0; j < 4; j++) {
    const u = (j - 1.5) * r * 0.5;
    const base = c.clone().addScaledVector(d, r * 0.5).addScaledVector(x, u).addScaledVector(n, r * 0.08);
    const dir = d.clone().addScaledVector(x, (u / r) * 0.22).addScaledVector(n, 0.25).normalize();
    const L = r * lens[j]!;
    const k1 = base.clone().addScaledVector(dir, L * 0.55);
    const dir2 = dir.clone().addScaledVector(n, 0.55).normalize();
    const tip = k1.clone().addScaledVector(dir2, L * 0.42);
    const rr = j === 3 ? fr * 0.88 : fr;
    parts.push(segment(base, k1, rr, radial), segment(k1, tip, rr * 0.92, radial));
  }
  // thumb: from the medial side of the mitten, pointing forward along the arm and in toward the palm
  const tb = c.clone().addScaledVector(x, s.medial * r * 0.86).addScaledVector(n, r * 0.35).addScaledVector(d, r * 0.05);
  const tdir = d.clone().multiplyScalar(0.7).addScaledVector(x, s.medial * 0.35).addScaledVector(n, 0.5).normalize();
  const t1 = tb.clone().addScaledVector(tdir, r * 0.5);
  const tdir2 = tdir.clone().addScaledVector(x, -s.medial * 0.35).addScaledVector(n, 0.2).normalize();
  const t2 = t1.clone().addScaledVector(tdir2, r * 0.44);
  parts.push(segment(tb, t1, fr * 1.12, radial), segment(t1, t2, fr * 1.02, radial));
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  return g;
}

function sampleColor(mesh: THREE.SkinnedMesh, idx: number[]): THREE.Color | null {
  try {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const uv = mesh.geometry.getAttribute('uv');
    const img = mat?.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (!uv || !img || !img.width || typeof document === 'undefined') return mat?.color ? mat.color.clone() : null;
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d', { willReadFrequently: true }); if (!cx) return null;
    cx.drawImage(img, 0, 0);
    const flipY = mat.map!.flipY;
    const rs: number[] = [], gs: number[] = [], bs: number[] = [];
    const tx = mat.map!; tx.updateMatrix(); const t2 = new THREE.Vector2();
    for (const i of idx) {
      t2.set(uv.getX(i), uv.getY(i)).applyMatrix3(tx.matrix); // gltfpack stores quantised UVs with a texture transform
      const u = t2.x - Math.floor(t2.x), v = t2.y - Math.floor(t2.y);
      const px = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)));
      const py = Math.min(img.height - 1, Math.max(0, Math.floor((flipY ? 1 - v : v) * img.height)));
      const d = cx.getImageData(px, py, 1, 1).data; rs.push(d[0]!); gs.push(d[1]!); bs.push(d[2]!);
    }
    const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1] ?? 255;
    return new THREE.Color().setRGB(med(rs) / 255, med(gs) / 255, med(bs) / 255, THREE.SRGBColorSpace);
  } catch { return null; }
}

/** Measures the mitten at the end of each arm and attaches cartoon fingers to its curl bone. Idempotent. */
export function addCartoonFingers(scene: THREE.Object3D, lowDetail = false): number {
  let added = 0;
  scene.updateMatrixWorld(true);
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh) meshes.push(m); });
  for (const side of ['L', 'R'] as const) {
    const hand = scene.getObjectByName(`arm${side}_hand`) as THREE.Bone | undefined;
    const curl = scene.getObjectByName(`arm${side}_curl`) as THREE.Bone | undefined;
    if (!hand || !curl || hand.userData?.curlSign !== undefined || curl.getObjectByName('cartoonFingers')) continue;
    const pts: THREE.Vector3[] = []; let colorMesh: THREE.SkinnedMesh | null = null; const colorIdx: number[] = [];
    for (const m of meshes) {
      const bones = m.skeleton.bones; const ci = bones.indexOf(curl), hi = bones.indexOf(hand); if (ci < 0) continue;
      const P = m.geometry.getAttribute('position'), J = m.geometry.getAttribute('skinIndex'), W = m.geometry.getAttribute('skinWeight');
      if (!P || !J || !W) continue;
      const inv = m.skeleton.boneInverses[ci]!; const v = V();
      for (let i = 0; i < P.count; i++) {
        let best = -1, bw = 0;
        for (let k = 0; k < 4; k++) { const w = W.getComponent(i, k); if (w > bw) { bw = w; best = J.getComponent(i, k); } }
        if ((best === ci || best === hi) && bw > 0.5) {
          v.fromBufferAttribute(P, i).applyMatrix4(m.bindMatrix).applyMatrix4(inv); pts.push(v.clone());
          if (best === ci && colorIdx.length < 24) { colorMesh = m; colorIdx.push(i); }
        }
      }
    }
    if (pts.length < 8) continue;
    // mitten = the points beyond the wrist (curl side); centre + radius from their bounding box
    const d = curl.position.clone().normalize(); // hand -> curl, i.e. along the arm toward the fingertips (bones are unrotated)
    const box = new THREE.Box3().setFromPoints(pts.filter((p) => p.dot(d) > -0.6 * curl.position.length()));
    const c = box.getCenter(V()); const sz = box.getSize(V());
    const r = Math.max(1e-3, Math.min(sz.x, sz.y, sz.z) * 0.5 * 1.05);
    const across = new THREE.Vector3(1, 0, 0); across.addScaledVector(d, -across.dot(d)).normalize();
    const n = new THREE.Vector3().crossVectors(across, d).normalize(); // curl rotates about +X: fingers fold toward -Z
    if (n.z > 0) n.negate();
    const medial = side === 'R' ? -1 : 1; // thumb on the body side (R arm sits at +x)
    const geo = fingerGeometry({ r, c, d, x: across, n, medial }, lowDetail);
    const col = (colorMesh && sampleColor(colorMesh, colorIdx)) || new THREE.Color('#f3efe8');
    const sr = col.clone().convertLinearToSRGB();
    const tex = new THREE.DataTexture(new Uint8Array([Math.round(sr.r * 255), Math.round(sr.g * 255), Math.round(sr.b * 255), 255]), 1, 1);
    tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    const src = (colorMesh?.material ?? null) as THREE.MeshStandardMaterial | null;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: Math.max(0.62, src?.roughness ?? 0.7), metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat); mesh.name = 'cartoonFingers'; mesh.castShadow = true; mesh.frustumCulled = false;
    curl.add(mesh); added++;
  }
  return added;
}
