import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Config de test (séparée de vite.config.js pour ne pas alourdir le build de prod).
// - environnement jsdom : rend les composants React hors navigateur
// - setup.js : matchers jest-dom + mocks globaux (fetch, showToast, matchMedia)
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.{js,jsx}'],
    css: false,
  },
})
