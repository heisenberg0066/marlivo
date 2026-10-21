// Personal settings (§12.2), stored on this device only.
import { t, useLang, setLang } from '../i18n';
import { usePrefs, setPrefs, type Prefs } from '../prefs';
import { go } from '../App';
import { BackRoom } from '../render/BackRoom';
import { syncAmbience } from '../render/sound';

export function SettingsScreen() {
  const p = usePrefs();
  const lang = useLang();
  const tog = (k: keyof Prefs, label: string) => <label className="row"><input type="checkbox" checked={!!p[k]} onChange={(e) => { setPrefs({ [k]: e.target.checked } as Partial<Prefs>); syncAmbience(); }} /> {t(label)}</label>;
  return (
    <div className="screen form-screen"><BackRoom dim />
      <div className="panel form">
        <div className="lobby-head"><button className="icon" onClick={() => history.length > 1 ? history.back() : go('/')}>←</button><h2>{t('settings.title')}</h2></div>
        <label>{t('settings.language')}<div className="seg">{(['en', 'fr'] as const).map((l) => <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>{l === 'en' ? 'English' : 'Français'}</button>)}</div></label>
        <label>{t('settings.name')}<input value={p.name} maxLength={16} onChange={(e) => setPrefs({ name: e.target.value })} /></label>
        {tog('sound', 'settings.sound')}
        {tog('ambience', 'settings.ambience')}
        <label>{t('settings.volume')}<input type="range" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => setPrefs({ volume: Number(e.target.value) })} /></label>
        <label>{t('settings.speed')}<div className="seg">{(['cinematic', 'normal', 'fast'] as const).map((s) => <button key={s} className={p.speed === s ? 'on' : ''} onClick={() => setPrefs({ speed: s })}>{t('settings.' + s)}</button>)}</div></label>
        {tog('reduced', 'settings.reduced')}
        <label>{t('settings.camera')}<div className="seg">{(['seat', 'top'] as const).map((s) => <button key={s} className={p.camera === s ? 'on' : ''} onClick={() => setPrefs({ camera: s })}>{t('settings.' + s)}</button>)}</div></label>
        {tog('confirmSwap', 'settings.confirmSwap')}
        {tog('slotNumbers', 'settings.slotNumbers')}
        {tog('fourColor', 'settings.fourColor')}
        {tog('largeCards', 'settings.largeCards')}
        {tog('leftHanded', 'settings.leftHanded')}
        <details><summary>{t('settings.server')}</summary>
          <input placeholder="https://marlivo.<you>.workers.dev" value={p.serverUrl} onChange={(e) => setPrefs({ serverUrl: e.target.value.trim() })} />
          <p className="muted small">{t('settings.serverHint')}</p>
          <label>{t('settings.ownerKey')}<input type="password" value={p.ownerKey} onChange={(e) => setPrefs({ ownerKey: e.target.value })} /></label>
        </details>
        <p className="muted small">MarLivo · build {__BUILD__}</p>
      </div>
    </div>
  );
}
declare const __BUILD__: string;
