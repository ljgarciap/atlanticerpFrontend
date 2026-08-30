import { test, expect } from '@playwright/test'

// Pre-QA — SCRUM-765 (mejora nueva, Daniela Amaya 2026-08-15): botón "Ver" en el detalle de un
// proyecto de Final Stage (Inicio) que lleva directo al Pipeline, filtrado/localizado en ese
// proyecto. Se promueve a spec permanente porque toca un gate de navegación (deep-link
// ?card=<id>) compartido con Lista de Proyectos.
const BASE = 'http://localhost:5173'
const CARD_ID = process.env.PREQA765_CARD_ID ?? ''
const PROJECT_NAME = process.env.PREQA765_PROJECT_NAME ?? 'PreQA765 Proyecto Final Stage'

async function login(page, email: string, password: string = 'Password123!') {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

test('Final Stage → detalle → "Ver" navega a Pipeline con el proyecto correcto localizado', async ({ page }) => {
  test.skip(CARD_ID === '', 'Requiere PREQA765_CARD_ID — ver checkpoint de memoria 2026-08-15')
  await login(page, 'designer@atlantic.test')
  await page.goto(`${BASE}/ventas-diseno/home`)
  await page.waitForTimeout(1200)

  await page.getByText(PROJECT_NAME, { exact: true }).first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e/.tmp/preqa765-01-final-stage-detalle.png', fullPage: true })

  const verButton = page.getByRole('button', { name: 'Ver', exact: true })
  await expect(verButton).toBeVisible()
  await verButton.click()
  await page.waitForTimeout(1000)

  // Debe quedar en Pipeline, con el proyecto seleccionado correcto (no otro).
  await expect(page).toHaveURL(new RegExp(`/ventas-diseno/pipeline\\?card=${CARD_ID}`))
  await page.screenshot({ path: 'e2e/.tmp/preqa765-02-pipeline-localizado.png', fullPage: true })
  await expect(page.getByText(PROJECT_NAME).first()).toBeVisible()
})
