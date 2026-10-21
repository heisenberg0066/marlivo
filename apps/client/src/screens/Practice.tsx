// Practice vs 1–3 bots (§17.1), fully offline: the room host runs in a Web Worker on this device.
import { useState } from 'react';
import type { BotLevel, Settings } from '@marlivo/engine';
import { t } from '../i18n';
import { createLocalRoom } from '../game/localRoom';
import { go } from '../App';
import { BackRoom } from '../render/BackRoom';
import { Logo } from './Home';

export function Practice({ test }: { test: boolean }) {
  const [bots, setBots] = useState(test ? 1 : 2);
  const [level, setLevel] = useState<BotLevel>('normal');
  const [cards, setCards] = useState(test ? 4 : 6);
  const [target, setTarget] = useState(test ? 2 : 3);
  const [speed, setSpeed] = useState<Settings['botSpeed']>('normal');
  const [helper, setHelper] = useState<Settings['memoryHelper']>('off');
  const [tools, setTools] = useState(test);
  const start = () => {
    const code = createLocalRoom({ cardsPerPlayer: cards, targetPoints: target, botSpeed: speed, memoryHelper: helper, test: tools, maxPlayers: Math.max(2, bots + 1 + (tools ? 1 : 0)) }, Array(bots).fill(level));
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
        <label>{t('practice.level')}<div className="seg">{(['easy', 'normal', 'hard'] as const).map((l) => <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>{t('practice.' + l)}</button>)}</div></label>
        <label>{t('practice.cards')}<div className="seg">{[4, 5, 6, 7, 8].map((n) => <button key={n} className={cards === n ? 'on' : ''} onClick={() => setCards(n)}>{n}</button>)}</div></label>
        <label>{t('practice.target')}<div className="seg">{[1, 2, 3, 5, 7].map((n) => <button key={n} className={target === n ? 'on' : ''} onClick={() => setTarget(n)}>{n}</button>)}</div></label>
        <label>{t('practice.speed')}<div className="seg">{(['slow', 'normal', 'fast', 'instant'] as const).map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{t('practice.' + s)}</button>)}</div></label>
        <label>{t('practice.helper')}<div className="seg">{(['off', 'own', 'full'] as const).map((h) => <button key={h} className={helper === h ? 'on' : ''} onClick={() => setHelper(h)}>{h === 'off' ? t('common.off') : t(h === 'own' ? 'practice.helperOwn' : 'practice.helperFull')}</button>)}</div></label>
        <label className="row"><input type="checkbox" checked={tools} onChange={(e) => setTools(e.target.checked)} /> {t('practice.testTools')}</label>
        <button className="act primary wide" onClick={start}>{t('practice.go')}</button>
      </div>
    </div>
  );
}
