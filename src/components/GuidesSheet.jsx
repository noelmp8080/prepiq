import { useState } from 'react'
import Sheet from './Sheet'
import { GUIDES } from '../data/guides'

/* ── Meal prep guides ─────────────────────────────────────────────────
 *
 * The Meal Prep Cookbook's four sections that are not recipes: tips,
 * storage and reheating, the batch-cooking intro, and the master grocery
 * list. Opened from a card on the Recipes screen (no sixth tab) and from
 * every batch-protein recipe, which opens it on the storage guide.
 *
 * Each guide folds open and shut, and more than one can be open at once.
 * All text is the book's — see src/data/guides.js.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }

const H = {
  ...MONO, fontSize: 'var(--pq-size-label)', fontWeight: 600,
  color: 'var(--pq-text-3)', letterSpacing: 'var(--pq-track-section)',
  textTransform: 'uppercase', margin: '16px 0 6px',
}

const P = {
  margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.55, color: 'var(--pq-text-2)',
}

function Dots({ items }) {
  return (
    <ul style={{ listStyle: 'none', margin: '0 0 6px', padding: 0 }}>
      {items.map((t, i) => (
        <li key={i} style={{ ...P, margin: 0, padding: '5px 0 5px 14px', position: 'relative' }}>
          <span aria-hidden="true" style={{
            position: 'absolute', left: 0, top: 13, width: 5, height: 5,
            borderRadius: '50%', background: 'var(--pq-accent)',
          }} />
          {t}
        </li>
      ))}
    </ul>
  )
}

function Block({ b }) {
  if (b.facts) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {b.facts.map(f => (
          <div key={f.l} style={{
            background: 'var(--pq-page)', border: 'var(--pq-card-border)',
            borderRadius: 14, padding: 12,
          }}>
            <div style={{ ...MONO, fontSize: 19, fontWeight: 600, color: 'var(--pq-accent)' }}>{f.v}</div>
            <div style={{ ...MONO, fontSize: 10, color: 'var(--pq-text-3)', letterSpacing: 'var(--pq-track-label)', marginTop: 4 }}>{f.l}</div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <>
      {b.h && <div style={H}>{b.h}</div>}
      {b.note && <p style={P}>{b.note}</p>}
      {b.p && <p style={P}>{b.p}</p>}
      {b.items && <Dots items={b.items} />}
      {b.groups && b.groups.map(g => (
        <div key={g.name}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--pq-text)', margin: '8px 0 2px' }}>{g.name}</div>
          <Dots items={g.items} />
        </div>
      ))}
      {b.methods && (
        <div style={{ borderTop: '1px solid var(--pq-rule-row)' }}>
          {b.methods.map(m => (
            <div key={m.name} data-method style={{ padding: '9px 0', borderBottom: '1px solid var(--pq-rule-meal)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--pq-text)' }}>{m.name}</span>
                {m.heat && (
                  <span style={{ ...MONO, fontSize: 12, color: 'var(--pq-text-2)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {m.heat}
                  </span>
                )}
              </div>
              {m.items.map((t, i) => (
                <div key={i} style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--pq-text-2)', marginTop: 3 }}>{t}</div>
              ))}
            </div>
          ))}
        </div>
      )}
      {b.tips && b.tips.map(t => (
        <div key={t.title} data-tip style={{ padding: '10px 0', borderBottom: '1px solid var(--pq-rule-meal)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--pq-text)', marginBottom: 4 }}>{t.title}</div>
          {t.text && <p style={{ ...P, margin: 0 }}>{t.text}</p>}
          {t.items && <div style={{ marginTop: 4 }}><Dots items={t.items} /></div>}
          {t.after && <p style={{ ...P, margin: '4px 0 0' }}>{t.after}</p>}
        </div>
      ))}
    </>
  )
}

export default function GuidesSheet({ onClose, initial = null }) {
  const [open, setOpen] = useState(() => new Set(initial ? [initial] : []))
  const toggle = id => setOpen(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  return (
    <Sheet open onClose={onClose} title="Meal prep guides">
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px var(--pq-gutter) 12px',
        borderBottom: '1px solid var(--pq-rule-cell)',
      }}>
        <span aria-hidden="true" style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: 'var(--pq-accent-grad)', color: 'var(--pq-on-accent-ink)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
          </svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 'var(--pq-size-sheet)', fontWeight: 700, color: 'var(--pq-text)',
            letterSpacing: '-.01em', lineHeight: 1.25,
          }}>Meal prep guides</div>
          <div style={{
            ...MONO, fontSize: 'var(--pq-size-eyebrow)', color: 'var(--pq-text-muted)',
            marginTop: 4, letterSpacing: 'var(--pq-track-chip)',
          }}>FROM THE MEAL PREP COOKBOOK</div>
        </div>
        <button onClick={onClose} aria-label="Close" style={{
          width: 'var(--pq-tap-min)', height: 'var(--pq-tap-min)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        }}>
          <span style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--pq-thumb-fallback)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--pq-text-muted)"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </span>
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', paddingBottom: 16 }}>
        {GUIDES.map(g => {
          const isOpen = open.has(g.id)
          return (
            <section key={g.id} data-guide={g.id} style={{ borderBottom: '1px solid var(--pq-rule-cell)' }}>
              <button
                onClick={() => toggle(g.id)}
                aria-expanded={isOpen}
                style={{
                  width: '100%', minHeight: 64, display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px var(--pq-gutter)', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--pq-sans)',
                }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--pq-text)' }}>{g.title}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--pq-text-3)', marginTop: 2 }}>
                    {g.sub} · {g.pages}
                  </span>
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                  stroke="var(--pq-text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform var(--pq-t-paint)' }}>
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
              {isOpen && (
                <div style={{ padding: '0 var(--pq-gutter) 16px' }}>
                  {g.blocks.map((b, i) => <Block key={i} b={b} />)}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </Sheet>
  )
}
