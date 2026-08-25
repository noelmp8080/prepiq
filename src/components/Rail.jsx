import { Home, Calendar, ChefHat, ShoppingCart, ChartColumn, Settings as Cog } from 'lucide-react'
import Logo, { LogoTile } from './Logo'

/* ── The wide-surface rail ────────────────────────────────────────────
 *
 * One component for both wide surfaces. The difference between 84px and
 * 224px is a set of values, not a second component — which is why
 * Logo.jsx was parameterised in block A rather than forked here.
 *
 * WIDTH IS A USER CHOICE, NOT A BREAKPOINT. The handoff says so
 * explicitly and puts the control on both surfaces. The surface only
 * supplies the DEFAULT, and only until the user touches the control —
 * see railIsExpanded in storeLogic.
 *
 * SIX DESTINATIONS, NOT FIVE. Goals joins the five phone tabs here,
 * because Settings is a pane on wide rather than a sheet. It sits at the
 * foot, after a spacer, exactly as in the prototype: it is a
 * destination, but not one of the five you move between while cooking.
 *
 * EVERY BUTTON CARRIES BOTH aria-label AND title. They are different
 * jobs — the label names the control for a screen reader, the title is
 * the hover tooltip that makes a collapsed icon rail usable with a
 * mouse. At 84px the caption is 9px, which is a legend, not a label.
 */

const ITEMS = [
  { id: 'today',   label: 'Today',   Icon: Home },
  { id: 'plan',    label: 'Week',    Icon: Calendar },
  { id: 'recipes', label: 'Recipes', Icon: ChefHat },
  { id: 'grocery', label: 'Grocery', Icon: ShoppingCart },
  { id: 'track',   label: 'Track',   Icon: ChartColumn },
]

/* Collapsed and expanded, side by side, so the pairs are readable as
   pairs. Every value is the prototype's. */
const V = {
  collapsed: {
    width: 84, pad: '20px 14px', itemH: 58, itemPad: '8px 0 7px',
    dir: 'column', gap: 5, labelSize: 9, labelTrack: '.08em',
    labelFlex: 'none', labelFont: 'var(--pq-mono)',
  },
  expanded: {
    width: 224, pad: '22px 16px', itemH: 44, itemPad: '0 13px',
    dir: 'row', gap: 11, labelSize: 13, labelTrack: '-.01em',
    labelFlex: '1', labelFont: 'var(--pq-sans)',
  },
}

export default function Rail({ active, onChange, expanded, onToggle, badges = {} }) {
  const v = expanded ? V.expanded : V.collapsed

  const itemStyle = on => ({
    minHeight: v.itemH, borderRadius: 'var(--pq-r-button)',
    display: 'flex', flexDirection: v.dir, alignItems: 'center',
    justifyContent: 'center', gap: v.gap, padding: v.itemPad,
    cursor: 'pointer', fontFamily: 'var(--pq-sans)', textAlign: 'left',
    border: `1px solid ${on ? 'transparent' : 'rgba(255,255,255,0.06)'}`,
    background: on ? 'var(--pq-accent-grad)' : 'rgba(0,0,0,0.14)',
    boxShadow: on ? 'var(--pq-accent-raise)' : 'none',
  })

  const labelStyle = on => ({
    fontSize: v.labelSize, fontWeight: 600, letterSpacing: v.labelTrack,
    flex: v.labelFlex, fontFamily: v.labelFont, whiteSpace: 'nowrap',
    color: on ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-2)',
  })

  return (
    <nav
      aria-label="Primary"
      data-rail
      data-expanded={expanded ? 'true' : 'false'}
      style={{
        width: v.width, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        padding: v.pad,
        background: 'linear-gradient(180deg,rgba(255,255,255,0.09) 0%,rgba(255,255,255,0.03) 100%)',
        borderRight: '1px solid rgba(255,255,255,0.1)',
        boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.25)',
      }}
    >
      {/* The lockup. Collapsed shows the 34px tile alone; expanded adds
          the wordmark and the MEAL PREP caption — both already in
          Logo.jsx, parameterised in block A for exactly this. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 0 22px' }}>
        {expanded
          ? <Logo size={34} caption="MEAL PREP" />
          : <LogoTile size={34} />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {ITEMS.map(({ id, label, Icon }) => {
          const on = active === id
          const badge = badges[id]
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-label={label}
              title={label}
              aria-current={on ? 'page' : undefined}
              style={itemStyle(on)}
            >
              <Icon
                size={19}
                color={on ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-2)'}
                strokeWidth={on ? 2.2 : 1.7}
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              />
              <span style={labelStyle(on)}>{label}</span>
              {/* Only where a number means something. Expanded only —
                  at 84px there is no room beside a 9px caption. */}
              {expanded && badge > 0 && (
                <span style={{
                  flexShrink: 0, padding: '2px 6px', borderRadius: 5,
                  fontFamily: 'var(--pq-mono)', fontSize: 10, fontWeight: 600,
                  color: 'var(--pq-on-accent-ink)',
                  background: on ? 'rgba(0,0,0,0.18)' : 'var(--pq-accent-grad)',
                  boxShadow: on ? 'none' : 'var(--pq-accent-raise)',
                }}>{badge}</span>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ flex: 1 }} />

      <button
        onClick={() => onChange('goals')}
        aria-label="Goals"
        title="Goals"
        aria-current={active === 'goals' ? 'page' : undefined}
        style={itemStyle(active === 'goals')}
      >
        <Cog
          size={18}
          color={active === 'goals' ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-2)'}
          strokeWidth={1.7}
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        />
        <span style={labelStyle(active === 'goals')}>Goals</span>
      </button>

      {/* The control that makes the width a choice. Drawn at the
          handoff's 34px, targeted at its own 44px floor — the same
          treatment as the close tile, the settings tile and the chips. */}
      <button
        onClick={() => onToggle(!expanded)}
        aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-expanded={expanded}
        style={{
          marginTop: 8, minHeight: 'var(--pq-tap-min)',
          display: 'flex', alignItems: 'center',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        }}
      >
        <span style={{
          flex: 1, minHeight: 34, borderRadius: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          background: 'rgba(0,0,0,0.14)',
          border: '1px solid var(--pq-rule-soft)',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            stroke="var(--pq-text-faint)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d={expanded ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
          </svg>
          {expanded && (
            <span style={{
              fontFamily: 'var(--pq-mono)', fontSize: 10, fontWeight: 600,
              letterSpacing: 'var(--pq-track-caption)',
              color: 'var(--pq-text-faint)', whiteSpace: 'nowrap',
            }}>COLLAPSE</span>
          )}
        </span>
      </button>
    </nav>
  )
}
