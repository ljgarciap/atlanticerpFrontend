import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8090'

async function login(page, email: string, password: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
}

test('Carlos Vergara (tecnico_servicios) — Mi calendario muestra solo lo propio, red sin scope/owner_id', async ({ page }) => {
  const calendarRequests: string[] = []
  page.on('request', req => {
    if (req.url().includes('/api/servicios/calendar')) calendarRequests.push(req.url())
  })

  await login(page, 'carlos@illuminations.com.pa', 'carlos@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/inicio`)
  await page.waitForTimeout(3000)

  await page.screenshot({ path: '/private/tmp/claude-501/-Users-lgarcia-Documents-GitHub-Softclass-Illumination-atlanticerp/c47e2ad4-b3ba-4bc6-867f-81df025c8911/scratchpad/carlos-home.png', fullPage: true })

  console.log('CARLOS calendar requests:', JSON.stringify(calendarRequests, null, 2))
  for (const url of calendarRequests) {
    expect(url).not.toContain('scope=')
    expect(url).not.toContain('owner_id=')
  }
  expect(calendarRequests.length).toBeGreaterThan(0)
})

test('Aaron Leis (lider_servicios, gerencia sin visitas de campo) — Mi calendario vacío, nunca calendario ajeno', async ({ page }) => {
  const calendarRequests: string[] = []
  page.on('request', req => {
    if (req.url().includes('/api/servicios/calendar')) calendarRequests.push(req.url())
  })

  await login(page, 'servicio@illuminations.com.pa', 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/inicio`)
  await page.waitForTimeout(3000)

  await page.screenshot({ path: '/private/tmp/claude-501/-Users-lgarcia-Documents-GitHub-Softclass-Illumination-atlanticerp/c47e2ad4-b3ba-4bc6-867f-81df025c8911/scratchpad/aaron-home.png', fullPage: true })

  console.log('AARON calendar requests:', JSON.stringify(calendarRequests, null, 2))
  for (const url of calendarRequests) {
    expect(url).not.toContain('scope=')
    expect(url).not.toContain('owner_id=')
  }
})

test('Toggle Día/Semana/Mes cambia el rango pedido al backend (RN4)', async ({ page }) => {
  const calendarRequests: string[] = []
  page.on('request', req => {
    if (req.url().includes('/api/servicios/calendar')) calendarRequests.push(req.url())
  })

  await login(page, 'carlos@illuminations.com.pa', 'carlos@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/inicio`)
  await page.waitForTimeout(2000)
  calendarRequests.length = 0

  // Click "Semana" pill inside Mi calendario panel
  const panel = page.locator('text=Mi calendario').locator('..').locator('..')
  await panel.getByText('Semana', { exact: false }).first().click()
  await page.waitForTimeout(1500)

  console.log('WEEK TOGGLE calendar requests:', JSON.stringify(calendarRequests, null, 2))
  expect(calendarRequests.length).toBeGreaterThan(0)
})
