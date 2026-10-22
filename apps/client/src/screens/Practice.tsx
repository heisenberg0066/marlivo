// Practice vs 1–3 bots (§17.1), fully offline: the room host runs in a Web Worker on this device.
import { useState } from 'react';
import type { BotLevel, Settings } from '@marlivo/engine';
import { t } from '../i18n';
import { createLocalRoom } from '../game/localRoom';
import { go } from '../App';
import { BackRoom } from '../render/BackRoom';
import { Logo } from './Home';
import { LayoutPicker } from './LayoutPicker';
import { usePrefs, setPrefs } from '../prefs';
import { CharacterBust, CHARACTER_IDS } from '../render/characters';

/** Default opponents: Orange guy and Ammar first (Ammar's own figures), never the player's own character. */
export function defaultOpponents(mine: string): string[] {
  return ['tango', 'ammar', 'mint', 'pepper', 'biscuit'].filter((c) => c !== mine);
}

export function Practice({ test }: { test: boolean }) {
  const [bots, setBots] = useState(test ? 1 : 2);
  const [level, setLevel] = useState<BotLevel>('normal');
  const [cards, setCards] = useState(test ? 4 : 6);
  const [target, setTarget] = useState(test ? 2 : 3);
  const [speed, setSpeed] = useState<Settings['botSpeed']>('normal');
  const [helper, setHelper] = useState<Settings['memoryHelper']>('off');
  const [tools, setTools] = useState(test);
  const prefs = usePrefs();
  const [opp, setOpp] = useState<string[]>(() => defaultOpponents(prefs.characterId).slice(0, 3));
  const pickOpp = (i: number, c: string) => setOpp((o) => o.map((x, k) => (k === i ? c : x)));
  const start = () => {
    const code = createLocalRoom({ cardsPerPlayer: cards, targetPoints: target, botSpeed: speed, memoryHelper: helper, test: tools, maxPlayers: Math.max(2, bots + 1 + (tools ? 1 : 0)) }, opp.slice(0, bots).map((c) => ({ level, characterId: c, name: t('char.' + c) })));
    go('/play/' + code);
  };
  return (
    <div className="screen form-screen">
      <BackRoom dim />
      <div className="panel form">
        <div className="lobby-head"><button className="icon" onClick={() => go('/')}>←</button><Logo small /></div>
        <h2>{tools ? t('home.test') : t('practice.title')}</h2>
        <p className="muted">{t('practice.offline')}</p>
        <label>{t('practice.bots')}<div className="seg">{[1, 2, 3].map((n) => <button key={n} className={bots === n ? 'on' : ''} onClick={() => setBots(n)}>{n}</button>)}</div></label>
        <label>{t('practice.youAre')}<div className="chars mini">{CHARACTER_IDS.map((c) => (
          <button key={c} className={`char ${prefs.characterId === c ? 'on' : ''}`} onClick={() => setPrefs({ characterId: c })} aria-label={t('char.' + c)}>
            <CharacterBust id={c} size={34} mood={prefs.characterId === c ? 'happy' : 'idle'} /><small>{t('char.' + c)}</small></button>))}</div></label>
        <label>{t('practice.opponents')}{opp.slice(0, bots).map((sel, i) => (
          <div key={i} className="opp-row" data-opp={i}><b>{i + 1}</b><div className="chars mini">{CHARACTER_IDS.map((c) => (
            <button key={c} className={`char ${sel === c ? 'on' : ''}`} onClick={() => pickOpp(i, c)} aria-label={t('char.' + c)} data-char={c}>
              <CharacterBust id={c} size={28} mood={sel === c ? 'happy' : 'idle'} /><small>{t('char.' + c)}</small></button>))}</div></div>))}</label>
        <label>{t('practice.level')}<div className="seg">{(['easy', 'normal', 'hard'] as const).map((l) => <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>{t('practice.' + l)}</button>)}</div></label>
        <label>{t('practice.cards')}<div className="seg">{[4, 5, 6, 7, 8].map((n) => <button key={n} className={cards === n ? 'on' : ''} onClick={() => setCards(n)}>{n}</button>)}</div></label>
        <LayoutPicker n={cards} value={prefs.layout} onPick={(id) => setPrefs({ layout: id })} />
        <label>{t('practice.target')}<div className="seg">{[1, 2, 3, 5, 7].map((n) => <button key={n} className={target === n ? 'on' : ''} onClick={() => setTarget(n)}>{n}</button>)}</div></label>
        <label>{t('practice.speed')}<div className="seg">{(['slow', 'normal', 'fast', 'instant'] as const).map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{t('practice.' + s)}</button>)}</div></label>
        <label>{t('practice.helper')}<div className="seg">{(['off', 'own', 'full'] as const).map((h) => <button key={h} className={helper === h ? 'on' : ''} onClick={() => setHelper(h)}>{h === 'off' ? t('common.off') : t(h === 'own' ? 'practice.helperOwn' : 'practice.helperFull')}</button>)}</div></label>
        <label className="row"><input type="checkbox" checked={tools} onChange={(e) => setTools(e.target.checked)} /> {t('practice.testTools')}</label>
        <button className="act primary wide" onClick={start}>{t('practice.go')}</button>
      </div>
    </div>
  );
}
