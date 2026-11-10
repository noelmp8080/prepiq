import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import Card, { CARD_CELL_RULE } from './Card'
import { useAppStore } from '../store/useAppStore'
import { recipeById } from '../data/recipes'
import {
  monthDates, monthLeadingBlanks, monthCells, monthSummary, fromISO,
} from '../store/storeLogic'

/* ── The month calendar — progress as the months go by ────────────────
 *
 * One cell per day, coloured by how the day's calories sat against the
 * target, with a dot when protein was hit. Four totals above it. It
 * lives on Track behind the TODAY / MONTH switch, because it is the same
 * question Track already answers — how did I do — asked about a month
 * instead of a day.
 *
 * A DAY OPENS WITHOUT A CLICK, as the owner asked. Move a pointer over
 * the days, or put a finger down and slide: a small card pops up beside
 * the day under it and follows as you move. A phone has no hover, so
 * the slide is its version of one — which is why the grid sets
 * `touch-action: none`: a finger on the calendar is reading days, not
 * scrolling the page. Scroll from anywhere outside the grid.
 *
 * THE LOGS ARE READ, NOT KEPT. A month is fetched when it is opened —
 * the device's copy at once, the cloud's when it answers — and held
 * here, not in the store. Today is the exception: it comes from the
 * live `mealLog`, so a meal logged a second ago is already on the grid.
 *
 * PAST DAYS ARE MEASURED AGAINST TODAY'S TARGETS. The app stores no
 * history of targets, so there is nothing else to measure them against;
 * changing a target re-colours earlier months. See DEVIATIONS §28.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const OVER = '#F0997B'

/* Each status is a different KIND of mark, not only a different colour:
   filled, tinted, outlined, bare. Two of them would be told apart in
   greyscale, and that is the test. */
const CELL = {
  hit:   { background: 'var(--pq-accent-grad)', color: 'var(--pq-on-accent-ink)',
           borderColor: 'transparent', fontWeight: 600 },
  under: { background: 'rgba(208,242,36,0.14)', color: 'var(--pq-text)',
           borderColor: 'rgba(208,242,36,0.45)' },
  over:  { background: 'transparent', color: OVER, borderColor: OVER },
  none:  { background: 'transparent', color: 'var(--pq-text-3)', borderColor: 'transparent' },
}

const POP_W = 224

function Stat({ value, label, accent, first }) {
  return (
    <div style={{ padding: '12px 10px', borderLeft: first ? 'none' : CARD_CELL_RULE, minWidth: 0 }}>
      <div style={{
        ...MONO, fontSize: 17, fontWeight: 600, lineHeight: 1,
        color: accent ? 'var(--pq-accent)' : 'var(--pq-text)',
      }}>{value}</div>
      <div style={{
        ...MONO, fontSize: 'var(--pq-size-label)', color: 'var(--pq-text-3)',
        letterSpacing: 'var(--pq-track-label)', marginTop: 6, whiteSpace: 'nowrap',
      }}>{label}</div>
    </div>
  )
}

function NavButton({ label, onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        width: 'var(--pq-tap-min)', height: 'var(--pq-tap-min)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--pq-r-button)', background: 'var(--pq-thumb-fallback)',
        border: '1px solid var(--pq-rule-strong)', padding: 0,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
        color: 'var(--pq-text-2)',
      }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  )
}

export default function MonthCalendar({ style }) {
  const { goals, mealLog, logDate, readLogsLocal, readLogsCloud } = useAppStore()

  const today = fromISO(logDate)
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const isThisMonth = view.y === today.getFullYear() && view.m === today.getMonth()

  const dates = useMemo(() => monthDates(view.y, view.m), [view.y, view.m])
  /* Only days that can hold a log are asked for. */
  const pastDates = useMemo(() => dates.filter(d => d <= logDate), [dates, logDate])
  const key = `${view.y}-${view.m}`

  /* The device's copy, synchronously, so the grid is never blank while
     the network is asked. Tagged with the month it belongs to: a slow
     answer for a month you have paged away from must not land on the
     one you are looking at. */
  const [cloud, setCloud] = useState({ key: null, logs: null })
  const local = useMemo(() => readLogsLocal(pastDates), [readLogsLocal, pastDates])

  useEffect(() => {
    let stale = false
    Promise.resolve(readLogsCloud(pastDates))
      .then(logs => { if (!stale && logs) setCloud({ key, logs }) })
      .catch(e => console.error('[monthLogs]', e))
    return () => { stale = true }
  }, [readLogsCloud, pastDates, key])

  const logsByDate = useMemo(() => {
    const out = { ...local }
    if (cloud.key === key && cloud.logs) {
      for (const [d, meals] of Object.entries(cloud.logs)) if (meals) out[d] = meals
    }
    /* Today is live, whatever either store last heard. */
    if (logDate in out || dates.includes(logDate)) out[logDate] = mealLog
    return out
  }, [local, cloud, key, logDate, mealLog, dates])

  const cells = useMemo(
    () => monthCells(dates, logsByDate, recipeById, goals, logDate),
    [dates, logsByDate, goals, logDate])
  const sum = useMemo(() => monthSummary(cells), [cells])
  const blanks = monthLeadingBlanks(view.y, view.m)

  /* ── The preview ────────────────────────────────────────────────── */
  const [active, setActive] = useState(null)        // index into cells, or null
  /* What the card last showed. It stays in the DOM while it fades, so
     the content has to outlive `active` going null. */
  const [shown, setShown] = useState(null)
  const [pos, setPos] = useState({ left: 0, top: 0, above: false })
  const wrapRef = useRef(null)
  const cellRefs = useRef([])

  /* Whether the card is travelling between two days or appearing fresh.
     Fresh, it must start AT its day — sliding in from wherever it was
     last left reads as the card arriving from the wrong place. */
  const [gliding, setGliding] = useState(false)

  const show = (i) => {
    if (i != null && cells[i]?.future) i = null
    setGliding(active != null && i != null)
    setActive(i)
    if (i != null) setShown(i)
  }

  /* Another month is another set of days; nothing carries over. */
  useEffect(() => { setActive(null); setShown(null) }, [key])

  /* Beside the day it describes: below it in the upper rows, above it
     in the lower ones, and never off either side. Measured after the
     commit, so it is the cell's real box. */
  useLayoutEffect(() => {
    if (active == null) return
    const wrap = wrapRef.current, cell = cellRefs.current[active]
    if (!wrap || !cell) return
    const w = wrap.getBoundingClientRect(), c = cell.getBoundingClientRect()
    const left = Math.max(0, Math.min(c.left - w.left + c.width / 2 - POP_W / 2, w.width - POP_W))
    const row = Math.floor((blanks + active) / 7)
    const above = row >= 3
    setPos({
      left, above,
      top: above ? c.top - w.top - 8 : c.bottom - w.top + 8,
    })
  }, [active, blanks])

  /* A finger does not hover, so the slide is read from the pointer's
     position. `elementFromPoint` rather than the event target: a touch
     keeps reporting the cell it started on. */
  const fromPoint = (e) => {
    const el = document.elementFromPoint?.(e.clientX, e.clientY)
    const cell = el?.closest?.('[data-cal-day]')
    if (!cell || !wrapRef.current?.contains(cell)) return null
    return Number(cell.dataset.calDay)
  }

  const monthName = new Date(view.y, view.m, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const step = n => setView(v => {
    const d = new Date(v.y, v.m + n, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const card = shown != null ? cells[shown] : null
  const cardDate = card ? fromISO(card.date)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase() : ''
  const gap = card ? goals.calories - card.kcal : 0

  return (
    <div data-month-calendar style={style}>
      {/* ── Month, and the way between months ─────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <NavButton label="Previous month" onClick={() => step(-1)}>
          <path d="m15 18-6-6 6-6" />
        </NavButton>
        <div data-month-name style={{
          fontSize: 17, fontWeight: 700, color: 'var(--pq-text)', letterSpacing: '-.01em',
        }}>{monthName}</div>
        {/* No next month past this one: there is nothing in it yet. */}
        <NavButton label="Next month" onClick={() => step(1)} disabled={isThisMonth}>
          <path d="m9 18 6-6-6-6" />
        </NavButton>
      </div>

      {/* ── Totals ────────────────────────────────────────────────── */}
      <Card style={{ marginTop: 12 }}>
        <div data-month-stats style={{ display: 'flex' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Stat first accent value={`${sum.onTarget}/${sum.logged}`} label="ON TARGET" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Stat value={sum.logged ? sum.avgKcal.toLocaleString() : '—'} label="AVG KCAL" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Stat value={`${sum.proteinDays}d`} label="PROTEIN" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Stat value={`${sum.streak}d`} label="STREAK" />
          </div>
        </div>
      </Card>

      {/* ── The grid ──────────────────────────────────────────────── */}
      <div aria-hidden="true" style={{
        display: 'flex', gap: 5, marginTop: 14,
        ...MONO, fontSize: 'var(--pq-size-label)', color: 'var(--pq-text-3)',
      }}>
        {DAY_LETTERS.map((l, i) => (
          <span key={i} style={{ flex: 1, textAlign: 'center' }}>{l}</span>
        ))}
      </div>

      <div
        ref={wrapRef}
        data-cal-wrap
        onPointerDown={e => { const i = fromPoint(e); if (i != null) show(i) }}
        onPointerMove={e => { const i = fromPoint(e); if (i != null) show(i) }}
        onPointerUp={e => { if (e.pointerType === 'touch') show(null) }}
        onPointerCancel={() => show(null)}
        onMouseLeave={() => show(null)}
        style={{ position: 'relative', marginTop: 6, touchAction: 'none' }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', margin: -2.5 }}>
          {Array.from({ length: blanks }, (_, i) => (
            <span key={`b${i}`} style={{ width: `${100 / 7}%` }} />
          ))}
          {cells.map((c, i) => {
            const on = active === i
            const look = c.future ? CELL.none : CELL[c.status]
            const dayNum = Number(c.date.slice(8))
            const isToday = c.date === logDate
            return (
              <div key={c.date} style={{ width: `${100 / 7}%`, padding: 2.5, boxSizing: 'border-box' }}>
                <div
                  ref={el => { cellRefs.current[i] = el }}
                  data-cal-day={i}
                  data-status={c.future ? 'future' : c.status}
                  tabIndex={c.future ? -1 : 0}
                  role="img"
                  aria-label={c.future
                    ? `${c.date}, not yet`
                    : c.kcal
                      ? `${c.date}: ${c.kcal} calories, ${c.protein} grams protein, ${c.status === 'hit' ? 'on target' : c.status}`
                      : `${c.date}: nothing logged`}
                  onMouseEnter={() => show(i)}
                  onFocus={() => show(i)}
                  onBlur={() => show(null)}
                  style={{
                    aspectRatio: '1', borderRadius: 9,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 3,
                    border: '1px solid', outline: 'none',
                    fontSize: 13, ...MONO, ...look,
                    opacity: c.future ? 0.35 : 1,
                    boxShadow: on ? '0 0 0 2px var(--pq-text)'
                      : isToday ? '0 0 0 1px var(--pq-accent)' : 'none',
                    transform: on ? 'scale(1.12)' : 'none',
                    transition: 'transform var(--pq-t-paint), box-shadow var(--pq-t-paint)',
                    position: 'relative', zIndex: on ? 1 : 0,
                  }}>
                  <span>{dayNum}</span>
                  {/* Always in the DOM, so a day gaining its dot does
                      not change the cell's height. */}
                  <span aria-hidden="true" style={{
                    width: 4, height: 4, borderRadius: '50%', background: 'currentColor',
                    opacity: c.proteinHit ? 1 : 0,
                  }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* ── The preview card ──────────────────────────────────────
            Always mounted; `active` only decides whether it is shown.
            That is what lets it fade and settle instead of blinking. */}
        <div
          data-cal-preview
          data-open={active != null ? '' : undefined}
          role="status"
          style={{
            position: 'absolute', left: pos.left, top: pos.top, width: POP_W, zIndex: 5,
            pointerEvents: 'none',
            padding: '10px 12px', borderRadius: 12,
            background: 'var(--pq-sheet-bg)', border: 'var(--pq-card-border)',
            boxShadow: 'var(--pq-sheet-shadow)',
            opacity: active != null ? 1 : 0,
            transform: `${pos.above ? 'translateY(-100%)' : ''} ${
              active != null ? 'scale(1)' : `translateY(${pos.above ? -6 : 6}px) scale(.95)`}`,
            transformOrigin: pos.above ? 'bottom center' : 'top center',
            transition: `opacity .16s, transform .2s cubic-bezier(.2,1.1,.3,1)${
              gliding ? ', left .16s, top .16s' : ''}`,
          }}>
          {card && (
            <>
              <div style={{
                ...MONO, fontSize: 'var(--pq-size-label)', color: 'var(--pq-text-muted)',
                letterSpacing: 'var(--pq-track-label)',
              }}>{cardDate}</div>
              {card.kcal > 0 ? (
                <>
                  <div style={{ marginTop: 4, ...MONO }}>
                    <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--pq-accent)' }}>
                      {card.kcal.toLocaleString()}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--pq-text-muted)' }}>
                      {' '}KCAL · {gap >= 0 ? `${gap} UNDER` : `${Math.abs(gap)} OVER`}
                    </span>
                  </div>
                  <div style={{ ...MONO, fontSize: 11, color: 'var(--pq-text-2)', marginTop: 2 }}>
                    {card.protein}G PROTEIN · {card.carbs}C · {card.fat}F
                  </div>
                  {card.entries.map((e, i) => (
                    <div key={e.id || i} style={{
                      fontSize: 12, color: 'var(--pq-text)', marginTop: 5, paddingTop: 5,
                      borderTop: '1px solid var(--pq-rule-row)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{recipeById[e.recipeId]?.name || 'Removed recipe'}</div>
                  ))}
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--pq-text-muted)', marginTop: 6 }}>
                  Nothing logged
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Key ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 14,
        ...MONO, fontSize: 'var(--pq-size-label)', color: 'var(--pq-text-muted)',
      }}>
        {[['hit', 'ON TARGET'], ['under', 'UNDER'], ['over', 'OVER']].map(([k, label]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span aria-hidden="true" style={{
              width: 10, height: 10, borderRadius: 3, border: '1px solid',
              background: CELL[k].background, borderColor: CELL[k].borderColor,
            }} />
            {label}
          </span>
        ))}
        <span>• PROTEIN HIT</span>
      </div>
      <p style={{
        ...MONO, margin: '10px 0 0', fontSize: 'var(--pq-size-label)',
        color: 'var(--pq-text-3)', lineHeight: 1.6,
      }}>SLIDE ACROSS THE DAYS TO SEE EACH ONE</p>
    </div>
  )
}
