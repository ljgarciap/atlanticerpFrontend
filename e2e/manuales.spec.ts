import { test, expect, type Page } from '@playwright/test'

// SCRUM-984 — spec PERMANENTE de Manuales de usuario (/manuales).
//
// Por qué se queda: cubre el gate de permiso del panel Administrar (manuales.manage — un usuario
// normal NO debe ver ni tener en el DOM el panel de carga/borrado), el orden del menú (justo
// después de Soporte) y los criterios visuales de la spec UX (no hay mockup en Jira, la spec
// docs/specs/manuales-usuario-ux.md de atlanticerp-backend ES la referencia).
//
// Autosembrado, sin depender de ningún entorno ni de IDs reales: la sesión se inyecta en
// localStorage y TODA la API (`/api/**`) y el PUT a S3 se responden desde acá con page.route. No
// toca el backend, ni S3, ni datos de negocio; corre igual contra localhost, dev o test.
// BASE explícito por MANUALES_BASE_URL (default: localhost del dev server, nunca dev.atlanticerp.ai).

const BASE = process.env.MANUALES_BASE_URL ?? 'http://localhost:5173'
test.use({ baseURL: BASE })

const MB = 1024 * 1024
const S3_PUT = 'https://s3.manuales-e2e.invalid/put'
const S3_FILE = 'https://s3.manuales-e2e.invalid/file'

interface SeedManual {
  id: string; name: string; module: string; type: 'pdf' | 'video'; size_bytes: number; created_at: string
}

const SEED: SeedManual[] = [
  { id: 'e2e-1', name: 'Manual E2E Bodega', module: 'bodega', type: 'pdf', size_bytes: 2 * MB, created_at: '2026-09-10T15:00:00Z' },
  { id: 'e2e-2', name: 'Video E2E Compras', module: 'compras', type: 'video', size_bytes: 120 * MB, created_at: '2026-09-05T15:00:00Z' },
  { id: 'e2e-3', name: 'Manual E2E CRM', module: 'crm', type: 'pdf', size_bytes: 500 * 1024, created_at: '2026-09-01T15:00:00Z' },
]

function fakeUser(permissions: string[]) {
  return {
    id: 987654, first_name: 'Usuario', last_name: 'E2E', email: 'manuales-e2e@example.invalid',
    language: 'es', role: 'designer', permissions, modules: {}, flags: { approve_large_amounts: false, manage_users: false },
    security_level: 1,
  }
}

/** Lo que el front le mandó al "backend" y a S3, para asertarlo (un mock que lo ignora esconde desalineaciones de contrato). */
interface Captures {
  initBody?: Record<string, unknown>
  put?: { method: string; url: string; contentType: string | undefined; bodyBytes: number }
  finalizeUrl?: string
  /** Cuántas veces se llamó a cada paso (un reintento no debe repetir pasos ya hechos). */
  counts: { init: number; put: number; finalize: number }
}

interface Options {
  captures?: Captures
  /** Fuerza la respuesta de POST /uploads (p. ej. un 422 de cuota). */
  initResponse?: { status: number; body: unknown }
  /** Fuerza la respuesta del finalize (p. ej. un 422 de contenido rechazado). */
  finalizeResponse?: { status: number; body: unknown }
  /** Respuestas sucesivas del finalize (una por llamada); agotadas, responde éxito. */
  finalizeSequence?: Array<{ status: number; body: unknown }>
  permissions?: string[]
  manuales?: SeedManual[]
  listStatus?: number
  limits?: { max_pdf_bytes: number; max_video_bytes: number }
}

function newCaptures(): Captures { return { counts: { init: 0, put: 0, finalize: 0 } } }

/** Inyecta sesión + mockea toda la API. Devuelve el estado mutable de "publicados" del mock. */
async function setup(page: Page, opts: Options = {}) {
  const published: SeedManual[] = [...(opts.manuales ?? SEED)]
  const user = fakeUser(opts.permissions ?? [])
  const limits = opts.limits ?? { max_pdf_bytes: 50 * MB, max_video_bytes: 500 * MB }

  await page.addInitScript(([u]) => {
    localStorage.setItem('accessToken', 'e2e-token')
    localStorage.setItem('atlanticerp_lang', 'es')
    localStorage.setItem('atlanticerp-auth-v3', JSON.stringify({ state: { user: u, refreshToken: 'e2e-refresh' }, version: 0 }))
  }, [user])

  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

  // Fallback (prioridad más baja): todo lo demás que el shell pida al montar. Predicado sobre el
  // path raíz /api/: el comodín '**/api/**' también atraparía los módulos de Vite (/src/api/*.ts).
  const isApi = (url: URL) => url.pathname.startsWith('/api/')
  await page.route(isApi, route => route.fulfill(json([])))
  await page.route(url => url.pathname.startsWith('/api/auth/'), route => route.fulfill(json({ user })))

  await page.route('**/api/biblioteca/config', route => route.fulfill(json({
    ...limits, allowed_extensions: ['pdf', 'mp4', 'webm'], modules: [],
  })))
  await page.route('**/api/biblioteca', route => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill(json(published, opts.listStatus ?? 200))
  })
  await page.route(/\/api\/biblioteca\/[^/]+\/url/, route => route.fulfill(json({ url: S3_FILE, expires_at: '2099-01-01T00:00:00Z' })))
  await page.route('**/api/biblioteca/uploads', route => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (opts.captures) { opts.captures.initBody = body; opts.captures.counts.init++ }
    if (opts.initResponse) return route.fulfill(json(opts.initResponse.body, opts.initResponse.status))
    // Misma validación `required` que BibliotecaController::initUpload: un campo mal nombrado da 422, como en producción.
    const missing = ['module', 'name', 'filename', 'content_type', 'size_bytes'].filter(k => body[k] === undefined || body[k] === '')
    if (missing.length > 0) {
      return route.fulfill(json({
        message: `The ${missing[0]} field is required.`,
        errors: Object.fromEntries(missing.map(k => [k, [`The ${k} field is required.`]])),
      }, 422))
    }
    return route.fulfill(json({
      upload_id: 'e2e-upload', url: S3_PUT, headers: { 'Content-Type': 'application/pdf' }, expires_at: '2099-01-01T00:00:00Z',
    }, 201))
  })
  await page.route('**/api/biblioteca/uploads/*/finalize', route => {
    if (opts.captures) { opts.captures.finalizeUrl = route.request().url(); opts.captures.counts.finalize++ }
    const next = opts.finalizeSequence?.shift()
    if (next) return route.fulfill(json(next.body, next.status))
    if (opts.finalizeResponse) return route.fulfill(json(opts.finalizeResponse.body, opts.finalizeResponse.status))
    const created: SeedManual = {
      id: 'e2e-new', name: 'Subido por E2E', module: 'bodega', type: 'pdf', size_bytes: 12, created_at: '2026-09-30T15:00:00Z',
    }
    published.unshift(created)
    return route.fulfill(json(created))
  })
  await page.route(/\/api\/biblioteca\/e2e-[^/]+$/, route => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    const id = route.request().url().split('/').pop()
    const idx = published.findIndex(m => m.id === id)
    if (idx >= 0) published.splice(idx, 1)
    return route.fulfill({ status: 204 })
  })

  // S3 simulado (incluye el preflight CORS del PUT directo desde el navegador).
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,PUT,HEAD', 'access-control-allow-headers': '*' }
  // A nivel de contexto (no de página): "Ver" abre el PDF en una pestaña nueva, que hereda el contexto.
  await page.context().route(S3_PUT, route => {
    const req = route.request()
    if (req.method() === 'PUT' && opts.captures) {
      opts.captures.put = { method: req.method(), url: req.url(), contentType: req.headers()['content-type'], bodyBytes: req.postDataBuffer()?.length ?? 0 }
      opts.captures.counts.put++
    }
    return route.fulfill({ status: req.method() === 'OPTIONS' ? 204 : 200, headers: cors })
  })
  await page.context().route(S3_FILE, route => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/pdf' }, body: '%PDF-1.4\n%%EOF' }))

  return published
}

const EMOJI = /\p{Extended_Pictographic}/u

test.describe('Manuales de usuario — usuario sin permiso de administración', () => {
  test('menú, filtros, tarjetas y ausencia total del panel Administrar', async ({ page }) => {
    await setup(page)
    await page.goto('/manuales')

    await expect(page.getByRole('heading', { name: 'Manuales de usuario', level: 1 })).toBeVisible()

    // Sidebar: la entrada aparece justo después de Soporte (el sidebar arranca colapsado: se compara el orden en el DOM).
    // El primer <nav> es el del escritorio (el segundo es el drawer móvil); sus entradas son <button>.
    const navLabels = await page.locator('nav').first().locator('button').evaluateAll(
      els => els.map(e => (e.getAttribute('title') ?? e.textContent ?? '').trim()),
    )
    const iSoporte = navLabels.findIndex(l => /^Soporte$/i.test(l))
    expect(iSoporte).toBeGreaterThanOrEqual(0)
    expect(navLabels[iSoporte + 1]).toMatch(/^Manuales de usuario$/i)

    // Filtros
    const select = page.getByLabel('Módulo')
    await expect(select).toHaveValue('all')
    await expect(select.locator('option')).toHaveCount(8)
    await expect(page.getByRole('button', { name: 'Todos', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Buscar por nombre')).toBeVisible()

    // Tarjetas: 3 sembradas, ordenadas por fecha descendente
    const cards = page.getByRole('list', { name: 'Listado de manuales' }).getByRole('listitem')
    await expect(cards).toHaveCount(3)
    await expect(cards.first()).toContainText('Manual E2E Bodega')
    await expect(cards.nth(1)).toContainText('Video E2E Compras')
    await expect(cards.nth(1).getByRole('button', { name: /Reproducir/ })).toBeVisible()
    await expect(cards.first().getByRole('button', { name: /Descargar/ })).toBeVisible()

    // Gate de permiso: ni botón ni panel existen en el DOM (no "deshabilitados").
    await expect(page.getByRole('button', { name: 'Administrar' })).toHaveCount(0)
    await expect(page.locator('#manuales-admin-panel')).toHaveCount(0)
    await expect(page.getByTestId('manual-file-input')).toHaveCount(0)

    // Regla de iconografía: ningún emoji en el DOM de la página.
    expect(EMOJI.test(await page.locator('main').innerText())).toBe(false)
  })

  test('filtros combinables y estados vacíos', async ({ page }) => {
    await setup(page)
    await page.goto('/manuales')
    const cards = page.getByRole('list', { name: 'Listado de manuales' }).getByRole('listitem')
    await expect(cards).toHaveCount(3)

    await page.getByLabel('Módulo').selectOption('compras')
    await expect(cards).toHaveCount(1)
    await expect(page.getByText('1 manual', { exact: true })).toBeVisible()

    await page.getByLabel('Módulo').selectOption('gerencia')
    await expect(page.getByText('No hay manuales disponibles para este módulo')).toBeVisible()

    await page.getByLabel('Módulo').selectOption('all')
    await page.getByLabel('Buscar por nombre').fill('zzz-no-existe')
    await expect(page.getByText('Ningún manual coincide con tu búsqueda')).toBeVisible()
    await page.getByRole('button', { name: 'Limpiar filtros' }).click()
    await expect(cards).toHaveCount(3)

    await page.getByRole('button', { name: 'Video', exact: true }).click()
    await expect(cards).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Video', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('catálogo vacío y error de carga', async ({ page }) => {
    await setup(page, { manuales: [] })
    await page.goto('/manuales')
    await expect(page.getByText('Aún no hay manuales publicados.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Subir manual' })).toHaveCount(0)

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await setup(page, { listStatus: 500 })
    await page.goto('/manuales')
    await expect(page.getByText('No se pudieron cargar los manuales.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  })

  test('Ver un PDF abre pestaña nueva', async ({ page }) => {
    await setup(page)
    await page.goto('/manuales')
    // En headless un PDF se descarga en vez de renderizarse, así que la URL de la pestaña no sirve
    // de señal: se verifica que se abrió la pestaña Y que pidió la URL prefirmada.
    const popupPromise = page.waitForEvent('popup')
    const fileRequest = page.context().waitForEvent('request', r => r.url().startsWith(S3_FILE))
    await page.getByRole('button', { name: 'Ver Manual E2E Bodega' }).click()
    await popupPromise
    expect((await fileRequest).url()).toBe(S3_FILE)
  })

  test('Reproducir abre un dialog con <video controls>, Esc cierra y el foco vuelve al botón', async ({ page }) => {
    await setup(page)
    await page.goto('/manuales')
    const play = page.getByRole('button', { name: 'Reproducir Video E2E Compras' })
    await play.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeFocused()
    await expect(dialog.locator('video')).toHaveAttribute('controls', '')
    await expect(dialog.locator('video')).not.toHaveAttribute('autoplay', /.*/)

    // Tab no sale del modal
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(play).toBeFocused()
  })

  for (const vp of [
    { name: 'desktop 1440', width: 1440, height: 900, cols: 3 },
    { name: 'tablet 768', width: 768, height: 1024, cols: 2 },
    { name: 'móvil 375', width: 375, height: 812, cols: 1 },
  ]) {
    test(`grid de ${vp.cols} columna(s) y sin scroll horizontal en ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await setup(page)
      await page.goto('/manuales')
      const list = page.getByRole('list', { name: 'Listado de manuales' })
      await expect(list.getByRole('listitem')).toHaveCount(3)
      const cols = await list.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      expect(cols).toBe(vp.cols)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }
})

test.describe('Manuales de usuario — con manuales.manage', () => {
  test('Administrar existe, despliega el panel y muestra los límites de la configuración', async ({ page }) => {
    await setup(page, { permissions: ['manuales.manage'], limits: { max_pdf_bytes: 20 * MB, max_video_bytes: 300 * MB } })
    await page.goto('/manuales')

    const toggle = page.getByRole('button', { name: 'Administrar' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    // Límites dinámicos: 20/300 salen de la config mockeada, no de una constante del front.
    await expect(page.getByText('PDF hasta 20 MB. Video MP4 o WebM hasta 300 MB.')).toBeVisible()
  })

  test('archivo no permitido: error inline y Subir deshabilitado', async ({ page }) => {
    await setup(page, { permissions: ['manuales.manage'] })
    await page.goto('/manuales')
    await page.getByRole('button', { name: 'Administrar' }).click()
    await page.getByTestId('manual-file-input').setInputFiles({ name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') })
    await expect(page.getByRole('alert').filter({ hasText: 'Formato no permitido' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Subir manual' }).last()).toBeDisabled()
  })

  test('subida completa: el manual nuevo aparece en el listado y se puede borrar con confirmación', async ({ page }) => {
    const captures: Captures = newCaptures()
    await setup(page, { permissions: ['manuales.manage'], captures })
    await page.goto('/manuales')
    await page.getByRole('button', { name: 'Administrar' }).click()

    await page.getByTestId('manual-file-input').setInputFiles({ name: 'Subido por E2E.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') })
    // Acotado al panel: la página tiene OTRO select "Módulo" (el filtro del listado).
    const panel = page.locator('#manuales-admin-panel')
    await panel.getByLabel('Módulo', { exact: true }).selectOption('bodega')
    await panel.getByRole('button', { name: 'Subir manual' }).click()

    await expect(page.getByText('Manual subido')).toBeVisible()

    // Contrato con el backend: body exacto del init (content_type, NO mime), PUT directo a S3 con el
    // Content-Type prefirmado y finalize sobre el upload_id que devolvió el init.
    expect(captures.initBody).toEqual({
      module: 'bodega', name: 'Subido por E2E', filename: 'Subido por E2E.pdf', content_type: 'application/pdf', size_bytes: 12,
    })
    expect(captures.put).toMatchObject({ method: 'PUT', url: S3_PUT, contentType: 'application/pdf', bodyBytes: 12 })
    expect(captures.finalizeUrl).toMatch(/\/api\/biblioteca\/uploads\/e2e-upload\/finalize$/)

    const cards = page.getByRole('list', { name: 'Listado de manuales' }).getByRole('listitem')
    await expect(cards.filter({ hasText: 'Subido por E2E' })).toHaveCount(1)

    // Borrado: alertdialog con foco en Cancelar; cancelar no borra, confirmar sí.
    await page.getByRole('button', { name: 'Eliminar Subido por E2E' }).click()
    const alert = page.getByRole('alertdialog')
    await expect(alert).toContainText('Subido por E2E')
    await expect(alert.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await alert.getByRole('button', { name: 'Cancelar' }).click()
    await expect(cards.filter({ hasText: 'Subido por E2E' })).toHaveCount(1)

    await page.getByRole('button', { name: 'Eliminar Subido por E2E' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click()
    await expect(page.getByText('Manual eliminado')).toBeVisible()
    await expect(cards.filter({ hasText: 'Subido por E2E' })).toHaveCount(0)
  })

  test('422 al iniciar (cuota de pendientes): muestra el mensaje del backend y no ofrece Reintentar', async ({ page }) => {
    const captures: Captures = newCaptures()
    await setup(page, {
      permissions: ['manuales.manage'], captures,
      initResponse: { status: 422, body: { message: 'Tienes demasiadas subidas pendientes. Finaliza o espera a que expiren.' } },
    })
    await page.goto('/manuales')
    await page.getByRole('button', { name: 'Administrar' }).click()
    await page.getByTestId('manual-file-input').setInputFiles({ name: 'Otro.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') })
    const panel = page.locator('#manuales-admin-panel')
    await panel.getByLabel('Módulo', { exact: true }).selectOption('crm')
    await panel.getByRole('button', { name: 'Subir manual' }).click()

    await expect(panel.getByRole('alert').filter({ hasText: 'Tienes demasiadas subidas pendientes' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
    await expect(panel.getByRole('button', { name: 'Descartar' })).toBeVisible()
    expect(captures.put).toBeUndefined()
  })

  test('422 del finalize (contenido rechazado): muestra el mensaje del backend y no ofrece Reintentar', async ({ page }) => {
    await setup(page, {
      permissions: ['manuales.manage'],
      finalizeResponse: { status: 422, body: { message: 'El contenido del archivo no corresponde a su formato.' } },
    })
    await page.goto('/manuales')
    await page.getByRole('button', { name: 'Administrar' }).click()
    await page.getByTestId('manual-file-input').setInputFiles({ name: 'Falso.pdf', mimeType: 'application/pdf', buffer: Buffer.from('no es un pdf') })
    const panel = page.locator('#manuales-admin-panel')
    await panel.getByLabel('Módulo', { exact: true }).selectOption('crm')
    await panel.getByRole('button', { name: 'Subir manual' }).click()

    await expect(panel.getByRole('alert').filter({ hasText: 'El contenido del archivo no corresponde a su formato' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
  })
  for (const [filename, declared, canonical] of [
    ['clase.mp4', 'video/x-m4v', 'video/mp4'],
    ['clase.webm', 'application/octet-stream', 'video/webm'],
    ['guia.pdf', '', 'application/pdf'],
  ] as const) {
    test(`content_type canónico aunque el navegador declare "${declared}" para ${filename}`, async ({ page }) => {
      const captures: Captures = newCaptures()
      await setup(page, {
        permissions: ['manuales.manage'], captures,
        initResponse: { status: 201, body: { upload_id: 'e2e-upload', url: S3_PUT, headers: { 'Content-Type': canonical }, expires_at: '2099-01-01T00:00:00Z' } },
      })
      await page.goto('/manuales')
      await page.getByRole('button', { name: 'Administrar' }).click()
      await page.getByTestId('manual-file-input').setInputFiles({ name: filename, mimeType: declared, buffer: Buffer.from('%PDF-1.4 e2e') })
      const panel = page.locator('#manuales-admin-panel')
      await panel.getByLabel('Módulo', { exact: true }).selectOption('crm')
      await panel.getByRole('button', { name: 'Subir manual' }).click()

      await expect(page.getByText('Manual subido')).toBeVisible()
      expect(captures.initBody).toMatchObject({ filename, content_type: canonical })
      expect(captures.put).toMatchObject({ method: 'PUT', contentType: canonical })
    })
  }

  test('finalize ya en curso: ofrece Reintentar y el reintento repite solo el finalize (sin otro init ni otro PUT)', async ({ page }) => {
    const captures: Captures = newCaptures()
    await setup(page, {
      permissions: ['manuales.manage'], captures,
      finalizeSequence: [{ status: 409, body: { code: 'finalize_in_progress', message: 'Esta subida ya se está finalizando. Espera unos segundos.' } }],
    })
    await page.goto('/manuales')
    await page.getByRole('button', { name: 'Administrar' }).click()
    await page.getByTestId('manual-file-input').setInputFiles({ name: 'Guia.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') })
    const panel = page.locator('#manuales-admin-panel')
    await panel.getByLabel('Módulo', { exact: true }).selectOption('bodega')
    await panel.getByRole('button', { name: 'Subir manual' }).click()

    await expect(panel.getByRole('alert').filter({ hasText: 'ya se está finalizando' })).toBeVisible()
    await panel.getByRole('button', { name: 'Reintentar' }).click()

    await expect(page.getByText('Manual subido')).toBeVisible()
    expect(captures.counts).toEqual({ init: 1, put: 1, finalize: 2 })
  })

  test('el modal de borrado no promete borrado permanente', async ({ page }) => {
    await setup(page, { permissions: ['manuales.manage'] })
    await page.goto('/manuales')
    await page.getByRole('button', { name: 'Administrar' }).click()
    await page.getByRole('button', { name: 'Eliminar Manual E2E Bodega' }).click()
    const alert = page.getByRole('alertdialog')
    await expect(alert).toContainText('dejará de estar disponible para todos los usuarios')
    await expect(alert).not.toContainText(/permanente|no se puede deshacer/i)
  })
})
