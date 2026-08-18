import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  /* Store logic only. The UI is deliberately not covered here — these
     tests exist for the rules where a wrong answer is silent, and every
     bug this file has produced so far has been in the store. */
  test: {
    environment: 'jsdom',
    include: ['src/tests/**/*.test.{js,jsx}'],
  },
})
