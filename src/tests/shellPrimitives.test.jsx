import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup as render } from 'react-dom/server'
import Card, { EmptyBlock } from '../components/Card'
import Logo, { LogoTile } from '../components/Logo'
import BottomNav from '../components/BottomNav'

/* Block A primitives. The failures guarded here are all silent ones —
   the component still looks right in isolation while the thing it
   exists for has quietly stopped happening. */

/* Comments necessarily contain the words the rules forbid - the Card
   comment explains why there is no variant prop, the Shell comment why
   background-attachment is not used. Strip them, or every rule below
   fails against its own justification. */
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const CARD_SRC = stripComments(readFileSync('src/components/Card.jsx', 'utf8'))
const SHELL_SRC = stripComments(readFileSync('src/components/Shell.jsx', 'utf8'))

describe('Card stays translucent over the shell', () => {
  it('renders the card recipe from tokens, not literals', () => {
    const html = render(<Card>x</Card>)
    expect(html).toContain('var(--pq-card-bg)')
    expect(html).toContain('var(--pq-card-border)')
    expect(html).toContain('var(--pq-card-shadow)')
    expect(html).toContain('var(--pq-r-card)')
  })

  /* THE FAILURE THIS EXISTS FOR: an opaque fill severs the card from the
     ramp. The card still looks fine on its own, so nothing would flag
     it, and the dimensional effect the whole design rests on disappears. */
  it('carries no opaque background of its own', () => {
    const html = render(<Card>x</Card>)
    expect(html).not.toMatch(/background:\s*#[0-9a-f]{3,8}/i)
    expect(html).not.toMatch(/background:\s*rgb\(/i)
    expect(html).not.toContain('var(--pq-panel)')
    expect(html).not.toContain('var(--pq-sheet-bg)')
  })

  it('has no opaque escape hatch in its source', () => {
    /* no variant prop, no `solid`/`opaque` branch — the only way to make
       a Card opaque should be to write a bug someone can see in review */
    expect(CARD_SRC).not.toMatch(/variant/i)
    expect(CARD_SRC).not.toMatch(/opaque/i)
  })

  it('is not the sheet — that is a separate primitive', () => {
    const sheet = readFileSync('src/components/Sheet.jsx', 'utf8')
    expect(sheet).toContain('var(--pq-sheet-bg)')
    expect(sheet).toContain('var(--pq-sheet-shadow)')
    expect(CARD_SRC).not.toContain('sheet-bg')
  })

  it('still lets a caller set layout without touching the surface', () => {
    const html = render(<Card style={{ padding: 16, marginTop: 20 }}>x</Card>)
    expect(html).toContain('padding:16px')
    expect(html).toContain('var(--pq-card-bg)')
  })

  it('EmptyBlock is the dashed block, at the card radius', () => {
    const html = render(<EmptyBlock>none</EmptyBlock>)
    expect(html).toContain('var(--pq-rule-dashed)')
    expect(html).toContain('var(--pq-r-card)')
    expect(html).toContain('padding:30px 22px')
  })
})

describe('the shell paints a fixed ramp, not a scrolling one', () => {
  /* The prose said scroll-height; the prototype paints once on a fixed
     frame. At 260 rows a document-height ramp shows ~5% of itself per
     screen and reads flat. If someone "fixes" this back, these fail. */
  it('puts the gradient on an absolute layer, not the scroller', () => {
    expect(SHELL_SRC).toMatch(/position:\s*'absolute',\s*inset:\s*0[\s\S]{0,300}var\(--pq-shell\)/)
  })

  it('never uses background-attachment: fixed — unreliable on iOS', () => {
    expect(SHELL_SRC).not.toMatch(/backgroundAttachment/i)
    expect(SHELL_SRC).not.toMatch(/background-attachment/i)
  })

  it('sizes in dvh, not vh', () => {
    expect(SHELL_SRC).toContain('100dvh')
    expect(SHELL_SRC).not.toMatch(/height:\s*'100vh'/)
  })

  it('leaves the scroller transparent and reserves the nav clearance', () => {
    expect(SHELL_SRC).toContain('var(--pq-nav-clearance)')
    const scroller = SHELL_SRC.slice(SHELL_SRC.indexOf('THE SCROLLER'))
    expect(scroller).not.toMatch(/background:/)
  })

  it('grounds the page so overscroll shows the ramp ground', () => {
    expect(SHELL_SRC).toContain('var(--pq-page)')
  })

  it('carries the wide ramp for block E without a second mechanism', () => {
    expect(SHELL_SRC).toContain('var(--pq-shell-wide)')
  })
})

describe('BottomNav', () => {
  const html = render(<BottomNav active="grocery" onChange={() => {}} />)

  it('is 64px with all five destinations', () => {
    expect(html).toContain('var(--pq-nav-h)')
    for (const l of ['TODAY', 'PLAN', 'RECIPES', 'GROCERY', 'TRACK']) {
      expect(html).toContain(l)
    }
  })

  it('labels are 9px mono at .10em, uppercase in the markup', () => {
    expect(html).toContain('var(--pq-size-nav)')
    expect(html).toContain('var(--pq-mono)')
    expect(html).toContain('var(--pq-track-label)')
  })

  /* Active state is weight AND colour: colour alone is invisible to
     anyone who cannot separate chartreuse from grey. */
  it('marks the active tab by stroke weight as well as accent', () => {
    expect(html).toContain('stroke-width="2.4"')
    expect(html).toContain('stroke-width="1.8"')
    expect((html.match(/stroke-width="2.4"/g) || []).length).toBe(1)
    expect((html.match(/aria-current="page"/g) || []).length).toBe(1)
  })

  it('draws 20px icons', () => {
    expect((html.match(/width="20" height="20"/g) || []).length).toBe(5)
  })

  /* WIRED IN BLOCK B, and only there. A badge fed by week-wide checks
     would light on Monday because Thursday has something unbought —
     wrong on six days out of seven, and wrong in the direction that
     teaches you to ignore it. */
  it('shows the dot only when that day still has something to buy', () => {
    const off = render(<BottomNav active="today" onChange={() => {}} badges={{ grocery: false }} />)
    expect(off).not.toContain('border-radius:50%')

    const on = render(<BottomNav active="today" onChange={() => {}} badges={{ grocery: true }} />)
    expect((on.match(/border-radius:50%/g) || []).length).toBe(1)
    expect(on).toContain('width:6px')
    expect(on).toContain('var(--pq-accent)')
  })

  it('defaults to no badge rather than throwing when none is passed', () => {
    expect(render(<BottomNav active="today" onChange={() => {}} />)).not.toContain('border-radius:50%')
  })

  /* Only grocery carries one. A dot on TRACK would mean something else
     entirely and nothing defines it. */
  it('badges only the grocery tab', () => {
    const all = render(<BottomNav active="today" onChange={() => {}}
                                  badges={{ grocery: true, track: true, plan: true }} />)
    expect((all.match(/border-radius:50%/g) || []).length).toBe(1)
  })

  it('has no stub left behind', () => {
    const src = readFileSync('src/components/BottomNav.jsx', 'utf8')
    expect(src).not.toContain('TODO(phase-3)')
    expect(src).not.toMatch(/&&\s*false\s*&&/)
  })
})

describe('Logo', () => {
  it('is Prep + bracketed IQ, brackets faint, IQ accent', () => {
    const html = render(<Logo />)
    expect(html).toContain('Prep')
    expect(html).toContain('IQ')
    expect(html).toContain('var(--pq-text-faint)')
    expect(html).toContain('var(--pq-accent)')
  })

  /* Parameterised now so block E does not fork it. */
  it('takes both sizes with the right radius and mono size', () => {
    const phone = render(<LogoTile size={30} />)
    const rail = render(<LogoTile size={34} />)
    expect(phone).toContain('width:30px')
    expect(phone).toContain('border-radius:8px')
    expect(phone).toContain('font-size:11px')
    expect(rail).toContain('width:34px')
    expect(rail).toContain('border-radius:9px')
    expect(rail).toContain('font-size:12px')
  })

  it('takes the sidebar caption without a second component', () => {
    expect(render(<Logo size={34} caption="MEAL PREP" />)).toContain('MEAL PREP')
  })
})
