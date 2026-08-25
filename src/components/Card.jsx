/* The card surface — one recipe, used by every card, list container and
 * stat block in the app.
 *
 * IT IS TRANSLUCENT WHITE OVER THE SHELL, AND THAT IS THE POINT.
 * The shell gradient is painted once behind a transparent scroller, so a
 * card's lightness is a function of where it sits on the SCREEN. Scroll,
 * and a card genuinely changes lightness as it travels through the ramp.
 * That is the prototype's behaviour and it is what the dimensional
 * effect is made of. Do not compensate for it.
 *
 * TWO THINGS THIS COMPONENT MUST NEVER DO, both guarded by tests:
 *
 *   1. Take an opaque background. A solid fill severs the card from the
 *      ramp and the effect dies silently — the card still looks fine in
 *      isolation, which is why nobody would notice.
 *   2. Nest inside anything opaque, for the same reason.
 *
 * Flat panels — Plan's day cards, inputs — are a DIFFERENT surface
 * (`#141619`, --pq-panel) and are not this component.
 *
 * Sheets are also not this component. Settings and RecipeSheet are
 * opaque, have their own shadow and a top-only radius; see Sheet.jsx. A
 * `variant="sheet"` prop here would make one component do two unrelated
 * jobs and would put an opaque background one prop away from every card.
 */
export default function Card({ children, style, as: Tag = 'div', ...rest }) {
  return (
    <Tag
      {...rest}
      style={{
        background: 'var(--pq-card-bg)',
        border: 'var(--pq-card-border)',
        boxShadow: 'var(--pq-card-shadow)',
        borderRadius: 'var(--pq-r-card)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </Tag>
  )
}

/** A 1px divider between rows inside a card. */
export const CARD_ROW_RULE = '1px solid var(--pq-rule-row)'
/** Between cells of a stat grid. */
export const CARD_CELL_RULE = '1px solid var(--pq-rule-cell)'

/* The dashed empty-state block. Every screen's "nothing here yet" uses
   it, so it lives beside the card rather than being redrawn per screen. */
export function EmptyBlock({ children, style, as: Tag = 'div', ...rest }) {
  return (
    <Tag {...rest} style={{
      border: 'var(--pq-rule-dashed)',
      borderRadius: 'var(--pq-r-card)',
      padding: '30px 22px',
      textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      ...style,
    }}>
      {children}
    </Tag>
  )
}
