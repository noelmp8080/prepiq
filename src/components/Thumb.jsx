/* The recipe thumbnail, and the tile that stands in when it fails.
 *
 * THE HANDOFF SAYS "most recipes have no photo". THIS APP'S DATA SAYS
 * OTHERWISE — measured: all 260 recipes carry an `image` path and all
 * 260 files exist in public/recipes. The bundle was written against a
 * thinner set. So the photo is the normal case here and the tile is the
 * fallback, which is the reverse of what the README assumes.
 *
 * That does not make the tile decorative. `image` is set for every
 * recipe whether or not the file resolves, so a missing or corrupt file
 * renders as a broken image with nothing to catch it — which is why the
 * error path below exists rather than being left to the browser.
 *
 * Three sizes, and the radius is NOT proportional — the handoff fixes it
 * per size:
 *
 *     36px -> 7px   (Plan)
 *     48px -> 9px   (Today, Recipes, Track)
 *     56px -> 10px  (recipe sheet header)
 *
 * ONE DEFINITION, because that mapping is a standing verification item.
 * Four copies of it across four screens is four places for 48/10 to
 * appear and never be noticed.
 *
 * The tile carries the recipe's initials, per the prototype markup. The
 * README's fallback section says "no icon, no initial" — that conflict
 * was resolved toward the markup, like the three before it. See
 * DEVIATIONS.md.
 */

import { useState, useRef } from 'react'

const SIZES = {
  36: { radius: 7, font: 11 },
  48: { radius: 9, font: 13 },
  56: { radius: 10, font: 15 },
  /* Block F. The grocery day view's recipe photo: 88px square on phone,
     and a 340x210 / 280x180 panel on the wide surfaces, which is not a
     square and passes its box in `style`. Both keep radius 10 — the
     mapping stops climbing at 56 in the handoff, and a 10px radius reads
     the same on a 88px tile as on a 56px one, where 14px would start to
     look like a card. Added here rather than inlined at the call site
     for the reason this map exists: one definition, so 88/10 cannot
     quietly become 88/14 on one screen. */
  88: { radius: 10, font: 20 },
}

/** Up to two initials from the recipe name.
 *
 *  This reads the name the catalog already holds — it does not name the
 *  dish, abbreviate it, or stand in for content that is missing. */
export function initialsOf(name = '') {
  return String(name)
    .split(/\s+/)
    .filter(w => /[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

export default function Thumb({ recipe, size = 48, src, style }) {
  /* Keyed by src so changing recipe clears a previous failure — without
     the key, one broken photo would make every later thumbnail in the
     same slot fall back too. */
  const [failed, setFailed] = useState(false)
  const shown = useRef(src)
  if (shown.current !== src) { shown.current = src; if (failed) setFailed(false) }

  const { radius, font } = SIZES[size] || SIZES[48]
  const box = {
    width: size, height: size, borderRadius: radius,
    flexShrink: 0,
    ...style,
  }

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        style={{ ...box, objectFit: 'cover' }}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      style={{
        ...box,
        background: 'var(--pq-thumb-fallback)',
        boxShadow: 'var(--pq-thumb-fallback-lip)',
        border: '1px solid var(--pq-rule-cell)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--pq-mono)',
        fontSize: font, fontWeight: 600,
        color: 'var(--pq-text-muted)',
        letterSpacing: '.02em',
      }}
    >
      {initialsOf(recipe?.name)}
    </div>
  )
}
