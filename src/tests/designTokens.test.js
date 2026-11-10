import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/* PAPER AND INK, pinned. The owner chose this look from mockups; these
   are the values a later edit is most likely to "round to something
   close" or quietly undo — the paper/ink/red split, both themes, the
   round corners, the grocery row size and the touch minimums. */

const css = readFileSync('src/tokens.css', 'utf8')

/* The file is `:root { light }` then `[data-theme="dark"] { overrides }`.
   Split once, so a dark value can never be read as the light one. */
const darkAt = css.indexOf('[data-theme="dark"] {')
const light = css.slice(0, darkAt)
const dark = css.slice(darkAt, css.indexOf('@media', darkAt))

const read = (block, name) => {
  const m = block.match(new RegExp(`--${name}:\\s*([^;]+);`))
  return m ? m[1].trim().replace(/\s+/g, ' ') : null
}
const tok = name => read(light, name)
const dk = name => read(dark, name)

/* WCAG relative luminance and contrast, so "readable" is a number. */
const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('paper, ink and one red', () => {
  it('has both themes in the file', () => {
    expect(darkAt).toBeGreaterThan(0)
    expect(dark.length).toBeGreaterThan(200)
  })

  it('paints filled controls in INK and emphasis in RED — two different tokens', () => {
    expect(tok('pq-accent-grad')).toBe('#17171A')
    expect(tok('pq-on-accent-ink')).toBe('#F6F4EF')
    expect(tok('pq-accent')).toBe('#B3261E')
    expect(tok('pq-accent-bar')).toBe('#B3261E')
    /* The split is the design. If these ever match again, every button
       has gone red or every progress bar has gone black. */
    expect(tok('pq-accent-grad')).not.toBe(tok('pq-accent'))
  })

  it('sits on paper, with cards one step lighter', () => {
    expect(tok('pq-page')).toBe('#F6F4EF')
    expect(tok('pq-shell')).toBe('#F6F4EF')
    expect(tok('pq-card-bg')).toBe('#FFFDF8')
    expect(tok('pq-panel')).toBe('#FFFDF8')
    expect(tok('pq-card-border')).toBe('1px solid #DDD9D0')
  })

  it('is flat: no raised controls, no card or well shadows', () => {
    for (const name of ['pq-accent-raise', 'pq-card-shadow', 'pq-well-shadow',
                        'pq-track-shadow', 'pq-thumb-fallback-lip']) {
      expect(tok(name), name).toBe('none')
    }
    /* No gradient anywhere in the token layer. */
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('gradient(')
  })

  it('swaps paper and ink in dark, and lifts the red', () => {
    expect(dk('pq-page')).toBe('#141416')
    expect(dk('pq-card-bg')).toBe('#1E1E21')
    expect(dk('pq-text')).toBe('#F2EFE8')
    expect(dk('pq-accent-grad')).toBe('#F2EFE8')
    expect(dk('pq-on-accent-ink')).toBe('#141416')
    expect(dk('pq-accent')).toBe('#FF8A7E')
    expect(dk('pq-accent-bar')).toBe('#F0574A')
  })

  it('changes only colour between themes — never a size, radius or space', () => {
    const pairs = [...dark.matchAll(/--(pq-[a-z0-9-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()])
    expect(pairs.length).toBeGreaterThan(20)
    /* Every dark override is a colour, a border in a colour, or a
       shadow in a colour. A length here would mean the two themes had
       stopped being the same layout. */
    for (const [name, value] of pairs) {
      expect(value, `${name}: ${value}`)
        .toMatch(/^(#[0-9A-Fa-f]{6}|rgba\([^)]+\)|1px (solid|dashed) #[0-9A-Fa-f]{6}|0 \d+px \d+px rgba\([^)]+\))$/)
    }
  })
})

describe('it can be read', () => {
  const pairs = t => [
    ['body text on the page',      t('pq-text'),          t('pq-page')],
    ['body text on a card',        t('pq-text'),          t('pq-card-bg')],
    ['labels on the page',         t('pq-text-3'),        t('pq-page')],
    ['labels on a card',           t('pq-text-3'),        t('pq-card-bg')],
    ['muted text on a card',       t('pq-text-muted'),    t('pq-card-bg')],
    ['faint text on the nav',      t('pq-text-faint'),    t('pq-nav-bg')],
    ['faintest text on the page',  t('pq-text-faintest'), t('pq-page')],
    ['red emphasis on a card',     t('pq-accent'),        t('pq-card-bg')],
    ['red emphasis on the page',   t('pq-accent'),        t('pq-page')],
    ['text on a filled control',   t('pq-on-accent-ink'), t('pq-accent-grad')],
    ['error text on its box',      t('pq-danger-text'),   t('pq-danger-bg')],
  ]

  it('clears 4.5:1 for every text pairing, light', () => {
    for (const [what, fg, bg] of pairs(tok)) {
      expect(contrast(fg, bg), `light: ${what} (${fg} on ${bg})`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('clears 4.5:1 for every text pairing, dark', () => {
    const t = name => dk(name) ?? tok(name)
    for (const [what, fg, bg] of pairs(t)) {
      expect(contrast(fg, bg), `dark: ${what} (${fg} on ${bg})`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('the values a later edit would most likely round', () => {
  it('keeps the grocery row and touch minimums', () => {
    expect(tok('pq-row-grocery')).toBe('56px')
    expect(tok('pq-tap-min')).toBe('44px')
    expect(tok('pq-nav-h')).toBe('60px')
    expect(tok('pq-nav-clearance')).toBe('96px')
    expect(tok('pq-check')).toBe('22px')
    expect(tok('pq-expander-w')).toBe('44px')
  })

  it('keeps the grocery item name at 18px — the spec says do not reduce', () => {
    expect(tok('pq-size-grocery')).toBe('18px')
  })

  it('is round, as asked', () => {
    expect(tok('pq-r-card')).toBe('20px')
    expect(tok('pq-r-chip')).toBe('999px')
    expect(read(light, 'pq-r-button')).toMatch(/^999px/)
    expect(tok('pq-r-check')).toMatch(/^50%/)
  })
})

describe('type is self-hosted, not fetched', () => {
  it('imports only the weights used', () => {
    for (const w of [400, 500, 600, 700]) {
      expect(css).toContain(`@fontsource/inter/latin-${w}.css`)
    }
    for (const w of [500, 600, 700]) {
      expect(css).toContain(`@fontsource/space-grotesk/latin-${w}.css`)
    }
    expect(css).not.toContain('inter/latin-300')
    expect(css).not.toContain('ibm-plex')
  })

  it('never reaches a font CDN', () => {
    expect(css).not.toContain('fonts.googleapis')
    expect(css).not.toContain('fonts.gstatic')
    expect(readFileSync('index.html', 'utf8')).not.toContain('fonts.googleapis')
  })

  it('names the families in the token layer', () => {
    expect(tok('pq-sans')).toContain('Inter')
    expect(tok('pq-mono')).toContain('Space Grotesk')
    expect(tok('pq-display')).toContain('Space Grotesk')
  })
})
