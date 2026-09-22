import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/* ── THE SHEET RULES NO BROWSER TEST CAN CHECK ────────────────────────
 *
 * A bottom sheet opened on an iPhone with only its header on screen:
 * every row, every restore button and SHOW ALL AGAIN sat behind
 * Safari's toolbar, so the one screen whose entire purpose is undoing
 * something could not undo anything.
 *
 * THE CAUSE, MEASURED. `position: fixed; inset: 0` is laid out against
 * iOS Safari's LAYOUT viewport, which is the large viewport — the
 * height the screen has with the toolbar retracted, regardless of what
 * the toolbar is doing now. On an iPhone 14 Pro that is 852px while the
 * user is looking at 752px. Modelled in Playwright at exactly those two
 * numbers, before the fix: a 149px sheet sat at 703-852 with the fold
 * at 752, so 49px of it was visible — its header — and the restore
 * button was at 786-830, entirely behind the toolbar.
 *
 * WHY THIS IS A SOURCE TEST AND NOT A LAYOUT TEST. Headless browsers
 * have no dynamic toolbar, so `vh`, `dvh` and `innerHeight` are the
 * same number in all of them and no amount of geometry can tell the
 * broken version from the fixed one. e2e/sheetViewport.spec.js covers
 * everything that IS measurable — fit, scrolling, hit-testing, the
 * safe-area inset — and says so in its header. This file covers the one
 * rule that is invisible to it, the same way Shell's identical rule has
 * been guarded since block A (shellPrimitives.test.jsx, "sizes in dvh,
 * not vh"). That precedent is why the pattern was available to copy and
 * the sheet's failure to copy it is what this test now prevents.
 *
 * Comments are stripped first — this one names every string the rules
 * below forbid.
 */
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const SHEET_SRC = stripComments(readFileSync('src/components/Sheet.jsx', 'utf8'))

const SHEETS = [
  'src/components/HiddenSheet.jsx',
  'src/components/RecipeSheet.jsx',
  'src/components/Settings.jsx',
  'src/components/Plan.jsx',
]

describe('the sheet is sized to the viewport the user can see', () => {
  it('sizes in dvh, not vh', () => {
    expect(SHEET_SRC).toContain('100dvh')
    expect(SHEET_SRC).not.toMatch(/height:\s*'100vh'/)
    expect(SHEET_SRC).not.toMatch(/maxHeight:\s*'100vh'/)
  })

  /* `inset: 0` sets `bottom`, and `bottom` is the edge that is wrong on
     iOS. Setting top + height instead means the bad edge is the one the
     browser drops. */
  it('anchors the overlay by top and height, never by inset', () => {
    expect(SHEET_SRC).not.toMatch(/inset:\s*0/)
    expect(SHEET_SRC).toMatch(/top:\s*0/)
    expect(SHEET_SRC).toMatch(/height:\s*'100dvh'/)
  })

  it('pads the panel for the home indicator', () => {
    expect(SHEET_SRC).toContain('var(--pq-safe-b)')
  })

  /* A bare env() in a component is untestable — it is 0 in every
     browser a test can run in. Routed through a token, a layout test
     can set it to 34px and measure, which e2e/sheetViewport.spec.js
     does. */
  it('takes the inset from the token, not from a bare env()', () => {
    expect(SHEET_SRC).not.toMatch(/env\(safe-area/)
  })

  it('defines the token once, in tokens.css', () => {
    const tokens = readFileSync('src/tokens.css', 'utf8')
    expect(tokens).toMatch(/--pq-safe-b:\s*env\(safe-area-inset-bottom/)
  })
})

/* ── ONE SHEET, NOT FOUR ──────────────────────────────────────────────
 * The bug was in the shared component, which is why every sheet in the
 * app had it. That is only true while every sheet still goes through
 * the shared component — a fifth one built from its own fixed overlay
 * would be outside every guard above. */
describe('every sheet goes through the shared one', () => {
  for (const path of SHEETS) {
    it(`${path.split('/').pop()} renders Sheet rather than its own overlay`, () => {
      const src = stripComments(readFileSync(path, 'utf8'))
      expect(src).toMatch(/from '\.\/Sheet'/)
      expect(src, 'a sheet must not build its own fixed overlay')
        .not.toMatch(/position:\s*'fixed'[\s\S]{0,80}inset:\s*0/)
    })
  }
})

/* ── THE SCROLLING CONTENT AREA ───────────────────────────────────────
 *
 * Each sheet supplies its own scroller, so this one is per file rather
 * than in Sheet.jsx.
 *
 * WHAT THIS IS NOT. I first believed HiddenSheet's missing
 * `minHeight: 0` was half the reported bug, wrote that in a comment,
 * then reverted it to watch the 20-item layout test fail — and it
 * passed. `min-height: auto` only resolves to the content size for a
 * flex item whose `overflow` is `visible`, and these scrollers all set
 * `overflow-y: auto`, so their automatic minimum was already 0. The
 * pair is consistency, not a fix, and the comment in HiddenSheet.jsx
 * now says so.
 */
describe('sheet content areas scroll rather than overflow', () => {
  for (const path of SHEETS) {
    it(`${path.split('/').pop()} gives its scroller flex: 1 and minHeight: 0`, () => {
      const src = stripComments(readFileSync(path, 'utf8'))
      expect(src).toMatch(/flex:\s*1,\s*minHeight:\s*0/)
      expect(src).toMatch(/overflowY:\s*'auto'/)
    })
  }
})
