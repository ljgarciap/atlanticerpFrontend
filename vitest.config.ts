import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', 'dist', 'e2e', '.claude'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Fase 1 del tracking de coverage (SCRUM-50): solo visibilidad, sin
      // thresholds todavía. El umbral se fija cuando haya un número base real.
      exclude: ['node_modules', 'dist', 'e2e', '.claude', 'src/test', '**/*.d.ts', '**/*.config.*'],
    },
  },
})
