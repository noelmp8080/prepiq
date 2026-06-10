import { createContext, useContext, useState, useLayoutEffect } from 'react'

const ThemeContext = createContext(null)

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
    setTheme(t => t === 'light' ? 'dark' : 'light')
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
