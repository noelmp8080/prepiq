/* ── ONE GROCERY ROW, TWO SCREENS ─────────────────────────────────────
 *
 * Lifted VERBATIM out of Grocery.jsx so the consolidated list and the
 * day view cannot drift into two rows that behave differently. Every
 * value here was already in the tree; nothing was retuned on the way
 * out, which is why the reflow harness passes unchanged over the old
 * list and then covers the new one for free.
 *
 * THE RULE THIS COMPONENT EXISTS TO KEEP: NOTHING MOVES ON TAP.
 * Checking changes `opacity`, `color`, `text-decoration`, `background`,
 * `box-shadow` and `border-color` — paint, all of it. The checkbox is a
 * 22px box that always contains its check at `opacity: 0`, and declares
 * the same 1.5px border in both states, so a tap adds no node and
 * changes no width.
 *
 * Two buttons side by side, deliberately: tap the row to check, tap the
 * 44px expander to ask why. No swipe, no long-press.
 *
 * The expander PANEL is `children` — the two screens answer "why am I
 * buying this" differently (the list names every meal that wants it; a
 * group is already one recipe) and that is content, not behaviour.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }

export default function GroceryRow({
  name,
  amount = null,          // short parsed quantity, or null to show none
  checked,
  onToggle,
  open,
  onToggleOpen,
  badge = null,          // the number beside the chevron; omitted when null
  expanderLabel,
  children,              // the expanded panel
}) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'stretch',
        borderBottom: '1px solid var(--pq-rule-row)',
      }}>
        {/* THE WHOLE ROW IS THE TARGET. Only paint changes. */}
        <button
          onClick={onToggle}
          aria-pressed={checked}
          style={{
            flex: 1, minWidth: 0, height: 'var(--pq-row-grocery)',
            display: 'flex', alignItems: 'center', gap: 14,
            background: 'transparent', border: 'none', cursor: 'pointer',
            textAlign: 'left', padding: 0, fontFamily: 'var(--pq-sans)',
            opacity: checked ? 0.45 : 1,
            transition: 'opacity var(--pq-t-paint)',
          }}>
          {/* Same box, same border width, both states —
              only colour, background and shadow move. */}
          <span style={{
            width: 'var(--pq-check)', height: 'var(--pq-check)',
            borderRadius: 'var(--pq-r-check)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1.5px solid ${checked ? 'transparent' : 'rgba(255,255,255,0.3)'}`,
            background: checked ? 'var(--pq-accent-grad)' : 'rgba(0,0,0,0.28)',
            boxShadow: checked
              ? 'var(--pq-accent-raise)'
              : 'inset 0 2px 4px rgba(0,0,0,0.45)',
          }}>
            {/* Always present, so a tap adds no node. */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              aria-hidden="true" stroke="#0E1012" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ opacity: checked ? 1 : 0 }}>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          {/* Named, not positional. The amount now sits after this
              span, so `span:last-child` finds the wrong one — and a
              selector that silently matches the wrong node is a suite
              that passes while the screen is broken. */}
          <span data-row-name style={{
            flex: 1, minWidth: 0,
            fontSize: 'var(--pq-size-grocery)', fontWeight: 500,
            color: 'var(--pq-text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textDecoration: checked ? 'line-through' : 'none',
          }}>{name}</span>

          {/* HOW MUCH, on the row. Parsed short — "1.1 lb", not the
              whole ingredient line, which runs to 127 characters in
              this catalog (DEVIATIONS §19). flexShrink: 0 so the NAME
              gives way first: a truncated ingredient is still
              recognisable, a truncated amount is a wrong number.

              Nothing at all when the line did not parse — no dash, no
              zero. The expander still carries the full line. */}
          {amount && (
            <span data-row-amount style={{
              flexShrink: 0, ...MONO,
              fontSize: 13, fontWeight: 500,
              color: 'var(--pq-text-3)', whiteSpace: 'nowrap',
              textDecoration: checked ? 'line-through' : 'none',
            }}>{amount}</span>
          )}
        </button>

        {/* The expander answers "why am I buying this" without costing a
            line on every row. Tap row = check, tap here = why. */}
        <button
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-label={expanderLabel}
          style={{
            flexShrink: 0, width: 'var(--pq-expander-w)',
            height: 'var(--pq-row-grocery)',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            gap: 3, background: 'transparent', border: 'none',
            cursor: 'pointer', padding: 0, color: 'var(--pq-text-3)',
            ...MONO, fontSize: 13, fontWeight: 500,
          }}>
          {badge}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            aria-hidden="true" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{
              transform: open ? 'rotate(90deg)' : 'none',
              transition: 'transform var(--pq-t-paint)',
            }}>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      {open && children}
    </div>
  )
}

/** The expanded panel's shell, so both screens indent and rule it the
 *  same way. What goes inside differs; the box does not.
 *
 *  `onHide` puts "Don't need this" under the ingredient line, in both
 *  views, from one definition. IN THE EXPANDER AND NOT A SWIPE: the row
 *  is 56px with a checkbox on it, and a swipe there is fired by accident
 *  while walking. Behind a deliberate tap, it cannot be.
 *
 *  HIDDEN, never "excluded" — the other set on this screen is
 *  day-scoped and transient, and the two must not read as one thing.
 *  See DEVIATIONS §22. */
export function GroceryRowPanel({ children, onHide, hideLabel = 'Don’t need this' }) {
  return (
    <div style={{
      padding: '6px 0 14px 36px',
      borderBottom: '1px solid var(--pq-rule-row)',
    }}>
      {children}
      {onHide && (
        <button
          data-hide-item
          onClick={onHide}
          style={{
            marginTop: 10, minHeight: 'var(--pq-tap-min)', padding: '0 12px',
            borderRadius: 'var(--pq-r-button)', cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--pq-rule-soft)',
            color: 'var(--pq-text-2)',
            fontFamily: 'var(--pq-mono)', fontSize: 11, fontWeight: 600,
            letterSpacing: 'var(--pq-track-chip)',
          }}>{hideLabel}</button>
      )}
    </div>
  )
}
