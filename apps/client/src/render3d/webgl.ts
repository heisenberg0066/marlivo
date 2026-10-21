// Tiny, three-free check so the 2D app can decide about 3D without downloading three.js.
let cached: boolean | null = null;
let failed = false;
export function webglAvailable(): boolean {
  if (cached !== null) return cached;
  try { const c = document.createElement('canvas'); cached = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { cached = false; }
  return cached;
}
/** Set when 3D failed at runtime (context lost, shader error…); 2D is used for the rest of the session. */
export const mark3dFailed = () => { failed = true; };
export const has3dFailed = () => failed;
