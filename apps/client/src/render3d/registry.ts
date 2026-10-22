// Character registry for the 3D table. The list lives in public/assets/characters/manifest.json, so real
// figures (GLB files) can be dropped in later without code changes — see docs/ADDING-CHARACTERS.md.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Mood } from '../render/characters';

export type Placeholder = 'bear' | 'cat' | 'owl' | 'orange' | 'ammar' | 'generic';
export interface CharacterEntry {
  name?: { en?: string; fr?: string };
  /** GLB file name next to manifest.json (or an absolute URL). null = use the built-in placeholder. */
  model: string | null;
  /** Optional lighter GLB used when Settings → Graphics is Low (phones by default). */
  modelLow?: string;
  /** false = the figure stands (no chair drawn behind it). */
  chair?: boolean;
  /** Bone-driven motion style for rigged models (bones: body/armL/armR or hips/spine/head). */
  motion?: 'creature' | 'person' | 'animal';
  placeholder?: Placeholder;
  pickable?: boolean;
  /** Model height in table units after normalising (default 1.05: a seated figure whose head clears the table). */
  height?: number;
  /** Where the model's feet go (default -0.62: on the chair, below the table edge). */
  baseY?: number;
  /** 0..1: how much of the texture shows as-is regardless of lights. Textures projected from painted reference
   *  art already carry their own shading, so a little self-light keeps the colours true to the reference. */
  glow?: number;
  /** Extra turn in degrees if the model does not face +Z. */
  rotationY?: number;
  /** Animation clip names in the GLB for each mood. Missing clips fall back to a gentle procedural motion. */
  clips?: Partial<Record<Mood, string>>;
}
export interface Manifest { version: number; characters: Record<string, CharacterEntry> }

export const BUILTIN: Manifest = {
  version: 1,
  characters: {
    biscuit: { model: null, placeholder: 'bear', pickable: true },
    mint: { model: null, placeholder: 'cat', pickable: true },
    pepper: { model: null, placeholder: 'owl', pickable: true },
    tango: { model: null, placeholder: 'orange', pickable: true },
    ammar: { model: null, placeholder: 'ammar', pickable: true },
    guest: { model: null, placeholder: 'generic' },
  },
};
export const DEFAULT_CLIPS: Record<Mood, string[]> = {
  idle: ['Idle', 'idle', 'Breathing'], think: ['Think', 'think', 'Thinking'], happy: ['Celebrate', 'celebrate', 'Happy', 'Cheer'],
  sad: ['Sad', 'sad', 'Defeated'], surprised: ['Surprised', 'surprised'], away: ['Sleep', 'sleep', 'Away'],
};

const base = () => (import.meta.env?.BASE_URL ?? '/') + 'assets/characters/';
let manifestP: Promise<Manifest> | null = null;
export function loadManifest(): Promise<Manifest> {
  manifestP ??= fetch(base() + 'manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : BUILTIN))
    .then((m: Manifest) => ({ version: m.version ?? 1, characters: { ...BUILTIN.characters, ...(m.characters ?? {}) } }))
    .catch(() => BUILTIN);
  return manifestP;
}
export function entryFor(m: Manifest, id: string): CharacterEntry {
  return m.characters[id] ?? m.characters.guest ?? { model: null, placeholder: 'generic' };
}

const glbCache = new Map<string, Promise<GLTF | null>>();
/** Loads (once) and returns the GLB for an entry, or null when there is none or it fails to load. */
export function modelUrl(e: CharacterEntry, level: 'high' | 'low' = 'high'): string | null {
  const f = level === 'low' && e.modelLow ? e.modelLow : e.model;
  if (!f) return null;
  return /^(https?:)?\/\//.test(f) || f.startsWith('/') ? f : base() + f;
}
export function loadModel(e: CharacterEntry, level: 'high' | 'low' = 'high'): Promise<GLTF | null> {
  const url = modelUrl(e, level);
  if (!url) return Promise.resolve(null);
  let p = glbCache.get(url);
  if (!p) {
    p = Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')])
      .then(([{ GLTFLoader }, { MeshoptDecoder }]) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url))
      .catch((err) => { console.warn('character model failed, using placeholder', url, err); return null; });
    glbCache.set(url, p);
  }
  return p;
}

/** Scales and lifts a loaded model so it is `height` tall with its feet at `baseY`, centred on x/z. */
export function normalise(obj: THREE.Object3D, e: CharacterEntry) {
  obj.updateMatrixWorld(true);
  let skinned = false;
  obj.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh) { skinned = true; m.skeleton.update(); } });
  const box = new THREE.Box3().setFromObject(obj, skinned); // skinned (and quantised) meshes need the bone-transformed vertices
  const size = box.getSize(new THREE.Vector3());
  const h = e.height ?? 1.05;
  const s = size.y > 0 ? h / size.y : 1;
  obj.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x * s, (e.baseY ?? -0.62) - box.min.y * s, -c.z * s);
  obj.rotation.y = ((e.rotationY ?? 0) * Math.PI) / 180;
  if (e.glow) obj.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && 'emissive' in m && m.map) { m.emissiveMap = m.map; m.emissive.setScalar(e.glow!); m.roughness = Math.max(m.roughness, 0.85); m.metalness = 0; m.needsUpdate = true; }
  });
}

export function clipFor(names: string[], e: CharacterEntry, mood: Mood): string | null {
  const want = [e.clips?.[mood], ...DEFAULT_CLIPS[mood]].filter(Boolean) as string[];
  for (const w of want) if (names.includes(w)) return w;
  if (mood !== 'idle') return clipFor(names, e, 'idle');
  return names[0] ?? null;
}
