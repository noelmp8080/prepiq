import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

/* RESET, AND THE SCREENS KNOWING ABOUT EACH OTHER.
 *
 * Four things arrived together and are covered together because they
 * lean on the same store fields:
 *
 *   - the cloud load actually reading the cloud (it never did)
 *   - Reset, in its three independent parts
 *   - Plan carrying each day's grocery progress and eaten meals
 *   - Track carrying the week and the doors out of it
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const getDocMock = vi.fn()
const setDocMock = vi.fn(async () => {})
const getDocsMock = vi.fn(async () => ({ docs: [] }))
const deleteDocMock = vi.fn(async () => {})
let authCb = null

vi.mock('../firebase', () => ({ auth: {}, db: {}, cloudEnabled: true }))
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...s) => ({ path: s.join('/') }),
  getDoc: (...a) => getDocMock(...a),
  setDoc: (...a) => setDocMock(...a),
  collection: (_db, ...s) => ({ path: s.join('/') }),
  getDocs: (...a) => getDocsMock(...a),
  deleteDoc: (...a) => deleteDocMock(...a),
}))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a, cb) => { authCb = cb; return () => {} },
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}))

const { AppStoreProvider, useAppStore } = await import('../store/useAppStore')
const { ThemeProvider } = await import('../store/useTheme')
const { default: Plan } = await import('../components/Plan')
const { default: Track } = await import('../components/Track')
const { default: ResetSheet } = await import('../components/ResetSheet')
const {
  lsKey, todayIndex, todayISO, dayKey, planDates, fromISO, emptiedWeekPlan,
  groceryProgressByDay, sinkChecked, buildGroceryItems,
  CHECKS_VERSION, EXCLUDED_VERSION, HIDDEN_VERSION,
} = await import('../store/storeLogic')
const { default: catalog } = await import('../data/groceryCatalog.json')
const { recipeById } = await import('../data/recipes')

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PLAN = DAYS.map((day, i) => ({ day, ids: [i + 1, i + 8] }))
const TODAY = todayIndex(PLAN)
const UID = 'uid-1'
const missing = { exists: () => false, data: () => ({}) }
const snap = value => ({ exists: () => true, data: () => value })
const readLS = (uid, name) => JSON.parse(localStorage.getItem(lsKey(uid, name)))
const saveLS = (uid, name, v) => localStorage.setItem(lsKey(uid, name), JSON.stringify(v))

let host, root, box
async function mount(children = null, { uid = null } = {}) {
  box = {}
  function Probe() { box.store = useAppStore(); return null }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <ThemeProvider><AppStoreProvider><Probe />{children}</AppStoreProvider></ThemeProvider>)
  })
  await act(async () => { await authCb(uid ? { uid } : null) })
  await act(async () => {})
}

beforeEach(() => {
  localStorage.clear()
  getDocMock.mockReset(); getDocMock.mockResolvedValue(missing)
  setDocMock.mockClear()
  getDocsMock.mockReset(); getDocsMock.mockResolvedValue({ docs: [] })
  deleteDocMock.mockClear()
})
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); root = null })

/* ── Pure ─────────────────────────────────────────────────────────── */

describe('the week has dates', () => {
  it('puts today on today, and counts out from it', () => {
    const now = new Date(2026, 10, 10)                 // Tue 10 Nov 2026, local
    const dates = planDates(7, 1, now)
    expect(dates[1]).toBe('2026-11-10')
    expect(dates[0]).toBe('2026-11-09')
    expect(dates[6]).toBe('2026-11-15')
  })

  it('crosses a month boundary without inventing a day', () => {
    expect(planDates(7, 6, new Date(2026, 10, 1))[0]).toBe('2026-10-26')
  })

  it('reads an ISO date back as a LOCAL day', () => {
    const d = fromISO('2026-11-10')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 10])
    expect(todayISO(d)).toBe('2026-11-10')
  })
})

describe('emptying a week', () => {
  it('keeps every day and puts each back to two empty slots', () => {
    const out = emptiedWeekPlan([{ day: 'Mon', ids: [1, 2] }, { day: 'Tue', ids: [3, null, 4] }])
    expect(out).toEqual([{ day: 'Mon', ids: [null, null] }, { day: 'Tue', ids: [null, null] }])
  })
})

/* ── Adding a meal in one tap ─────────────────────────────────────── */

const { default: Recipes } = await import('../components/Recipes')
const { default: RecipeSheet } = await import('../components/RecipeSheet')
const { addMealToDay, removeMealFromDay } = await import('../store/storeLogic')
const { recipes: allRecipes } = await import('../data/recipes')

describe('a day is never full', () => {
  const plan = [{ day: 'Mon', ids: [1, null] }, { day: 'Tue', ids: [3, 4] }]

  it('fills the first empty slot when there is one', () => {
    expect(addMealToDay(plan, 0, 9)[0].ids).toEqual([1, 9])
  })
  it('grows the day by one when there is not', () => {
    expect(addMealToDay(plan, 1, 9)[1].ids).toEqual([3, 4, 9])
  })
  it('touches no other day', () => {
    expect(addMealToDay(plan, 1, 9)[0]).toBe(plan[0])
  })
  it('removes an extra slot outright and only empties a base one', () => {
    expect(removeMealFromDay([{ day: 'Mon', ids: [1, 2, 3] }], 0, 1)[0].ids).toEqual([1, 3])
    expect(removeMealFromDay([{ day: 'Mon', ids: [1, 2] }], 0, 0)[0].ids).toEqual([null, 2])
  })
})

describe('adding from the recipe list', () => {
  const addButtons = () => [...host.querySelectorAll('[data-add-meal]')]
  const chips = () => [...host.querySelectorAll('[data-add-target] [data-day-chip]')]

  it('starts on today', async () => {
    saveLS(null, 'weekplan', PLAN)
    await mount(<Recipes />)
    expect(chips()).toHaveLength(7)
    expect(chips().map(c => c.getAttribute('aria-pressed')).indexOf('true')).toBe(TODAY)
  })

  it('puts a meal on the chosen day in ONE tap, even when that day has two already', async () => {
    saveLS(null, 'weekplan', PLAN)
    await mount(<Recipes />)
    const day = (TODAY + 3) % 7
    await act(async () => { chips()[day].click() })
    const fresh = allRecipes.findIndex(r => !PLAN[day].ids.includes(r.id))
    const before = box.store.weekPlan[day].ids

    await act(async () => { addButtons()[fresh].click() })

    expect(box.store.weekPlan[day].ids).toEqual([...before, allRecipes[fresh].id])
    expect(readLS(null, 'weekplan')[day].ids).toEqual([...before, allRecipes[fresh].id])
    /* and the button says so, and the day's count went up */
    expect(addButtons()[fresh].getAttribute('aria-pressed')).toBe('true')
    expect(chips()[day].textContent).toContain('3')
  })

  it('the same button takes it off again', async () => {
    saveLS(null, 'weekplan', PLAN)
    await mount(<Recipes />)
    const fresh = allRecipes.findIndex(r => !PLAN[TODAY].ids.includes(r.id))
    await act(async () => { addButtons()[fresh].click() })
    await act(async () => { addButtons()[fresh].click() })
    expect(box.store.weekPlan[TODAY].ids).toEqual(PLAN[TODAY].ids)
    expect(addButtons()[fresh].getAttribute('aria-pressed')).toBe('false')
  })

  it('shows what is already on the chosen day as ticked', async () => {
    saveLS(null, 'weekplan', PLAN)
    await mount(<Recipes />)
    const on = addButtons().filter(b => b.getAttribute('aria-pressed') === 'true')
    expect(on).toHaveLength(PLAN[TODAY].ids.length)
  })

  it('leaves the favourite heart as its own button', async () => {
    saveLS(null, 'weekplan', PLAN)
    await mount(<Recipes />)
    await act(async () => { addButtons()[5].click() })
    expect(box.store.favorites.size).toBe(0)
  })
})

describe('adding from the recipe sheet', () => {
  const chips = () => [...host.querySelectorAll('[role="dialog"] [data-day-chip]')]

  it('a day chip adds it there and the sheet stays open to show it', async () => {
    saveLS(null, 'weekplan', PLAN)
    const onClose = vi.fn()
    const r = allRecipes.find(x => PLAN.every(d => !d.ids.includes(x.id)))
    await mount(<RecipeSheet recipe={r} onClose={onClose} />)
    expect(chips().every(c => c.getAttribute('aria-pressed') === 'false')).toBe(true)

    await act(async () => { chips()[4].click() })

    expect(box.store.weekPlan[4].ids).toContain(r.id)
    expect(chips()[4].getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('[data-sheet-added]').textContent).toBe('ON FRI')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('adds to several days, and a lit chip takes it off', async () => {
    saveLS(null, 'weekplan', PLAN)
    const r = allRecipes.find(x => PLAN.every(d => !d.ids.includes(x.id)))
    await mount(<RecipeSheet recipe={r} onClose={() => {}} />)
    await act(async () => { chips()[0].click() })
    await act(async () => { chips()[2].click() })
    expect(host.querySelector('[data-sheet-added]').textContent).toBe('ON MON · WED')
    await act(async () => { chips()[0].click() })
    expect(box.store.weekPlan[0].ids).toEqual(PLAN[0].ids)
    expect(host.querySelector('[data-sheet-added]').textContent).toBe('ON WED')
  })

  it('offers no day as full', async () => {
    saveLS(null, 'weekplan', PLAN)
    await mount(<RecipeSheet recipe={allRecipes[40]} onClose={() => {}} />)
    expect(chips().some(c => c.disabled)).toBe(false)
    expect(host.textContent).not.toContain('FULL')
  })
})

describe('grocery progress per day', () => {
  it('agrees with the list it is counting', () => {
    const rows = buildGroceryItems(PLAN, catalog, new Set(), 2, new Set())
    const checks = new Set([dayKey(2, rows[0].id), dayKey(2, rows[1].id), dayKey(3, rows[0].id)])
    const prog = groceryProgressByDay(PLAN, catalog, new Set(), new Set(), checks)
    expect(prog).toHaveLength(7)
    expect(prog[2]).toEqual({ total: rows.length, got: 2 })
  })

  it('does not count a check for an item that day no longer lists', () => {
    const prog = groceryProgressByDay(PLAN, catalog, new Set(), new Set(), new Set(['2:999999']))
    expect(prog[2].got).toBe(0)
  })
})

describe('sinkChecked', () => {
  const rank = { b: 1, d: 0 }
  const rankOf = x => rank[x] ?? -1
  it('keeps unchecked rows in order and piles checked ones in the order checked', () => {
    expect(sinkChecked(['a', 'b', 'c', 'd', 'e'], rankOf)).toEqual(['a', 'c', 'e', 'd', 'b'])
  })
  it('is the same list when nothing is checked', () => {
    expect(sinkChecked(['a', 'b'], () => -1)).toEqual(['a', 'b'])
  })
})

/* ── The cloud load ───────────────────────────────────────────────── */

describe('a signed-in load reads the cloud', () => {
  /* IT NEVER DID. Seven snapshots were destructured from six reads, the
     seventh was undefined, `.exists()` threw, and the catch quietly
     loaded this device's copy instead. Every suite passed because every
     mock returned "missing", where the fallback and the real path give
     the same answer. This one returns a plan only the cloud has. */
  it('takes the plan from the cloud over the device copy', async () => {
    saveLS(UID, 'weekplan', PLAN)
    const cloudPlan = DAYS.map(day => ({ day, ids: [20, null] }))
    getDocMock.mockImplementation(async ref =>
      ref.path.endsWith('weekPlan/current') ? snap({ days: cloudPlan }) : missing)
    await mount(null, { uid: UID })
    expect(box.store.weekPlan).toEqual(cloudPlan)
  })

  it('asks for the hidden-items document, the read that was missing', async () => {
    getDocMock.mockImplementation(async ref =>
      ref.path.endsWith('grocery/hidden')
        ? snap({ version: HIDDEN_VERSION, keys: ['5'] }) : missing)
    await mount(null, { uid: UID })
    expect([...box.store.groceryHidden]).toEqual(['5'])
  })
})

/* ── Reset ────────────────────────────────────────────────────────── */

describe('reset is a clean start', () => {
  const OLD = '2026-03-14'                      // months back: well outside this week

  async function seeded(opts) {
    saveLS(opts?.uid ?? null, 'weekplan', PLAN)
    saveLS(opts?.uid ?? null, 'goals', { calories: 2400, protein: 200, carbs: 250, fat: 80 })
    saveLS(opts?.uid ?? null, `log_${todayISO()}`, [{ id: 'x', recipeId: 1 }])
    saveLS(opts?.uid ?? null, `log_${OLD}`, [{ id: 'o', recipeId: 2 }])
    saveLS(opts?.uid ?? null, 'grocery', { version: CHECKS_VERSION, keys: ['0:1'] })
    saveLS(opts?.uid ?? null, 'grocery_excluded', { version: EXCLUDED_VERSION, keys: ['0:2'] })
    saveLS(opts?.uid ?? null, 'grocery_hidden', { version: HIDDEN_VERSION, keys: ['7'] })
    saveLS(opts?.uid ?? null, 'favorites', [3, 4])
    await mount(null, opts)
  }

  it('resets everything by default, and it reaches the device', async () => {
    await seeded()
    await act(async () => { box.store.resetApp() })

    expect(box.store.weekPlan.every(d => d.ids.every(x => x === null))).toBe(true)
    expect(box.store.weekPlan.map(d => d.day)).toEqual(DAYS)
    expect(box.store.groceryChecks.size).toBe(0)
    expect(box.store.groceryExcluded.size).toBe(0)
    expect(box.store.mealLog).toEqual([])
    expect(box.store.consumed.calories).toBe(0)
    expect(box.store.goals).toEqual(box.store.defaultGoals)
    expect(box.store.favorites.size).toBe(0)
    expect(box.store.groceryHidden.size).toBe(0)

    expect(readLS(null, 'weekplan').every(d => d.ids.every(x => x === null))).toBe(true)
    expect(readLS(null, 'grocery').keys).toEqual([])
    expect(readLS(null, 'grocery_excluded').keys).toEqual([])
    expect(readLS(null, 'goals')).toEqual(box.store.defaultGoals)
    expect(readLS(null, 'favorites')).toEqual([])
    expect(readLS(null, 'grocery_hidden').keys).toEqual([])
  })

  /* THE WHOLE HISTORY. It used to clear this week only, which left every
     earlier month on the calendar — not a clean start. */
  it('removes every logged day from the device, however old', async () => {
    await seeded()
    await act(async () => { box.store.resetApp() })
    expect(localStorage.getItem(lsKey(null, `log_${OLD}`))).toBeNull()
    expect(localStorage.getItem(lsKey(null, `log_${todayISO()}`))).toBeNull()
    expect(Object.keys(localStorage).filter(k => k.includes('_log_'))).toEqual([])
    expect(box.store.readLogsLocal([OLD])[OLD]).toEqual([])
  })

  it('leaves another account’s logs on a shared device alone', async () => {
    saveLS('someone-else', `log_${OLD}`, [{ id: 'z', recipeId: 5 }])
    await seeded()
    await act(async () => { box.store.resetApp() })
    expect(readLS('someone-else', `log_${OLD}`)).toHaveLength(1)
  })

  it('deletes every log document in the account', async () => {
    const refs = [{ path: `users/${UID}/logs/${OLD}` }, { path: `users/${UID}/logs/2026-11-09` }]
    getDocsMock.mockResolvedValue({ docs: refs.map(ref => ({ ref })) })
    await seeded({ uid: UID })
    await act(async () => { box.store.resetApp() })
    await act(async () => {})

    expect(getDocsMock).toHaveBeenCalledWith({ path: `users/${UID}/logs` })
    expect(deleteDocMock.mock.calls.map(c => c[0])).toEqual(refs)
  })

  it('says so when the account could not be cleared', async () => {
    getDocsMock.mockRejectedValue(Object.assign(new Error('nope'), { code: 'permission-denied' }))
    await seeded({ uid: UID })
    await act(async () => { box.store.resetApp() })
    await act(async () => {})
    expect(box.store.syncErrors['logged history']).toContain('permission-denied')
  })

  it('leaves what was switched off alone', async () => {
    await seeded()
    await act(async () => {
      box.store.resetApp({ week: true, tracking: false, targets: false, prefs: false })
    })
    expect(box.store.mealLog).toHaveLength(1)
    expect(readLS(null, `log_${OLD}`)).toHaveLength(1)
    expect(box.store.goals.calories).toBe(2400)
    expect([...box.store.groceryHidden]).toEqual(['7'])
    expect(box.store.favorites.size).toBe(2)
    expect(box.store.weekPlan.every(d => d.ids.every(x => x === null))).toBe(true)
  })

  it('empties this week’s bars as well as today’s', async () => {
    saveLS(null, 'weekplan', PLAN)
    const other = planDates(7, TODAY)[(TODAY + 1) % 7]
    saveLS(null, `log_${other}`, [{ id: 'y', recipeId: 2 }])
    await mount()
    expect(box.store.logsByDay[(TODAY + 1) % 7]).toHaveLength(1)
    await act(async () => { box.store.resetApp({ week: false, tracking: true, targets: false, prefs: false }) })
    expect(box.store.logsByDay.every(l => l.length === 0)).toBe(true)
  })

  it('the sheet starts with all four on, and resets only what is left on', async () => {
    saveLS(null, 'weekplan', PLAN)
    saveLS(null, 'goals', { calories: 2400, protein: 200, carbs: 250, fat: 80 })
    saveLS(null, 'favorites', [3])
    const onClose = vi.fn()
    await mount(<ResetSheet open onClose={onClose} />)

    const switches = [...host.querySelectorAll('[role="switch"]')]
    expect(switches).toHaveLength(4)
    expect(switches.every(s => s.getAttribute('aria-checked') === 'true')).toBe(true)

    await act(async () => { switches[2].click() })            // keep my targets
    await act(async () => { host.querySelector('[data-reset-confirm]').click() })

    expect(box.store.goals.calories).toBe(2400)
    expect(box.store.favorites.size).toBe(0)
    expect(box.store.weekPlan.every(d => d.ids.every(x => x === null))).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  it('will not confirm with everything switched off', async () => {
    await mount(<ResetSheet open onClose={() => {}} />)
    for (const s of host.querySelectorAll('[role="switch"]')) await act(async () => { s.click() })
    expect(host.querySelector('[data-reset-confirm]').disabled).toBe(true)
  })
})

/* ── Plan knows the grocery list and the log ──────────────────────── */

describe('Plan carries what Grocery and Track are doing', () => {
  it('shows each planned day’s grocery progress, from the same derivation', async () => {
    saveLS(null, 'weekplan', PLAN)
    const rows = buildGroceryItems(PLAN, catalog, new Set(), 3, new Set())
    saveLS(null, 'grocery', { version: CHECKS_VERSION, keys: [dayKey(3, rows[0].id)] })
    await mount(<Plan />)
    const links = [...host.querySelectorAll('[data-plan-grocery]')]
    expect(links).toHaveLength(7)
    expect(links[3].textContent).toContain(`1 OF ${rows.length} GOT`)
  })

  it('opens the grocery list ON the day that was tapped', async () => {
    saveLS(null, 'weekplan', PLAN)
    const onChange = vi.fn()
    await mount(<Plan onChange={onChange} />)
    const other = (TODAY + 2) % 7
    await act(async () => { host.querySelectorAll('[data-plan-grocery]')[other].click() })
    expect(onChange).toHaveBeenCalledWith('grocery')
    expect(box.store.groceryDay).toBe(other)
    expect(box.store.groceryDayIsToday).toBe(false)
  })

  it('opens today as TODAY rather than as a pinned day', async () => {
    saveLS(null, 'weekplan', PLAN)
    await mount(<Plan onChange={() => {}} />)
    await act(async () => { box.store.setGroceryDay((TODAY + 1) % 7) })
    await act(async () => { host.querySelectorAll('[data-plan-grocery]')[TODAY].click() })
    expect(box.store.groceryDayIsToday).toBe(true)
  })

  it('offers no grocery line on a day with no meals', async () => {
    saveLS(null, 'weekplan', PLAN.map((d, i) => (i === 0 ? { ...d, ids: [null, null] } : d)))
    await mount(<Plan />)
    expect(host.querySelectorAll('[data-plan-grocery]')).toHaveLength(6)
  })

  it('marks a meal eaten the moment it is logged', async () => {
    saveLS(null, 'weekplan', PLAN)
    await mount(<Plan />)
    expect(host.querySelectorAll('[data-eaten]')).toHaveLength(0)
    await act(async () => { box.store.logMeal(PLAN[TODAY].ids[0], 'planned') })
    expect(host.querySelectorAll('[data-eaten]')).toHaveLength(1)
    expect(host.textContent).toContain('EATEN')
  })

  it('measures each day against the calorie target', async () => {
    saveLS(null, 'weekplan', PLAN)
    await mount(<Plan />)
    expect(host.textContent).toContain(`/ ${box.store.goals.calories} KCAL`)
  })

  it('has the reset button when given somewhere to send it', async () => {
    const onReset = vi.fn()
    await mount(<Plan onReset={onReset} />)
    await act(async () => { host.querySelector('[data-reset-open]').click() })
    expect(onReset).toHaveBeenCalled()
  })
})

/* ── Track knows the week ─────────────────────────────────────────── */

describe('Track carries the week and the way out of it', () => {
  it('draws one column per plan day', async () => {
    saveLS(null, 'weekplan', PLAN)
    await mount(<Track />)
    expect(host.querySelectorAll('[data-week-day]')).toHaveLength(7)
  })

  it('counts another day’s log in the week total', async () => {
    saveLS(null, 'weekplan', PLAN)
    const other = TODAY === 0 ? 1 : TODAY - 1
    saveLS(null, `log_${planDates(7, TODAY)[other]}`, [{ id: 'y', recipeId: 2 }])
    await mount(<Track />)
    const week = host.querySelector('[data-track-week]')
    expect(week.textContent).toContain(`${recipeById[2].cal.toLocaleString()} EATEN`)
  })

  it('moves the week total when a meal is logged today', async () => {
    saveLS(null, 'weekplan', PLAN)
    await mount(<Track />)
    const id = PLAN[TODAY].ids[0]
    await act(async () => { box.store.logMeal(id, 'planned') })
    expect(host.querySelector('[data-track-week]').textContent)
      .toContain(`${recipeById[id].cal.toLocaleString()} EATEN`)
  })

  it('goes to the plan and to the groceries', async () => {
    saveLS(null, 'weekplan', PLAN)
    const onChange = vi.fn()
    await mount(<Track onChange={onChange} />)
    await act(async () => { host.querySelector('[data-track-to-plan]').click() })
    await act(async () => { host.querySelector('[data-track-to-grocery]').click() })
    expect(onChange.mock.calls.map(c => c[0])).toEqual(['plan', 'grocery'])
  })

  it('says what today’s plan adds up to', async () => {
    saveLS(null, 'weekplan', PLAN)
    await mount(<Track />)
    const [a, b] = PLAN[TODAY].ids
    expect(host.querySelector('[data-track-planned]').textContent)
      .toContain(`${recipeById[a].cal + recipeById[b].cal} KCAL`)
  })

  it('says so, and points at the plan, when nothing is planned today', async () => {
    saveLS(null, 'weekplan', emptiedWeekPlan(PLAN))
    const onChange = vi.fn()
    await mount(<Track onChange={onChange} />)
    expect(host.textContent).toContain('Nothing planned for today')
    expect(host.querySelector('[data-track-planned]')).toBeNull()
  })
})

/* ── The whole week as one list ───────────────────────────────────── */

const { default: Grocery } = await import('../components/Grocery')
const { buildWeekGroceryItems, weekRowKeys, weekRowChecked } = await import('../store/storeLogic')

describe('the week list is the day lists, merged', () => {
  const week = buildWeekGroceryItems(PLAN, catalog, new Set(), new Set())
  const perDay = PLAN.map((_, i) => buildGroceryItems(PLAN, catalog, new Set(), i, new Set()))

  it('lists exactly the items some day lists, once each', () => {
    const union = new Set(perDay.flat().map(r => r.id))
    expect(new Set(week.map(r => r.id))).toEqual(union)
    expect(week).toHaveLength(union.size)
  })

  it('knows which days need each item', () => {
    for (const row of week) {
      const days = perDay.map((rows, i) => (rows.some(r => r.id === row.id) ? i : -1))
        .filter(i => i >= 0)
      expect(row.days).toEqual(days)
    }
  })

  it('carries every quantity line, each tagged with its day', () => {
    for (const row of week) {
      const lines = perDay.flatMap(rows => rows.filter(r => r.id === row.id).flatMap(r => r.qty))
      expect(row.qty).toEqual(lines)
      expect(row.qtyDay).toHaveLength(row.qty.length)
      expect(row.qtyFrom).toHaveLength(row.qty.length)
    }
  })

  it('drops an item from the week only when every day has cleared it', () => {
    const shared = week.find(r => r.days.length > 1)
    const one = new Set([dayKey(shared.days[0], shared.id)])
    const still = buildWeekGroceryItems(PLAN, catalog, one, new Set()).find(r => r.id === shared.id)
    expect(still.days).toEqual(shared.days.slice(1))
    const all = new Set(weekRowKeys(shared))
    expect(buildWeekGroceryItems(PLAN, catalog, all, new Set()).some(r => r.id === shared.id)).toBe(false)
  })

  it('is got only when got on every day that needs it', () => {
    const shared = week.find(r => r.days.length > 1)
    const keys = weekRowKeys(shared)
    expect(weekRowChecked(shared, new Set(keys.slice(1)))).toBe(false)
    expect(weekRowChecked(shared, new Set(keys))).toBe(true)
  })
})

describe('the week view', () => {
  const rowsOf = () => [...host.querySelectorAll('[data-grocery-list] [data-flip]')]
  const nameOf = r => r.querySelector('[data-row-name]').textContent
  const weekPill = () => host.querySelector('[data-week-pill]')

  async function mountWeek() {
    saveLS(null, 'weekplan', PLAN)
    await mount(<Grocery />)
    await act(async () => { weekPill().click() })
  }

  it('shows one row per item for the whole week', async () => {
    await mountWeek()
    /* Open every aisle, so collapsed-by-default ones are counted too. */
    for (const b of host.querySelectorAll('[data-grocery-list] section > button[aria-expanded="false"]')) {
      await act(async () => { b.click() })
    }
    expect(rowsOf()).toHaveLength(box.store.groceryWeekRows.length)
    expect(host.querySelector('[data-grocery-header]').textContent).toContain('WHOLE WEEK')
    expect(host.querySelector('[data-grocery-header]').textContent)
      .toContain(`${box.store.groceryWeekRows.length} left`)
  })

  it('lights the week pill and no day pill', async () => {
    await mountWeek()
    expect(weekPill().getAttribute('aria-pressed')).toBe('true')
    const days = [...host.querySelectorAll('[data-day-pill]')]
      .filter(b => !b.hasAttribute('data-aisles-pill'))
    expect(days.every(b => b.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('a tick in the week ticks that item on every day that needs it', async () => {
    await mountWeek()
    const shared = box.store.groceryWeekRows.find(r => r.days.length > 1)
    await act(async () => { box.store.toggleGroceryItemWeek(shared.id) })
    for (const k of weekRowKeys(shared)) expect(box.store.groceryChecks.has(k)).toBe(true)
    expect(readLS(null, 'grocery').keys).toEqual(expect.arrayContaining(weekRowKeys(shared)))

    await act(async () => { box.store.toggleGroceryItemWeek(shared.id) })
    for (const k of weekRowKeys(shared)) expect(box.store.groceryChecks.has(k)).toBe(false)
  })

  it('ticking it on each day, one by one, ticks it in the week', async () => {
    /* The store alone: this is about the keys, and re-rendering the
       whole screen per day made it slow enough to time out under load. */
    saveLS(null, 'weekplan', PLAN)
    await mount()
    const shared = box.store.groceryWeekRows.find(r => r.days.length > 1)
    for (const d of shared.days) {
      expect(box.store.groceryWeekProgress.got).toBe(0)
      await act(async () => { box.store.setGroceryDay(d) })
      await act(async () => { box.store.toggleGroceryItem(shared.id) })
    }
    expect(box.store.groceryWeekProgress.got).toBe(1)
  })

  it('sinks a tapped row to the bottom of its aisle', async () => {
    await mountWeek()
    const first = rowsOf()[0]
    const name = nameOf(first)
    await act(async () => { first.querySelector('button[aria-pressed]').click() })
    const inAisle = [...first.parentElement.querySelectorAll('[data-flip]')]
    expect(nameOf(inAisle[inAisle.length - 1])).toBe(name)
    expect(first.querySelector('button[aria-pressed]').getAttribute('aria-pressed')).toBe('true')
  })

  it('choosing a day leaves the week', async () => {
    await mountWeek()
    await act(async () => { host.querySelectorAll('[data-day-pill]')[3].click() })
    expect(box.store.groceryWeek).toBe(false)
    expect(box.store.groceryDay).toBe(3)
    expect(weekPill().getAttribute('aria-pressed')).toBe('false')
  })

  it('Plan opens the list straight into the week', async () => {
    saveLS(null, 'weekplan', PLAN)
    const onChange = vi.fn()
    await mount(<Plan onChange={onChange} />)
    const link = host.querySelector('[data-plan-week-grocery]')
    expect(link.textContent).toContain(`0 OF ${box.store.groceryWeekRows.length} GOT`)
    await act(async () => { link.click() })
    expect(box.store.groceryWeek).toBe(true)
    expect(onChange).toHaveBeenCalledWith('grocery')
  })

  it('Plan offers no week list for an empty week', async () => {
    saveLS(null, 'weekplan', emptiedWeekPlan(PLAN))
    await mount(<Plan />)
    expect(host.querySelector('[data-plan-week-grocery]')).toBeNull()
  })
})
