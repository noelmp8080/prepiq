/* ── The screen header ────────────────────────────────────────────────
 *
 * THE CONTRACT IS THREE FIELDS: `{ eyebrow, title, actions }`. Every
 * screen that has a title declares exactly those, and nothing else about
 * a header is a screen's business — the type scale, the wide padding,
 * the rule under it and the difference between the two wide surfaces all
 * live here.
 *
 * THE HEADER STAYS INSIDE THE SCREEN, and that is deliberate rather than
 * a compromise. The prototype hoists it into shared chrome, which works
 * there because its header content is static. It is not static here:
 * Recipes' eyebrow is `{filtered.length} OF 260 RECIPES`, and `filtered`
 * is component-local state derived from a search box and a filter chip.
 * Hoisting the markup would mean hoisting that state to App, or handing
 * App a render callback, or registering the header through a context on
 * every keystroke. All three are worse than a component with three
 * props, and the last two are the escape hatches this was meant to
 * avoid. What §11 actually buys — one definition of the bar, the rule
 * spanning both columns, one place for headPad — is bought either way.
 *
 * WHY IT SPANS BOTH COLUMNS ANYWAY: it renders ABOVE the screen's grid,
 * not inside a column, and carries its own horizontal padding rather
 * than inheriting the body gutter. So the rule runs the full content
 * width on wide, which is the visible thing that was missing.
 *
 * `style` IS FOR LAYOUT, NOT SURFACE — the same convention Card.jsx
 * uses. A caller may set where the header sits; it may not restyle the
 * bar. Today is the only screen that needs it, because on phone a logo
 * lockup sits above and the gap to the eyebrow is 14px rather than 24px.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }

/* wide gets the prototype's headPad and the rule; phone keeps exactly
   what block C shipped, because this is a wide-layout change and the
   phone was already right. */
const PAD = {
  phone:   '24px 20px 0',
  tablet:  '24px var(--pq-gutter) 20px',
  desktop: '24px var(--pq-gutter) 20px',
}

export default function ScreenHeader({
  eyebrow, title, actions = null, surface = 'phone', style,
}) {
  const wide = surface === 'tablet' || surface === 'desktop'

  return (
    <header
      data-screen-header
      style={{
        padding: PAD[surface] || PAD.phone,
        /* 1px rgba(255,255,255,0.09), full content width. On phone there
           is no second column for it to span and no bar in the design,
           so it is not drawn. */
        borderBottom: wide ? '1px solid rgba(255,255,255,0.09)' : 'none',
        display: 'flex',
        alignItems: wide ? 'flex-end' : 'flex-start',
        justifyContent: 'space-between',
        gap: 20,
        ...style,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <div style={{
            ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 500,
            color: 'var(--pq-text-muted)',
            letterSpacing: 'var(--pq-track-eyebrow)',
            marginBottom: 6,
          }}>{eyebrow}</div>
        )}
        <h1 style={{
          margin: 0,
          /* 28px, and 34px at >=1400 through the token — the prototype's
             h1Size, whose `wide` flag means desktop rather than either
             wide surface. */
          fontSize: 'var(--pq-size-title)',
          fontWeight: 700,
          letterSpacing: 'var(--pq-tight-title)',
          lineHeight: 1,
          color: 'var(--pq-text)',
        }}>{title}</h1>
      </div>

      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </header>
  )
}
