import { defineConfig } from '@playwright/test'

/* ── THE LAYOUT TESTS jsdom CANNOT RUN ────────────────────────────────
 *
 * The vitest suite is a PROPERTY harness: jsdom returns all zeros from
 * getBoundingClientRect, so `groceryNoReflow.test.jsx` asserts declared
 * style rather than geometry and says so at the top of the file.
 *
 * That gap is exactly where the hidden sheet shipped broken. A sheet
 * anchored to the bottom of a viewport it had measured wrongly put its
 * restore buttons below the fold, and NOTHING in 586 passing tests could
 * see it, because seeing it requires a browser that does layout.
 *
 * So this config exists for one narrow job: assert that things which
 * must be tappable are inside the viewport, in real pixels. It is not a
 * second functional suite and should not grow into one.
 *
 * WHY CHROMIUM FOR AN IPHONE BUG. WebKit would be closer, but the thing
 * being asserted is geometry — a box's bottom edge against the
 * viewport's — and that is not engine-specific. What IS specific is
 * Safari's dynamic toolbar, and no headless browser reproduces it; the
 * spec models it as a SHORTER VIEWPORT instead, which is precisely what
 * the toolbar does to the visible area.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
  },
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
