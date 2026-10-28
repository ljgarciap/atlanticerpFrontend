import { defineConfig, devices } from '@playwright/test'
// Config para correr specs de smoke contra atlanticerp.ai (prod) — mismo patrón que
// playwright.test-remote.config.ts mismo para test.atlanticerp.ai. Usar con credenciales reales
// vía SMOKE_EMAIL/SMOKE_PASSWORD, nunca hardcodeadas.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: process.env.E2E_BASE_URL, trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
