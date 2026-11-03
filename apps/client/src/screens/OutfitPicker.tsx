// Outfit picker (v0.9): shown under the character picker when the chosen character has outfits with 2+ outfits (none at the moment).
// The choice is saved on this device (prefs.outfits) and, in a room, sent with PICK_CHARACTER so every player sees it.
import { CharacterBust } from '../render/characters';
import { OUTFITS, outfitOf, hasOutfitChoice } from '../outfits';
import { getLang, t } from '../i18n';

export function OutfitPicker({ charId, value, onPick, size = 46 }: { charId: string; value?: string; onPick(outfit: string): void; size?: number }) {
  const set = OUTFITS[charId];
  if (!set || !hasOutfitChoice(charId)) return null; // hidden unless there is a real choice (Livo has one look since v0.11)
  const cur = outfitOf(charId, value);
  const lang = getLang();
  return (
    <div className="outfits" role="radiogroup" aria-label={t('outfit.title')}>
      <small className="outfits-title">{t('outfit.title')}</small>
      <div className="chars outfit-row">{set.list.map((o) => (
        <button key={o.id} role="radio" aria-checked={cur === o.id} className={`char outfit ${cur === o.id ? 'on' : ''}`} data-outfit={o.id} onClick={() => onPick(o.id)} aria-label={o.name[lang] ?? o.name.en}>
          <CharacterBust id={charId} outfit={o.id} size={size} mood={cur === o.id ? 'happy' : 'idle'} /><small>{o.name[lang] ?? o.name.en}</small>
        </button>))}</div>
    </div>
  );
}
