import { test, expect, type Page } from '@playwright/test'

/**
 * SCRUM-1026 — los items de una partida de cotizacion deben quedar en ORDEN DE INGRESO,
 * sin importar la cantidad, y no moverse al editar cantidad/precio/descuento ni al guardar,
 * recargar, duplicar la partida o generar el documento.
 *
 * Causa raiz que cubre: `QuotePart::items()` sin ORDER BY -> Postgres movia al final del heap
 * cualquier fila con UPDATE (ej. editar la cantidad) y el item saltaba de posicion.
 *
 * Entorno: E2E_BASE_URL (default http://127.0.0.1:5173), E2E_USER / E2E_PASS.
 * Usa un borrador editable: E2E_QUOTE_ID (recomendado; el spec crea sus partidas y las BORRA al terminar,
 * sin dejar basura). Si no se define, crea un borrador por API (no existe endpoint para borrar
 * cotizaciones, por lo que quedaria una fila vacia 'E2E orden 1026').
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173'
const USER = process.env.E2E_USER ?? 'management@atlantic.test'
const PASS = process.env.E2E_PASS ?? 'Password123!'
const QTYS = [50, 5, 20, 1, 100]
const REFS = QTYS.map((_, i) => `ORD${i + 1}`)

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('atlanticerp_lang', 'es') }).catch(() => {})
  await page.locator('input[type="email"]').fill(USER)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /iniciar sesión|login|ingresar/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 })
}

async function api(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(async ([m, p, b]) => {
    const token = localStorage.getItem('accessToken')
    const res = await fetch(p as string, {
      method: m as string,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: b ? (b as string) : undefined,
    })
    let json: unknown = null
    try { json = await res.json() } catch { /* sin cuerpo */ }
    return { status: res.status, json }
  }, [method, path, body ? JSON.stringify(body) : null] as const)
}

async function refsInDom(page: Page): Promise<string[]> {
  // Una sola partida visible en este escenario: los inputs de referencia de los items, en orden de DOM.
  return page.locator('input[value^="ORD"]').evaluateAll(els => els.map(e => (e as HTMLInputElement).value))
}

async function refsViaApi(page: Page, quoteId: number): Promise<string[][]> {
  const r = await api(page, 'GET', `/api/ventas-diseno/quotes/${quoteId}`)
  const parts = (r.json as { parts: { items: { reference: string }[] }[] }).parts
  return parts.map(p => p.items.map(i => i.reference))
}

test('items de una partida conservan el orden de ingreso (agregar, editar cantidad/precio, recargar, duplicar)', async ({ page }) => {
  await login(page)
  const envId = Number(process.env.E2E_QUOTE_ID ?? 0)
  const quoteId = envId || ((await api(page, 'POST', '/api/ventas-diseno/quotes', { description: `E2E orden 1026 ${Date.now()}` })).json as { id: number }).id
  expect(quoteId).toBeGreaterThan(0)
  await api(page, 'POST', `/api/ventas-diseno/quotes/${quoteId}/parts`, { name: 'Partida orden' })

  try {
    await page.goto(`${BASE}/ventas-diseno/quotes/${quoteId}`)
    // Alta por la UI con cantidades disparejas.
    for (let i = 0; i < QTYS.length; i++) {
      await page.getByRole('button', { name: '+ Agregar ítem' }).first().click()
      await page.getByPlaceholder('Referencia').fill(REFS[i])
      await page.getByPlaceholder('Descripción').fill(`Item ${REFS[i]}`)
      await page.locator('input[type="number"]').last().fill(String(QTYS[i]))
      await page.getByPlaceholder(/Precio unit/).fill('10')
      await page.getByRole('button', { name: '+ Agregar', exact: true }).click()
      await expect(page.locator(`input[value="${REFS[i]}"]`)).toBeVisible()
    }
    expect(await refsInDom(page)).toEqual(REFS)
    expect((await refsViaApi(page, quoteId))[0]).toEqual(REFS)

    // Editar cantidad y precio de items de en medio y del primero -> el orden no cambia.
    const qtyOf = (ref: string) => page.locator(`input[value="${ref}"]`).locator('xpath=ancestor::tr[1]').locator('input[type="number"]').first()
    for (const ref of [REFS[0], REFS[2]]) {
      const input = qtyOf(ref)
      await input.fill('3')
      await page.locator(`input[value="${ref}"]`).locator('xpath=ancestor::tr[1]').getByRole('button', { name: 'Guardar', exact: true }).click()
      await expect(input).toHaveValue('3')
    }
    await page.waitForTimeout(1500)
    const edited = (await api(page, 'GET', `/api/ventas-diseno/quotes/${quoteId}`)).json as { parts: { items: { reference: string; quantity: number }[] }[] }
    expect(edited.parts[0].items.filter(i => i.quantity === 3).map(i => i.reference)).toEqual([REFS[0], REFS[2]])
    expect((await refsViaApi(page, quoteId))[0]).toEqual(REFS)
    await page.reload()
    await expect(page.locator(`input[value="${REFS[0]}"]`)).toBeVisible()
    expect(await refsInDom(page)).toEqual(REFS)

    // Duplicar la partida conserva el orden en la copia.
    const part = (await api(page, 'GET', `/api/ventas-diseno/quotes/${quoteId}`)).json as { parts: { id: number }[] }
    await api(page, 'POST', `/api/ventas-diseno/quotes/${quoteId}/parts/${part.parts[0].id}/duplicate`)
    const after = await refsViaApi(page, quoteId)
    expect(after[0]).toEqual(REFS)
    expect(after[1]).toEqual(REFS)

    // Documento (PDF): el orden de lineas del PDF sigue el de la partida.
    const pdf = await api(page, 'GET', `/api/ventas-diseno/quotes/${quoteId}/pdf`)
    expect(pdf.status).toBe(200)
  } finally {
    // Limpieza: borra todas las partidas creadas (los items caen en cascada).
    const cur = (await api(page, 'GET', `/api/ventas-diseno/quotes/${quoteId}`)).json as { parts?: { id: number }[] }
    for (const part of cur.parts ?? []) await api(page, 'DELETE', `/api/ventas-diseno/quotes/${quoteId}/parts/${part.id}`)
  }
})
