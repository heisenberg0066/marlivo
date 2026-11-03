// This device's outfit choice per character (kept apart from outfits.ts so the 3D/engine-side code stays free of prefs).
import { getPrefs, setPrefs } from './prefs';
import { OUTFITS, outfitOf } from './outfits';

/** This device's preferred outfit for a character (persisted with the other prefs in localStorage). */
export const myOutfit = (charId: string): string | undefined => (OUTFITS[charId] ? outfitOf(charId, getPrefs().outfits?.[charId]) : undefined);
export function setMyOutfit(charId: string, outfit: string) { setPrefs({ outfits: { ...(getPrefs().outfits ?? {}), [charId]: outfit } }); }
