import { test, expect, type Page } from '@playwright/test'
import path from 'path'

/**
 * Pre-QA — SCRUM-311 (REQ-248, Observaciones y Adjuntos de "Nuevo ticket"). Corre contra el
 * stack local (Docker :8090 + Vite :5173).
 *
 * Cuentas reales (password = email):
 *  - servicio@atlantic.com.pa (lider_servicios) — puede crear tickets, adjuntar.
 *  - carlos@atlantic.com.pa   (tecnico_servicios) — NO puede crear tickets ni adjuntar.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'
const DL_DIR = 'e2e/.tmp/preqa-scrum311'
const FILES_DIR = path.resolve(process.cwd(), 'e2e/.tmp/preqa-scrum311-files')

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

async function gotoTickets(page: Page) {
  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(1500)
}

async function openCreateModal(page: Page) {
  await page.getByRole('button', { name: /nuevo ticket/i }).click()
  await page.waitForTimeout(500)
}

// Llena los campos mínimos obligatorios (Descripción + Cliente Master→Subcliente→Proyecto) para
// habilitar "Crear ticket". Toma el primer resultado disponible en cada buscador.
async function fillMinimumRequired(page: Page, descripcion: string) {
  await page.getByLabel('Breve descripción').fill(descripcion)

  await page.getByRole('button', { name: 'Cliente Master', exact: true }).click()
  await page.waitForTimeout(600)
  await page.locator('ul li button').first().click()
  await page.waitForTimeout(300)

  await page.getByRole('button', { name: 'Subcliente', exact: true }).click()
  await page.waitForTimeout(600)
  await page.locator('ul li button').first().click()
  await page.waitForTimeout(500)

  const projectSelect = page.locator('select').last()
  await projectSelect.selectOption({ index: 1 })
}

test('1. RN2 — extensión no permitida (.exe) rechazada con mensaje visible en UI', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoTickets(page)
  await openCreateModal(page)
  await page.screenshot({ path: `${DL_DIR}/01a-modal-open.png`, fullPage: true })

  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(path.join(FILES_DIR, 'malware.exe'))
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${DL_DIR}/01b-extension-rejected.png`, fullPage: true })

  await expect(page.getByText('Ese tipo de archivo no está permitido.')).toBeVisible()
  // No debe haberse agregado a la lista de adjuntos pendientes
  await expect(page.getByText('malware.exe')).toHaveCount(0)
})

test('2. RN2 — archivo mayor al máximo configurado (16MB > 15MB) rechazado con mensaje visible', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoTickets(page)
  await openCreateModal(page)

  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(path.join(FILES_DIR, 'big-photo.jpg'))
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${DL_DIR}/02-size-rejected.png`, fullPage: true })

  await expect(page.getByText(/supera el máximo de 15 ?MB/)).toBeVisible()
  await expect(page.getByText('big-photo.jpg')).toHaveCount(0)
})

test('3. RN2 — límite de cantidad configurado server-side (bajado a 2) se respeta aunque el cliente permita más, y el rechazo se ve en la UI', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoTickets(page)
  await openCreateModal(page)

  await fillMinimumRequired(page, `Pre-QA SCRUM-311 maxfiles ${Date.now()}`)

  // Adjuntar 3 archivos válidos (server max ya bajado a 2 vía BD antes de correr esta suite;
  // el cliente sigue con su propio MAX_ATTACHMENTS=10 hardcoded, así que no bloquea acá).
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles([
    path.join(FILES_DIR, 'a.jpg'),
    path.join(FILES_DIR, 'b.jpg'),
    path.join(FILES_DIR, 'c.jpg'),
  ])
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${DL_DIR}/03a-3-files-added-clientside.png`, fullPage: true })

  await expect(page.getByText('a.jpg')).toBeVisible()
  await expect(page.getByText('b.jpg')).toBeVisible()
  await expect(page.getByText('c.jpg')).toBeVisible()

  // Submit real: crea el ticket y sube los 3 archivos secuencialmente. El backend (max=2) debe
  // rechazar el 3ro con 422 — confirmamos que ese rechazo se ve como toast, no silencioso.
  await page.getByRole('button', { name: 'Crear ticket' }).click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${DL_DIR}/03b-tras-submit.png`, fullPage: true })

  await expect(page.getByText(/alcanzó el máximo de 2 archivos|No se pudo subir/)).toBeVisible({ timeout: 5000 })
})

test('4. Crear ticket SIN observaciones y SIN adjuntos — RN1 ambos opcionales, no bloquea el submit', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoTickets(page)
  await openCreateModal(page)

  const descripcion = `Pre-QA SCRUM-311 sin-adjuntos ${Date.now()}`
  await fillMinimumRequired(page, descripcion)
  await page.screenshot({ path: `${DL_DIR}/04a-form-listo-sin-adjuntos.png`, fullPage: true })

  const createButton = page.getByRole('button', { name: 'Crear ticket' })
  await expect(createButton).toBeEnabled()
  await createButton.click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${DL_DIR}/04b-tras-crear.png`, fullPage: true })

  // El modal de creación debe haberse cerrado (onCreated navega/cierra) — ningún toast de error.
  await expect(page.getByText('No se pudo crear el ticket')).toHaveCount(0)
})

test('5a. Permisos — Carlos (tecnico_servicios) NO tiene el botón "Nuevo ticket"', async ({ page }) => {
  await login(page, 'carlos@atlantic.com.pa')
  await gotoTickets(page)
  await page.screenshot({ path: `${DL_DIR}/05a-carlos-tabla.png`, fullPage: true })

  await expect(page.getByRole('button', { name: /nuevo ticket/i })).toHaveCount(0)
})

test('5b. Permisos API directa — Carlos, POST /tickets/{id}/attachments → 403', async ({ page }) => {
  await login(page, 'carlos@atlantic.com.pa')
  const token = await page.evaluate(() => localStorage.getItem('accessToken') ?? '')
  expect(token).toBeTruthy()

  const listResp = await page.request.get(`${BASE}/api/servicios/tickets`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const list = await listResp.json()
  const ticketId = Array.isArray(list) ? list[0]?.id : list?.data?.[0]?.id
  test.skip(!ticketId, 'No se pudo resolver un ticket id real')

  const resp = await page.request.post(`${BASE}/api/servicios/tickets/${ticketId}/attachments`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file: { name: 'foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake') } },
    failOnStatusCode: false,
  })
  console.log('[Permisos] Carlos POST attachments status:', resp.status())
  expect(resp.status()).toBe(403)
})

test('6. Recargar a mitad del formulario con adjuntos ya cargados — no debe romper la app', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoTickets(page)
  await openCreateModal(page)

  await page.getByLabel('Breve descripción').fill('Pre-QA reload test')
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(path.join(FILES_DIR, 'a.jpg'))
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${DL_DIR}/06a-antes-reload.png`, fullPage: true })

  await page.reload()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/06b-post-reload.png`, fullPage: true })

  // La app debe seguir viva (tabla de tickets visible), no una pantalla rota
  await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
})

test('7. Adjuntar el mismo archivo dos veces (mismo picker) — confirmar comportamiento', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoTickets(page)
  await openCreateModal(page)

  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(path.join(FILES_DIR, 'a.jpg'))
  await page.waitForTimeout(200)
  await fileInput.setInputFiles(path.join(FILES_DIR, 'a.jpg'))
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${DL_DIR}/07-duplicate-file.png`, fullPage: true })

  const count = await page.getByText('a.jpg').count()
  console.log('[Duplicado] veces que aparece a.jpg en la lista de adjuntos:', count)
})

test('9. Ticket pre-existente (creado antes de este batch) sin observaciones/adjuntos — detalle no se rompe', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoTickets(page)

  const eyeButtons = page.locator('button[title="Ver detalle"]')
  await expect(eyeButtons.first()).toBeVisible({ timeout: 10000 })
  await eyeButtons.first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/09-detalle-pre-existente.png`, fullPage: true })

  await expect(page.getByText('Observaciones', { exact: true })).toBeVisible()
  await expect(page.getByText('Fotos, videos o archivos adjuntos', { exact: true })).toBeVisible()
  await expect(page.getByText('Sin adjuntos', { exact: true })).toBeVisible()
})
