import { test, expect, devices } from '@playwright/test'

/* ── SWIPE BETWEEN RECIPES, AND THE FULL-SIZE PHOTO — IN A REAL BROWSER ──
 *
 * The vitest file (recipeSwipe.test.jsx) proves the logic with synthetic
 * touch events. What it cannot prove is the part that goes wrong on a
 * phone: whether the browser hands a sideways drag to the page at all
 * (touch-action), whether a vertical drag still scrolls the recipe, and
 * whether the photo fits the screen it is shown on. Those need layout
 * and a real touch pipeline, so the gestures here are sent through the
 * DevTools protocol as touch input, not as constructed DOM events.
 */

const { userAgent, deviceScaleFactor } = devices['iPhone 14 Pro']
test.use({
  userAgent, deviceScaleFactor,
  viewport: { width: 393, height: 752 }, isMobile: true, hasTouch: true,
})

async function openRecipes(page) {
  await page.addInitScript(() => sessionStorage.setItem('skipAuth', '1'))
  await page.goto('/')
  await page.getByRole('button', { name: /recipes/i }).first().click()
  await expect(page.getByLabel('Search recipes')).toBeVisible()
}

async function settled(page) {
  await page.locator('[role=dialog]').first().evaluate(
    el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)))
}

/** A real finger: touchStart, a run of touchMoves, touchEnd. */
async function drag(page, from, to, steps = 12) {
  const cdp = await page.context().newCDPSession(page)
  const pt = (x, y) => [{ x, y, id: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(...from) })
  for (let i = 1; i <= steps; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / steps
    const y = from[1] + ((to[1] - from[1]) * i) / steps
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x, y) })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(350)
}

const sheetTitle = page => page.locator('[role=dialog]').first().getAttribute('aria-label')

test('swipe left and right moves through the list on screen', async ({ page }) => {
  await openRecipes(page)
  const names = await page.locator('[data-add-meal]').evaluateAll(btns =>
    btns.slice(0, 3).map(b => b.getAttribute('aria-label').replace(/^Add (.*) to \w+$/, '$1')))

  await page.locator('button', { hasText: names[0] }).first().click()
  await settled(page)
  expect(await sheetTitle(page)).toBe(names[0])

  const box = await page.locator('[data-recipe-swipe]').boundingBox()
  const y = box.y + box.height * 0.45
  await drag(page, [box.x + box.width * 0.8, y], [box.x + box.width * 0.15, y])
  expect(await sheetTitle(page)).toBe(names[1])
  await page.screenshot({ path: 'test-results/swipe-next.png' })

  await drag(page, [box.x + box.width * 0.2, y], [box.x + box.width * 0.85, y])
  expect(await sheetTitle(page)).toBe(names[0])
})

test('a vertical drag scrolls the recipe instead of changing it', async ({ page }) => {
  await openRecipes(page)
  await page.locator('[data-add-meal]').first().evaluate(b => b.previousElementSibling.click())
  await settled(page)
  const before = await sheetTitle(page)
  const scroller = page.locator('[data-recipe-swipe] > div[style*="overflow-y"]')
  const box = await scroller.boundingBox()
  await drag(page, [box.x + box.width / 2, box.y + box.height * 0.8],
                   [box.x + box.width / 2 + 20, box.y + box.height * 0.1])
  expect(await sheetTitle(page)).toBe(before)
  expect(await scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(50)
})

test('tapping the dish shows the whole photo, fitted to the phone', async ({ page }) => {
  await openRecipes(page)
  await page.locator('[data-add-meal]').first().evaluate(b => b.previousElementSibling.click())
  await settled(page)
  await page.locator('[data-photo-open]').tap()
  const img = page.locator('[data-photo-viewer] img')
  await expect(img).toBeVisible()
  await page.waitForTimeout(400)
  const m = await img.evaluate(el => {
    const r = el.getBoundingClientRect()
    return { w: r.width, h: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom,
             vw: window.innerWidth, vh: window.innerHeight, nat: el.naturalWidth }
  })
  expect(m.nat).toBeGreaterThan(0)                 /* the file actually loaded */
  expect(m.left).toBeGreaterThanOrEqual(0)
  expect(m.right).toBeLessThanOrEqual(m.vw)
  expect(m.top).toBeGreaterThanOrEqual(0)
  expect(m.bottom).toBeLessThanOrEqual(m.vh)
  expect(Math.max(m.w / m.vw, m.h / m.vh)).toBeGreaterThan(0.9) /* it fills the screen */
  await page.screenshot({ path: 'test-results/photo-viewer.png' })

  await page.locator('[data-photo-viewer]').tap()
  await expect(page.locator('[data-photo-viewer]')).toHaveCount(0)
  await expect(page.locator('[role=dialog]')).toBeVisible()
})
