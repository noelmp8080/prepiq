import { useAppStore } from '../store/useAppStore'

/* FAILED CLOUD WRITES.
 *
 * This started life inside Grocery.jsx, because grocery checks were the
 * first writer to stop swallowing its errors. All five writers report
 * now, and four of them fire on other screens — a failed weekly-plan
 * write happens on Plan.
 *
 * IT WAS PINNED ABOVE THE NAV, APP-WIDE, AND IS NOW IN FLOW ON GROCERY.
 * That is the position agreed in phase 0 and recorded in DEVIATIONS.md
 * §3, and it was parked from block B until the grocery header and day
 * chips existed to sit between.
 *
 * The consequence, accepted rather than overlooked: a failed write made
 * on Plan is not announced on Plan. It is not LOST — `syncErrors` is
 * keyed by writer and persists until that writer succeeds or the user
 * dismisses it — so the message is waiting the next time Grocery opens.
 * It is delayed, not silent. The overlay it replaced could not be used
 * here anyway: undo owns the space above the nav for 3500ms, and a
 * failed write is exactly what happens immediately after a clear.
 *
 * ONE LINE PER FAILING WRITER, because the store keys errors by writer:
 * a successful goals write must not clear a failed plan write, and
 * collapsing them to one slot would hide exactly the failure worth
 * seeing.
 */
export default function SyncErrorBanner() {
  const { syncErrors, dismissSyncErrors } = useAppStore()
  const entries = Object.entries(syncErrors ?? {})
  if (entries.length === 0) return null

  const what = entries.map(([k]) => k).join(', ')

  return (
    <div
      role="alert"
      data-sync-error
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 12px', borderRadius: 'var(--pq-r-button)',
        /* Not the card surface: a card is translucent over the shell and
           would tint with scroll position. An alert holds still. */
        background: 'rgba(197,48,48,0.14)',
        border: '1px solid rgba(233,120,120,0.34)',
        color: '#F2C7C7',
        fontFamily: 'var(--pq-sans)', fontSize: 12, fontWeight: 500,
        lineHeight: 1.5, wordBreak: 'break-word',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        Saved on this device only — your {what} did not reach your account, so
        {entries.length > 1 ? ' these changes may be undone' : ' this change may be undone'} next time the app loads.
        {entries.map(([k, detail]) => (
          <span key={k} style={{
            display: 'block', opacity: 0.75, marginTop: 4,
            fontFamily: 'var(--pq-mono)', fontSize: 11,
          }}>
            {k}: {detail}
          </span>
        ))}
      </span>
      <button
        onClick={dismissSyncErrors}
        aria-label="Dismiss"
        style={{
          flexShrink: 0, minHeight: 'var(--pq-tap-min)', padding: '0 4px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#F2C7C7', fontFamily: 'var(--pq-mono)',
          fontSize: 11, fontWeight: 600, letterSpacing: 'var(--pq-track-chip)',
        }}
      >
        DISMISS
      </button>
    </div>
  )
}
