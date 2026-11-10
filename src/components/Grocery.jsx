import { useState, useRef, useLayoutEffect, useMemo, useEffect } from 'react'
import { EmptyBlock } from './Card'
import SyncErrorBanner from './SyncErrorBanner'
import GroceryRow, { GroceryRowPanel } from './GroceryRow'
import GroceryDay from './GroceryDay'
import HiddenSheet from './HiddenSheet'
import { useAppStore } from '../store/useAppStore'
import { groupBySection, dayKey, sinkChecked, weekRowChecked, weekRowKeys } from '../store/storeLogic'
import { useFlip } from '../lib/useFlip'
import { amountFor } from '../lib/groceryAmount'
import { hiddenItemsNamed } from '../lib/groceryByDay'
import { recipeById } from '../data/recipes'
import catalog from '../data/groceryCatalog.json'

/* ── The grocery list ─────────────────────────────────────────────────
 *
 * BUILT FOR A SUPERMARKET, NOT FOR A DESKTOP THAT HAPPENS TO SHRINK.
 * One hand, a basket in the other, bad lighting, 375px.
 *
 * THE RULE THIS SCREEN WAS FIRST BUILT AROUND WAS "NOTHING MOVES ON
 * TAP", AND IT HAS BEEN DELIBERATELY REPLACED. The owner asked for the
 * checklist behaviour of a notes app: a checked item travels to the
 * bottom and the checked ones pile up there, so what is left at the top
 * is exactly what is still missing. That is the rule now.
 *
 * WHAT SURVIVES OF THE OLD RULE, because it is what made it safe:
 *
 *   ONLY THE TAPPED ROW CHANGES PLACE. Every unchecked row keeps its
 *   order (`sinkChecked`), so the row that arrives under your thumb is
 *   the one that was directly below — never a surprise from elsewhere.
 *   THE ROW ITSELF IS STILL PAINT-ONLY. Same box, same border width,
 *   same node count checked and unchecked; nothing inside a row resizes.
 *   THE MOVE IS A TRANSFORM. The new order is committed at once and the
 *   travel is drawn on top of it (`useFlip`), so a second tap during the
 *   animation lands on the row it appears to land on.
 *   IT SINKS WITHIN ITS GROUP — its aisle, or its recipe — so a checked
 *   item is still found where you would look for it.
 *
 * TWO THINGS THE REDESIGN CHANGED, AND WHY THEY MAKE THE RULE STRONGER:
 *
 *   The checkbox is a 22px box rather than a swapped icon. Both states
 *   declare the same 1.5px border and the same box, changing only
 *   colour, background and shadow — so `box-sizing: border-box` keeps
 *   the geometry identical and the reflow harness no longer needs its
 *   SVG-internals exemption.
 *
 *   THE CHECK MARK IS ALWAYS IN THE DOM, at `opacity: 0` when unchecked.
 *   Rendering it conditionally would add and remove a node on every tap,
 *   which is a DOM change the harness has to be told to ignore — and an
 *   exemption is a hole. Nothing is added or removed now, so "paint
 *   only" is literally true rather than true-modulo-an-exclusion.
 *
 * ROW GEOMETRY, measured rather than chosen:
 *   56px tall, whole row is the target (~331x56 at 375px) — about 6x the
 *   44px floor by area. The checkbox is a state indicator INSIDE the
 *   target, not the target.
 *   18px name, single line. Measured against all 577 catalog items: at
 *   375px the name column holds 27 characters and exactly two real
 *   ingredients exceed it. Those truncate; the expander carries the
 *   full name.
 *
 * QUANTITIES LIVE IN THE EXPANDER, NOT ON THE ROW. The handoff's row
 * diagram shows `1.5 lb`, which assumes a normalised amount field. This
 * catalog stores whole ingredient lines — measured across a real day,
 * 26 to 53 characters each, none under 12, and one row already carries
 * two of them. There is no column that holds those beside an 18px name.
 * Confirmed with the user; see DEVIATIONS.md.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/* ── WIDE: TWO EXPLICIT COLUMNS, NOT CSS `columns` ────────────────────
 *
 * The prototype lays the sections out with `columns: 2`. That is
 * multi-column flow, which redistributes content BETWEEN columns
 * whenever anything above it changes height — so opening an expander in
 * one column can move rows in the other, rows the user never touched.
 * On phone the worst case is "things below move"; in a flowed pair of
 * columns it is "things sideways move", which is a failure mode the row
 * contract has never had to survive.
 *
 * Worse, jsdom cannot measure column balancing, so the harness could
 * neither prove nor disprove it — the single most important property in
 * the project would have shipped unverifiable.
 *
 * So sections are assigned alternately to two INDEPENDENT columns. A
 * height change in one is structurally incapable of moving the other,
 * which is the same reasoning that made the shell ramp a fixed layer:
 * arrange it so the question cannot arise. Measured on real days, the
 * alternating split lands within 13% — 680/736px and 792/904px — so it
 * reads as balanced columns. Confirmed with the user; see DEVIATIONS.md.
 */
function splitColumns(sections) {
  const a = [], b = []
  sections.forEach((s, i) => (i % 2 === 0 ? a : b).push(s))
  return [a, b]
}

export default function Grocery({ onChange, surface = 'phone' }) {
  const wide = surface === 'tablet' || surface === 'desktop'
  const desktop = surface === 'desktop'
  const {
    weekPlan, planToday, groceryRows: dayRows, groceryChecks, groceryExcluded, groceryDay,
    groceryWeek: week, setGroceryWeek, groceryWeekRows, toggleGroceryItemWeek,
    groceryDayIsToday, setGroceryDay, toggleGroceryItem,
    clearGrocery, undoClear, startNewGroceryList,
    groceryHidden, hideGroceryItem, unhideGroceryItem, unhideAllGroceryItems,
    groceryProgress,
  } = useAppStore()
  const listRef = useRef(null)

  const [openRow, setOpenRow] = useState(null)
  /* COLLAPSE STATE PERSISTS ACROSS DAY CHANGES — it lives here, above
     the day, rather than being re-seeded per day. Which sections you
     want shut is about how you shop, not about which day it is. */
  const [collapsed, setCollapsed] = useState(() => new Set(catalog.collapsedByDefault))
  const [undo, setUndo] = useState(null)
  /* null when shut. Otherwise `{ title, items }` — the whole hidden set
     from the header, or ONE GROUP'S from its note. Both openings are
     one piece of state rather than a list plus a separate title,
     because a title left over from the other opening is a sheet that
     lies about what it is showing. */
  const [hiddenSheet, setHiddenSheet] = useState(null)
  const scrollPin = useRef(null)

  /* ── THE WHOLE WEEK IS A THIRD READING, NOT A SECOND LIST ───────────
     `week` swaps which rows the aisle list walks and how a row's check
     is read and written; everything below — sections, counts, Clear,
     the sink — runs on `rows`, `isChecked` and `toggle` and does not
     know which it has. See buildWeekGroceryItems. */
  const rows = week ? groceryWeekRows : dayRows
  const weekById = useMemo(
    () => new Map(groceryWeekRows.map(r => [r.id, r])), [groceryWeekRows])
  const toggle = week ? toggleGroceryItemWeek : toggleGroceryItem

  const sections = useMemo(() => groupBySection(rows, catalog), [rows])
  const hiddenNamed = useMemo(() => hiddenItemsNamed(groceryHidden, catalog), [groceryHidden])

  const isChecked = id => (week
    ? weekRowChecked(weekById.get(id), groceryChecks)
    : groceryChecks.has(dayKey(groceryDay, id)))
  /* THE ORDER THINGS WERE CHECKED IN, which is the order they pile up
     in. A Set iterates in insertion order and the stored array keeps it,
     so this survives a reload without a second field to keep in step.

     A week row is got when its LAST day's key went in, so that is its
     place in the pile. */
  const checkRank = useMemo(() => {
    const rank = new Map()
    let n = 0
    for (const k of groceryChecks) rank.set(k, n++)
    if (!week) return id => rank.get(dayKey(groceryDay, id)) ?? -1
    return id => {
      const row = weekById.get(id)
      if (!weekRowChecked(row, groceryChecks)) return -1
      return Math.max(...weekRowKeys(row).map(k => rank.get(k)))
    }
  }, [groceryChecks, groceryDay, week, weekById])
  const done = rows.filter(r => isChecked(r.id)).length
  const left = rows.length - done
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0

  const day = weekPlan[groceryDay]
  const mealCount = week
    ? weekPlan.reduce((n, d) => n + (d.ids || []).filter(Boolean).length, 0)
    : (day?.ids || []).filter(Boolean).length

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

  /* An open expander belongs to a row on a particular day. Leaving it
     open across a day change would reveal a different item's amounts
     under the same chevron. */
  useEffect(() => { setOpenRow(null) }, [groceryDay, week])

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
      setTimeout(() => setUndo(u => (u === restored ? null : u)), 3500)
    }
  }

  /* ── TWO READINGS OF ONE DAY (block F) ──────────────────────────────
     BY MEAL, or BY AISLE. `mode` is which reading is on screen, NOT
     which day: AISLES keeps the selected day and walks the same items
     in shop order.

     THERE IS NO SECOND STORE BEHIND THIS. Both readings show the same
     day's items, so both read and write the one `dayIndex:itemId` check
     Set, the one exclusion set, and the one CHECKS_VERSION. An item
     ticked under a recipe is ticked in the aisle, and an ingredient two
     recipes share ticks in both groups at once — it is one shop, and
     buying a thing once buys it. DEVIATIONS §21.

     So `left`, `done` and `pct` above serve both views unchanged: the
     day view's item set IS `rows`, which the parity test in
     groceryByDay.test.js asserts on every day of the fixture. */
  const [mode, setMode] = useState('day')
  /* The week is always read by aisle: by meal it would be fourteen
     recipe blocks, which is the Plan screen with checkboxes. */
  const dayView = !week && mode === 'day'

  /* Rows travel when their order changes — but only within one list.
     Another day, the other reading, or the week is a different list. */
  useFlip(listRef, `${week ? 'week' : groceryDay}|${mode}`)

  /* "Nothing planned" only when there is genuinely no meal. A day whose
     items were all cleared has nothing to BUY, which is a different
     sentence and the one the aisle view has always shown. */
  const headerLabel = rows.length === 0
    ? (dayView && mealCount === 0 ? 'Nothing planned' : 'Nothing to buy')
    : left === 0 ? 'All done'
      : `${left} left`

  const dayName = (day?.day || '').toUpperCase()
  const subLine = [
    week ? 'WHOLE WEEK' : (groceryDayIsToday ? 'TODAY' : null),
    week ? null : dayName,
    `${mealCount} MEAL${mealCount === 1 ? '' : 'S'}`,
  ].filter(Boolean).join(' · ')
  return (
    <div ref={listRef} style={{ paddingBottom: 92 }}>

      {/* ── Sticky header ───────────────────────────────────────────
          Never scrolls away: what is left, how far you are, and what
          Clear will do are all things you look at mid-aisle. */}
      <div data-grocery-header style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--pq-header-bg)',
        borderBottom: '1px solid var(--pq-rule-strong)',
        boxShadow: 'var(--pq-header-shadow)',
        padding: '12px var(--pq-gutter) 10px',
        display: 'flex', flexDirection: 'column', gap: 9,
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <span style={{
              fontSize: 19, fontWeight: 700, color: 'var(--pq-text)', letterSpacing: '-.01em',
            }}>{headerLabel}</span>
            <div style={{
              ...MONO, fontSize: 'var(--pq-size-eyebrow)', color: 'var(--pq-text-2)',
              letterSpacing: 'var(--pq-track-label)', marginTop: 3,
            }}>{subLine}</div>

            {/* A ONE-WAY DOOR WOULD BE A TRAP. Hiding a row removes it
                with nothing left on the list to say so, so the count is
                the way back — and it is in the header rather than
                buried, because it is the only place that knows about
                items no planned recipe currently asks for. */}
            {hiddenNamed.length > 0 && (
              <button
                data-hidden-count
                onClick={() => setHiddenSheet({
                  title: 'Hidden items', items: hiddenNamed,
                })}
                style={{
                  marginTop: 5, minHeight: 'var(--pq-tap-min)', padding: 0,
                  background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left', color: 'var(--pq-text-muted)',
                  ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 500,
                  letterSpacing: 'var(--pq-track-label)',
                  textDecoration: 'underline', textUnderlineOffset: 3,
                }}>{hiddenNamed.length} hidden</button>
            )}
          </div>
          <button
            onClick={onClear}
            disabled={done === 0}
            style={{
              flexShrink: 0, minHeight: 'var(--pq-tap-min)', padding: '0 14px',
              borderRadius: 'var(--pq-r-button)', border: 'none',
              cursor: done ? 'pointer' : 'default',
              background: done ? 'var(--pq-accent-grad)' : 'transparent',
              boxShadow: done ? 'var(--pq-accent-raise)' : 'none',
              color: done ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-faint)',
              ...MONO, fontSize: 'var(--pq-size-body)', fontWeight: 600,
              letterSpacing: '.04em',
            }}>{done ? `CLEAR ${done}` : 'CLEAR'}</button>
        </div>

        {/* Its agreed slot — under the header row, above the day chips.
            Parked since block B because neither existed until now. */}
        <SyncErrorBanner />

        {/* ── Day chips ─────────────────────────────────────────────
            On wide these move to the side pane, where there is room for
            full day labels and the progress bar beside them. */}
        {/* ── Day pills ─────────────────────────────────────────────
            MON…SUN plus AISLES, on every surface now: the day view puts
            the selector in the header on all four frames, and a second
            copy in the wide side pane would be two controls for one
            choice. The side pane keeps the progress readout and drops
            its day list — see DEVIATIONS §18.

            AISLES IS A MODE, NOT AN EIGHTH DAY, and the spec's "eighth
            pill after SUN" is followed in place but not in behaviour.
            Mutually exclusive pills would mean nothing is lit on MON…SUN
            while AISLES is active — and the consolidated list underneath
            it is DAY-SCOPED (DEVIATIONS §4), so the one thing the user
            most needs to see is which day it is for. So the day pills
            show the selected day whatever the mode, AISLES toggles the
            reading, and two pills are lit at once on purpose: "Monday",
            and "the whole list for it". See DEVIATIONS §17. */}
        <div style={{ display: 'flex', gap: wide ? 8 : 5, flexWrap: wide ? 'wrap' : 'nowrap' }}>
          {/* THE WHOLE WEEK, FIRST. It is the list for the weekly shop
              and the days are slices of it, so it leads the row. Words,
              not a letter, for the reason the AISLES pill is an icon: a
              single letter here would read as an eighth day. */}
          <button
            data-week-pill
            onClick={() => setGroceryWeek(true)}
            aria-pressed={week}
            aria-label="Whole week — everything for every planned meal"
            style={{
              flex: wide ? '0 0 auto' : 1.25, minHeight: 'var(--pq-tap-min)',
              display: 'flex', alignItems: 'center',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            }}>
            <span style={{
              flex: 1, minHeight: 36, borderRadius: 'var(--pq-r-chip)',
              padding: wide ? '0 18px' : 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
              background: week ? 'var(--pq-accent-grad)' : 'transparent',
              boxShadow: week ? 'var(--pq-accent-raise)' : 'none',
              border: `1px solid ${week ? 'var(--pq-accent-grad)' : 'var(--pq-pill-border)'}`,
              color: week ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-3)',
              ...MONO, fontSize: wide ? 11 : 10, fontWeight: 600,
              letterSpacing: 'var(--pq-track-chip)',
            }}>
              {wide ? 'WHOLE WEEK' : 'ALL'}
              <span aria-hidden="true" style={{ fontSize: 8, opacity: 0.75 }}>{' '}</span>
            </span>
          </button>

          {weekPlan.map((d, i) => {
            const on = !week && i === groceryDay
            const hasMeals = (d.ids || []).some(Boolean)
            /* The pill knows what the list under it is doing: a day
               whose every item is got shows a tick instead of the dot. */
            const prog = groceryProgress?.[i]
            const allGot = !!prog && prog.total > 0 && prog.got === prog.total
            return (
              /* The pill is the design's 36px; the TARGET around it is
                 the handoff's own 44px floor. Growing the pill would
                 change the design, shrinking the target would break the
                 rule the same document states two sections later. Same
                 treatment as the filter chips and the close tile. */
              <button
                key={d.day}
                data-day-pill
                onClick={() => setGroceryDay(i)}
                aria-pressed={on}
                aria-label={`${d.day}${hasMeals ? (allGot ? ', all got' : '') : ', no meals'}`}
                style={{
                  flex: wide ? '0 0 auto' : 1, minHeight: 'var(--pq-tap-min)',
                  display: 'flex', alignItems: 'center',
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                }}>
                <span style={{
                  flex: 1, minHeight: 36, borderRadius: 'var(--pq-r-chip)',
                  padding: wide ? '0 18px' : 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 2,
                  background: on ? 'var(--pq-accent-grad)' : 'transparent',
                  boxShadow: on ? 'var(--pq-accent-raise)' : 'none',
                  border: `1px solid ${on ? 'var(--pq-accent-grad)' : 'var(--pq-pill-border)'}`,
                  color: on ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-3)',
                  ...MONO, fontSize: wide ? 11 : 10, fontWeight: 600,
                  letterSpacing: 'var(--pq-track-chip)',
                }}>
                  {wide ? d.day.toUpperCase() : DAY_LETTERS[i]}
                  <span aria-hidden="true" style={{ fontSize: 8, opacity: 0.75 }}>
                    {allGot ? '✓' : hasMeals ? '•' : ' '}
                  </span>
                </span>
              </button>
            )
          })}

          <button
            data-day-pill
            data-aisles-pill
            /* In the week there is only the aisle reading, so the pill
               is lit and has nothing to switch to. */
            onClick={() => { if (!week) setMode(m => (m === 'week' ? 'day' : 'week')) }}
            aria-pressed={!dayView}
            aria-disabled={week || undefined}
            aria-label="Aisles — this day's items in store order"
            style={{
              flex: wide ? '0 0 auto' : 1, minHeight: 'var(--pq-tap-min)',
              display: 'flex', alignItems: 'center',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            }}>
            <span style={{
              flex: 1, minHeight: 36, borderRadius: 'var(--pq-r-chip)',
              padding: wide ? '0 18px' : 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
              background: !dayView ? 'var(--pq-accent-grad)' : 'transparent',
              boxShadow: !dayView ? 'var(--pq-accent-raise)' : 'none',
              border: `1px solid ${!dayView ? 'var(--pq-accent-grad)' : 'var(--pq-pill-border)'}`,
              color: !dayView ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-3)',
              ...MONO, fontSize: wide ? 11 : 10, fontWeight: 600,
              letterSpacing: 'var(--pq-track-chip)',
            }}>
              {/* A LETTER WOULD READ AS A DAY. On phone the seven day
                  pills are single letters — M T W T F S S — so an "A"
                  in the eighth slot scans as an eighth day rather than
                  as a different kind of control. An icon cannot be
                  mistaken for one. The pill keeps flex: 1, so the row
                  is still eight equal widths.

                  A list, not a cart: what it switches to is the same
                  day's items in store order, and a cart would suggest
                  something to do with buying rather than with sorting. */}
              {wide ? 'AISLES' : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  aria-hidden="true" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 6h12" /><path d="M8 12h12" /><path d="M8 18h12" />
                  <path d="M3.5 6h.01" /><path d="M3.5 12h.01" /><path d="M3.5 18h.01" />
                </svg>
              )}
              {/* Holds the same vertical space the day pills' meal dot
                  does, so all eight pills are one height. */}
              <span aria-hidden="true" style={{ fontSize: 8, opacity: 0.75 }}>{' '}</span>
            </span>
          </button>
        </div>

        {/* ── Progress ────────────────────────────────────────────────
            A fixed 4px track that clips its fill, so the width change on
            a tap cannot alter the header's height and cannot move the
            list beneath it. */}
        <div style={{
          height: 6, borderRadius: 3, overflow: 'hidden',
          background: 'var(--pq-track-bg)', boxShadow: 'var(--pq-track-shadow)',
        }}>
          <div data-progress-fill style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 3,
            background: 'var(--pq-accent-bar)', transition: 'width .4s ease',
          }} />
        </div>
      </div>

      {/* ── Empty day ───────────────────────────────────────────────
          The dashed block, NOT a header with empty sections under it.
          Empty sections would read as a list you had finished. */}
      {/* Two readings of the same day. The day view is the default; AISLES
          hands back the consolidated store-walk list below, unchanged. */}
      {dayView ? (
        <GroceryDay
          weekPlan={weekPlan}
          dayIndex={groceryDay}
          excluded={groceryExcluded}
          surface={surface}
          isChecked={id => isChecked(id)}
          checkRank={checkRank}
          onToggle={toggleGroceryItem}
          onHide={hideGroceryItem}
          hidden={groceryHidden}
          onShowHidden={(items, title) => setHiddenSheet({ title, items })}
          onChange={onChange}
        />
      ) : rows.length === 0 ? (
        <div style={{ padding: '28px var(--pq-gutter) 0' }}>
          <EmptyBlock>
            <p style={{
              margin: '0 0 6px', fontSize: 'var(--pq-size-meal)', fontWeight: 600,
              color: 'var(--pq-text-2)',
            }}>Nothing to buy {week ? 'this week' : `for ${day?.day || 'this day'}`}</p>
            <p style={{
              ...MONO, margin: '0 0 18px', fontSize: 12, color: 'var(--pq-text-muted)',
              lineHeight: 1.6,
            }}>{mealCount === 0
              ? (week ? 'NO MEALS PLANNED THIS WEEK' : 'NO MEALS ASSIGNED TO THIS DAY')
              : 'EVERYTHING HERE IS CLEARED'}</p>
            <button
              onClick={() => onChange?.('plan')}
              style={{
                minHeight: 'var(--pq-tap-min)', padding: '0 18px',
                borderRadius: 'var(--pq-r-button)', border: 'none', cursor: 'pointer',
                background: 'var(--pq-accent-grad)', boxShadow: 'var(--pq-accent-raise)',
                color: 'var(--pq-on-accent-ink)',
                ...MONO, fontSize: 12, fontWeight: 600, letterSpacing: 'var(--pq-track-chip)',
              }}>OPEN THE WEEK PLAN</button>
          </EmptyBlock>
        </div>
      ) : (
        <div data-grocery-list style={{
          padding: '10px var(--pq-gutter)',
          ...(wide ? {
            display: 'grid',
            /* minmax(0,…), not a bare 1fr — see Today's macro card.
               A sections region forced wider than its track pushes the
               side pane off the viewport, and body{overflow-x:hidden}
               makes that read as a cut-off rather than a scrollbar. */
            gridTemplateColumns: desktop
              ? 'minmax(0,1fr) 320px' : 'minmax(0,1fr) 280px',
            gap: desktop ? 26 : 20, alignItems: 'start',
          } : null),
        }}>
          {/* Left region. On desktop it splits again into two
              independent columns, giving three in total. */}
          <div style={desktop ? {
            display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
            gap: 26, alignItems: 'start',
          } : undefined}>
          {(desktop ? splitColumns(sections) : [sections]).map((group, gi) => (
          <div key={gi}>
          {group.map(section => {
            const shut = collapsed.has(section.name)
            return (
              <section key={section.name}>
                <button
                  onClick={() => toggleSection(section.name)}
                  aria-expanded={!shut}
                  style={{
                    width: '100%', minHeight: 'var(--pq-tap-min)',
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: '10px 0 6px', textAlign: 'left', fontFamily: 'var(--pq-sans)',
                  }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                    stroke="var(--pq-text-3)" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: shut ? 'rotate(-90deg)' : 'none' }}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                  <span style={{
                    ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 600,
                    letterSpacing: 'var(--pq-track-section)', textTransform: 'uppercase',
                    color: 'var(--pq-text-muted)',
                  }}>{section.name}</span>
                  <span style={{
                    ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 500,
                    color: 'var(--pq-text-3)',
                  }}>{section.items.length}</span>
                </button>

                {/* Still-needed first in shop order, got ones after in
                    the order they were got. */}
                {!shut && sinkChecked(section.items, it => checkRank(it.id)).map(item => {
                  const checked = isChecked(item.id)
                  const open = openRow === item.id
                  return (
                    <GroceryRow
                      key={item.id}
                      flipKey={`a:${item.id}`}
                      name={item.name}
                      /* THE DAY'S TOTAL for this item: item.qty holds
                         every line that asked for it, across the day's
                         recipes. The day view shows the per-recipe
                         amount instead. */
                      amount={amountFor(item.qty)}
                      checked={checked}
                      onToggle={() => toggle(item.id)}
                      open={open}
                      onToggleOpen={() => setOpenRow(open ? null : item.id)}
                      badge={item.meals.length}
                      expanderLabel={`${item.meals.length} meal${item.meals.length === 1 ? '' : 's'} need ${item.name}`}
                    >
                      <GroceryRowPanel onHide={() => hideGroceryItem(item.id)}>
                        <p style={{
                          margin: '0 0 6px', fontSize: 'var(--pq-size-body)', fontWeight: 600,
                          color: 'var(--pq-text)', wordBreak: 'break-word',
                        }}>{item.name}</p>
                        {item.qty.map((q, i) => (
                          <p key={i} style={{
                            ...MONO, margin: '0 0 2px', fontSize: 12,
                            color: 'var(--pq-text-muted)',
                          }}>
                            {q}
                            <span style={{ display: 'block', opacity: 0.7 }}>
                              — {recipeById[item.qtyFrom?.[i]]?.name || 'this day'}
                              {/* In the week, which day wants it. */}
                              {week && weekPlan[item.qtyDay?.[i]]
                                ? ` · ${weekPlan[item.qtyDay[i]].day.toUpperCase()}` : ''}
                            </span>
                          </p>
                        ))}
                        <p style={{
                          margin: '6px 0 0', fontSize: 12, color: 'var(--pq-text-3)',
                          lineHeight: 1.5,
                        }}>
                          For: {item.meals.map(id => recipeById[id]?.name).filter(Boolean).join(', ')}
                        </p>
                      </GroceryRowPanel>
                    </GroceryRow>
                  )
                })}
              </section>
            )
          })}
          </div>
          ))}
          </div>

          {/* The side pane: which day, and how far through it you are.
              On phone both live in the sticky header; here there is room
              for full day names beside the list rather than above it. */}
          {wide && (
            <aside data-grocery-side style={{
              position: 'sticky', top: 10,
              display: 'flex', flexDirection: 'column', gap: 12,
              padding: 16, borderRadius: 'var(--pq-r-card)',
              background: 'var(--pq-panel)',
              border: '1px solid var(--pq-rule-soft)',
            }}>
              <div style={{
                ...MONO, fontSize: 'var(--pq-size-label)', fontWeight: 600,
                color: 'var(--pq-text-3)', letterSpacing: 'var(--pq-track-section)',
              }}>SHOPPING FOR</div>
              {/* The day LIST that used to live here is gone: block F
                  moved the selector into the sticky header on every
                  surface, and two controls for one choice is how they
                  drift apart. The pane keeps what the header has no room
                  for — the day name in full and the progress readout.
                  DEVIATIONS §18. */}
              <div style={{
                fontSize: "var(--pq-size-meal)", fontWeight: 700,
                color: "var(--pq-text)",
              }}>{week ? 'Whole week' : (day?.day || '')}</div>

              <div style={{
                ...MONO, fontSize: 'var(--pq-size-label)', fontWeight: 600,
                color: 'var(--pq-text-3)', letterSpacing: 'var(--pq-track-section)',
                marginTop: 4,
              }}>PROGRESS</div>
              <div style={{
                height: 5, borderRadius: 3, overflow: 'hidden',
                background: 'var(--pq-track-bg)', boxShadow: 'var(--pq-track-shadow)',
              }}>
                <div style={{
                  height: '100%', width: `${pct}%`, borderRadius: 3,
                  background: 'var(--pq-accent-bar)', transition: 'width .4s ease',
                }} />
              </div>
              <div style={{ ...MONO, fontSize: 12, color: 'var(--pq-text-muted)' }}>
                {done} OF {rows.length} · {pct}%
              </div>

              <button
                onClick={startNewGroceryList}
                style={{
                  marginTop: 4, minHeight: 'var(--pq-tap-min)',
                  borderRadius: 'var(--pq-r-button)', background: 'transparent',
                  border: '1px solid var(--pq-rule-soft)', cursor: 'pointer',
                  color: 'var(--pq-text-muted)',
                  ...MONO, fontSize: 11, fontWeight: 500,
                  letterSpacing: 'var(--pq-track-chip)',
                }}>START A NEW LIST</button>
            </aside>
          )}

          {!wide && <button
            onClick={startNewGroceryList}
            style={{
              width: '100%', minHeight: 'var(--pq-tap-min)', marginTop: 24,
              borderRadius: 'var(--pq-r-button)', background: 'transparent',
              border: '1px solid var(--pq-rule-soft)', cursor: 'pointer',
              color: 'var(--pq-text-muted)',
              ...MONO, fontSize: 12, fontWeight: 500, letterSpacing: 'var(--pq-track-chip)',
            }}>START A NEW LIST</button>}
        </div>
      )}

      {/* THE WAY BACK TO THE PLAN, from a list that has something on it.
          The empty states already offer it; a full list did not, so the
          one screen that decides what is on this list was a tab away
          with nothing pointing at it. */}
      {rows.length > 0 && (
        <div style={{ padding: '14px var(--pq-gutter) 0' }}>
          <button
            data-grocery-to-plan
            onClick={() => onChange?.('plan')}
            style={{
              width: '100%', minHeight: 'var(--pq-tap-min)',
              borderRadius: 'var(--pq-r-button)', background: 'transparent',
              border: '1px solid var(--pq-rule-soft)', cursor: 'pointer',
              color: 'var(--pq-text-muted)',
              ...MONO, fontSize: 12, fontWeight: 500, letterSpacing: 'var(--pq-track-chip)',
            }}>{week ? 'CHANGE THE WEEK’S MEALS IN THE PLAN'
              : `CHANGE ${dayName}’S MEALS IN THE PLAN`}</button>
        </div>
      )}

      <HiddenSheet
        open={hiddenSheet !== null}
        title={hiddenSheet?.title || 'Hidden items'}
        items={hiddenSheet?.items || []}
        onClose={() => setHiddenSheet(null)}
        onRestore={(id) => {
          unhideGroceryItem(id)
          /* Drop it from the open list too, so the sheet reflects the
             restore without being reopened. */
          setHiddenSheet(s => {
            const next = (s?.items || []).filter(i => i.itemId !== id)
            return next.length ? { ...s, items: next } : null
          })
        }}
        /* Only when the sheet IS the whole set: "show all" inside one
           recipe's view would restore items that recipe never
           mentioned. */
        onRestoreAll={hiddenSheet && hiddenSheet.items.length === hiddenNamed.length
          ? () => { unhideAllGroceryItems(); setHiddenSheet(null) }
          : undefined}
      />

      {/* Undo rather than a confirm dialog: a dialog in a supermarket is
          two taps and a moment of doubt. */}
      {undo && (
        <div role="status" style={{
          position: 'fixed', left: 12, right: 12, zIndex: 102,
          bottom: 'calc(var(--pq-nav-h) + 12px + env(safe-area-inset-bottom))',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '12px 14px', borderRadius: 'var(--pq-r-button)',
          background: 'var(--pq-sheet-bg)', border: 'var(--pq-card-border)',
          boxShadow: 'var(--pq-sheet-shadow)', color: 'var(--pq-text)',
        }}>
          <span style={{ ...MONO, fontSize: 12, letterSpacing: 'var(--pq-track-chip)' }}>
            {undo.size} REMOVED
          </span>
          <button
            onClick={() => { undoClear(undo); setUndo(null) }}
            style={{
              minHeight: 'var(--pq-tap-min)', padding: '0 4px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--pq-accent)',
              ...MONO, fontSize: 12, fontWeight: 700, letterSpacing: 'var(--pq-track-chip)',
            }}>UNDO</button>
        </div>
      )}
    </div>
  )
}
