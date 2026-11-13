import { createPortal } from 'react-dom'
import Sheet, { SheetHeader } from './Sheet'
import { guides } from '../data/recipeExtras'

/* ── Meal prep guides ─────────────────────────────────────────────────
 *
 * The non-recipe pages of the Meal Prep Cookbook, opened from a card at
 * the top of Recipes or from a batch recipe's storage link. Each guide
 * is a section that opens and closes; `initial` names the one that
 * starts open.
 *
 * PORTALLED. Opened from inside the recipe sheet, whose panel animates
 * with a transform — and a transformed ancestor becomes the containing
 * block for `position: fixed`. Rendered to <body> it covers the screen
 * the way every other sheet does.
 */

const MONO_LABEL = {
  fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-label)', fontWeight: 600,
  color: 'var(--pq-text-3)', letterSpacing: 'var(--pq-track-section)',
}

function Guide({ guide, open }) {
  return (
    <details data-guide={guide.id} open={open} style={{ borderBottom: '1px solid var(--pq-rule-cell)' }}>
      <summary style={{
        listStyle: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px var(--pq-gutter)', minHeight: 'var(--pq-tap-min)',
      }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--pq-text)' }}>
            {guide.title}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--pq-text-3)', marginTop: 2 }}>
            {guide.subtitle}
          </span>
        </span>
        <svg className="pq-guide-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
          stroke="var(--pq-text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </summary>

      <div style={{ padding: '0 var(--pq-gutter) 18px' }}>
        {guide.facts && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
            {guide.facts.map(f => (
              <div key={f.label} style={{
                background: 'var(--pq-panel)', border: '1px solid var(--pq-rule-soft)',
                borderRadius: 14, padding: 12,
              }}>
                <div style={{
                  fontFamily: 'var(--pq-mono)', fontSize: 19, fontWeight: 600, color: 'var(--pq-accent)',
                }}>{f.value}</div>
                <div style={{ ...MONO_LABEL, marginTop: 4 }}>{f.label}</div>
              </div>
            ))}
          </div>
        )}

        {(guide.lists || []).map((l, i) => (
          <div key={l.title || i}>
            {l.title && <div style={{ ...MONO_LABEL, margin: '14px 0 6px' }}>{l.title}</div>}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {l.items.map(t => (
                <li key={t} style={{
                  display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0',
                  fontSize: 'var(--pq-size-body)', color: 'var(--pq-text-2)', lineHeight: 1.5,
                }}>
                  <span aria-hidden="true" style={{
                    width: 5, height: 5, borderRadius: '50%', background: 'var(--pq-accent)',
                    flexShrink: 0, position: 'relative', top: -2,
                  }} />
                  <span style={{ flex: 1 }}>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {(guide.tables || []).map(t => (
          <div key={t.title}>
            <div style={{ ...MONO_LABEL, margin: '14px 0 6px' }}>{t.title}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['METHOD', 'HEAT', 'TIME'].map(h => (
                    <th key={h} style={{
                      ...MONO_LABEL, textAlign: 'left', padding: '6px 0',
                      borderBottom: '1px solid var(--pq-rule-cell)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map(r => (
                  <tr key={r.method}>
                    <td style={{
                      padding: '9px 8px 9px 0', borderBottom: '1px solid var(--pq-rule-meal)',
                      fontWeight: 600, color: 'var(--pq-text)', verticalAlign: 'top',
                    }}>
                      {r.method}
                      {r.best && <span style={{ fontWeight: 500, color: 'var(--pq-accent)' }}> · best</span>}
                    </td>
                    <td style={{
                      padding: '9px 8px 9px 0', borderBottom: '1px solid var(--pq-rule-meal)',
                      color: 'var(--pq-text-2)', fontFamily: 'var(--pq-mono)', fontSize: 12,
                      whiteSpace: 'nowrap', verticalAlign: 'top',
                    }}>{r.heat}</td>
                    <td style={{
                      padding: '9px 0', borderBottom: '1px solid var(--pq-rule-meal)',
                      color: 'var(--pq-text-2)', lineHeight: 1.4, verticalAlign: 'top',
                    }}>{r.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </details>
  )
}

export default function GuidesSheet({ onClose, initial = 'storage' }) {
  return createPortal(
    <Sheet open onClose={onClose} title="Meal prep guides">
      <style>{`
        [data-guide] summary::-webkit-details-marker { display: none }
        [data-guide] .pq-guide-chev { transition: transform .15s }
        [data-guide][open] .pq-guide-chev { transform: rotate(90deg) }
      `}</style>
      <SheetHeader onClose={onClose}>
        <div style={{ fontSize: 'var(--pq-size-sheet)', fontWeight: 700, color: 'var(--pq-text)' }}>
          Meal prep guides
        </div>
        <div style={{
          fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-eyebrow)',
          color: 'var(--pq-text-muted)', marginTop: 4, letterSpacing: 'var(--pq-track-chip)',
        }}>FROM THE MEAL PREP COOKBOOK</div>
      </SheetHeader>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', paddingBottom: 12 }}>
        {guides.map(g => <Guide key={g.id} guide={g} open={g.id === initial} />)}
      </div>
    </Sheet>,
    document.body,
  )
}
