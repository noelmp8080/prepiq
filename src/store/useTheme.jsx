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
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('prepiq_theme') || 'dark'
    document.body.setAttribute('data-theme', saved)
    return saved
  })

  useLayoutEffect(() => {
    document.body.setAttribute('data-theme', theme)
    localStorage.setItem('prepiq_theme', theme)
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
