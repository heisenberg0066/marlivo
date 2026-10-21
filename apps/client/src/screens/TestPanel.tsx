// Test-room tools (§17.3): reveal all, presets, force deck/dice, set a card, step mode, inspector, latency, drop,
// bot autoplay ×100, export replay. Only shown in rooms created as Test rooms (server-enforced too).
import { useState } from 'react';
import { PRESETS, type PlayerView } from '@marlivo/engine';
import { simulateMatch } from '@marlivo/room';
import type { Session } from '../game/session';
import { t } from '../i18n';

export function TestPanel({ session, view }: { session: Session; view: PlayerView }) {
  const act = session.intent.bind(session);
  const [preset, setPreset] = useState(PRESETS[0]!.id);
  const [deck, setDeck] = useState('');
  const [dice, setDice] = useState('');
  const [slot, setSlot] = useState('');
  const [card, setCard] = useState('');
  const [lat, setLat] = useState(session.conn.latency);
  const [auto, setAuto] = useState<string>('');
  const [showInsp, setShowInsp] = useState(false);
  const info = session.testInfo;
  const runAuto = async () => {
    setAuto('…');
    let ok = 0, fails = 0, rounds = 0; const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      try { const r = simulateMatch('auto-' + Date.now() + '-' + i, { invariants: true }); ok++; rounds += r.rounds; } catch (e) { fails++; console.error(e); }
      if (i % 10 === 9) { setAuto(`${i + 1}/100…`); await new Promise((r) => setTimeout(r, 0)); }
    }
    setAuto(`✓ ${ok} ok, ${fails} failed, ${rounds} rounds, ${Math.round(performance.now() - t0)} ms`);
  };
  return (
    <div className="test-panel">
      <h3>🧪 {t('test.title')}</h3>
      <label className="row"><input type="checkbox" checked={!!view.test?.reveal} onChange={(e) => act({ t: 'TEST_REVEAL', on: e.target.checked })} /> {t('test.reveal')}</label>
      <h4>{t('test.presets')}</h4>
      <div className="row-btns"><select value={preset} onChange={(e) => setPreset(e.target.value)}>{PRESETS.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}</select>
        <button onClick={() => act({ t: 'TEST_PRESET', id: preset })}>{t('test.apply')}</button></div>
      <p className="muted small">{PRESETS.find((p) => p.id === preset)?.hint}{view.test?.preset ? ` · ⏳ ${view.test.preset}` : ''}</p>
      <h4>{t('test.forceDeck')}</h4>
      <div className="row-btns"><input placeholder="QS 4C 7H …" value={deck} onChange={(e) => setDeck(e.target.value)} /><button onClick={() => act({ t: 'TEST_FORCE_DECK', cards: deck.trim().split(/[\s,]+/).filter(Boolean) })}>{t('test.apply')}</button></div>
      <div className="row-btns"><button onClick={() => act({ t: 'TEST_SET_DECK_TOP', cards: deck.trim().split(/[\s,]+/).filter(Boolean) })}>Deck top now</button></div>
      <h4>{t('test.forceDice')}</h4>
      <div className="row-btns"><input placeholder="6 2 3" value={dice} onChange={(e) => setDice(e.target.value)} /><button onClick={() => act({ t: 'TEST_FORCE_DICE', values: dice.trim().split(/[\s,]+/).map(Number).filter((n) => n >= 1 && n <= 6) })}>{t('test.apply')}</button></div>
      <h4>{t('test.setSlot')}</h4>
      <div className="row-btns"><input placeholder="S1-03" value={slot} onChange={(e) => setSlot(e.target.value)} /><input placeholder="QS" value={card} onChange={(e) => setCard(e.target.value)} /><button onClick={() => act({ t: 'TEST_SET_SLOT', slot: slot.trim(), card: card.trim() })}>{t('test.apply')}</button></div>
      <h4>{t('test.step')}</h4>
      <div className="row-btns">
        <label className="row"><input type="checkbox" checked={!!info?.stepMode} onChange={(e) => session.send({ type: 'TEST', op: 'STEP_MODE', on: e.target.checked })} /> {t('test.step')}</label>
        <button disabled={!info?.stepMode} onClick={() => session.send({ type: 'TEST', op: 'STEP' })}>{t('test.next')} ({info?.pendingBots ?? 0})</button>
      </div>
      <h4>{t('test.latency')}: {lat}</h4>
      <input type="range" min={0} max={2000} step={50} value={lat} onChange={(e) => { session.conn.latency = Number(e.target.value); setLat(Number(e.target.value)); }} />
      <div className="row-btns">
        <button onClick={() => session.conn.drop()}>{t('test.drop')}</button>
        <button onClick={runAuto}>{t('test.autoplay')}</button>
        <button onClick={() => session.send({ type: 'TEST', op: 'EXPORT' })}>{t('test.export')}</button>
      </div>
      {auto && <p className="small">{auto}</p>}
      <button onClick={() => setShowInsp(!showInsp)}>{t('test.inspector')} ({session.inspector.length})</button>
      {showInsp && <pre className="inspector">{session.inspector.slice(-40).reverse().map((x) => `${x.dir === 'in' ? '⬇' : '⬆'} ${new Date(x.at).toLocaleTimeString()} ${JSON.stringify(x.msg).slice(0, 300)}`).join('\n')}</pre>}
    </div>
  );
}
