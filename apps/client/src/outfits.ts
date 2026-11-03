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

// Labels shown to players are Livo 1-4 (1 streetwear, 2 sporty, 3 denim, 4 stockholm); the ids stay.
export const OUTFITS: Record<string, OutfitSet> = {
  livo: {
    def: 'streetwear',
    list: [
      { id: 'streetwear', name: { en: 'Livo 1', fr: 'Livo 1' }, rest: 'sides' },
      { id: 'sporty', name: { en: 'Livo 2', fr: 'Livo 2' }, rest: 'pockets' },
      { id: 'denim', name: { en: 'Livo 3', fr: 'Livo 3' }, rest: 'pockets' },
      { id: 'stockholm', name: { en: 'Livo 4', fr: 'Livo 4' }, rest: 'pockets' },
    ],
    // The chibi beanie build (417eb6d). Not offered; move it into `list` to make it a 5th choice.
    hidden: [{ id: 'beanie', name: { en: 'Beanie', fr: 'Bonnet' } }],
  },
};

const all = (id: string) => [...(OUTFITS[id]?.list ?? []), ...(OUTFITS[id]?.hidden ?? [])];
/** The outfit to show for a character: a known requested outfit, else the character's default (undefined = no outfits). */
export function outfitOf(charId: string, outfit?: string | null): string | undefined {
  const set = OUTFITS[charId]; if (!set) return undefined;
  return outfit && all(charId).some((o) => o.id === outfit) ? outfit : set.def;
}
export const outfitDef = (charId: string, outfit?: string | null): OutfitDef | undefined => { const o = outfitOf(charId, outfit); return all(charId).find((x) => x.id === o); };
/** Figure key for the 3D/2D renderers: 'livo@denim', or the plain id for characters without outfits. */
export function figKey(charId: string, outfit?: string | null): string {
  const o = outfitOf(charId, outfit);
  return o ? `${charId}@${o}` : charId;
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
