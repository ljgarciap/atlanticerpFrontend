import { test, expect } from '@playwright/test'
import { iniciarSesion, llamar, type Tokens } from './apoyo/venta-cobrada'

// Flujo ejecutable de la Fase 29b (Compras): estado visible de las órdenes, agencias (nombre único, contacto editable, desactivar),
// proveedores (edición parcial, control de versión, desactivar) y familias (renombrar, moneda, desactivar). Catálogos:
// atlanticerp-backend/docs/flujos/compras-reposicion-proveedores.md y compras-familias.md. Por la API real; lo que crea lleva «[FLUJO]».
// UN worker (npm run e2e:flujos).

const ROLES = ['vendedor', 'lidercompras', 'gerencia'] as const
const STAMP = String(Date.now())
let tokens: Tokens
const ctx: Record<string, any> = {}

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Compras, Fase 29b', () => {
  test.beforeAll(async ({ request }) => { tokens = await iniciarSesion(request, ROLES) })
  const api = (request: Parameters<typeof llamar>[0], rol: string, method: string, path: string, payload?: unknown) => llamar(request, tokens, rol, method, `/compras${path}`, payload)

  test('1. cada orden trae su estado visible', async ({ request }) => {
    const filas = (await api(request, 'lidercompras', 'GET', '/orders?per_page=20')).body.data as { status: string; status_visible?: string }[]
    for (const o of filas) expect(o.status_visible, 'el estado visible siempre viene').toBeTruthy()
    for (const o of filas.filter(x => x.status !== 'por_aprobar')) expect(o.status_visible).toBe(o.status)
  })

  test('2. agencias: nombre único, contacto editable y desactivar sin borrar', async ({ request }) => {
    const nombre = `[FLUJO] Agencia 29b ${STAMP}`
    const alta = await api(request, 'lidercompras', 'POST', '/liquidation-agencies', { name: nombre })
    expect(alta.status).toBe(201)
    ctx.agencia = alta.body.id
    const repetida = await api(request, 'lidercompras', 'POST', '/liquidation-agencies', { name: nombre.toUpperCase() })
    expect(repetida.status, 'el nombre es único sin distinguir mayúsculas').toBe(422)
    expect(repetida.body.errors).toHaveProperty('name')

    const edicion = await api(request, 'lidercompras', 'PUT', `/liquidation-agencies/${ctx.agencia}`, { name: `${nombre} B`, contact_name: 'Contacto Flujo', email: 'contacto@example.com' })
    expect(edicion.status).toBe(200)
    expect(edicion.body.contact_name).toBe('Contacto Flujo')
    expect((await api(request, 'vendedor', 'PUT', `/liquidation-agencies/${ctx.agencia}`, { name: 'x' })).status, 'el vendedor no edita agencias').toBe(403)

    expect((await api(request, 'lidercompras', 'PUT', `/liquidation-agencies/${ctx.agencia}`, { is_active: false })).body.is_active).toBe(false)
    const visibles = (await api(request, 'lidercompras', 'GET', `/liquidation-agencies?search=${STAMP}`)).body.data as unknown[]
    expect(visibles, 'desactivada no se ofrece').toHaveLength(0)
    const todas = (await api(request, 'lidercompras', 'GET', `/liquidation-agencies?search=${STAMP}&incluir_inactivas=1`)).body.data as unknown[]
    expect(todas, 'pero se conserva').toHaveLength(1)
  })

  test('3. proveedores: edición parcial, versión que evita pisar y desactivar', async ({ request }) => {
    const nombre = `[FLUJO] Proveedor 29b ${STAMP}`
    const alta = await api(request, 'lidercompras', 'POST', '/providers', { name: nombre, category: 'locales', country: 'Panamá', whatsapp: '+507 6000-0000' })
    expect(alta.status).toBe(201)
    ctx.proveedor = alta.body.id
    const v0 = alta.body.version as string
    expect(v0).toBeTruthy()

    const parcial = await api(request, 'lidercompras', 'PATCH', `/providers/${ctx.proveedor}`, { contact_name: 'Contacto Parcial', version: v0 })
    expect(parcial.status, 'PATCH no exige reenviar el nombre').toBe(200)
    expect(parcial.body.name).toBe(nombre)
    if (parcial.body.version !== v0) {
      const pisado = await api(request, 'lidercompras', 'PATCH', `/providers/${ctx.proveedor}`, { contact_name: 'Pisado', version: v0 })
      expect(pisado.status, 'con la versión vieja el servidor no pisa').toBe(409)
      expect(pisado.body.code).toBe('provider_changed')
    }
    expect((await api(request, 'lidercompras', 'PUT', `/providers/${ctx.proveedor}`, { contact_name: 'x' })).status, 'el PUT sigue pidiendo el formulario completo').toBe(422)
    expect((await api(request, 'vendedor', 'PATCH', `/providers/${ctx.proveedor}`, { contact_name: 'x' })).status).toBe(403)

    expect((await api(request, 'lidercompras', 'PATCH', `/providers/${ctx.proveedor}`, { is_active: false })).body.is_active).toBe(false)
    const activos = (await api(request, 'lidercompras', 'GET', `/providers?per_page=100&search=${STAMP}`)).body.data as unknown[]
    expect(activos).toHaveLength(0)
    const todos = (await api(request, 'lidercompras', 'GET', `/providers?per_page=100&search=${STAMP}&incluir_inactivas=1`)).body.data as unknown[]
    expect(todos).toHaveLength(1)
  })

  test('4. familias: renombrar, moneda, nombre repetido y desactivar', async ({ request }) => {
    const nombre = `[FLUJO] Familia 29b ${STAMP}`
    const otra = await api(request, 'lidercompras', 'POST', '/families', { name: `${nombre} otra` })
    const alta = await api(request, 'lidercompras', 'POST', '/families', { name: nombre })
    ctx.familia = alta.body.id
    expect((await api(request, 'lidercompras', 'PATCH', `/families/${ctx.familia}`, { name: `${nombre} OTRA` })).status, 'no se repite el nombre').toBe(422)
    const ok = await api(request, 'lidercompras', 'PATCH', `/families/${ctx.familia}`, { name: `${nombre} B`, currency: 'eur' })
    expect(ok.status).toBe(200)
    expect(ok.body.currency).toBe('EUR')
    expect((await api(request, 'vendedor', 'PATCH', `/families/${ctx.familia}`, { name: 'x' })).status, 'el vendedor no edita familias').toBe(403)
    expect((await api(request, 'lidercompras', 'GET', `/families/${ctx.familia}`)).body).toHaveProperty('stock_por_almacen')

    expect((await api(request, 'lidercompras', 'PATCH', `/families/${ctx.familia}`, { is_active: false })).body.is_active).toBe(false)
    const visibles = ((await api(request, 'lidercompras', 'GET', '/families?per_page=100')).body.data as { id: number }[]).map(f => f.id)
    expect(visibles).not.toContain(ctx.familia)
    const todas = ((await api(request, 'lidercompras', 'GET', '/families?per_page=100&incluir_inactivas=1')).body.data as { id: number }[]).map(f => f.id)
    expect(todas, 'se conserva con su historial').toContain(ctx.familia)
    await api(request, 'lidercompras', 'PATCH', `/families/${otra.body.id}`, { is_active: false })
  })
})
