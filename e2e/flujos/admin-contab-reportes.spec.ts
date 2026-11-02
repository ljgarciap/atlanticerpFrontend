import { test, expect } from '@playwright/test'
import { API, iniciarSesion, llamar, crearVentaCobrada, type Tokens, type VentaCobrada } from './apoyo/venta-cobrada'

// Flujo ejecutable de los Reportes de Admin & Contab (catálogo: atlanticerp-backend/docs/flujos/admin-contab-reportes.md): con una venta
// propia cobrada por transferencia, cada reporte debe reflejarla (por cliente: medio de pago, mensual y acumulado; globales: libro de facturas,
// ventas, flujo de caja, comisiones, notas de crédito e Inicio) y los permisos deben cortar a quien no corresponde. Correr con UN worker.

const ROLES = ['vendedor', 'gerencia', 'gerencia3', 'lidercompras', 'liderbodega', 'asistentebodega', 'auxiliarbodega', 'transporte', 'contabilidad', 'asistenteadministrativa', 'superadmin'] as const
const STAMP = String(Date.now())
const HOY = new Date().toISOString().slice(0, 10)
let tokens: Tokens
let venta: VentaCobrada
let sinDatos: number

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de reportes de Admin & Contab', () => {
  test.beforeAll(async ({ request }) => {
    tokens = await iniciarSesion(request, ROLES)
  })

  const api = (request: Parameters<typeof llamar>[0], rol: string, method: string, path: string) => llamar(request, tokens, rol, method, `/admin-contab${path}`)

  test('1. una venta propia cobrada por transferencia (y un cliente sin movimientos)', async ({ request }) => {
    venta = await crearVentaCobrada(request, tokens, STAMP)
    expect(venta.monto).toBeGreaterThan(0)
    const vacio = await llamar(request, tokens, 'vendedor', 'POST', '/ventas-diseno/master-clients', { name: `[FLUJO] Cliente sin movimientos ${STAMP}` })
    sinDatos = vacio.body.id
  })

  test('2. ventas por medio de pago: el cobro aparece en su columna y base + impuesto = total', async ({ request }) => {
    const r = (await api(request, 'contabilidad', 'GET', `/reports/ventas-medio-pago?master_client_id=${venta.masterClient}`)).body
    expect(r.resumen.facturas_cobradas).toBe(1)
    expect(r.resumen.total).toBeCloseTo(venta.monto, 2)
    expect(r.filas).toHaveLength(1)
    const fila = r.filas[0]
    expect(fila.cliente).toBe(venta.clienteNombre)
    expect(fila.transferencia, 'el cobro está en la columna de su método').toBeCloseTo(venta.monto, 2)
    expect(fila.cheque + fila.efectivo + fila.tarjeta, 'y en ninguna otra').toBe(0)
    expect(fila.base_imponible + fila.itbms).toBeCloseTo(fila.total, 1)

    const vacio = (await api(request, 'contabilidad', 'GET', `/reports/ventas-medio-pago?master_client_id=${sinDatos}`)).body
    expect(vacio.resumen.facturas_cobradas).toBe(0)
    expect(vacio.filas).toHaveLength(0)

    const xlsx = await request.get(`${API}/admin-contab/reports/ventas-medio-pago/excel?master_client_id=${venta.masterClient}`, { headers: { Authorization: `Bearer ${tokens.contabilidad}` } })
    expect(xlsx.status()).toBe(200)
    expect(xlsx.headers()['content-type']).toContain('spreadsheetml')
  })

  test('3. mensual por cliente y acumulado: sin cliente no hay reporte; con cliente suman lo facturado y lo cobrado', async ({ request }) => {
    for (const ruta of ['mensual-cliente', 'mensual-cliente-acumulado']) {
      expect((await api(request, 'contabilidad', 'GET', `/reports/${ruta}`)).body, `${ruta} sin cliente`).toEqual({ estado: 'sin_cliente' })
      const r = (await api(request, 'contabilidad', 'GET', `/reports/${ruta}?master_client_id=${venta.masterClient}`)).body
      expect(r.estado).toBe('ok')
      expect(r.resumen.registros).toBe(1)
      expect(r.resumen.total_facturado).toBeCloseTo(venta.monto, 2)
      expect(r.resumen.total_cobrado).toBeCloseTo(venta.monto, 2)
      expect(r.resumen.total_pendiente, 'cobrada del todo: nada pendiente').toBeCloseTo(0, 2)
      expect(r.filas).toHaveLength(1)
      expect(r.filas[0].transferencia).toBeCloseTo(venta.monto, 2)
      expect(r.totales.total_caja).toBeCloseTo(venta.monto, 2)
      expect(r.pendientes).toHaveLength(0)
      const vacio = (await api(request, 'contabilidad', 'GET', `/reports/${ruta}?master_client_id=${sinDatos}`)).body
      expect(vacio.filas, `${ruta}: cliente sin movimientos`).toHaveLength(0)
      const xlsxVacio = await request.get(`${API}/admin-contab/reports/${ruta}/excel?master_client_id=${sinDatos}`, { headers: { Authorization: `Bearer ${tokens.contabilidad}`, Accept: 'application/json' } })
      expect(xlsxVacio.status(), 'sin datos no se descarga').toBe(422)
      const xlsx = await request.get(`${API}/admin-contab/reports/${ruta}/excel?master_client_id=${venta.masterClient}`, { headers: { Authorization: `Bearer ${tokens.contabilidad}` } })
      expect(xlsx.status()).toBe(200)
    }
    // Rango de fechas fuera de la venta: sin filas.
    const fuera = (await api(request, 'contabilidad', 'GET', `/reports/mensual-cliente?master_client_id=${venta.masterClient}&desde=2020-01-01&hasta=2020-01-31`)).body
    expect(fuera.filas).toHaveLength(0)
    const todos = (await api(request, 'contabilidad', 'GET', '/reports/mensual-cliente?master_client_id=todos')).body
    expect(todos.resumen.total_cobrado).toBeGreaterThanOrEqual(venta.monto)
  })

  test('4. libro de facturas: la factura figura, el filtro por tipo funciona y el resumen cuadra con las filas', async ({ request }) => {
    const hoy = (await api(request, 'contabilidad', 'GET', `/reports/libro-facturas?desde=${HOY}&hasta=${HOY}`)).body
    const doc = (hoy.documentos as { cliente: string; tipo: string; total: number; base_imponible: number; itbms: number }[]).find(d => d.cliente === venta.clienteNombre)
    expect(doc, 'la factura de la venta está en el libro de hoy').toBeTruthy()
    expect(doc!.tipo).toBe('Factura')
    expect(doc!.total).toBeCloseTo(venta.monto, 2)
    expect(doc!.base_imponible + doc!.itbms).toBeCloseTo(doc!.total, 1)

    const soloFacturas = (await api(request, 'contabilidad', 'GET', '/reports/libro-facturas?tipo=factura')).body.documentos as { tipo: string }[]
    expect(soloFacturas.length).toBeGreaterThan(0)
    expect(soloFacturas.every(d => d.tipo === 'Factura')).toBe(true)
    const soloNotas = (await api(request, 'contabilidad', 'GET', '/reports/libro-facturas?tipo=nota_credito')).body.documentos as { tipo: string }[]
    expect(soloNotas.every(d => d.tipo !== 'Factura')).toBe(true)
    const todo = (await api(request, 'contabilidad', 'GET', '/reports/libro-facturas')).body
    expect(todo.resumen.facturas).toBe(soloFacturas.length)
    expect(todo.resumen.notas_credito).toBe(soloNotas.length)

    const vacio = await request.get(`${API}/admin-contab/reports/libro-facturas/excel?desde=2020-01-01&hasta=2020-01-02`, { headers: { Authorization: `Bearer ${tokens.contabilidad}`, Accept: 'application/json' } })
    expect(vacio.status(), 'sin documentos no se descarga').toBe(422)
    const xlsx = await request.get(`${API}/admin-contab/reports/libro-facturas/excel?desde=${HOY}&hasta=${HOY}`, { headers: { Authorization: `Bearer ${tokens.contabilidad}` } })
    expect(xlsx.status()).toBe(200)
  })

  test('5. series (ventas, flujo de caja, comisiones), notas de crédito e Inicio reflejan la venta', async ({ request }) => {
    expect((await api(request, 'contabilidad', 'GET', '/reports/ventas?periodo=inventado')).status).toBe(422)
    for (const periodo of ['hoy', '3m', '6m', 'anio']) {
      expect((await api(request, 'contabilidad', 'GET', `/reports/ventas?periodo=${periodo}`)).status, `ventas ${periodo}`).toBe(200)
      expect((await api(request, 'contabilidad', 'GET', `/reports/flujo-caja?periodo=${periodo}`)).status, `flujo ${periodo}`).toBe(200)
      expect((await api(request, 'contabilidad', 'GET', `/reports/comisiones?periodo=${periodo}`)).status, `comisiones ${periodo}`).toBe(200)
    }
    const mesActual = (rows: { mes: string; anio: number }[]) => rows[rows.length - 1]
    const ventas = (await api(request, 'contabilidad', 'GET', '/reports/ventas?periodo=3m')).body
    expect(mesActual(ventas.meses).total, 'ventas del mes incluyen la venta').toBeGreaterThanOrEqual(venta.monto)
    const flujo = (await api(request, 'contabilidad', 'GET', '/reports/flujo-caja?periodo=3m')).body
    expect(mesActual(flujo.meses).entradas, 'el cobro es una entrada del mes').toBeGreaterThanOrEqual(venta.monto)
    expect(mesActual(flujo.meses).neto).toBeCloseTo(mesActual(flujo.meses).entradas - mesActual(flujo.meses).salidas, 2)

    expect((await api(request, 'contabilidad', 'GET', '/reports/notas-credito')).status).toBe(200)
    const inicio = (await api(request, 'contabilidad', 'GET', '/home/resumen-mes')).body
    expect(inicio.total_cobrado_mes, 'Inicio suma el cobro del mes').toBeGreaterThanOrEqual(venta.monto)
  })

  test('6. permisos: el vendedor no ve ningún reporte; la Asistente ve todos menos la comisión de cartera', async ({ request }) => {
    const rutas = ['/reports/ventas-medio-pago', '/reports/mensual-cliente', '/reports/mensual-cliente-acumulado', '/reports/libro-facturas', '/reports/ventas?periodo=3m',
      '/reports/flujo-caja?periodo=3m', '/reports/comisiones?periodo=3m', '/reports/notas-credito', '/reports/cartera', '/home/resumen-mes', '/home/pendientes']
    for (const ruta of rutas) {
      expect((await api(request, 'vendedor', 'GET', ruta)).status, `vendedor ${ruta}`).toBe(403)
      expect((await api(request, 'lidercompras', 'GET', ruta)).status, `líder de compras ${ruta}`).toBe(403)
      expect((await api(request, 'asistenteadministrativa', 'GET', ruta)).status, `asistente ${ruta}`).toBe(200)
      expect((await api(request, 'gerencia', 'GET', ruta)).status, `gerencia ${ruta}`).toBe(200)
    }
  })
})
