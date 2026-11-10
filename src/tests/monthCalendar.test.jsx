import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

/* THE MONTH CALENDAR on Track: the pure month logic, and the screen —
   which days it colours, where it reads them from, and the preview that
   opens without a click. */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const getDocMock = vi.fn()
let authCb = null

vi.mock('../firebase', () => ({ auth: {}, db: {}, cloudEnabled: true }))
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...s) => ({ path: s.join('/') }),
  getDoc: (...a) => getDocMock(...a),
  setDoc: async () => {},
}))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a, cb) => { authCb = cb; return () => {} },
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}))

const { AppStoreProvider, useAppStore } = await import('../store/useAppStore')
const { ThemeProvider } = await import('../store/useTheme')
const { default: Track } = await import('../components/Track')
const {
  lsKey, todayISO, monthDates, monthLeadingBlanks, dayStatus, proteinHit,
  monthCells, monthSummary,
} = await import('../store/storeLogic')
const { recipeById } = await import('../data/recipes')

const UID = 'uid-1'
const missing = { exists: () => false, data: () => ({}) }
const snap = value => ({ exists: () => true, data: () => value })
const saveLS = (uid, name, v) => localStorage.setItem(lsKey(uid, name), JSON.stringify(v))

let host, root, box
async function mount({ uid = null } = {}) {
  box = {}
  function Probe() { box.store = useAppStore(); return null }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <ThemeProvider><AppStoreProvider><Probe /><Track /></AppStoreProvider></ThemeProvider>)
  })
  await act(async () => { await authCb(uid ? { uid } : null) })
  await act(async () => {})
}

beforeEach(() => {
  localStorage.clear()
  getDocMock.mockReset(); getDocMock.mockResolvedValue(missing)
})
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); root = null })

/* ── Pure ─────────────────────────────────────────────────────────── */

describe('month logic', () => {
  it('lists every date of a month, in local time', () => {
    const nov = monthDates(2026, 10)
    expect(nov).toHaveLength(30)
    expect(nov[0]).toBe('2026-11-01')
    expect(nov[29]).toBe('2026-11-30')
    expect(monthDates(2028, 1)).toHaveLength(29)          // leap February
  })

  it('starts the grid on Monday', () => {
    expect(monthLeadingBlanks(2026, 10)).toBe(6)          // 1 Nov 2026 is a Sunday
    expect(monthLeadingBlanks(2026, 5)).toBe(0)           // 1 Jun 2026 is a Monday
  })

  it('calls a day on target within ten percent either way', () => {
    expect(dayStatus(0, 1800)).toBe('none')
    expect(dayStatus(1619, 1800)).toBe('under')
    expect(dayStatus(1620, 1800)).toBe('hit')
    expect(dayStatus(1980, 1800)).toBe('hit')
    expect(dayStatus(1981, 1800)).toBe('over')
  })

  it('counts protein as hit from ninety percent of the target', () => {
    expect(proteinHit(161, 180)).toBe(false)
    expect(proteinHit(162, 180)).toBe(true)
    expect(proteinHit(200, 0)).toBe(false)
  })

  const book = { 1: { cal: 900, protein: 90, carbs: 50, fat: 20 },
                 2: { cal: 600.5, protein: 40, carbs: 30, fat: 10 } }
  const goals = { calories: 1800, protein: 180 }
  const dates = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11']
  const logs = {
    '2026-11-08': [{ recipeId: 1 }, { recipeId: 1 }],
    '2026-11-09': [{ recipeId: 2 }],
    '2026-11-11': [{ recipeId: 1 }],                      // the future: ignored
  }
  const cells = monthCells(dates, logs, book, goals, '2026-11-10')

  it('builds a cell per date with rounded totals and a status', () => {
    expect(cells.map(c => c.status)).toEqual(['hit', 'under', 'none', 'none'])
    expect(cells[0]).toMatchObject({ kcal: 1800, protein: 180, proteinHit: true, future: false })
    expect(cells[1].kcal).toBe(601)
  })

  it('reports nothing for a day that has not come', () => {
    expect(cells[3]).toMatchObject({ future: true, kcal: 0, entries: [] })
  })

  it('sums the month, and the streak is the longest run', () => {
    expect(monthSummary(cells)).toEqual(
      { logged: 2, onTarget: 1, proteinDays: 1, streak: 2, avgKcal: 1201 })
    const gappy = [1, 1, 0, 1, 1, 1, 0].map(k => ({ kcal: k, status: 'under' }))
    expect(monthSummary(gappy).streak).toBe(3)
  })
})

/* ── The screen ───────────────────────────────────────────────────── */

describe('the month view on Track', () => {
  const now = new Date()
  const daysAgo = n => todayISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
  const today = todayISO(now)
  const cal = () => host.querySelector('[data-month-calendar]')
  const openMonth = async () => {
    await act(async () => { host.querySelector('[data-track-view="month"]').click() })
    await act(async () => {})
  }
  const dayCell = date => [...host.querySelectorAll('[data-cal-day]')]
    .find(c => c.getAttribute('aria-label').startsWith(date))
  const hover = el => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  const preview = () => host.querySelector('[data-cal-preview]')
  const monthLabel = d => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  it('opens on Today and switches to the calendar', async () => {
    await mount()
    expect(cal()).toBeNull()
    expect(host.querySelector('[data-track-week]')).toBeTruthy()
    await openMonth()
    expect(cal()).toBeTruthy()
    expect(host.querySelector('[data-track-week]')).toBeNull()
    expect(host.querySelector('[data-month-name]').textContent).toBe(monthLabel(now))
  })

  it('draws a cell for every day of the month', async () => {
    await mount()
    await openMonth()
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    expect(host.querySelectorAll('[data-cal-day]')).toHaveLength(days)
  })

  it('colours a logged day from the device log, and counts it', async () => {
    /* Yesterday — unless today is the 1st, when this month has no
       earlier day to put it on. */
    if (now.getDate() === 1) return
    saveLS(null, `log_${daysAgo(1)}`, [{ id: 'a', recipeId: 1 }])
    await mount()
    await openMonth()
    expect(dayCell(daysAgo(1)).dataset.status).toBe('under')
    expect(host.querySelector('[data-month-stats]').textContent).toContain('0/1')
  })

  it('shows today from the live log the moment a meal is logged', async () => {
    await mount()
    await openMonth()
    expect(dayCell(today).dataset.status).toBe('none')
    await act(async () => { box.store.logMeal(1, 'meal') })
    expect(dayCell(today).dataset.status).toBe('under')
  })

  it('previews a day on hover, with no click, and hides it on leaving', async () => {
    await mount()
    await openMonth()
    await act(async () => { box.store.logMeal(1, 'meal') })
    expect(preview().hasAttribute('data-open')).toBe(false)

    await act(async () => { hover(dayCell(today)) })
    expect(preview().hasAttribute('data-open')).toBe(true)
    expect(preview().textContent).toContain(recipeById[1].name)
    expect(preview().textContent).toContain(`${recipeById[1].cal}`)

    await act(async () => {
      host.querySelector('[data-cal-wrap]')
        .dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    })
    expect(preview().hasAttribute('data-open')).toBe(false)
  })

  it('says so for a past day with nothing logged', async () => {
    await mount()
    await openMonth()
    await act(async () => { hover(dayCell(today)) })
    expect(preview().textContent).toContain('Nothing logged')
  })

  it('takes a day from the cloud over the device copy', async () => {
    if (now.getDate() === 1) return
    const date = daysAgo(1)
    saveLS(UID, `log_${date}`, [{ id: 'a', recipeId: 1 }])
    getDocMock.mockImplementation(async ref => (ref.path.endsWith(`logs/${date}`)
      ? snap({ meals: [{ id: 'b', recipeId: 2 }, { id: 'c', recipeId: 3 }] }) : missing))
    await mount({ uid: UID })
    await openMonth()
    await act(async () => { hover(dayCell(date)) })
    expect(preview().textContent).toContain(recipeById[2].name)
    expect(preview().textContent).not.toContain(recipeById[1].name)
  })

  it('keeps the device copy when the cloud read fails', async () => {
    if (now.getDate() === 1) return
    const date = daysAgo(1)
    saveLS(null, `log_${date}`, [{ id: 'a', recipeId: 1 }])
    await mount()
    getDocMock.mockRejectedValue(new Error('offline'))
    await openMonth()
    expect(dayCell(date).dataset.status).toBe('under')
  })

  it('goes back a month, and will not go forward past this one', async () => {
    await mount()
    await openMonth()
    expect(host.querySelector('[aria-label="Next month"]').disabled).toBe(true)
    await act(async () => { host.querySelector('[aria-label="Previous month"]').click() })
    expect(host.querySelector('[data-month-name]').textContent)
      .toBe(monthLabel(new Date(now.getFullYear(), now.getMonth() - 1, 1)))
    expect(host.querySelector('[aria-label="Next month"]').disabled).toBe(false)
  })

  it('marks days still to come as future and gives them no preview', async () => {
    await mount()
    await openMonth()
    const future = [...host.querySelectorAll('[data-cal-day][data-status="future"]')]
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    expect(future).toHaveLength(days - now.getDate())
    if (future.length) {
      await act(async () => { hover(future[0]) })
      expect(preview().hasAttribute('data-open')).toBe(false)
    }
  })

  it('gives every control at least the 44px floor', async () => {
    await mount()
    await openMonth()
    for (const b of [...host.querySelectorAll('[data-track-view], [aria-label$="month"]')]) {
      expect(b.style.minHeight || b.style.height).toBe('var(--pq-tap-min)')
    }
  })
})
