import { test, expect, type APIRequestContext } from '@playwright/test'

// Promovido a permanente por Pre-QA (2026-08-09) — ver
// docs/pre-qa/scrum741-uat-compras-bodega-oculto-backend-bypass-20260809.md. Regla del proyecto:
// un smoke test que verifica un gate de permiso/flujo de estado que ya se rompió una vez no se
// descarta (aquí se rompió DOS veces: el bug original — sidebar oculto pero backend seguía
// sirviendo datos reales — y el primer intento de fix, que solo cerraba la rama restringida de
// `ventas_diseno.read` sin considerar que Gerencia (`management`) tiene `compras.read`/
// `bodega.read` REALES vía su rol, no solo el fallback).
//
// Decisión de Luis (Opción B del doc de Pre-QA): mientras Compras/Bodega estén ocultos por la
// etapa de UAT actual, NADIE no-superadmin accede de verdad — ni siquiera con el permiso real.
// Este test self-seedea el estado de UAT vía la API real (no asume que ya está en un estado
// dado) y lo restaura en afterAll, como exige `feedback_e2e_permanent_tests_must_self_seed.md`.

const BACKEND_URL = process.env.PREQA_BACKEND_URL ?? 'http://localhost:8090'

// Cuentas reales (password = email), ver project_roster_usuarios_reales_atlanticerp.md.
const SUPERADMIN = { email: 'andres.loi@illuminations.com.pa', password: 'andres.loi@illuminations.com.pa' }
const DAVID = { email: 'david@grupolafayette.com', password: 'david@grupolafayette.com' } // Gerencia, compras.read/bodega.read reales
const MARK = { email: 'mbekhar@illuminations.com.pa', password: 'mbekhar@illuminations.com.pa' } // Gerencia, ídem

async function login(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${BACKEND_URL}/api/auth/login`, {
    headers: { Accept: 'application/json' },
    data: { email, password },
  })
  expect(res.ok(), `login falló para ${email}: ${res.status()}`).toBeTruthy()
  const body = await res.json()
  return body.token as string
}

async function setUatHidden(request: APIRequestContext, saToken: string, modules: string[], action: 'hide' | 'restore') {
  const res = await request.post(`${BACKEND_URL}/api/admin/module-visibility/bulk`, {
    headers: { Authorization: `Bearer ${saToken}`, Accept: 'application/json' },
    data: { modules, menuItems: [], action },
  })
  expect(res.ok(), `bulk module-visibility (${action}) falló: ${res.status()}`).toBeTruthy()
}

test.describe('SCRUM-741 — UAT oculto (Compras/Bodega) corta acceso real, incluso con compras.read/bodega.read reales', () => {
  // Serial a propósito: ambos tests mutan el mismo estado global de UAT (module-visibility/bulk
  // no es por-sesión, es un toggle real compartido) — en paralelo se pisan entre sí (visto en
  // vivo: "restaurar" del segundo test corría mientras el primero todavía esperaba el 403).
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async ({ request }) => {
    // Estado limpio conocido antes de empezar, por si una corrida previa quedó a mitad de camino.
    const saToken = await login(request, SUPERADMIN.email, SUPERADMIN.password)
    await setUatHidden(request, saToken, ['compras', 'bodega'], 'restore')
  })

  test.afterAll(async ({ request }) => {
    const saToken = await login(request, SUPERADMIN.email, SUPERADMIN.password)
    await setUatHidden(request, saToken, ['compras', 'bodega'], 'restore')
  })

  test('David y Mark (Gerencia, compras.read/bodega.read reales) pierden acceso real mientras el módulo está oculto por UAT', async ({ request }) => {
    const saToken = await login(request, SUPERADMIN.email, SUPERADMIN.password)
    const davidToken = await login(request, DAVID.email, DAVID.password)
    const markToken = await login(request, MARK.email, MARK.password)

    await setUatHidden(request, saToken, ['compras', 'bodega'], 'hide')

    const davidInventory = await request.get(`${BACKEND_URL}/api/compras/inventory`, {
      headers: { Authorization: `Bearer ${davidToken}`, Accept: 'application/json' },
    })
    expect(davidInventory.status(), 'David debe recibir 403 real en /api/compras/inventory con Compras oculto').toBe(403)

    const markInventory = await request.get(`${BACKEND_URL}/api/compras/inventory`, {
      headers: { Authorization: `Bearer ${markToken}`, Accept: 'application/json' },
    })
    expect(markInventory.status(), 'Mark debe recibir 403 real en /api/compras/inventory con Compras oculto').toBe(403)

    const davidBodega = await request.get(`${BACKEND_URL}/api/bodega/orders/status`, {
      headers: { Authorization: `Bearer ${davidToken}`, Accept: 'application/json' },
    })
    expect(davidBodega.status(), 'David debe recibir 403 real en /api/bodega/orders/status con Bodega oculto').toBe(403)

    const markBodega = await request.get(`${BACKEND_URL}/api/bodega/orders/status`, {
      headers: { Authorization: `Bearer ${markToken}`, Accept: 'application/json' },
    })
    expect(markBodega.status(), 'Mark debe recibir 403 real en /api/bodega/orders/status con Bodega oculto').toBe(403)

    // Superadmin nunca se ve afectado por la máscara UAT.
    const saInventory = await request.get(`${BACKEND_URL}/api/compras/inventory`, {
      headers: { Authorization: `Bearer ${saToken}`, Accept: 'application/json' },
    })
    expect(saInventory.status(), 'Superadmin nunca debe perder acceso, ni con el módulo oculto').toBe(200)
    const saBody = await saInventory.json()
    expect(saBody.restricted).toBe(false)
  })

  test('restaurar el módulo devuelve acceso funcional completo a David/Mark — el mecanismo sigue siendo reversible', async ({ request }) => {
    const saToken = await login(request, SUPERADMIN.email, SUPERADMIN.password)
    const davidToken = await login(request, DAVID.email, DAVID.password)
    const markToken = await login(request, MARK.email, MARK.password)

    // Este test asume que el anterior dejó compras/bodega ocultos (mismo describe, orden secuencial
    // por default de Playwright) — lo confirmamos igual en vez de asumirlo ciegamente.
    await setUatHidden(request, saToken, ['compras', 'bodega'], 'hide')

    await setUatHidden(request, saToken, ['compras', 'bodega'], 'restore')

    const davidInventory = await request.get(`${BACKEND_URL}/api/compras/inventory`, {
      headers: { Authorization: `Bearer ${davidToken}`, Accept: 'application/json' },
    })
    expect(davidInventory.status()).toBe(200)
    const davidBody = await davidInventory.json()
    expect(davidBody.restricted, 'David debe recuperar el modo NO restringido tras restaurar').toBe(false)

    const markBodega = await request.get(`${BACKEND_URL}/api/bodega/orders/status`, {
      headers: { Authorization: `Bearer ${markToken}`, Accept: 'application/json' },
    })
    expect(markBodega.status()).toBe(200)
  })
})
