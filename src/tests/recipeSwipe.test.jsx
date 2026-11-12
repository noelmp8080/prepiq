import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { recipes } from '../data/recipes'

/* Swipe between recipes, and the full-size photo.
 *
 * Both live in the recipe sheet. Swipe is opt-in per screen: a screen
 * that passes `list` + `onNavigate` gets it, one that does not gets the
 * sheet exactly as it was — so both halves of that are asserted. */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../firebase', () => ({ auth: {}, db: {}, cloudEnabled: true }))
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

const { AppStoreProvider } = await import('../store/useAppStore')
const { default: RecipeSheet } = await import('../components/RecipeSheet')
const { default: Recipes } = await import('../components/Recipes')

const LIST = recipes.slice(0, 3)

/* Holds the open recipe the way a screen does. */
function Harness({ start = 1, withList = true }) {
  const [r, setR] = useState(LIST[start])
  return withList
    ? <RecipeSheet recipe={r} onClose={() => setR(null)} list={LIST} onNavigate={setR} />
    : <RecipeSheet recipe={r} onClose={() => setR(null)} />
}

let host, root
async function mount(el) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root.render(<AppStoreProvider>{el}</AppStoreProvider>) })
  await act(async () => { await authCb(null) })
}
beforeEach(() => localStorage.clear())
afterEach(() => {
  if (root) act(() => root.unmount())
  host?.remove(); root = null
  document.querySelectorAll('[data-photo-viewer]').forEach(n => n.remove())
})

const title = () => host.querySelector('[role="dialog"]').getAttribute('aria-label')
const position = () => host.querySelector('[data-recipe-position]')?.textContent || ''
const swipeArea = () => host.querySelector('[data-recipe-swipe]')

/* jsdom has no Touch constructor; React reads `touches` off the native
   event, so a plain event carrying that property is enough. */
function touch(el, type, x, y) {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  const pts = type === 'touchend' ? [] : [{ clientX: x, clientY: y }]
  Object.defineProperty(ev, 'touches', { value: pts })
  Object.defineProperty(ev, 'changedTouches', { value: [{ clientX: x, clientY: y }] })
  el.dispatchEvent(ev)
}
async function swipe(dx, dy = 0, el = swipeArea()) {
  await act(async () => {
    touch(el, 'touchstart', 200, 300)
    touch(el, 'touchmove', 200 + dx / 2, 300 + dy / 2)
    touch(el, 'touchmove', 200 + dx, 300 + dy)
    touch(el, 'touchend', 200 + dx, 300 + dy)
  })
}

describe('swiping between recipes', () => {
  it('says where you are in the list', async () => {
    await mount(<Harness start={1} />)
    expect(position()).toContain('2 OF 3')
  })

  it('swipe left opens the next recipe, swipe right the previous', async () => {
    await mount(<Harness start={1} />)
    expect(title()).toBe(LIST[1].name)
    await swipe(-120)
    expect(title()).toBe(LIST[2].name)
    expect(position()).toContain('3 OF 3')
    await swipe(120)
    await swipe(120)
    expect(title()).toBe(LIST[0].name)
  })

  it('a short drag springs back and stays put', async () => {
    await mount(<Harness start={1} />)
    await swipe(-30)
    expect(title()).toBe(LIST[1].name)
  })

  it('a vertical drag is a scroll, not a swipe', async () => {
    await mount(<Harness start={1} />)
    await swipe(-90, -300)
    expect(title()).toBe(LIST[1].name)
  })

  it('stops at the ends of the list', async () => {
    await mount(<Harness start={2} />)
    await swipe(-150)
    expect(title()).toBe(LIST[2].name)
    expect(host.querySelector('[data-recipe-next]').disabled).toBe(true)
  })

  it('a swipe that starts on a day chip does not add the meal to that day', async () => {
    await mount(<Harness start={0} />)
    const chip = host.querySelector('[role="dialog"] [aria-pressed]:not([data-photo-open])')
    const chips = [...host.querySelectorAll('[role="dialog"] button[aria-pressed]')]
      .filter(b => !/favourite/i.test(b.getAttribute('aria-label') || ''))
    const day = chips[0] || chip
    const before = day.getAttribute('aria-pressed')
    await swipe(-30, 0, day)            /* sideways, but under the commit distance */
    await act(async () => { day.click() })  /* the click a touch release produces */
    expect(day.getAttribute('aria-pressed')).toBe(before)
    /* and an ordinary tap still works */
    await act(async () => { day.click() })
    expect(day.getAttribute('aria-pressed')).not.toBe(before)
  })

  it('arrow buttons and keys do the same', async () => {
    await mount(<Harness start={0} />)
    await act(async () => { host.querySelector('[data-recipe-next]').click() })
    expect(title()).toBe(LIST[1].name)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    })
    expect(title()).toBe(LIST[2].name)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    })
    expect(title()).toBe(LIST[1].name)
  })

  it('a screen that passes no list gets the sheet as before', async () => {
    await mount(<Harness start={1} withList={false} />)
    expect(host.querySelector('[data-recipe-position]')).toBeNull()
    await swipe(-150)
    expect(title()).toBe(LIST[1].name)
  })

  it('the Recipes screen hands the sheet its filtered list', async () => {
    await mount(<Recipes />)
    const first = host.querySelector('button[style*="text-align: left"]')
    await act(async () => { first.click() })
    expect(position()).toContain(`1 OF ${recipes.length}`)
    await swipe(-120)
    expect(position()).toContain(`2 OF ${recipes.length}`)
  })
})

describe('the full-size photo', () => {
  it('opens on tapping the dish, full screen, over the sheet', async () => {
    await mount(<Harness start={0} />)
    expect(document.querySelector('[data-photo-viewer]')).toBeNull()
    await act(async () => { host.querySelector('[data-photo-open]').click() })
    const viewer = document.querySelector('[data-photo-viewer]')
    expect(viewer).not.toBeNull()
    /* Portalled to body, so it is sized by the screen, not the sheet. */
    expect(viewer.parentElement).toBe(document.body)
    expect(viewer.querySelector('img').getAttribute('src')).toBe(LIST[0].image)
    expect(viewer.querySelector('img').style.objectFit).toBe('contain')
  })

  it('Escape closes the photo and leaves the sheet open', async () => {
    const onClose = vi.fn()
    host = document.createElement('div'); document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root.render(<AppStoreProvider>
        <RecipeSheet recipe={LIST[0]} onClose={onClose} list={LIST} onNavigate={() => {}} />
      </AppStoreProvider>)
    })
    await act(async () => { await authCb(null) })
    await act(async () => { host.querySelector('[data-photo-open]').click() })
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('[data-photo-viewer]')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a tap anywhere closes it, and does not close the sheet', async () => {
    await mount(<Harness start={0} />)
    await act(async () => { host.querySelector('[data-photo-open]').click() })
    await act(async () => { document.querySelector('[data-photo-viewer]').click() })
    expect(document.querySelector('[data-photo-viewer]')).toBeNull()
    expect(host.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('no photo, no button — the initials tile opens nothing', async () => {
    const noPhoto = { ...LIST[0], image: '' }
    await mount(<RecipeSheet recipe={noPhoto} onClose={() => {}} />)
    expect(host.querySelector('[data-photo-open]')).toBeNull()
  })
})
