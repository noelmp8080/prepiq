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
        /* ── 100dvh, NOT inset:0 — AND THE DIFFERENCE IS THE WHOLE BUG ──
         *
         * iOS Safari lays `position: fixed` out against the LAYOUT
         * viewport, which is the large viewport: the height the screen
         * has when the toolbar is retracted, whatever the toolbar is
         * doing right now. So `inset: 0` on an iPhone 14 Pro is 852px
         * tall while the user is looking at 752px, and the bottom 100px
         * of this overlay is behind Safari's toolbar.
         *
         * A sheet aligned to the BOTTOM of that overlay therefore lands
         * where it cannot be seen. Measured, before the fix: a 149px
         * sheet sat at 703-852 with the fold at 752, so 49px of it was
         * on screen — its header, and nothing else. The restore buttons
         * were at 786-830, entirely behind the toolbar. That is the
         * reported bug exactly, and the reason it was "only the header
         * shows" rather than "the sheet is cut off".
         *
         * `100dvh` is the DYNAMIC viewport: it tracks the toolbar. The
         * shell has sized in dvh since block A for this same reason
         * (Shell.jsx) — the pattern was already here, and this overlay
         * predates the grocery work and never got it.
         *
         * `top` + `height` rather than `inset: 0`, because with top,
         * bottom and height all set, `bottom` is the one that gets
         * dropped — and it is the one that would be wrong. */
        position: 'fixed', top: 0, left: 0, right: 0,
        height: '100dvh',
        zIndex: 200,
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
          /* 88% of a container that is now the VISIBLE viewport rather
             than the large one. The percentage is unchanged; what it
             resolves against is what was wrong. */
          width: '100%', maxHeight: '88%',
          display: 'flex', flexDirection: 'column',
          /* THE HOME INDICATOR TAKES THE BOTTOM 34px on these phones,
             and the system takes taps there for its own swipe. A sheet
             flush to the bottom puts its last action — SHOW ALL AGAIN,
             or RecipeSheet's buttons — inside that strip. Padded here
             on the PANEL rather than in each sheet's content, so every
             sheet in the app gets it from one place: this was a pattern
             bug, not one screen's bug.

             Zero on every desktop browser, so nothing moves there. */
          paddingBottom: 'var(--pq-safe-b)',
          background: 'var(--pq-sheet-bg)',
          boxShadow: 'var(--pq-sheet-shadow)',
          /* 18, not the README's 20. Both sheets in the prototype
             markup round at 18 and they agree with each other; the
             prose does not agree with them. Fourth contradiction,
             resolved the same way as the three before it. */
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
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
