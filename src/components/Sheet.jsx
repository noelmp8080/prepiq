import { useEffect } from 'react'

/* The bottom sheet — Settings and RecipeSheet.
 *
 * DELIBERATELY NOT A CARD VARIANT. A sheet is opaque, has its own
 * shadow, and rounds only its top corners; a card is translucent over
 * the shell, has the raised inset lines, and rounds all four. They share
 * nothing but "rectangle with a radius". A `variant="sheet"` prop on
 * Card would make one component do two unrelated jobs, and — worse — put
 * an opaque background one prop away from every card in the app, which
 * is the exact failure Card.jsx exists to prevent.
 *
 * Opaque is correct here: a sheet covers the shell rather than sitting
 * in it, so there is no ramp to participate in.
 */
export default function Sheet({ open, onClose, title, children, labelledBy }) {
  /* Escape closes, and the body does not scroll behind an open sheet.
     Both are restored on close so a sheet cannot strand the page. */
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'var(--pq-scrim)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-labelledby={labelledBy}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '88%',
          display: 'flex', flexDirection: 'column',
          background: 'var(--pq-sheet-bg)',
          boxShadow: 'var(--pq-sheet-shadow)',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          borderTop: 'var(--pq-card-border)',
          /* Slides up from the bottom. The only entrance animation in
             the app — motion is minimal by design. */
          animation: 'pq-sheet-up .22s cubic-bezier(.22,.61,.36,1)',
        }}
      >
        <style>{`
          @keyframes pq-sheet-up { from { transform: translateY(100%) } to { transform: none } }
          @media (prefers-reduced-motion: reduce) {
            @keyframes pq-sheet-up { from { transform: none } to { transform: none } }
          }
        `}</style>
        {children}
      </div>
    </div>
  )
}

/** Sheet header: title left, close right. 1px bottom divider. */
export function SheetHeader({ children, onClose, id }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '16px var(--pq-gutter)',
      borderBottom: '1px solid var(--pq-rule-strong)',
      flexShrink: 0,
    }}>
      <div id={id} style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          width: 'var(--pq-tap-min)', height: 'var(--pq-tap-min)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--pq-text-3)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  )
}
