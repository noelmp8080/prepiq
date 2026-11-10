import { Home, Calendar, ChefHat, ShoppingCart, ChartColumn } from 'lucide-react'

/* Bottom nav — 64px, five destinations.
 *
 * Icon shapes are matched to the prototype rather than copied as paths,
 * as the handoff allows since the app already has lucide. Verified
 * against the prototype markup one by one:
 *
 *   TODAY    m3 9 9-7 9 7v11a...        House
 *   PLAN     M8 2v4 ...                 Calendar
 *   RECIPES  M17 21a1 1 0 ...           ChefHat
 *   GROCERY  circle cx=8 cy=21 ...      ShoppingCart
 *   TRACK    M3 3v16a2 2 0 0 0 2 2h16   ChartColumn
 *
 * ChartColumn, not BarChart3: same shape, current name. BarChart3 is
 * lucide's deprecated alias for it.
 *
 * ACTIVE STATE IS STROKE WEIGHT AS WELL AS COLOUR — 2.4 against 1.8.
 * Colour alone would leave the active tab indistinguishable to anyone
 * who cannot separate chartreuse from grey.
 */

const TABS = [
  { id: 'today',   label: 'TODAY',   Icon: Home },
  { id: 'plan',    label: 'PLAN',    Icon: Calendar },
  { id: 'recipes', label: 'RECIPES', Icon: ChefHat },
  { id: 'grocery', label: 'GROCERY', Icon: ShoppingCart, badge: true },
  { id: 'track',   label: 'TRACK',   Icon: ChartColumn },
]

export default function BottomNav({ active, onChange, badges = {} }) {
  return (
    <nav
      aria-label="Primary"
      style={{
        /* A FLOATING CAPSULE, not a bar docked to the edge. It sits 12px
           in from the sides and clear of the home indicator, with the
           current tab filled in ink. Paper and ink has no gradients or
           blur; the capsule is one flat surface with a hairline. */
        position: 'absolute', left: 12, right: 12,
        bottom: 'calc(10px + var(--pq-safe-b))',
        height: 'var(--pq-nav-h)',
        background: 'var(--pq-nav-bg)',
        border: 'var(--pq-card-border)',
        borderRadius: 999,
        boxShadow: 'var(--pq-nav-shadow)',
        display: 'flex', gap: 2, padding: 5,
        zIndex: 100,
      }}
    >
      {TABS.map(({ id, label, Icon, badge }) => {
        const on = active === id
        const color = on ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-faint)'
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-current={on ? 'page' : undefined}
            style={{
              position: 'relative', flex: 1, minWidth: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              padding: 0, borderRadius: 999,
              background: on ? 'var(--pq-accent-grad)' : 'transparent',
              border: 'none', cursor: 'pointer',
              fontFamily: 'var(--pq-mono)',
              transition: 'background var(--pq-t-paint)',
            }}
          >
            {/* The badge marks a day whose list still has unchecked
                items — the DAY's, not the week's. It waited for block B
                because a badge fed by week-wide checks would have been
                wrong on six days out of seven: it would light on Monday
                because Thursday has something unbought.
                `badges.grocery` comes from the same derivation the
                screen renders, so the dot and the list cannot disagree. */}
            {badge && badges[id] && (
              <span style={{
                position: 'absolute', top: 8, right: 'calc(50% - 17px)',
                width: 7, height: 7, borderRadius: '50%',
                background: 'var(--pq-accent)',
                /* A ring in the tab's own colour, so the red dot reads
                   on the ink fill as well as on paper. */
                boxShadow: `0 0 0 2px ${on ? 'var(--pq-accent-grad)' : 'var(--pq-nav-bg)'}`,
              }} />
            )}
            <Icon
              size={20}
              color={color}
              /* NOT absoluteStrokeWidth. That prop rescales by size/24,
                 turning 2.4 into 2.88 - the prototype uses the raw value
                 against a 24-unit viewBox drawn at 20px. Caught by the
                 nav test asserting the rendered stroke-width. */
              strokeWidth={on ? 2.4 : 1.8}
              aria-hidden="true"
            />
            <span style={{
              fontSize: 'var(--pq-size-nav)', fontWeight: 600,
              letterSpacing: 'var(--pq-track-label)',
              color,
            }}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
