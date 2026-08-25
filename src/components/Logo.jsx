/* Prep[IQ] — the chosen mark (handoff "Logo", option 1a).
 *
 * A bracketed wordmark rather than a new shape: it reuses the mono-and-
 * bracket vocabulary already in the UI. `Prep` in Plex Sans 600 at
 * -.03em, `[IQ]` in Plex Mono 700, brackets faint, IQ in the accent — so
 * the mark recolours with the theme rather than being an image.
 *
 * PARAMETERISED FROM THE START. Block E needs a 34px tile in the sidebar
 * against 30px on the phone, with a different radius and mono size. That
 * is one `size` prop, not a forked component.
 */

const SIZES = {
  30: { tile: 30, radius: 8, mono: 11 },   // phone
  34: { tile: 34, radius: 9, mono: 12 },   // sidebar
}

/** The rounded app-icon tile: just `[IQ]`. Legible down to a 20px favicon. */
export function LogoTile({ size = 30 }) {
  const s = SIZES[size] || SIZES[30]
  return (
    <span
      aria-hidden="true"
      style={{
        width: s.tile, height: s.tile, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: s.radius,
        background: 'var(--pq-logo-tile)',
        border: 'var(--pq-card-border)',
        boxShadow: 'var(--pq-logo-tile-shadow)',
        fontFamily: 'var(--pq-mono)', fontWeight: 700, fontSize: s.mono,
        letterSpacing: 'var(--pq-tight-logo)',
        color: 'var(--pq-accent)',
      }}
    >
      IQ
    </span>
  )
}

/** The full lockup: tile + wordmark. Top of Today, and the expanded rail. */
export default function Logo({ size = 30, caption = null }) {
  const s = SIZES[size] || SIZES[30]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <LogoTile size={size} />
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline' }}>
          <span style={{
            fontFamily: 'var(--pq-sans)', fontWeight: 600,
            fontSize: 'var(--pq-size-logo)', letterSpacing: 'var(--pq-tight-logo)',
            color: 'var(--pq-text)',
          }}>Prep</span>
          {/* brackets faint, IQ accent — the mark's whole idea */}
          <span style={{
            fontFamily: 'var(--pq-mono)', fontWeight: 700,
            fontSize: 'var(--pq-size-logo)', letterSpacing: 'var(--pq-tight-row)',
            color: 'var(--pq-text-faint)',
          }}>
            [<span style={{ color: 'var(--pq-accent)' }}>IQ</span>]
          </span>
        </span>
        {caption && (
          <span style={{
            fontFamily: 'var(--pq-mono)', fontWeight: 600, fontSize: 9,
            letterSpacing: 'var(--pq-track-caption)', color: 'var(--pq-text-faintest)',
          }}>{caption}</span>
        )}
      </span>
    </span>
  )
}
