import { useState, useEffect } from 'react'

/* ── WHICH SURFACE IS THIS? ───────────────────────────────────────────
 *
 * Three, from the handoff's own reference sizes:
 *
 *   phone     390 x 844   bottom nav, one column
 *   tablet   1194 x 834   84px icon rail, two panes
 *   desktop  1512 x 950   224px sidebar, three columns where data allows
 *
 * BREAKPOINTS SIT BELOW THE REFERENCE WIDTHS, not at them. A layout that
 * only appears at exactly 1194px is a layout nobody sees: an iPad in
 * landscape with any browser chrome is narrower than its screen, and a
 * desktop window is whatever the user dragged it to. 900 and 1400 are
 * the nearest round numbers that keep each reference size comfortably
 * inside its own band.
 *
 * WIDTH ONLY, NOT ORIENTATION OR POINTER. An iPad in portrait is 834px
 * wide and gets the phone layout, which is correct — there is no room
 * for a rail and a two-pane split at that width. Asking about pointer
 * type instead would put a touch laptop on the phone layout.
 */
export const PHONE_MAX = 899
export const TABLET_MAX = 1399

export function surfaceFor(width) {
  if (width <= PHONE_MAX) return 'phone'
  if (width <= TABLET_MAX) return 'tablet'
  return 'desktop'
}

export const isWide = surface => surface === 'tablet' || surface === 'desktop'

export function useSurface() {
  const [surface, setSurface] = useState(() =>
    surfaceFor(typeof window === 'undefined' ? 390 : window.innerWidth))

  useEffect(() => {
    /* Reading innerWidth again on mount, not only in the initialiser:
       between the first render and the effect the window can already
       have changed — a rotation, or a devtools pane opening. */
    const read = () => setSurface(surfaceFor(window.innerWidth))
    read()
    window.addEventListener('resize', read)
    /* orientationchange fires before innerWidth settles on some iOS
       versions, so resize is the one that carries the truth; this is
       only here so a rotation that fires no resize still lands. */
    window.addEventListener('orientationchange', read)
    return () => {
      window.removeEventListener('resize', read)
      window.removeEventListener('orientationchange', read)
    }
  }, [])

  return surface
}
