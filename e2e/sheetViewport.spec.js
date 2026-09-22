import { test, expect, devices } from '@playwright/test'

/* ── EVERY ACTION IN A SHEET MUST BE TAPPABLE ─────────────────────────
 *
 * The bug this file exists for: the Hidden items sheet opened on an
 * iPhone with only its header visible. The rows, the SHOW AGAIN buttons
 * and SHOW ALL AGAIN were below the fold, so the one screen whose whole
 * purpose is undoing something could not undo anything.
 *
 * 586 vitest tests passed through it. They had to — jsdom does no
 * layout, so "is this button on screen" is not a question it can answer.
 * `groceryNoReflow.test.jsx` says so in its own header.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE — stated, because the gap is the
 * reason the bug shipped and pretending it is closed would be worse
 * than the bug.
 *
 *   CAN:  that a sheet fits its viewport, that its list scrolls rather
 *         than overflowing, that every action is inside the visible
 *         area and is what a tap at its centre actually hits, and that
 *         the safe-area inset is honoured when there is one.
 *
 *   CANNOT: that `100dvh` beats `100vh`. Headless Chromium has no
 *         dynamic toolbar, so vh, dvh and innerHeight are all the same
 *         number and no assertion here can tell them apart. That rule
 *         is guarded at the SOURCE level in sheetPrimitives.test.jsx,
 *         the same way Shell's dvh rule has been since block A.
 *
 * ASSERTED BY HIT TEST, NOT BY ARITHMETIC. `elementFromPoint` at a
 * button's centre answers the question actually being asked — if you
 * tap here, does this button get it — and catches both a button below
 * the fold and a button with something painted over it.
 */

/* The iPhone's user agent, scale and touch flags — but NOT its
   `defaultBrowserType`, which Playwright refuses inside a describe and
   which would pull in WebKit. The engine is not what is under test
   here; the box geometry is. */
const { userAgent, deviceScaleFactor } = devices['iPhone 14 Pro']
const PHONE = { userAgent, deviceScaleFactor }
const W = 393
const TALL = 852          // toolbars retracted
const SHORT = 752         // toolbar showing — the case that broke

/* The iPhone 14 Pro's home indicator. Zero in every desktop browser,
   which is exactly why it is injected rather than waited for. */
const SAFE_B = 34

/* Hidden ids well clear of the seeded day's own items, so the list the
   sheet shows is independent of what the day derives. */
const TWENTY = Array.from({ length: 20 }, (_, i) => String(30 + i))

const PLAN = [
  { day: 'Mon', ids: [3, 4] },
  { day: 'Tue', ids: [1, 2] },
  { day: 'Wed', ids: [5, 6] },
  { day: 'Thu', ids: [7, 8] },
  { day: 'Fri', ids: [9, 10] },
  { day: 'Sat', ids: [11, null] },
  { day: 'Sun', ids: [12, null] },
]

async function openApp(page, hiddenKeys, { safeBottom = 0 } = {}) {
  await page.addInitScript(([plan, keys]) => {
    localStorage.setItem('prepiq_anon_weekplan', JSON.stringify(plan))
    localStorage.setItem('prepiq_anon_grocery_hidden',
      JSON.stringify({ version: 1, keys }))
    sessionStorage.setItem('skipAuth', '1')
  }, [PLAN, hiddenKeys])
  await page.goto('/')
  if (safeBottom) {
    /* Stand in for env(safe-area-inset-bottom), which no desktop
       browser reports and every iPhone does.

       AFTER the navigation, not in an init script: tokens.css defines
       this on :root too, and at equal specificity the sheet that loads
       last wins. An init script runs first, so its value was being
       overwritten by the real token and the padding measured 0 — which
       looked like the fix not working and was the injection not
       landing. */
    await page.addStyleTag({ content: `:root { --pq-safe-b: ${safeBottom}px }` })
  }
  await page.getByRole('button', { name: /grocery/i }).first().click()
  await expect(page.locator('[data-grocery-list]')).toBeVisible()
}

/* THE SHEET SLIDES UP OVER 0.22s, and measuring during those 220ms
   reads `translateY(100%)` — the sheet's whole height below where it
   lands. The first version of this file did exactly that and reported a
   dialog bottom of 1152px in a 752px viewport, which looks like the bug
   and is not. Wait for the animation, then measure. */
async function settled(page) {
  await page.locator('[role=dialog]').evaluate(
    el => Promise.all(el.getAnimations().map(a => a.finished)))
}

/** Is this element the thing a tap at its own centre would hit? */
function tappable(locator, safeBottom = 0) {
  return locator.evaluate((el, safe) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return {
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      viewport: window.innerHeight,
      /* Above the fold AND above the home indicator's strip. */
      onScreen: r.bottom <= window.innerHeight - safe && r.top >= 0,
      hits: !!hit && (el === hit || el.contains(hit) || hit.contains(el)),
      hitTag: hit ? hit.tagName : 'none',
    }
  }, safeBottom)
}

const sheetScroller = page => page.locator('[role=dialog] [data-sheet-scroll]')

for (const [label, height] of [['toolbar retracted', TALL], ['toolbar showing', SHORT]]) {
  test.describe(`${W}x${height} — ${label}`, () => {
    test.use({ ...PHONE, viewport: { width: W, height }, isMobile: true, hasTouch: true })

    test('one hidden item: its restore action is on screen and tappable', async ({ page }) => {
      await openApp(page, ['9'])
      await page.locator('[data-hidden-count]').click()
      await settled(page)

      const rows = page.locator('[data-hidden-row]')
      await expect(rows).toHaveCount(1)

      const m = await tappable(rows.first().locator('button'))
      expect(m, `SHOW AGAIN at ${JSON.stringify(m)}`)
        .toMatchObject({ onScreen: true, hits: true })
    })

    test('the sheet never extends past the bottom of the viewport', async ({ page }) => {
      await openApp(page, TWENTY)
      await page.locator('[data-hidden-count]').click()
      await settled(page)

      const m = await page.getByRole('dialog').evaluate(el => ({
        bottom: Math.round(el.getBoundingClientRect().bottom),
        viewport: window.innerHeight,
      }))
      expect(m.bottom, `dialog bottom ${m.bottom} vs viewport ${m.viewport}`)
        .toBeLessThanOrEqual(m.viewport + 1)
    })

    /* THE OVERFLOW HALF. A flex child with overflow-y:auto and no
       min-height:0 does not scroll — it grows, and takes its content
       off the bottom of the panel. Asserted as "the list scrolls" and
       "nothing escapes the panel", because either one alone can be
       satisfied by an accident. */
    test('twenty hidden items: the list scrolls inside the panel', async ({ page }) => {
      await openApp(page, TWENTY)
      await page.locator('[data-hidden-count]').click()
      await settled(page)
      await expect(page.locator('[data-hidden-row]')).toHaveCount(20)

      const m = await sheetScroller(page).evaluate(el => {
        const dialog = el.closest('[role=dialog]')
        return {
          scrolls: el.scrollHeight > el.clientHeight + 1,
          escapes: Math.round(el.getBoundingClientRect().bottom) >
                   Math.round(dialog.getBoundingClientRect().bottom) + 1,
        }
      })
      expect(m.scrolls, 'the 20-item list must scroll, not overflow').toBe(true)
      expect(m.escapes, 'the list must not extend past the panel').toBe(false)
    })

    test('twenty hidden items: show-all is reachable by scrolling the list', async ({ page }) => {
      await openApp(page, TWENTY)
      await page.locator('[data-hidden-count]').click()
      await settled(page)

      /* The FIRST row is tappable with nothing scrolled at all. */
      const first = await tappable(page.locator('[data-hidden-row]').first().locator('button'))
      expect(first, `first SHOW AGAIN at ${JSON.stringify(first)}`)
        .toMatchObject({ onScreen: true, hits: true })

      /* And the LAST action is reachable by scrolling the sheet's own
         container — not the page behind it. */
      await sheetScroller(page).evaluate(el => { el.scrollTop = el.scrollHeight })
      const all = page.getByRole('button', { name: 'SHOW ALL AGAIN' })
      const m = await tappable(all)
      expect(m, `SHOW ALL AGAIN at ${JSON.stringify(m)}`)
        .toMatchObject({ onScreen: true, hits: true })
    })

    /* The strip the home indicator occupies. Zero here unless injected,
       so without this the padding could be deleted and nothing would
       notice. */
    test(`actions clear a ${SAFE_B}px safe-area inset`, async ({ page }) => {
      await openApp(page, TWENTY, { safeBottom: SAFE_B })
      await page.locator('[data-hidden-count]').click()
      await settled(page)

      await sheetScroller(page).evaluate(el => { el.scrollTop = el.scrollHeight })
      const all = page.getByRole('button', { name: 'SHOW ALL AGAIN' })
      const m = await tappable(all, SAFE_B)
      expect(m, `SHOW ALL AGAIN at ${JSON.stringify(m)} with ${SAFE_B}px inset`)
        .toMatchObject({ onScreen: true, hits: true })
    })

    /* THE TAB BAR. Measured rather than assumed: the sheet overlay is
       z-200 and BottomNav is z-100, so the sheet paints OVER the bar
       and the bar intercepts nothing. The hit test is what proves it —
       if that ordering ever changes, this fails rather than the user
       finding out in a shop. */
    test('the tab bar does not intercept taps meant for the sheet', async ({ page }) => {
      await openApp(page, ['9'])
      await page.locator('[data-hidden-count]').click()
      await settled(page)

      const m = await tappable(page.locator('[data-hidden-row]').first().locator('button'))
      expect(m.hits, `a tap landed on ${m.hitTag} instead`).toBe(true)
    })

    /* THE PER-GROUP SHEET IS THE SAME SHEET, and the point of checking
       it is that a fix applied to one opening and not the other is the
       shape of bug this feature already has once. */
    test('the per-group sheet is tappable too', async ({ page }) => {
      await openApp(page, ['9'])

      const note = page.locator('[data-group-hidden]').first()
      await expect(note).toBeVisible()
      await note.scrollIntoViewIfNeeded()
      await note.click()
      await settled(page)

      const m = await tappable(page.locator('[data-hidden-row]').first().locator('button'))
      expect(m, `group sheet SHOW AGAIN at ${JSON.stringify(m)}`)
        .toMatchObject({ onScreen: true, hits: true })
    })
  })
}

/* ── THE OTHER SHEETS ─────────────────────────────────────────────────
 *
 * "If one is wrong they probably all are." They were — and the reason
 * is that the wrong part was in Sheet.jsx, which RecipeSheet, Settings,
 * Plan and HiddenSheet all render. The `[role=dialog]` panel measured
 * above IS that shared component, so what holds for it holds for the
 * other three by construction rather than by four similar tests.
 *
 * What does NOT follow is each sheet's own content area, which is why
 * the 20-item scroll case is asserted on HiddenSheet directly: that
 * half of the bug lived in the one sheet that had been written without
 * the `flex:1, min-height:0` pair the other three carry. There is a
 * source-level test for all four in sheetPrimitives.test.jsx. */
test.describe(`${W}x${SHORT} — the shared panel`, () => {
  test.use({ ...PHONE, viewport: { width: W, height: SHORT }, isMobile: true, hasTouch: true })

  test('the panel every sheet renders carries the safe-area inset', async ({ page }) => {
    await openApp(page, ['9'], { safeBottom: SAFE_B })
    await page.locator('[data-hidden-count]').click()
    await settled(page)

    const m = await page.getByRole('dialog').evaluate(el => ({
      padBottom: getComputedStyle(el).paddingBottom,
      overlayHeight: getComputedStyle(el.parentElement).height,
      viewport: window.innerHeight,
    }))
    expect(m.padBottom, 'the shared panel must carry the inset').toBe(`${SAFE_B}px`)
    /* The overlay is the dynamic viewport, not the document. */
    expect(parseFloat(m.overlayHeight)).toBeCloseTo(m.viewport, 0)
  })
})
