// Tiny i18n (EN + FR). All strings live in i18n/{en,fr}.json so Ammar can edit them. French plurals: 0 and 1 are "one".
import en from './en.json';
import fr from './fr.json';
import { useSyncExternalStore } from 'react';
export type Lang = 'en' | 'fr';
const dicts: Record<Lang, Record<string, string>> = { en, fr };
let lang: Lang = (localStorage.getItem('marlivo.lang') as Lang) || (navigator.language?.startsWith('fr') ? 'fr' : 'en');
const subs = new Set<() => void>();
export const getLang = () => lang;
export function setLang(l: Lang) { lang = l; localStorage.setItem('marlivo.lang', l); document.documentElement.lang = l; subs.forEach((f) => f()); }
document.documentElement.lang = lang;
export function t(key: string, vars: Record<string, string | number> = {}): string {
  let k = key;
  if (typeof vars.count === 'number') {
    const one = lang === 'fr' ? vars.count <= 1 : vars.count === 1;
    const pk = `${key}_${one ? 'one' : 'other'}`;
    if (dicts[lang][pk] ?? dicts.en[pk]) k = pk;
  }
  const s = dicts[lang][k] ?? dicts.en[k] ?? key;
  return s.replace(/\{\{(\w+)\}\}/g, (_, v) => String(vars[v] ?? ''));
}
export function useLang(): Lang { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => lang); }
