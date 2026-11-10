import { useState, useEffect } from 'react'
import Sheet from './Sheet'
import { Toggle } from './Settings'
import { useAppStore } from '../store/useAppStore'

/* ── Reset — start the week over ──────────────────────────────────────
 *
 * ONE BUTTON FOR A CLEAN START. Four things it clears, each with its own
 * switch and all of them on: the owner asked for reset to mean everything.
 * They
 * are different things to lose: an emptied plan is a few minutes of
 * picking meals, a cleared log is a record that cannot be rebuilt, and
 * targets are four numbers. So the sheet says exactly what will go and
 * lets any of it be kept.
 *
 * A SHEET, NOT AN UNDO TOAST. Clear on the grocery list uses a toast
 * because it is a small, frequent action in a shop. This is rare and
 * wide, and a reset that happens on a stray tap of a header button is
 * the worst version of it — so it asks first, and the destructive button
 * names what it is about to do.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }

export default function ResetSheet({ open, onClose }) {
  const { resetApp, defaultGoals } = useAppStore()
  const [week, setWeek] = useState(true)
  const [tracking, setTracking] = useState(true)
  const [targets, setTargets] = useState(true)
  const [prefs, setPrefs] = useState(true)

  /* Every opening starts from the same answer — everything, a clean
     start. A switch left off from last time would make the same button
     do something different. */
  useEffect(() => {
    if (open) { setWeek(true); setTracking(true); setTargets(true); setPrefs(true) }
  }, [open])

  const nothing = !week && !tracking && !targets && !prefs

  function confirm() {
    resetApp({ week, tracking, targets, prefs })
    onClose?.()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Reset">
      <div style={{ padding: '20px var(--pq-gutter) 0', flexShrink: 0 }}>
        <p style={{
          margin: '0 0 3px', fontSize: 18, fontWeight: 700,
          color: 'var(--pq-text)', letterSpacing: '-.01em',
        }}>Reset</p>
        <p style={{
          ...MONO, margin: 0, fontSize: 'var(--pq-size-eyebrow)',
          color: 'var(--pq-text-3)', letterSpacing: 'var(--pq-track-chip)',
        }}>A CLEAN START · THIS CANNOT BE UNDONE</p>
      </div>

      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
        padding: '16px var(--pq-gutter) 0',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <Toggle
          label="This week"
          hint="EMPTIES THE MEAL PLAN AND THE GROCERY LIST"
          checked={week} onChange={setWeek}
        />
        <Toggle
          label="What I’ve logged"
          hint="EVERY LOGGED DAY, IN EVERY MONTH"
          checked={tracking} onChange={setTracking}
        />
        <Toggle
          label="Daily targets"
          hint={`BACK TO ${defaultGoals.calories} KCAL · ${defaultGoals.protein}P · ${defaultGoals.carbs}C · ${defaultGoals.fat}F`}
          checked={targets} onChange={setTargets}
        />
        <Toggle
          label="Favourites and hidden items"
          hint="SAVED RECIPES AND “DON’T NEED THIS” ITEMS"
          checked={prefs} onChange={setPrefs}
        />
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
          data-reset-confirm
          onClick={confirm}
          disabled={nothing}
          style={{
            flex: 1, minHeight: 'var(--pq-tap-min)', padding: 14,
            borderRadius: 'var(--pq-r-button)', border: 'none',
            cursor: nothing ? 'default' : 'pointer',
            background: nothing ? 'var(--pq-well-bg)' : 'var(--pq-accent-grad)',
            boxShadow: nothing ? 'none' : 'var(--pq-accent-raise)',
            color: nothing ? 'var(--pq-text-faint)' : 'var(--pq-on-accent-ink)',
            ...MONO, fontSize: 'var(--pq-size-body)', fontWeight: 600,
            letterSpacing: 'var(--pq-track-chip)',
          }}>RESET</button>
      </div>
    </Sheet>
  )
}

/* The header button that opens it. One definition, so Plan, Track and
   Settings cannot grow three different-looking resets. */
export function ResetButton({ onClick, style }) {
  return (
    <button
      data-reset-open
      onClick={onClick}
      aria-label="Reset"
      style={{
        flexShrink: 0, minHeight: 'var(--pq-tap-min)', padding: '0 14px',
        display: 'flex', alignItems: 'center', gap: 6,
        borderRadius: 'var(--pq-r-button)', cursor: 'pointer',
        background: 'var(--pq-thumb-fallback)',
        border: '1px solid var(--pq-rule-strong)',
        boxShadow: 'var(--pq-thumb-fallback-lip)',
        color: 'var(--pq-text-2)',
        ...MONO, fontSize: 12, fontWeight: 500, letterSpacing: 'var(--pq-track-chip)',
        ...style,
      }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />
      </svg>
      RESET
    </button>
  )
}
