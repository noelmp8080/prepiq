import { createContext, useContext, useState, useLayoutEffect } from 'react'

const ThemeContext = createContext(null)

/* THE ACCENT IS ONE VALUE, AND EVERY ACCENT SURFACE DERIVES FROM IT.
 *
 * The design ships a fixed ramp — five stops plus two ink colours — and
 * those exact hexes live in tokens.css because they are authoritative.
 * This layer exists for the other case: a custom accent, where no
 * authoritative ramp exists and an approximation is the only option.
 *
 * shade() is a linear mix in RGB toward white or black. It reproduces
 * exactly ONE of the design's five stops (the bottom inset shade, at
 * .42) and approximates the other four - which is precisely why the
 * default ramp is not generated here. See tokens.css for the misses.
 */
const DEFAULT_ACCENT = '#D0F224'

export function shade(hex, amount) {
  const to = amount > 0 ? 255 : 0
  const t = Math.abs(amount)
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return '#' + ch.map(v => Math.round(v + (to - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** The full ramp for an accent. Returns null for the default, because
 *  tokens.css already carries the authoritative values and overriding
 *  them with derived ones would be strictly worse. */
export function accentRamp(accent) {
  if (!accent || accent.toUpperCase() === DEFAULT_ACCENT) return null
  return {
    '--pq-accent': accent,
    '--pq-accent-lift': shade(accent, 0.30),
    '--pq-accent-drop': shade(accent, -0.26),
    '--pq-accent-edge': shade(accent, 0.72),
    '--pq-accent-shade': shade(accent, -0.42),
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('prepiq_theme') || 'dark'
    document.body.setAttribute('data-theme', saved)
    return saved
  })
  const [accent, setAccentState] = useState(
    () => localStorage.getItem('prepiq_accent') || DEFAULT_ACCENT)

  useLayoutEffect(() => {
    document.body.setAttribute('data-theme', theme)
    localStorage.setItem('prepiq_theme', theme)
  }, [theme])

  /* Written onto the root element, so every --pq-accent-* consumer —
     gradients, the raised shadow, progress bars, the checkbox, the logo
     tile — recolours from this one write. */
  useLayoutEffect(() => {
    const root = document.documentElement
    const ramp = accentRamp(accent)
    const keys = ['--pq-accent', '--pq-accent-lift', '--pq-accent-drop',
                  '--pq-accent-edge', '--pq-accent-shade']
    if (!ramp) {
      for (const k of keys) root.style.removeProperty(k)   // fall back to tokens.css
    } else {
      for (const [k, v] of Object.entries(ramp)) root.style.setProperty(k, v)
    }
    localStorage.setItem('prepiq_accent', accent)
  }, [accent])

  function toggleTheme() {
    setTheme(t => (t === 'light' ? 'dark' : 'light'))
  }
  const setAccent = next => setAccentState(next || DEFAULT_ACCENT)

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, accent, setAccent, DEFAULT_ACCENT }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
