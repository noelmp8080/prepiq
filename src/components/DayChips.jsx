/* ── Seven day chips — pick a day in one tap ──────────────────────────
 *
 * Adding a meal used to be: open the recipe, find ADD TO PLAN at the
 * bottom, wait for a second sheet, pick a day from a list. The days are
 * now ON the thing you are looking at, as seven chips, in two places:
 *
 *   Recipes      the chips choose WHICH DAY the + on every row adds to.
 *   RecipeSheet  the chips ARE the add: tap WED and it is on Wednesday.
 *
 * Same chips, same look, so the days read as one control wherever they
 * appear. What a tap MEANS is the caller's — this component only draws
 * the row and reports the index.
 *
 * `count(i)` is the small number under the letter: how many meals that
 * day already holds, so you can see the week filling up as you add.
 * `isOn(i)` lights a chip; `isToday(i)` rings it.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }

export default function DayChips({ days = [], isOn, isToday, count, onPick, label }) {
  return (
    <div role="group" aria-label={label} data-day-chips
      style={{ display: 'flex', gap: 5 }}>
      {days.map((d, i) => {
        const on = !!isOn?.(i)
        const today = !!isToday?.(i)
        const n = count?.(i) ?? 0
        return (
          <button
            key={d.day}
            data-day-chip
            onClick={() => onPick?.(i)}
            aria-pressed={on}
            aria-label={`${d.day}${today ? ', today' : ''}, ${n} meal${n === 1 ? '' : 's'}`}
            style={{
              flex: 1, minWidth: 0, minHeight: 'var(--pq-tap-min)',
              display: 'flex', alignItems: 'center',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            }}>
            <span style={{
              flex: 1, minHeight: 40, borderRadius: 'var(--pq-r-chip)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
              background: on ? 'var(--pq-accent-grad)' : 'var(--pq-panel)',
              boxShadow: on ? 'var(--pq-accent-raise)' : 'none',
              border: `1px solid ${on ? 'transparent'
                : today ? 'var(--pq-accent)' : 'var(--pq-rule-soft)'}`,
              color: on ? 'var(--pq-on-accent-ink)'
                : today ? 'var(--pq-accent)' : 'var(--pq-text-2)',
              ...MONO, fontSize: 11, fontWeight: 600,
              letterSpacing: 'var(--pq-track-chip)',
            }}>
              {d.day.toUpperCase()}
              <span aria-hidden="true" style={{ fontSize: 9, fontWeight: 500, opacity: 0.8 }}>
                {n || '·'}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
