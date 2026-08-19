import { useAppStore } from '../store/useAppStore'

/* FAILED CLOUD WRITES, WHEREVER YOU ARE.
 *
 * This started life inside Grocery.jsx, because grocery checks were the
 * first writer to stop swallowing its errors. All five writers report
 * now, and four of them fire on other screens — a failed weekly-plan
 * write happens on Plan, and a banner only Grocery can show would be a
 * silent failure with extra steps.
 *
 * So it is rendered once, app-wide, pinned above the bottom nav rather
 * than inserted into the page flow. Each screen owns its own gradient
 * header and its own scroll; a banner in the flow would have to be
 * added to five layouts and would sit under a different amount of
 * chrome in each.
 *
 * ONE LINE PER FAILING WRITER, because the store keys errors by writer:
 * a successful goals write must not clear a failed plan write, and
 * collapsing them to one slot would hide exactly the failure worth
 * seeing.
 *
 * Colours match Auth's error block — one error look in the app.
 */
export default function SyncErrorBanner() {
  const { syncErrors, dismissSyncErrors } = useAppStore()
  const entries = Object.entries(syncErrors ?? {})
  if (entries.length === 0) return null

  const what = entries.map(([k]) => k).join(', ')

  return (
    <div
      role="alert"
      style={{
        position: 'fixed', left: '12px', right: '12px', zIndex: 101,
        bottom: 'calc(68px + 12px + env(safe-area-inset-bottom))',
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        fontSize: '12px', color: '#C53030', fontWeight: 500, lineHeight: 1.5,
        padding: '10px 14px', background: '#FDECEC',
        border: '1px solid rgba(197,48,48,0.25)', borderRadius: '10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)', wordBreak: 'break-word',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}
    >
      <span style={{ flex: 1 }}>
        Saved on this device only — your {what} did not reach your account, so
        {entries.length > 1 ? ' these changes may be undone' : ' this change may be undone'} next time the app loads.
        {entries.map(([k, detail]) => (
          <span key={k} style={{ display: 'block', opacity: 0.75, marginTop: '4px' }}>
            {k}: {detail}
          </span>
        ))}
      </span>
      <button
        onClick={dismissSyncErrors}
        aria-label="Dismiss"
        style={{
          background: 'none', border: 'none', cursor: 'pointer', color: '#C53030',
          fontSize: '12px', fontWeight: 700, padding: 0, flexShrink: 0,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}
      >
        Dismiss
      </button>
    </div>
  )
}
