import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/* ── The full-size photo ─────────────────────────────────────────────
 *
 * Tap the dish in the recipe sheet and it opens here, as large as the
 * screen allows without cropping: `object-fit: contain` inside a box
 * bounded by the VISIBLE viewport (100dvh, for the toolbar reason in
 * Sheet.jsx), so a tall photo fits the height and a wide one the width.
 *
 * PORTALLED TO <body>, NOT RENDERED IN PLACE. The sheet panel animates
 * with a transform, and a transformed ancestor becomes the containing
 * block for `position: fixed` — rendered inside it, this overlay would
 * be the size of the sheet, not the screen.
 *
 * ESCAPE CLOSES THIS, NOT THE SHEET UNDER IT. Sheet listens for Escape
 * on window in the bubble phase; this listens in the capture phase and
 * stops the event, so one press backs out one layer.
 *
 * Any tap closes it — the photo, the black around it, the X. There is
 * nothing in here to interact with, so there is nothing a stray tap
 * could hit by mistake.
 */
export default function PhotoViewer({ src, alt, onClose }) {
  useEffect(() => {
    if (!src) return
    const onKey = e => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose?.()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [src, onClose])

  if (!src) return null

  return createPortal(
    <div
      data-photo-viewer
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `Photo of ${alt}` : 'Recipe photo'}
      onClick={e => { e.stopPropagation(); onClose?.() }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '100dvh',
        zIndex: 300,
        background: 'rgba(0,0,0,.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(12px + env(safe-area-inset-top, 0px)) 12px calc(12px + var(--pq-safe-b, 0px))',
        boxSizing: 'border-box',
        animation: 'pq-photo-in .2s ease-out',
        cursor: 'zoom-out',
      }}
    >
      <style>{`
        @keyframes pq-photo-in { from { opacity: 0 } }
        @keyframes pq-photo-grow { from { transform: scale(.9); opacity: 0 } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes pq-photo-grow { from { opacity: 0 } }
        }
      `}</style>

      <img
        src={src}
        alt={alt || ''}
        style={{
          display: 'block',
          maxWidth: '100%', maxHeight: '100%',
          width: 'auto', height: 'auto',
          objectFit: 'contain',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,.5)',
          animation: 'pq-photo-grow .26s cubic-bezier(.2,1,.32,1) both',
        }}
      />

      <button
        aria-label="Close photo"
        onClick={e => { e.stopPropagation(); onClose?.() }}
        style={{
          position: 'absolute',
          top: 'calc(10px + env(safe-area-inset-top, 0px))', right: 10,
          width: 'var(--pq-tap-min, 44px)', height: 'var(--pq-tap-min, 44px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        }}
      >
        <span style={{
          width: 36, height: 36, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,.16)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </span>
      </button>
    </div>,
    document.body,
  )
}
