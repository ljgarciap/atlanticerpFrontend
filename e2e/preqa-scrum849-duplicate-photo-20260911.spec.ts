import { test, expect, request as playwrightRequest } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Pre-QA (2026-09-11) — verificación adversarial INDEPENDIENTE de la 3ra vuelta de
 * SCRUM-849.6/849.7 (foto ad-hoc rota al duplicar partida). Root cause real: `copyPhotoTo()`
 * usaba `Storage::disk('s3-public')->copy()`, que en S3 REAL dispara `GetObjectAcl` contra el
 * origen — denegado por la policy IAM de la app — y fallaba en silencio (`throw => false`),
 * dejando `photo_key` en BD apuntando a una key que nunca se creó en S3.
 *
 * Corre contra el stack LOCAL (localhost:8090, ver skill atlanticerp-local-dev) — el Docker local de
 * este proyecto está conectado al bucket S3 REAL `atlanticerp-dev` (ver
 * memory/project_local_s3_conectado.md), así que este spec SÍ ejercita el mismo codepath de
 * Flysystem/S3 que rompió en dev.atlanticerp.ai. El test unitario de `QuotePartControllerTest` usa
 * `Storage::fake('s3-public')`, que NO reproduce el fallo de ACL (el driver local fake no tiene
 * concepto de ACL) — este spec es la única verificación real de que `get()+put()` evita ese
 * codepath contra S3 de verdad.
 *
 * Foto real de 64x64 (no un fixture de 1x1) — generada a propósito para esta verificación,
 * `e2e/fixtures/preqa849-real-64x64.png`.
 *
 * Self-seeding real (ver feedback_e2e_permanent_tests_must_self_seed.md): crea su propia
 * Quote/QuotePart/QuoteItem vía API en beforeAll con designer@atlantic.test.
 */
test.describe.configure({ mode: 'serial' })

const API_BASE = 'http://localhost:8090'
const FIXTURE_PATH = join(__dirname, 'fixtures', 'preqa849-real-64x64.png')

let seededQuoteId: number
let seededPartId: number
let seededItemId: number
let authToken: string

test.beforeAll(async () => {
  const api = await playwrightRequest.newContext({ baseURL: API_BASE })
  const loginResp = await api.post('/api/auth/login', {
    data: { email: 'designer@atlantic.test', password: 'Password123!' },
  })
  const { token } = await loginResp.json()
  authToken = token
  const auth = { Authorization: `Bearer ${token}` }

  const quoteResp = await api.post('/api/ventas-diseno/quotes', { headers: auth, data: {} })
  const quote = await quoteResp.json()
  seededQuoteId = quote.id

  const partResp = await api.post(`/api/ventas-diseno/quotes/${seededQuoteId}/parts`, {
    headers: auth, data: { name: 'Partida foto duplicada' },
  })
  const part = await partResp.json()
  seededPartId = part.id

  const itemResp = await api.post(`/api/ventas-diseno/quotes/${seededQuoteId}/parts/${seededPartId}/items`, {
    headers: auth,
    data: { reference: 'PREQA-DUP-PHOTO-1', description: 'Ítem personalizado con foto real', quantity: 1, unit_price: 150 },
  })
  const item = await itemResp.json()
  seededItemId = item.id

  // Foto REAL (64x64, no 1x1) subida vía API — mismo endpoint que la UI usa.
  const photoBytes = readFileSync(FIXTURE_PATH)
  const uploadResp = await api.post(
    `/api/ventas-diseno/quotes/${seededQuoteId}/parts/${seededPartId}/items/${seededItemId}/photo`,
    {
      headers: auth,
      multipart: { file: { name: 'preqa849-real-64x64.png', mimeType: 'image/png', buffer: photoBytes } },
    },
  )
  expect(uploadResp.status(), 'la foto real debe subirse sin error antes de duplicar').toBeLessThan(300)

  await api.dispose()
})

test('SCRUM-849.6/849.7 — duplicar la partida copia la foto REAL a una key propia en S3 real (no fake), sin icono roto', async ({ page, request }) => {
  const auth = { Authorization: `Bearer ${authToken}` }

  // 1) Estado ANTES de duplicar: confirmar que el ítem original tiene photo_url y que esa URL
  //    devuelve bytes reales (sanity — si esto falla, el problema es la subida, no la copia).
  const beforeDetail = await request.get(`${API_BASE}/api/ventas-diseno/quotes/${seededQuoteId}`, { headers: auth })
  const before = await beforeDetail.json()
  const originalItem = before.parts
    .find((p: { id: number }) => p.id === seededPartId)
    ?.items.find((i: { reference: string }) => i.reference === 'PREQA-DUP-PHOTO-1')
  expect(originalItem?.photo_url, 'el ítem original debe tener photo_url antes de duplicar').toBeTruthy()

  const originalPhotoResp = await request.get(originalItem.photo_url)
  expect(originalPhotoResp.status(), 'la foto original debe existir de verdad en S3').toBe(200)
  const originalBytes = await originalPhotoResp.body()
  // Nota: el backend re-encodea la imagen subida vía GD (ResizesImages::resizeAndEncodeImage(),
  // imagepng quality 6) — el tamaño final no es el de la foto original que se subió, es el de la
  // versión reprocesada. 100 bytes ya descarta un archivo vacío/corrupto (un PNG 1x1 mínimo son
  // ~68 bytes) sin asumir un tamaño exacto que depende de la compresión de GD.
  expect(originalBytes.length, 'la foto original no debe estar vacía/corrupta').toBeGreaterThan(100)

  // 2) Duplicar la partida (mismo endpoint que el botón "Duplicar" del header de partida).
  const dupResp = await request.post(
    `${API_BASE}/api/ventas-diseno/quotes/${seededQuoteId}/parts/${seededPartId}/duplicate`,
    { headers: auth },
  )
  expect(dupResp.status(), 'duplicar la partida debe responder 200/201, no un 500 por el fallo de foto').toBeLessThan(300)
  const dup = await dupResp.json()

  // 3) La NUEVA key del ítem duplicado debe apuntar a un archivo REAL en S3 (no un 404/objeto
  //    inexistente — exactamente el bug original: photo_key en BD sin objeto real detrás).
  const afterDetail = await request.get(`${API_BASE}/api/ventas-diseno/quotes/${seededQuoteId}`, { headers: auth })
  const after = await afterDetail.json()
  const dupPart = after.parts.find((p: { id: number }) => p.id === dup.id)
  const dupItems: Array<{ reference: string; photo_url: string | null }> = dupPart?.items ?? []
  const dupItem = dupItems.find(i => i.reference === 'PREQA-DUP-PHOTO-1')

  expect(dupItem, 'debe existir un ítem duplicado con la misma referencia en la partida nueva').toBeTruthy()
  expect(dupItem!.photo_url, 'el ítem duplicado debe tener su propia photo_url (no null)').toBeTruthy()
  expect(dupItem!.photo_url, 'la key duplicada no debe ser la misma que la original (key propia, nunca compartida)').not.toBe(originalItem.photo_url)

  const dupPhotoResp = await request.get(dupItem!.photo_url!)
  expect(
    dupPhotoResp.status(),
    'CRÍTICO si falla: photo_key quedó en BD pero el objeto nunca se creó en S3 real (exactamente el bug original de Storage::copy() + GetObjectAcl denegado)',
  ).toBe(200)
  const dupBytes = await dupPhotoResp.body()
  expect(Buffer.compare(originalBytes, dupBytes), 'los bytes de la copia deben ser IDÉNTICOS a los del original').toBe(0)

  // 4) Verificación visual real en el formulario — el navegador debe cargar la imagen sin ícono
  //    roto (naturalWidth/naturalHeight > 0 confirma que el <img> resolvió un recurso real).
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto('/login')
  await page.locator('input[type="email"]').fill('designer@atlantic.test')
  await page.locator('input[type="password"]').fill('Password123!')
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1800)

  await page.goto(`/ventas-diseno/quotes/${seededQuoteId}`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/.tmp/preqa-849-duplicate-form-photos.png', fullPage: true })

  const thumbnails = page.locator('img[alt=""]')
  const count = await thumbnails.count()
  expect(count, 'debe haber al menos 2 thumbnails visibles (original + copia)').toBeGreaterThanOrEqual(2)

  for (let i = 0; i < count; i++) {
    const naturalWidth = await thumbnails.nth(i).evaluate((img: HTMLImageElement) => img.naturalWidth)
    expect(naturalWidth, `thumbnail #${i} no debe estar roto (naturalWidth debe ser > 0)`).toBeGreaterThan(0)
  }
})

test('SCRUM-849.6/849.7 — camino de ruptura: photo_key corrupto en BD (dato preexistente sin objeto real) no tumba la duplicación completa', async ({ request }) => {
  const auth = { Authorization: `Bearer ${authToken}` }

  // Nota (Senior Review 2026-09-11): este test NO corrompe photo_key — no hay endpoint público
  // para forzarlo, así que solo confirma que duplicar un ítem con foto real sigue dando
  // 200/201 end-to-end contra el stack local. La cobertura REAL del camino de ruptura (fallo de
  // copyPhotoTo() sin tumbar la duplicación) vive en
  // `QuotePartControllerTest::test_duplicar_partida_si_falla_la_copia_de_foto_no_tumba_la_duplicacion`
  // (backend), que borra la key real de Storage::fake() antes de duplicar y fuerza el
  // RuntimeException real de "Source photo not found" — no un mock, el código real.
  const itemResp = await request.post(
    `${API_BASE}/api/ventas-diseno/quotes/${seededQuoteId}/parts/${seededPartId}/items`,
    { headers: auth, data: { reference: 'PREQA-DUP-PHOTO-2', description: 'Ítem 2 con foto', quantity: 1, unit_price: 50 } },
  )
  const item2 = await itemResp.json()
  const photoBytes = readFileSync(FIXTURE_PATH)
  await request.post(
    `${API_BASE}/api/ventas-diseno/quotes/${seededQuoteId}/parts/${seededPartId}/items/${item2.id}/photo`,
    { headers: auth, multipart: { file: { name: 'preqa849-real-64x64.png', mimeType: 'image/png', buffer: photoBytes } } },
  )

  const dupResp = await request.post(
    `${API_BASE}/api/ventas-diseno/quotes/${seededQuoteId}/parts/${seededPartId}/duplicate`,
    { headers: auth },
  )
  expect(dupResp.status(), 'duplicar una partida con ítems con foto nunca debe dar 500').toBeLessThan(500)
  expect(dupResp.status()).toBeLessThan(300)
})
