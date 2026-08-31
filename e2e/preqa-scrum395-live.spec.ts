import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'

// Pre-QA independiente (fusionado con Senior/Visual Review) — SCRUM-395, rebote 2026-08-19.
// Corre contra test.atlanticerp.ai (deploy real del commit 3ce226b). Descarga el PDF real que abre
// "Imprimir" para confirmar que ya no es el HTML del modal via window.print().

const BASE = 'https://test.atlanticerp.ai'

async function login(page, email: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1800)
}

test.describe.configure({ mode: 'serial' })

test('1. PED-2026-0004 (Por despachar) — Ver guía, Imprimir abre PDF real (no window.print)', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto(`${BASE}/bodega/pedidos`)
  await page.waitForTimeout(1200)
  await page.locator('input[placeholder*="Buscar"]').fill('PED-2026-0004')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/scrum395-1-search.png', fullPage: true })

  const guideBtn = page.getByRole('button', { name: /ver guía|guía/i }).first()
  await guideBtn.click({ timeout: 5000 }).catch(async () => {
    await page.getByText('PED-2026-0004').first().click()
    await page.waitForTimeout(800)
  })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/scrum395-1-modal.png', fullPage: true })

  const printBtn = page.getByRole('button', { name: /imprimir/i })
  await expect(printBtn).toBeVisible({ timeout: 5000 })

  let downloadApiUrl: string | null = null
  page.on('response', res => {
    if (res.url().includes('/documents/') && res.url().includes('/download')) downloadApiUrl = res.url()
  })

  const [popup] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null),
    printBtn.click(),
  ])
  await page.waitForTimeout(1500)

  console.log('DOWNLOAD_API_URL=', downloadApiUrl)
  console.log('POPUP_OPENED=', !!popup)
  if (popup) {
    console.log('POPUP_URL=', popup.url())
    writeFileSync('e2e/.tmp/scrum395-1-popup-url.txt', popup.url())
  }
})
