// How to play: every rule in plain words, with the friends scene (pumpkins, badminton, flags).
import { useLang } from '../i18n';
import { t } from '../i18n';
import { go } from '../App';
import { FriendsScene } from '../render/characters';
import { HOWTO } from './howtoText';
import { Logo } from './Home';

const frPunct = (s: string, lang: string) => (lang === 'fr' ? s.replace(/ ([:;!?»])/g, '\u202F$1').replace(/« /g, '«\u202F') : s);

export function HowTo() {
  const lang = useLang();
  const h = HOWTO[lang];
  return (
    <div className="screen howto">
      <div className="howto-inner">
        <div className="lobby-head"><button className="icon" onClick={() => go('/')}>←</button><Logo small /></div>
        <h2>{t('howto.title')}</h2>
        <div className="home-footer howto-scene"><FriendsScene /></div>
        <p className="intro">{frPunct(h.intro, lang)}</p>
        {h.sections.map((s, i) => (
          <section key={i}><h3><span className="sec-n">{i + 1}</span>{frPunct(s.h, lang)}</h3><ul>{s.p.map((x, k) => <li key={k}>{frPunct(x, lang)}</li>)}</ul></section>
        ))}
        <button className="act primary wide" onClick={() => go('/practice')}>{t('home.practice')}</button>
      </div>
    </div>
  );
}
