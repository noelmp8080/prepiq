import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

/* Settings is a sheet over whatever screen you were on, not a sixth
   destination in a nav built for five. */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../firebase', () => ({ auth: {}, db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...s) => ({ path: s.join('/') }),
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  setDoc: async () => {},
}))
let authCb = null
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a, cb) => { authCb = cb; return () => {} },
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}))

const { AppStoreProvider, useAppStore } = await import('../store/useAppStore')
const { ThemeProvider } = await import('../store/useTheme')
const { default: Settings } = await import('../components/Settings')
const { lsKey } = await import('../store/storeLogic')

let host, root, box
async function open(onClose = () => {}) {
  box = {}
  function Probe() { box.store = useAppStore(); return null }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <ThemeProvider>
        <AppStoreProvider>
          <Probe />
          <Settings open onClose={onClose} />
        </AppStoreProvider>
      </ThemeProvider>)
  })
  await act(async () => { await authCb(null) })
  return host
}
beforeEach(() => localStorage.clear())
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); root = null })

const dialog = () => host.querySelector('[role="dialog"]')
const field = key => host.querySelector(`#goal-${key}`)
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent === label)

/* React tracks an input's value on the node, so assigning `.value` and
   firing `input` is ignored — the change never reaches onChange and the
   assertion afterwards passes against an untouched store. Going through
   the native setter is what makes the edit real. Found the hard way:
   without it, "holds edits locally until SAVE" passed for the wrong
   reason. */
const valueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value').set
function type(key, value) {
  const f = field(key)
  act(() => {
    valueSetter.call(f, value)
    f.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return f
}

describe('the panel', () => {
  it('is a sheet: scrim, top-only radius, capped at 88%', async () => {
    await open()
    const panel = dialog()
    expect(panel.style.maxHeight).toBe('88%')
    expect(panel.style.borderTopLeftRadius).toBe('18px')
    expect(panel.style.borderBottomLeftRadius).toBe('')      // bottom stays square
    expect(panel.style.background).toBe('var(--pq-sheet-bg)')
    expect(panel.parentElement.style.background).toBe('var(--pq-scrim)')
  })

  /* Same failure mode as the recipe sheet, and it bites harder here:
     the thing pushed off the bottom is the only way to save. */
  it('scrolls its body so SAVE cannot leave the screen', async () => {
    await open()
    const kids = [...dialog().children].filter(c => c.tagName === 'DIV')
    const body = kids.find(c => c.style.overflowY === 'auto')
    expect(body).toBeTruthy()
    expect(body.style.flex).toMatch(/^1( 1 0%)?$/)
    expect(body.style.minHeight).toBe('0px')
    expect(kids[kids.length - 1].style.flexShrink).toBe('0')
    expect(button('SAVE GOALS')).toBeTruthy()
  })

  it('closes on the backdrop, the close button and Escape', async () => {
    const onClose = vi.fn()
    await open(onClose)

    dialog().parentElement.click()
    expect(onClose).toHaveBeenCalled()

    onClose.mockClear()
    ;[...host.querySelectorAll('button')]
      .find(b => b.getAttribute('aria-label') === 'Close').click()
    expect(onClose).toHaveBeenCalled()

    onClose.mockClear()
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('the four macro goal fields', () => {
  it('shows all four, seeded from the store', async () => {
    await open()
    for (const [key, want] of [['calories', 1800], ['protein', 180], ['carbs', 200], ['fat', 60]]) {
      expect(field(key), key).toBeTruthy()
      expect(field(key).value).toBe(String(want))
    }
  })

  /* THE ONE THAT WOULD SHIP SILENTLY. updateGoals REPLACES the stored
     object rather than merging, so a Save that sent only the edited
     field would drop the other three to undefined — and the screen would
     look right until the next reload. */
  it('saves all four even when only one was edited', async () => {
    await open()
    expect(type('calories', '2400').value).toBe('2400')   // the edit registered
    act(() => { button('SAVE GOALS').click() })

    expect(box.store.goals).toEqual({ calories: 2400, protein: 180, carbs: 200, fat: 60 })
    const stored = JSON.parse(localStorage.getItem(lsKey(null, 'goals')))
    expect(stored).toEqual({ calories: 2400, protein: 180, carbs: 200, fat: 60 })
  })

  /* Typing straight into the store would write to Firestore per
     keystroke, and "18" would be a real calorie goal on the way to
     "1800". */
  it('holds edits locally until SAVE', async () => {
    await open()
    expect(type('calories', '18').value).toBe('18')        // the edit registered
    expect(box.store.goals.calories).toBe(1800)              // and did NOT reach the store
    expect(localStorage.getItem(lsKey(null, 'goals'))).toBe(null)
  })

  it('keeps the old value rather than storing a blank or a zero', async () => {
    await open()
    for (const bad of ['', '0', '-5', 'abc']) {
      type('protein', bad)
      act(() => { button('SAVE GOALS').click() })
      expect(box.store.goals.protein, `"${bad}" should not become a goal`).toBe(180)
    }
  })
})

describe('the preference toggle', () => {
  const sw = () => host.querySelector('[role="switch"]')

  it('is a switch with the state in the markup, not only in colour', async () => {
    await open()
    expect(sw()).toBeTruthy()
    expect(sw().getAttribute('aria-checked')).toBe('false')
  })

  /* Track is the inset well when off; track and knob take the accent
     when on. Asserted because "the toggle looks off" is the kind of
     thing a token rename breaks without failing anything. */
  it('uses the well when off and the accent when on', async () => {
    await open()
    const track = () => sw().querySelector('span[aria-hidden="true"]')

    expect(track().style.background).toBe('var(--pq-well-bg)')
    expect(track().style.boxShadow).toBe('var(--pq-well-shadow)')
    expect(track().style.justifyContent).toBe('flex-start')

    act(() => { sw().click() })

    expect(sw().getAttribute('aria-checked')).toBe('true')
    expect(track().style.background).toBe('var(--pq-accent-grad)')
    expect(track().style.justifyContent).toBe('flex-end')
  })

  it('flips the real preference, not a local copy', async () => {
    await open()
    expect(document.body.getAttribute('data-theme')).toBe('dark')
    act(() => { sw().click() })
    expect(document.body.getAttribute('data-theme')).toBe('light')
  })
})

describe('nothing is invented', () => {
  /* The prototype carries three PRESET buttons whose values are
     placeholders. Shipping them would mean choosing four macro targets
     per preset and presenting them as nutrition guidance. */
  it('ships no macro presets', async () => {
    await open()
    expect(dialog().textContent).not.toContain('PRESETS')
  })

  it('gives every control at least a 44px target', async () => {
    await open()
    for (const b of host.querySelectorAll('button')) {
      const h = b.style.height || b.style.minHeight
      expect(h, `button "${b.textContent.slice(0, 20)}" at ${h || 'no height'}`)
        .toMatch(/var\(--pq-tap-min\)|^4[4-9]px|^[5-9]\dpx/)
    }
    for (const i of host.querySelectorAll('input')) {
      expect(i.style.minHeight).toBe('var(--pq-tap-min)')
    }
  })
})
