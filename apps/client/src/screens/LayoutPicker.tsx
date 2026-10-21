// Starting card layout picker (v0.7): each player chooses how their cards are laid out (single line, 2 rows,
// 3 rows…) before the match, with a mini preview of the grid. Locked once play starts.
import { layoutOptions, rowLengths, validLayout } from '@marlivo/engine';
import { t } from '../i18n';

export function LayoutPreview({ n, id, size = 12 }: { n: number; id: string; size?: number }) {
  const rows = rowLengths(n, Number(id.slice(1)));
  return (
    <span className="lp-grid" aria-hidden>
      {rows.map((len, r) => <span key={r} className="lp-row">{Array.from({ length: len }, (_, i) => <span key={i} className="lp-card" style={{ width: size, height: size * 1.4 }} />)}</span>)}
    </span>
  );
}

export function layoutName(n: number, id: string) {
  const k = Number(id.slice(1));
  if (k === 1) return t('layout.line', { n });
  const rows = rowLengths(n, k);
  return rows.every((x) => x === rows[0]) ? t('layout.rowsOf', { k, m: rows[0]! }) : t('layout.rows', { k, list: rows.join(' + ') });
}

export function LayoutPicker({ n, value, onPick, locked }: { n: number; value: string | undefined; onPick(id: string): void; locked?: boolean }) {
  const cur = validLayout(n, value);
  return (
    <div className="layout-picker" role="radiogroup" aria-label={t('layout.title')}>
      <div className="lp-head"><b>🂠 {t('layout.title')}</b><small className="muted">{locked ? t('layout.locked') : t('layout.hint')}</small></div>
      <div className="lp-opts">
        {layoutOptions(n).map((id) => (
          <button key={id} role="radio" aria-checked={cur === id} data-layout={id} className={`lp-opt ${cur === id ? 'on' : ''}`} disabled={locked} onClick={() => onPick(id)}>
            <LayoutPreview n={n} id={id} />
            <small>{layoutName(n, id)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
