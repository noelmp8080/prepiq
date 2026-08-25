import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/* THE HANDOFF SAYS EVERY VALUE IS AUTHORITATIVE. This asserts the ones a
   later edit is most likely to "round to something close" — the accent
   ramp, the card recipe, the grocery row size, and the touch minimums. */

const css = readFileSync('src/tokens.css', 'utf8')
const tok = name => {
  const m = css.match(new RegExp(`--${name}:\s*([^;]+);`))
  return m ? m[1].trim().replace(/\s+/g, ' ') : null
}

describe('the accent ramp is the spec ramp, exactly', () => {
  it('carries the seven authoritative accent values', () => {
    expect(tok('pq-accent')).toBe('#D0F224')
    expect(tok('pq-accent-lift')).toBe('#DDF667')
    expect(tok('pq-accent-drop')).toBe('#99B31B')
    expect(tok('pq-accent-edge')).toBe('#F2FCBE')
    expect(tok('pq-accent-shade')).toBe('#798C15')
    expect(tok('pq-on-accent')).toBe('#131719')
    expect(tok('pq-on-accent-ink')).toBe('#0E1012')
  })

  /* The ramp is not generated, and shade() is gone — nothing in the
     design ever passes a custom accent. The evidence for why the values
     are literals lives in tokens.css; these assertions are the guard. */
})

describe('the values a later edit would most likely round', () => {
  it('keeps the grocery row and touch minimums', () => {
    expect(tok('pq-row-grocery')).toBe('56px')
    expect(tok('pq-tap-min')).toBe('44px')
    expect(tok('pq-nav-h')).toBe('64px')
    expect(tok('pq-nav-clearance')).toBe('92px')
    expect(tok('pq-check')).toBe('22px')
    expect(tok('pq-expander-w')).toBe('44px')
  })

  it('keeps the grocery item name at 18px — the spec says do not reduce', () => {
    expect(tok('pq-size-grocery')).toBe('18px')
  })

  it('keeps the shell ramp and the flat panel', () => {
    expect(tok('pq-shell-1')).toBe('#3D464C')
    expect(tok('pq-shell-2')).toBe('#313A40')
    expect(tok('pq-shell-3')).toBe('#262D32')
    expect(tok('pq-shell-4')).toBe('#1D2327')
    expect(tok('pq-panel')).toBe('#141619')
    expect(tok('pq-page')).toBe('#08090A')
  })

  it('keeps the card border and radii', () => {
    expect(tok('pq-card-border')).toBe('1px solid rgba(255,255,255,0.14)')
    expect(tok('pq-r-card')).toBe('14px')
    expect(tok('pq-r-button')).toBe('10px')
    expect(tok('pq-r-check')).toBe('6px')
  })
})

describe('type is self-hosted, not fetched', () => {
  it('imports only the weights the handoff names', () => {
    for (const w of [400, 500, 600, 700]) {
      expect(css).toContain(`@fontsource/ibm-plex-sans/latin-${w}.css`)
    }
    for (const w of [400, 500, 600]) {
      expect(css).toContain(`@fontsource/ibm-plex-mono/latin-${w}.css`)
    }
    expect(css).not.toContain('ibm-plex-sans/latin-300')
    expect(css).not.toContain('ibm-plex-mono/latin-700')
  })

  it('never reaches a font CDN', () => {
    expect(css).not.toContain('fonts.googleapis')
    expect(css).not.toContain('fonts.gstatic')
    expect(readFileSync('index.html', 'utf8')).not.toContain('fonts.googleapis')
  })

  it('names both families in the token layer', () => {
    expect(tok('pq-sans')).toContain('IBM Plex Sans')
    expect(tok('pq-mono')).toContain('IBM Plex Mono')
  })
})
