import { useState, useMemo } from 'react'
import Card, { CARD_ROW_RULE } from './Card'
import Thumb from './Thumb'
import RecipeSheet from './RecipeSheet'
import { useAppStore } from '../store/useAppStore'
import { recipes } from '../data/recipes'

/* ── Recipes — finding one of 260 ─────────────────────────────────────
 *
 * Search, filter, open. Assigning to a day happens in the recipe sheet's
 * ADD TO PLAN, not from a trailing button here: the prototype's trailing
 * control is the favourite heart, and a list row with two different
 * commit actions is a row where you learn which is which by getting it
 * wrong. The README describes an assign button; the markup draws a
 * heart. Ruled toward the markup, like the rest of this block.
 *
 * PAGINATED. 260 rows is 260 thumbnails, and the whole list is not what
 * anyone is looking at — you search, or you filter, or you take the
 * first screenful. LOAD MORE says how many remain rather than pretending
 * the list ended.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }


/* Every value here exists in the catalog — checked against it rather
   than copied from the prototype and hoped for. Counts at the time of
   writing: high-protein 198, under-500 131, chicken 123, low-fat 95,
   rice-bowls 66, pasta 52, seafood 14; jalal 136, mealprep 124. */
const FILTERS = [
  { label: 'ALL',          test: () => true },
  { label: "JALAL'S",      test: r => r.source === 'jalal' },
  { label: 'MEAL PREP',    test: r => r.source === 'mealprep' },
  { label: 'HIGH PROTEIN', test: r => r.tags.includes('high-protein') },
  { label: 'UNDER 500',    test: r => r.tags.includes('under-500') },
  { label: 'LOW FAT',      test: r => r.tags.includes('low-fat') },
  { label: 'CHICKEN',      test: r => r.tags.includes('chicken') },
  { label: 'PASTA',        test: r => r.tags.includes('pasta') },
  { label: 'RICE BOWLS',   test: r => r.tags.includes('rice-bowls') },
  { label: 'SEAFOOD',      test: r => r.tags.includes('seafood') },
  { label: 'FAVES',        test: (r, favs) => favs.has(r.id) },
]

/* More columns where the data supports it. 260 rows in one column is a
   scroll; in three it is a page you can scan. The ROW is unchanged —
   same thumb, same name, same heart — only how many sit side by side. */
const RESULT_COLS = { tablet: 'repeat(2,minmax(0,1fr))', desktop: 'repeat(3,minmax(0,1fr))' }
const PAGES = { phone: 40, tablet: 48, desktop: 60 }

export default function Recipes({ surface = 'phone' }) {
  const { favorites, toggleFavorite } = useAppStore()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('ALL')
  const PAGE = PAGES[surface] || PAGES.phone
  const [shown, setShown] = useState(PAGE)
  const [sheetRecipe, setSheetRecipe] = useState(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const f = FILTERS.find(x => x.label === filter) || FILTERS[0]
    return recipes.filter(r => f.test(r, favorites) && (!q || r.name.toLowerCase().includes(q)))
  }, [query, filter, favorites])

  const visible = filtered.slice(0, shown)
  const remaining = filtered.length - visible.length

  /* Any change to what is being listed starts the page count over —
     otherwise a search inherits the previous list's depth and shows 200
     matches at once, or shows LOAD MORE against a list of three. */
  const change = fn => (...args) => { fn(...args); setShown(PAGE) }

  return (
    <div>
      <div style={{ padding: '24px 20px 0' }}>
        <div style={{
          ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 500,
          color: 'var(--pq-text-muted)', letterSpacing: 'var(--pq-track-eyebrow)',
          marginBottom: 6,
        }}>{filtered.length} OF {recipes.length} RECIPES</div>
        <h1 style={{
          margin: 0, fontSize: 'var(--pq-size-title)', fontWeight: 700,
          letterSpacing: 'var(--pq-tight-title)', lineHeight: 1, color: 'var(--pq-text)',
        }}>Recipes</h1>
      </div>

      <div style={{ padding: '16px var(--pq-gutter) 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--pq-panel)',
          border: '1px solid var(--pq-rule-soft)',
          borderRadius: 'var(--pq-r-button)',
          padding: '11px 14px',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            stroke="var(--pq-text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={change(e => setQuery(e.target.value))}
            placeholder="Search recipes"
            aria-label="Search recipes"
            style={{
              flex: 1, minWidth: 0, minHeight: 22,
              background: 'none', border: 'none', outline: 'none',
              fontSize: 'var(--pq-size-row)', color: 'var(--pq-text)',
              fontFamily: 'var(--pq-sans)',
            }}
          />
        </div>
      </div>

      {/* Chips are drawn at the design's size and TARGETED at 44px — the
          button is 44 tall, the painted pill inside it is not. Growing
          the pill to 44 would have changed the design; shrinking the
          target would have broken the handoff's own floor. */}
      <div style={{
        padding: '12px var(--pq-gutter) 0', display: 'flex', gap: 6,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        {FILTERS.map(f => {
          const on = filter === f.label
          return (
            <button
              key={f.label}
              onClick={change(() => setFilter(f.label))}
              aria-pressed={on}
              style={{
                flexShrink: 0, minHeight: 'var(--pq-tap-min)',
                display: 'flex', alignItems: 'center',
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              }}>
              <span style={{
                padding: '7px 12px', borderRadius: 'var(--pq-r-chip)',
                ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 500,
                letterSpacing: '.04em', whiteSpace: 'nowrap',
                background: on ? 'var(--pq-accent-grad)' : 'var(--pq-panel)',
                boxShadow: on ? 'var(--pq-accent-raise)' : 'none',
                border: `1px solid ${on ? 'transparent' : 'var(--pq-rule-soft)'}`,
                color: on ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-3)',
              }}>{f.label}</span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <p style={{
          margin: 0, padding: '32px 20px', textAlign: 'center',
          fontSize: 'var(--pq-size-body)', color: 'var(--pq-text-3)',
        }}>No recipes match</p>
      ) : (
        <Card style={{
          margin: '14px var(--pq-gutter) 0',
          ...(RESULT_COLS[surface] ? {
            display: 'grid', gridTemplateColumns: RESULT_COLS[surface],
          } : null),
        }}>
          {visible.map(r => {
            const faved = favorites.has(r.id)
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', borderBottom: CARD_ROW_RULE }}>
                <button
                  onClick={() => setSheetRecipe(r)}
                  style={{
                    flex: 1, minWidth: 0, minHeight: 'var(--pq-tap-min)',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 0 11px 12px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    textAlign: 'left', fontFamily: 'var(--pq-sans)',
                  }}>
                  <Thumb recipe={r} size={48} src={r.image} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block', fontSize: 'var(--pq-size-row)', fontWeight: 600,
                      color: 'var(--pq-text)', letterSpacing: '-.01em',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{r.name}</span>
                    <span style={{
                      ...MONO, display: 'block', fontSize: 'var(--pq-size-eyebrow)',
                      color: 'var(--pq-text-muted)', marginTop: 3,
                    }}>{r.cal} KCAL · {r.protein}P · {r.carbs}C · {r.fat}F</span>
                  </span>
                </button>
                <button
                  onClick={() => toggleFavorite(r.id)}
                  aria-label={faved ? `Remove ${r.name} from favourites` : `Add ${r.name} to favourites`}
                  aria-pressed={faved}
                  style={{
                    flexShrink: 0, width: 'var(--pq-tap-min)', height: 70,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  }}>
                  <svg width="15" height="15" viewBox="0 0 24 24"
                    fill={faved ? 'var(--pq-accent)' : 'none'}
                    stroke={faved ? 'var(--pq-accent)' : 'var(--pq-text-3)'}
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                  </svg>
                </button>
              </div>
            )
          })}
        </Card>
      )}

      {remaining > 0 && (
        <div style={{ padding: '14px var(--pq-gutter)' }}>
          <button
            onClick={() => setShown(n => n + PAGE)}
            style={{
              width: '100%', minHeight: 'var(--pq-tap-min)',
              borderRadius: 'var(--pq-r-button)', background: 'transparent',
              border: '1px solid var(--pq-rule-soft)', cursor: 'pointer',
              color: 'var(--pq-text-2)',
              ...MONO, fontSize: 12, fontWeight: 500, letterSpacing: 'var(--pq-track-chip)',
            }}>LOAD MORE · {remaining} LEFT</button>
        </div>
      )}

      <RecipeSheet recipe={sheetRecipe} onClose={() => setSheetRecipe(null)} />
    </div>
  )
}
