// Character outfits (v0.9): one character id can come in several looks. The seat carries `outfit` (synced by the room
// host like characterId); the 3D layer renders the figure key `${id}@${outfit}` whose manifest entry is the base entry
// merged with `outfits[outfit]` (see render3d/registry.ts). Per-figure tables (EYE_SPEC, BODY_SPECS, FP_PALETTE, ...)
// are looked up by that key first, then by the plain id.

export interface OutfitDef {
  id: string;
  name: { en: string; fr: string };
  /** Idle/rest arms: 'pockets' = hands in the jacket/coat pockets, 'sides' = hanging at her sides. */
  rest?: 'pockets' | 'sides';
}
export interface OutfitSet { list: OutfitDef[]; def: string; hidden?: OutfitDef[] }

// v0.11: Livo's adult outfits (streetwear/sporty/denim/stockholm, v0.9-v0.10) were dropped; their GLBs/portraits/specs
// are archived in tools/character-pipeline/livo/outfits/archive and on the git branch livo-adult-outfits. The chibi
// beanie build (417eb6d) is Livo's only look again. A character with a single outfit renders under its plain id
// (figKey -> 'livo'), so every per-figure table uses the original 'livo' tuning, and no picker is shown.
export const OUTFITS: Record<string, OutfitSet> = {
  livo: { def: 'beanie', list: [{ id: 'beanie', name: { en: 'Livo', fr: 'Livo' } }] },
};

const all = (id: string) => [...(OUTFITS[id]?.list ?? []), ...(OUTFITS[id]?.hidden ?? [])];
/** The outfit to show for a character: a known requested outfit, else the character's default (undefined = no outfits). */
export function outfitOf(charId: string, outfit?: string | null): string | undefined {
  const set = OUTFITS[charId]; if (!set) return undefined;
  return outfit && all(charId).some((o) => o.id === outfit) ? outfit : set.def;
}
export const outfitDef = (charId: string, outfit?: string | null): OutfitDef | undefined => { const o = outfitOf(charId, outfit); return all(charId).find((x) => x.id === o); };
/** True when a character offers 2+ outfits (only then is the outfit picker shown). */
export const hasOutfitChoice = (charId: string) => (OUTFITS[charId]?.list.length ?? 0) >= 2;
/** Figure key for the 3D/2D renderers: 'livo@denim', or the plain id for characters without an outfit choice. */
export function figKey(charId: string, outfit?: string | null): string {
  const o = outfitOf(charId, outfit);
  return o && hasOutfitChoice(charId) ? `${charId}@${o}` : charId;
}
export function splitKey(key: string): [string, string | undefined] {
  const i = key.indexOf('@');
  return i < 0 ? [key, undefined] : [key.slice(0, i), key.slice(i + 1)];
}
/** Looks a per-figure table up by figure key, then by the plain character id. */
export function byKey<T>(table: Record<string, T>, key: string | undefined): T | undefined {
  if (!key) return undefined;
  return table[key] ?? table[splitKey(key)[0]];
}
