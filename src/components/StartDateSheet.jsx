import { useState, useEffect } from 'react'
import Sheet from './Sheet'
import { useAppStore } from '../store/useAppStore'
import { todayISO, isISODate, addDaysISO, nextMonday, longDate } from '../store/storeLogic'

/* ── When does the plan start? ────────────────────────────────────────
 *
 * Asked for by the owner: they wanted to start a diet next week and
 * begin meal prepping now, and the plan could only ever be "this week".
 *
 * Three quick answers cover almost every case — today, tomorrow, next
 * Monday — and the date field covers the rest. Past dates are refused:
 * a plan that "started" last Tuesday is just the running week, which is
 * what clearing the start date gives.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }

export default function StartDateSheet({ open, onClose }) {
  const { planStart, setPlanStart, logDate } = useAppStore()
  const today = logDate || todayISO()
  const [value, setValue] = useState(planStart || nextMonday(today))

  /* Each opening shows what is saved, or next Monday as the suggestion. */
  useEffect(() => {
    if (open) setValue(planStart && planStart >= today ? planStart : nextMonday(today))
  }, [open, planStart, today])

  const valid = isISODate(value) && value >= today

  function save(iso) {
    /* Starting today is the running week: no start date to keep. */
    setPlanStart(iso === today ? null : iso)
    onClose?.()
  }

  const quick = [
    ['Today', today],
    ['Tomorrow', addDaysISO(today, 1)],
    ['Next Monday', nextMonday(today)],
  ]

  return (
    <Sheet open={open} onClose={onClose} title="Plan start date">
      <div style={{ padding: '20px var(--pq-gutter) 0', flexShrink: 0 }}>
        <p style={{
          margin: '0 0 3px', fontSize: 18, fontWeight: 700,
          color: 'var(--pq-text)', letterSpacing: '-.01em',
        }}>When does your plan start?</p>
        <p style={{
          ...MONO, margin: 0, fontSize: 'var(--pq-size-eyebrow)',
          color: 'var(--pq-text-3)', letterSpacing: 'var(--pq-track-chip)', lineHeight: 1.6,
        }}>THE WEEK BEGINS ON THIS DAY · PREP AND SHOP FOR IT NOW</p>
      </div>

      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
        padding: '16px var(--pq-gutter) 0',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {quick.map(([label, iso]) => (
          <button
            key={label}
            data-start-quick={label}
            onClick={() => setValue(iso)}
            aria-pressed={value === iso}
            style={{
              width: '100%', minHeight: 'var(--pq-tap-min)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 14px', borderRadius: 'var(--pq-r-button)', cursor: 'pointer',
              background: 'var(--pq-panel)',
              border: `1px solid ${value === iso ? 'var(--pq-accent)' : 'var(--pq-rule-soft)'}`,
              color: 'var(--pq-text)', fontFamily: 'var(--pq-sans)',
              fontSize: 'var(--pq-size-row)', fontWeight: 500, textAlign: 'left',
            }}>
            <span>{label}</span>
            <span style={{ ...MONO, fontSize: 12, color: 'var(--pq-text-3)' }}>
              {longDate(iso).toUpperCase()}
            </span>
          </button>
        ))}

        <label style={{
          ...MONO, display: 'block', marginTop: 8,
          fontSize: 'var(--pq-size-eyebrow)', color: 'var(--pq-text-3)',
          letterSpacing: 'var(--pq-track-chip)',
        }}>
          OR PICK A DATE
          <input
            type="date"
            data-start-date
            value={value}
            min={today}
            onChange={e => setValue(e.target.value)}
            aria-label="Plan start date"
            style={{
              display: 'block', width: '100%', minHeight: 'var(--pq-tap-min)', marginTop: 6,
              padding: '10px 14px', borderRadius: 'var(--pq-r-button)',
              background: 'var(--pq-panel)', border: '1px solid var(--pq-rule-soft)',
              color: 'var(--pq-text)', fontSize: 'var(--pq-size-row)',
              fontFamily: 'var(--pq-sans)', colorScheme: 'light dark',
            }}
          />
        </label>
        {!valid && (
          <p style={{ ...MONO, margin: 0, fontSize: 12, color: 'var(--pq-text-3)' }}>
            CHOOSE TODAY OR A LATER DATE
          </p>
        )}
      </div>

      <div style={{
        flexShrink: 0, padding: '16px var(--pq-gutter) 24px',
        display: 'flex', gap: 10,
      }}>
        <button
          onClick={onClose}
          style={{
            flex: 1, minHeight: 'var(--pq-tap-min)', padding: 14,
            borderRadius: 'var(--pq-r-button)', cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--pq-rule-soft)',
            color: 'var(--pq-text-2)',
            ...MONO, fontSize: 'var(--pq-size-body)', fontWeight: 600,
            letterSpacing: 'var(--pq-track-chip)',
          }}>CANCEL</button>
        <button
          data-start-save
          onClick={() => save(value)}
          disabled={!valid}
          style={{
            flex: 1, minHeight: 'var(--pq-tap-min)', padding: 14,
            borderRadius: 'var(--pq-r-button)', border: 'none',
            cursor: valid ? 'pointer' : 'default',
            background: valid ? 'var(--pq-accent-grad)' : 'var(--pq-well-bg)',
            boxShadow: valid ? 'var(--pq-accent-raise)' : 'none',
            color: valid ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-faint)',
            ...MONO, fontSize: 'var(--pq-size-body)', fontWeight: 600,
            letterSpacing: 'var(--pq-track-chip)',
          }}>SET START</button>
      </div>
    </Sheet>
  )
}
