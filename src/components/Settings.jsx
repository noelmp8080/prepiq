import { useState, useEffect } from 'react'
import Sheet from './Sheet'
import { useAppStore } from '../store/useAppStore'
import { useTheme } from '../store/useTheme'
import { cloudEnabled } from '../firebase'

/* ── Settings — a bottom sheet, not a tab ─────────────────────────────
 *
 * It slides over whatever screen you were on, so nothing is lost behind
 * it and there is no sixth destination in a nav built for five.
 *
 * The prototype also carries a PRESETS row — three buttons, each setting
 * a whole macro target at once. It is not built here: the placeholders
 * carry no values, so shipping it would mean choosing four numbers per
 * preset and presenting them as nutrition guidance. That is a product
 * decision with a health dimension, not a layout gap. Everything else on
 * this sheet is built.
 */

const FIELDS = [
  { key: 'calories', label: 'Calories', unit: 'KCAL PER DAY', max: 10000 },
  { key: 'protein',  label: 'Protein',  unit: 'GRAMS PER DAY', max: 1000 },
  { key: 'carbs',    label: 'Carbs',    unit: 'GRAMS PER DAY', max: 1000 },
  { key: 'fat',      label: 'Fat',      unit: 'GRAMS PER DAY', max: 1000 },
]

const MONO_SECTION = {
  fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-label)',
  fontWeight: 600, color: 'var(--pq-text-3)',
  letterSpacing: 'var(--pq-track-section)',
}

/* ── The toggle ───────────────────────────────────────────────────────
 *
 * Track is the inset well — the same recessed surface as the goal inputs
 * and the macro progress tracks, so "off" reads as an empty channel. On,
 * the track and the knob both take the accent.
 *
 * The whole row is the target, not the 44x26 switch, so the label is
 * tappable too. */
function Toggle({ checked, onChange, label, hint }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: '100%', minHeight: 'var(--pq-tap-min)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: 0,
        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        fontFamily: 'var(--pq-sans)',
      }}
    >
      <span>
        <span style={{
          display: 'block', fontSize: 'var(--pq-size-row)', fontWeight: 500,
          color: 'var(--pq-text)',
        }}>{label}</span>
        {hint && (
          <span style={{
            display: 'block', fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-label)',
            color: 'var(--pq-text-3)', letterSpacing: 'var(--pq-track-caption)', marginTop: 2,
          }}>{hint}</span>
        )}
      </span>
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0, width: 44, height: 26, borderRadius: 13,
          padding: 3, display: 'flex',
          justifyContent: checked ? 'flex-end' : 'flex-start',
          background: checked ? 'var(--pq-accent-grad)' : 'var(--pq-well-bg)',
          boxShadow: checked ? 'var(--pq-accent-raise)' : 'var(--pq-well-shadow)',
          border: checked ? 'none' : '1px solid var(--pq-rule-cell)',
          transition: 'background var(--pq-t-paint)',
        }}
      >
        <span style={{
          width: 20, height: 20, borderRadius: '50%',
          background: checked ? 'var(--pq-on-accent-ink)' : 'var(--pq-accent)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.45)',
        }} />
      </span>
    </button>
  )
}

/* ── ONE COMPONENT, TWO FORMS ─────────────────────────────────────────
 *
 * A sheet on phone, a pane on wide. The difference is the wrapper; the
 * body is identical, which is the handoff's "nothing about the visual
 * language changes between surfaces, only the layout".
 *
 * IT IS ALWAYS MOUNTED. `open` gates what it RENDERS, not whether it
 * exists — so the draft survives being closed, and survives the window
 * being narrowed from pane to sheet mid-edit. Rendering it conditionally
 * in App would unmount it on a resize and silently discard whatever was
 * typed, which is the exact failure the block E brief names. */
export default function Settings({ open, onClose, inline = false }) {
  const { goals, updateGoals } = useAppStore()
  const { theme, toggleTheme } = useTheme()

  /* Held locally until SAVE. Typing straight into the store would write
     to Firestore on every keystroke, and a half-typed "18" would be a
     real goal for as long as it took to type the rest. */
  const [draft, setDraft] = useState(goals)
  useEffect(() => { if (open) setDraft(goals) }, [open, goals])

  const set = (key, raw) => {
    const n = raw === '' ? '' : Number(raw)
    setDraft(d => ({ ...d, [key]: n }))
  }

  function save() {
    /* ALL FOUR, ALWAYS. updateGoals replaces the stored object rather
       than merging it, so sending one field would silently drop the
       other three. */
    const next = {}
    for (const f of FIELDS) {
      const v = Number(draft[f.key])
      next[f.key] = Number.isFinite(v) && v > 0 ? Math.min(v, f.max) : goals[f.key]
    }
    updateGoals(next)
    onClose?.()
  }

  const body = (
    <>
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 12,
        padding: '20px var(--pq-gutter) 0',
      }}>
        <div>
          <p style={{
            margin: '0 0 3px', fontSize: 18, fontWeight: 700,
            color: 'var(--pq-text)', letterSpacing: '-.01em',
          }}>Daily goals</p>
          <p style={{
            margin: 0, fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-eyebrow)',
            color: 'var(--pq-text-3)', letterSpacing: 'var(--pq-track-chip)',
          }}>NUTRITION TARGETS</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 'var(--pq-tap-min)', height: 'var(--pq-tap-min)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          }}>
          <span style={{
            width: 36, height: 36, borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--pq-thumb-fallback)',
            boxShadow: 'var(--pq-thumb-fallback-lip)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="var(--pq-text-muted)" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </span>
        </button>
      </div>

      {/* The sheet is capped at 88%, so the body scrolls rather than the
          panel growing past it. min-height:0 is what lets a flex child
          shrink below its content; without it the save button leaves the
          screen and nothing says so. */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
        padding: '20px var(--pq-gutter) 0',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
          {FIELDS.map(f => (
            <div key={f.key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <label htmlFor={`goal-${f.key}`}>
                <span style={{
                  display: 'block', fontSize: 'var(--pq-size-row)', fontWeight: 500,
                  color: 'var(--pq-text)',
                }}>{f.label}</span>
                <span style={{
                  display: 'block', fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-label)',
                  color: 'var(--pq-text-3)', letterSpacing: 'var(--pq-track-caption)', marginTop: 2,
                }}>{f.unit}</span>
              </label>
              <input
                id={`goal-${f.key}`}
                type="number"
                inputMode="numeric"
                value={draft[f.key] ?? ''}
                onChange={e => set(f.key, e.target.value)}
                style={{
                  width: 96, minHeight: 'var(--pq-tap-min)', textAlign: 'center',
                  padding: '9px 12px', borderRadius: 9,
                  background: 'var(--pq-track-bg)',
                  border: '1px solid var(--pq-rule-cell)',
                  boxShadow: 'var(--pq-well-shadow)',
                  fontFamily: 'var(--pq-mono)', fontSize: 15, fontWeight: 500,
                  color: 'var(--pq-text)', outline: 'none',
                }}
              />
            </div>
          ))}
        </div>

        {/* WHICH MODE IS THIS BUILD IN?
            Only shown when there is something to say. A local-only build
            that looks identical to a signed-in one is how someone
            reviews the wrong thing, or reports "sign-in is broken" about
            a build that was never given a cloud to sign in to. Quiet,
            but present — see DEVIATIONS §13. */}
        {!cloudEnabled && (
          <div data-local-only style={{
            marginBottom: 20, padding: '10px 12px',
            borderRadius: 'var(--pq-r-button)',
            background: 'var(--pq-well-bg)',
            border: '1px solid var(--pq-rule-soft)',
          }}>
            <div style={{
              ...MONO_SECTION, color: 'var(--pq-accent)', marginBottom: 4,
            }}>LOCAL ONLY</div>
            <p style={{
              margin: 0, fontFamily: 'var(--pq-mono)', fontSize: 11,
              lineHeight: 1.6, color: 'var(--pq-text-3)',
              letterSpacing: 'var(--pq-track-chip)',
            }}>
              NO ACCOUNT CONNECTED. EVERYTHING IS SAVED TO THIS DEVICE
              AND NOTHING SYNCS.
            </p>
          </div>
        )}

        {/* PREFERENCES. One toggle, because one preference exists — the
            theme. The handoff names no others, and adding some would be
            inventing product surface rather than building the design. */}
        <div style={{ ...MONO_SECTION, marginBottom: 10 }}>PREFERENCES</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
          <Toggle
            label="Light theme"
            hint="THE APP IS BUILT DARK"
            checked={theme === 'light'}
            onChange={toggleTheme}
          />
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: '12px var(--pq-gutter) 24px' }}>
        <button
          onClick={save}
          style={{
            width: '100%', minHeight: 'var(--pq-tap-min)', padding: 14,
            borderRadius: 'var(--pq-r-button)', border: 'none', cursor: 'pointer',
            background: 'var(--pq-accent-grad)',
            boxShadow: 'var(--pq-accent-raise)',
            color: 'var(--pq-on-accent-ink)',
            fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-body)',
            fontWeight: 600, letterSpacing: 'var(--pq-track-chip)',
          }}>SAVE GOALS</button>
      </div>
    </>
  )

  if (!open) return null

  /* The pane. Not a Card: a card is translucent over the shell and would
     tint as the column scrolls, and this is a full-height surface rather
     than a block within one. Same sheet gradient, all four corners
     rounded because nothing is anchored to an edge here. */
  if (inline) {
    return (
      <div
        role="region"
        aria-label="Daily goals"
        data-settings-pane
        style={{
          maxWidth: 520, margin: '0 auto',
          display: 'flex', flexDirection: 'column',
          maxHeight: '100%',
          background: 'var(--pq-sheet-bg)',
          border: 'var(--pq-card-border)',
          borderRadius: 'var(--pq-r-card)',
          boxShadow: 'var(--pq-card-shadow)',
          overflow: 'hidden',
        }}>
        {body}
      </div>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title="Daily goals">
      {body}
    </Sheet>
  )
}
