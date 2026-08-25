/* The app shell — a fixed graphite ramp with a transparent scroller
 * over it.
 *
 * THE GRADIENT DOES NOT SCROLL, AND THIS WAS CHECKED AGAINST THE
 * PROTOTYPE RATHER THAN THE PROSE.
 *
 * The handoff's text says the gradient "runs the full height of the
 * scroll container". The prototype does something else: it paints
 * `linear-gradient(176deg, ...)` once, on a fixed 390x844 frame with
 * `overflow: hidden`, and scrolls content over it. `176deg` appears
 * exactly once in that file, and the scroller inside carries no
 * background at all.
 *
 * The prototype is right and the prose is wrong, because at list length
 * the two diverge completely:
 *
 *   260 Recipes rows at ~64px  = 16,640px of scroll
 *   viewport                   = 844px
 *   ramp visible per screen    = 5.1%
 *
 * Stretched over the document, a four-stop ramp shows about a twentieth
 * of itself per screen — flat, and the dimensional effect the handoff
 * credits it with is gone. Fixed, every screen shows the whole ramp at
 * any scroll depth.
 *
 * The handoff corroborates this against itself: its card section says a
 * card near the top of "a screen" is lighter than the same card near the
 * bottom. Screen, not document. That only holds under a fixed ramp.
 *
 * A CONSEQUENCE, ACCEPTED DELIBERATELY: a card changes lightness as it
 * scrolls through the ramp. That is not a bug to compensate for; it is
 * what the effect is made of.
 *
 * IMPLEMENTATION NOTES, both load-bearing on iPhone:
 *
 *   - The ramp is an explicit `position:absolute; inset:0` element, NOT
 *     `background-attachment: fixed` on the body. That property is
 *     unreliable in iOS Safari, which is where this app lives.
 *   - Sized in `dvh`, not `vh`, so the ramp tracks the visual viewport
 *     as Safari's toolbars collapse instead of being clipped by them.
 *
 * The page behind the shell is `--pq-page`, so an overscroll bounce
 * reveals the ramp's own ground rather than white.
 */
export default function Shell({ children, nav, rail, overlay, wide = false }) {
  /* WIDE PUTS THE RAIL BESIDE THE SCROLLER, not above it. The ramp layer
     is unchanged — still absolute, still inset:0, still clipped by the
     same fixed frame — so every card on every surface sits on the same
     painted gradient. Block E swaps ONE token and adds a flex row; that
     was the whole point of building it this way in block A. */
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--pq-page)',
      /* dvh, not vh — see above */
      height: '100dvh',
      overflow: 'hidden',
      color: 'var(--pq-text)',
      fontFamily: 'var(--pq-sans)',
    }}>
      {/* THE RAMP. Painted once, never scrolls. Block E swaps this one
          token for --pq-shell-wide (168deg); the mechanism is unchanged. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: wide ? 'var(--pq-shell-wide)' : 'var(--pq-shell)',
          pointerEvents: 'none',
        }}
      />

      {/* THE SCROLLER. Transparent by construction — anything opaque
          here would sever every card from the ramp at once.

          On wide the rail is a flex sibling of the scroller rather than
          a layer over it: a fixed bar would have to be positioned
          against the frame and would then overlap content at every
          width the rail is not exactly as wide as expected. */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', minHeight: 0,
      }}>
        {rail}
        <div style={{
          flex: 1, minWidth: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          /* clears the 64px bar with breathing room, per the handoff.
             No bar on wide, so no clearance to reserve. */
          paddingBottom: rail ? 0 : 'var(--pq-nav-clearance)',
        }}>
          {children}
        </div>
      </div>

      {overlay}
      {nav}
    </div>
  )
}
