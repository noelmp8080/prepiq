import { useState, useRef, useLayoutEffect, useMemo } from 'react'
import { CheckSquare, Square, ChevronRight, ChevronDown, Undo2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { buildGroceryItems, groupBySection, dayKey } from '../store/storeLogic'
import catalog from '../data/groceryCatalog.json'

/* ── The grocery list ─────────────────────────────────────────────────
 *
 * BUILT FOR A SUPERMARKET, NOT FOR A DESKTOP THAT HAPPENS TO SHRINK.
 * One hand, a basket in the other, bad lighting, 390px. Desktop is the
 * fallback here — the reverse of how the budget app was built.
 *
 * THE RULE THE WHOLE SCREEN IS BUILT AROUND: NOTHING MOVES ON TAP.
 * Checking a row changes `opacity`, `color` and `text-decoration` and
 * nothing else. Those are paint properties: no layout, no reflow, no
 * reorder, no insertion, no sink-to-bottom. Both icons are the same
 * 20px box so the swap costs no space either.
 *
 * A list that rearranges under your thumb is how you check the wrong
 * item next, and in a shop you would not notice. Reordering therefore
 * happens only at moments you control: collapsing a section, Clear, or
 * re-entering the screen.
 *
 * ROW GEOMETRY, measured rather than chosen:
 *   56px tall, whole row is the target (~358x56 at 390px) — about 6.4x
 *   the 44px floor by area. The checkbox is a state indicator INSIDE
 *   the target, not the target.
 *   18px name, single line. Measured against all 577 catalog items: at
 *   375px the name column is 257px, which holds 27 characters, and
 *   exactly two real ingredients exceed it. Those truncate and the chip
 *   carries the full name.
 *
 * 375px IS THE BINDING WIDTH, not 360. Dropping every phone to 17px to
 * serve the narrowest one trades the primary case for the edge case.
 */

const ROW = 56
const HEADER = 72

export default function Grocery() {
  const {
    weekPlan, groceryChecks, groceryExcluded, groceryDay, toggleGroceryItem,
    clearGrocery, undoClear, startNewGroceryList,
  } = useAppStore()

  const [openChip, setOpenChip] = useState(null)
  const [collapsed, setCollapsed] = useState(() => new Set(catalog.collapsedByDefault))
  const [undo, setUndo] = useState(null)
  const scrollPin = useRef(null)

  const rows = useMemo(
    () => buildGroceryItems(weekPlan, catalog, groceryExcluded, groceryDay),
    [weekPlan, groceryExcluded, groceryDay])
  const sections = useMemo(() => groupBySection(rows, catalog), [rows])

  /* Checks are keyed dayIndex:itemId, same as exclusions. The row knows
     its item; the day comes from the store. */
  const isChecked = id => groceryChecks.has(dayKey(groceryDay, id))
  const done = rows.filter(r => isChecked(r.id)).length
  const left = rows.length - done
  const pct = rows.length ? Math.round(done / rows.length * 100) : 0

  /* PIN THE SCROLL OFFSET when a section above the viewport collapses.
     `overflow-anchor` is not trusted here: it is unimplemented in Safari,
     which is most of this app's traffic, and the failure mode is the page
     jumping under a thumb — the exact thing the no-reflow rule exists to
     prevent. */
  useLayoutEffect(() => {
    const pin = scrollPin.current
    if (pin == null) return
    scrollPin.current = null
    const delta = document.documentElement.scrollHeight - pin.height
    if (delta) window.scrollTo({ top: Math.max(0, pin.top + delta), behavior: 'instant' })
  }, [collapsed])

  function toggleSection(name) {
    scrollPin.current = { top: window.scrollY, height: document.documentElement.scrollHeight }
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function onClear() {
    const restored = clearGrocery()
    if (restored.size) {
      setUndo(restored)
      setTimeout(() => setUndo(u => (u === restored ? null : u)), 3000)
    }
  }

  return (
    <div style={{ paddingBottom: '88px' }}>

      {/* ── 72px sticky header, replacing a 183px gradient ──────────
          The old header spent 26% of the usable screen on a wordmark you
          already know. This says what is left, how far you are, and what
          Clear will do — and never scrolls away, so neither control has
          to be hunted for. */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, height: `${HEADER}px`,
        background: 'var(--bg)', borderBottom: '1px solid rgba(79,63,212,0.12)',
        padding: '12px 16px', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', gap: '8px',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>
            {left === 0 ? 'All done' : `${left} left`}
          </span>
          <button
            onClick={onClear}
            disabled={done === 0}
            style={{
              minHeight: '44px', padding: '0 14px', borderRadius: '12px', cursor: done ? 'pointer' : 'default',
              background: done ? 'rgba(79,63,212,0.10)' : 'transparent',
              border: 'none', color: done ? '#4F3FD4' : 'var(--ink4)',
              fontSize: '14px', fontWeight: 700, fontFamily: 'Plus Jakarta Sans, sans-serif',
              flexShrink: 0,
            }}>
            {done ? `Clear ${done}` : 'Clear'}
          </button>
        </div>
        <div style={{ height: '6px', background: 'rgba(79,63,212,0.12)', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#0DC8A0', borderRadius: '4px', transition: 'width .4s ease' }} />
        </div>
      </div>

      {/* Desktop is the same component in two columns. Nothing that makes
          the phone work is reversed here; the grid simply widens. */}
      {/* data-grocery-list marks the region the no-reflow test watches.
          The property being defended is that THE LIST does not move under
          a thumb; the 72px header is fixed-height and its counter is
          meant to change. */}
      <div data-grocery-list style={{
        padding: '12px 16px', maxWidth: '720px', margin: '0 auto',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '0 28px', alignItems: 'start',
      }}>
        {rows.length === 0 && (
          <p style={{ fontSize: '15px', color: 'var(--ink4)', fontWeight: 500, padding: '40px 0', textAlign: 'center' }}>
            Nothing to buy — set up your weekly plan first.
          </p>
        )}

        {sections.map(section => {
          const isShut = collapsed.has(section.name)
          return (
            <section key={section.name} style={{ breakInside: 'avoid' }}>
              <button
                onClick={() => toggleSection(section.name)}
                style={{
                  width: '100%', minHeight: '44px', display: 'flex', alignItems: 'center', gap: '8px',
                  background: 'transparent', border: 'none', cursor: 'pointer', padding: '10px 0 6px',
                  textAlign: 'left', fontFamily: 'Plus Jakarta Sans, sans-serif',
                }}>
                {isShut ? <ChevronRight size={16} color="var(--ink4)" /> : <ChevronDown size={16} color="var(--ink4)" />}
                <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink3)' }}>
                  {section.name}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink4)' }}>{section.items.length}</span>
              </button>

              {!isShut && section.items.map(item => {
                const checked = isChecked(item.id)
                const open = openChip === item.id
                return (
                  <div key={item.id}>
                    <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid rgba(79,63,212,0.07)' }}>
                      {/* THE WHOLE ROW IS THE TARGET. Only paint changes. */}
                      <button
                        onClick={() => toggleGroceryItem(item.id)}
                        style={{
                          flex: 1, minWidth: 0, height: `${ROW}px`, display: 'flex', alignItems: 'center', gap: '14px',
                          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0,
                          fontFamily: 'Plus Jakarta Sans, sans-serif',
                          opacity: checked ? 0.5 : 1, transition: 'opacity .15s',
                        }}>
                        {checked
                          ? <CheckSquare size={20} strokeWidth={2} color="#0DC8A0" style={{ flexShrink: 0 }} />
                          : <Square      size={20} strokeWidth={2} color="#C4B5FD" style={{ flexShrink: 0 }} />}
                        <span style={{
                          fontSize: '18px', fontWeight: 600, color: 'var(--ink)', minWidth: 0,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          textDecoration: checked ? 'line-through' : 'none',
                        }}>{item.name}</span>
                      </button>

                      {/* The chip answers "why am I buying this" without
                          costing a line on every row. Tap row = check,
                          tap chip = why. No swipe, no long-press. */}
                      <button
                        onClick={() => setOpenChip(open ? null : item.id)}
                        aria-expanded={open}
                        aria-label={`${item.meals.length} meals need ${item.name}`}
                        style={{
                          flexShrink: 0, width: '44px', height: `${ROW}px`, display: 'flex',
                          alignItems: 'center', justifyContent: 'flex-end', gap: '3px',
                          background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                          color: 'var(--ink4)', fontSize: '14px', fontWeight: 700,
                          fontFamily: 'Plus Jakarta Sans, sans-serif',
                        }}>
                        {item.meals.length}
                        <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                      </button>
                    </div>

                    {open && (
                      <div style={{
                        padding: '4px 0 12px 34px', fontFamily: 'Plus Jakarta Sans, sans-serif',
                        borderBottom: '1px solid rgba(79,63,212,0.07)',
                      }}>
                        <p style={{ margin: '0 0 6px', fontSize: '13px', color: 'var(--ink)', fontWeight: 600, wordBreak: 'break-word' }}>
                          {item.name}
                        </p>
                        {item.qty.map((q, i) => (
                          <p key={i} style={{ margin: '0 0 2px', fontSize: '12px', color: 'var(--ink3)', fontFamily: 'DM Mono, monospace' }}>{q}</p>
                        ))}
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--ink4)', fontWeight: 500 }}>
                          For {item.meals.length} meal{item.meals.length === 1 ? '' : 's'} this week
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          )
        })}

        {rows.length > 0 && (
          <button
            onClick={startNewGroceryList}
            style={{
              gridColumn: '1 / -1', minHeight: '44px', marginTop: '24px', borderRadius: '12px',
              background: 'transparent', border: '1.5px solid rgba(79,63,212,0.18)', cursor: 'pointer',
              color: 'var(--ink3)', fontSize: '14px', fontWeight: 700, fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}>
            Start a new list
          </button>
        )}
      </div>

      {/* Undo rather than a confirm dialog: a dialog in a supermarket is
          two taps and a moment of doubt. */}
      {undo && (
        <div role="status" style={{
          position: 'fixed', left: '12px', right: '12px', bottom: 'calc(68px + 12px + env(safe-area-inset-bottom))',
          zIndex: 102, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          background: '#1A1044', color: '#fff', borderRadius: '12px', padding: '12px 14px',
          boxShadow: '0 6px 20px rgba(0,0,0,.25)', fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{undo.size} removed</span>
          <button
            onClick={() => { undoClear(undo); setUndo(null) }}
            style={{
              minHeight: '44px', display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent',
              border: 'none', cursor: 'pointer', color: '#C4B5FD', fontSize: '14px', fontWeight: 800,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}>
            <Undo2 size={16} /> Undo
          </button>
        </div>
      )}
    </div>
  )
}
