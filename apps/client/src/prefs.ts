// Personal settings (§12.2), stored on this device.
import { useSyncExternalStore } from 'react';
export interface Prefs {
  name: string; characterId: string; sound: boolean; ambience: boolean; volume: number;
  speed: 'cinematic' | 'normal' | 'fast'; reduced: boolean; camera: 'seat' | 'top'; confirmSwap: boolean; slotNumbers: boolean;
  fourColor: boolean; largeCards: boolean; renderer: '2d' | '3d'; layout: string; leftHanded: boolean; serverUrl: string; ownerKey: string; friendsKey: string;
}
const reducedOS = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const defaults: Prefs = {
  name: '', characterId: 'biscuit', sound: true, ambience: false, volume: 0.7, speed: 'normal', reduced: reducedOS, camera: 'seat',
  confirmSwap: true, slotNumbers: true, fourColor: false, largeCards: false, renderer: '2d', layout: 'r2', leftHanded: false, serverUrl: '', ownerKey: '', friendsKey: '',
};
let prefs: Prefs = { ...defaults, ...JSON.parse(localStorage.getItem('marlivo.prefs') || '{}') };
const subs = new Set<() => void>();
export const getPrefs = () => prefs;
export function setPrefs(p: Partial<Prefs>) { prefs = { ...prefs, ...p }; localStorage.setItem('marlivo.prefs', JSON.stringify(prefs)); subs.forEach((f) => f()); }
export function usePrefs(): Prefs { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => prefs); }
/** Animation time scale (§16): Cinematic ×1.3, Normal ×1.0, Fast ×0.6. Reduced motion shortens further. */
export const speedScale = () => (prefs.reduced ? 0.35 : prefs.speed === 'cinematic' ? 1.3 : prefs.speed === 'fast' ? 0.6 : 1);
declare const __SERVER_URL__: string;
/** The online server: build-time (GitHub repo variable MARLIVO_SERVER_URL) or set by hand in Settings. */
export const serverUrl = () => (prefs.serverUrl || __SERVER_URL__ || '').replace(/\/+$/, '');
