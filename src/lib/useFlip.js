import { useLayoutEffect, useRef } from 'react'

/* ── ROWS THAT TRAVEL TO WHERE THEY NOW BELONG ────────────────────────
 *
 * Checking a grocery row sends it to the bottom of its group. Without
 * this the row would simply vanish from under the thumb and reappear
 * somewhere else, which reads as the list glitching. With it, the row
 * slides down and the ones beneath close the gap — the checklist
 * behaviour of a notes app, which is what was asked for.
 *
 * FLIP: after React has committed the new order, measure every marked
 * row, compare with where it was after the previous commit, shift it
 * back to the old place with a transform, then let the transform go.
 * Only `transform` is ever animated, so the layout itself is settled the
 * instant the tap lands — the next tap hits the row it appears to hit.
 *
 * A ROW IS MARKED with `data-flip="<stable key>"`. The hook owns that
 * node's `transform` and `transition`; nothing else may set them.
 *
 * `resetKey` names WHICH LIST this is. When it changes — another day,
 * the other reading — nothing animates: those are different rows that
 * happen to share keys, and flying them across the screen would claim a
 * continuity that is not there.
 *
 * Reduced motion: the order still changes, nothing travels.
 */
const EASE = 'transform .34s cubic-bezier(.2,.8,.2,1)'

export function useFlip(ref, resetKey) {
  const prev = useRef({ key: resetKey, at: new Map() })

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const nodes = [...root.querySelectorAll('[data-flip]')]

    /* Settle anything still in flight before measuring, or the reading
       is of a row halfway through its last move. */
    for (const n of nodes) if (n.style.transform || n.style.transition) clear(n)

    const base = root.getBoundingClientRect()
    const at = new Map()
    for (const n of nodes) {
      const r = n.getBoundingClientRect()
      at.set(n.dataset.flip, { x: r.left - base.left, y: r.top - base.top })
    }

    const before = prev.current
    prev.current = { key: resetKey, at }
    if (before.key !== resetKey) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const moved = []
    for (const n of nodes) {
      const was = before.at.get(n.dataset.flip)
      const now = at.get(n.dataset.flip)
      if (!was) continue
      const dx = was.x - now.x, dy = was.y - now.y
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) moved.push({ n, dx, dy })
    }
    if (!moved.length) return

    /* The row that travelled furthest is the one that was tapped; it
       passes over the rows that are only closing the gap. */
    const far = moved.reduce((a, b) =>
      (Math.abs(b.dy) + Math.abs(b.dx) > Math.abs(a.dy) + Math.abs(a.dx) ? b : a))

    for (const { n, dx, dy } of moved) {
      n.style.transition = 'none'
      n.style.transform = `translate(${dx}px, ${dy}px)`
      n.style.position = 'relative'
      n.style.zIndex = n === far.n ? '1' : '0'
    }
    root.getBoundingClientRect()                      // commit the starting frame

    const frame = requestAnimationFrame(() => {
      for (const { n } of moved) {
        n.style.transition = EASE
        n.style.transform = ''
        /* Leave the row exactly as it was found once it has arrived. A
           stray `position: relative` would make it a stacking context
           for good, and the next measurement would have to undo it. */
        n.addEventListener('transitionend', () => clear(n), { once: true })
      }
    })
    return () => cancelAnimationFrame(frame)
  })
}

/* Everything this hook ever sets on a row, removed. A row at rest
   carries none of it. */
function clear(n) {
  n.style.transition = ''
  n.style.transform = ''
  n.style.position = ''
  n.style.zIndex = ''
}
