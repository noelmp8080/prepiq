import { createContext, useContext, useState, useLayoutEffect } from 'react'

const ThemeContext = createContext(null)

/* THE ACCENT IS A CONSTANT, NOT A DERIVED RAMP.
 *
 * An earlier pass kept a shade() helper here so a custom accent could
 * regenerate the ramp. It is gone, deliberately: nothing in the design
 * ever passes a non-default accent, the handoff never mentions an accent
 * picker, and Settings holds only macro goals and preference toggles.
 * The prototype's own `this.props.accent ?? '#D0F224'` is a scaffolding
 * default that no call site overrides.
 *
 * A helper that exists for a feature nobody asked for is a helper that
 * will eventually be used to approximate a value we already know
 * exactly. The ramp lives in tokens.css as seven literals; see that file
 * for why they are not generated.
 */
/* LIGHT IS THE DEFAULT NOW, and the stored choice has a NEW KEY.
 *
 * Paper and ink was chosen as a light design with a dark version beside
 * it. The old provider wrote `prepiq_theme = 'dark'` on first load
 * whether or not anyone had chosen it, so every device that ever opened
 * the app holds a "dark" that is not a preference. Reading that key
 * would open the new look in dark for everyone and call it their choice.
 * A new key starts everyone on the default; from here the value is only
 * written when it is what the app is showing.
 *
 * `theme-color` follows the theme, so the phone's status bar area is
 * paper in light and near-black in dark instead of a leftover purple.
 */
const KEY = 'prepiq_theme_v2'
const CHROME = { light: '#F6F4EF', dark: '#141416' }

function apply(theme) {
  document.body.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[theme])
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    let saved = null
    try { saved = localStorage.getItem(KEY) } catch { /* private mode */ }
    const t = saved === 'dark' ? 'dark' : 'light'
    apply(t)
    return t
  })

  useLayoutEffect(() => {
    apply(theme)
    try { localStorage.setItem(KEY, theme) } catch { /* best effort */ }
  }, [theme])

  function toggleTheme() {
    setTheme(t => (t === 'light' ? 'dark' : 'light'))
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
