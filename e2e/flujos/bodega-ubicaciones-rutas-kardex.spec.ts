import { test, expect } from '@playwright/test'
import { hoyDeLaEmpresa, iniciarSesion, llamar, crearPedido, entregarYCobrar, type Tokens, type Pedido } from './apoyo/venta-cobrada'

// Flujo ejecutable de Bodega: ubicaciones físicas (CRUD y chip «Espacio libre»), rutas de entrega del día y Kardex (catálogo:
// atlanticerp-backend/docs/flujos/bodega-ubicaciones-rutas-kardex.md). Por la API real y con la cuenta de cada rol. Las ubicaciones no se
// borran (solo se desactivan), así que las que crea llevan el prefijo «[FLUJO]». Correr con UN worker (npm run e2e:flujos).

const ROLES = ['vendedor', 'gerencia', 'lidercompras', 'liderbodega', 'asistentebodega', 'auxiliarbodega', 'transporte', 'contabilidad', 'superadmin'] as const
const STAMP = String(Date.now())
const HOY = hoyDeLaEmpresa()
let tokens: Tokens
let central: number
let sala: number
let pedido: Pedido

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Bodega: ubicaciones, rutas del día y kardex', () => {
  test.beforeAll(async ({ request }) => {
    tokens = await iniciarSesion(request, ROLES)
    const bodegas = (await llamar(request, tokens, 'liderbodega', 'GET', '/bodega/warehouses')).body.data as { id: number; name: string; modo_detalle: string }[]
    central = bodegas.find(b => b.name === 'Bodega Central')!.id
    sala = bodegas.find(b => b.modo_detalle === 'ubicacion_exacta' && b.id !== central)!.id
  })

  const api = (request: Parameters<typeof llamar>[0], rol: string, method: string, path: string, payload?: unknown) => llamar(request, tokens, rol, method, `/bodega${path}`, payload)

  test('1. ubicaciones: alta, código único por bodega, renombre, desactivación y permisos', async ({ request }) => {
    const codigo = `[FLUJO]-${STAMP}`
    expect((await api(request, 'vendedor', 'GET', `/warehouses/${central}/locations`)).status, 'el vendedor no lee ubicaciones').toBe(403)
    expect((await api(request, 'vendedor', 'POST', `/warehouses/${central}/locations`, { codigo })).status).toBe(403)
    expect((await api(request, 'lidercompras', 'GET', `/warehouses/${central}/locations`)).status, 'el Líder de Compras las lee').toBe(200)
    expect((await api(request, 'lidercompras', 'POST', `/warehouses/${central}/locations`, { codigo })).status, 'pero no las escribe').toBe(403)
    expect((await api(request, 'liderbodega', 'POST', `/warehouses/${central}/locations`, {})).status, 'el código es obligatorio').toBe(422)
    expect((await api(request, 'liderbodega', 'POST', '/warehouses/99999999/locations', { codigo })).status, 'bodega inexistente').toBe(404)

    const alta = await api(request, 'liderbodega', 'POST', `/warehouses/${central}/locations`, { codigo })
    expect(alta.status).toBe(201)
    expect(alta.body.is_active, 'nace activa').toBe(true)
    const id = alta.body.id as number
    expect((await api(request, 'liderbodega', 'POST', `/warehouses/${central}/locations`, { codigo })).status, 'el código no se repite en la misma bodega').toBe(422)
    const otra = await api(request, 'liderbodega', 'POST', `/warehouses/${sala}/locations`, { codigo })
    expect(otra.status, 'pero sí en otra bodega').toBe(201)

    // Renombre: no puede chocar con otra ubicación de la bodega, ni tocar la de otra bodega.
    const segunda = await api(request, 'asistentebodega', 'POST', `/warehouses/${central}/locations`, { codigo: `${codigo}-B` })
    expect(segunda.status, 'la asistente de bodega también escribe').toBe(201)
    expect((await api(request, 'liderbodega', 'PATCH', `/warehouses/${central}/locations/${segunda.body.id}`, { codigo })).status).toBe(422)
    expect((await api(request, 'liderbodega', 'PATCH', `/warehouses/${sala}/locations/${id}`, { codigo: 'X' })).status, 'la ubicación es de otra bodega').toBe(404)
    expect((await api(request, 'liderbodega', 'PATCH', `/warehouses/${central}/locations/${segunda.body.id}`, { codigo: `${codigo}-C` })).status).toBe(200)
    // Fase 29: escribir ubicaciones exige el permiso angosto «bodega.locations.manage»; el auxiliar ya no lo tiene.
    const delAuxiliar = await api(request, 'auxiliarbodega', 'POST', `/warehouses/${central}/locations`, { codigo: `${codigo}-AUX` })
    expect(delAuxiliar.status, 'el auxiliar de bodega ya no escribe ubicaciones').toBe(403)

    // Chip «Espacio libre»: lista las ubicaciones activas sin existencias; una desactivada sale.
    const libres = async () => ((await api(request, 'liderbodega', 'GET', `/warehouses/${central}?chip=espacio_libre`)).body.ubicaciones as string[])
    expect(await libres()).toContain(codigo)
    expect((await api(request, 'liderbodega', 'PATCH', `/warehouses/${central}/locations/${id}`, { is_active: false })).status).toBe(200)
    expect(await libres(), 'una ubicación desactivada no se ofrece').not.toContain(codigo)
    const activas = (await api(request, 'liderbodega', 'GET', `/warehouses/${central}/locations`)).body.data as { codigo: string; is_active: boolean }[]
    expect(activas.find(l => l.codigo === codigo), 'por defecto el listado oculta las desactivadas').toBeUndefined()
    const todas = (await api(request, 'liderbodega', 'GET', `/warehouses/${central}/locations?incluir_inactivas=1`)).body.data as { codigo: string; is_active: boolean }[]
    expect(todas.find(l => l.codigo === codigo)?.is_active, 'con incluir_inactivas se ven y conservan el estado').toBe(false)
    expect((await api(request, 'auxiliarbodega', 'GET', `/warehouses/${central}/locations`)).status).toBe(200)

    // Se deja desactivadas las de prueba (no hay borrado).
    for (const [b, l] of [[central, segunda.body.id], [sala, otra.body.id]] as const) {
      expect((await api(request, 'liderbodega', 'PATCH', `/warehouses/${b}/locations/${l}`, { is_active: false })).status).toBe(200)
    }
  })

  test('2. rutas del día: un pedido con entrega de hoy aparece hasta que se entrega', async ({ request }) => {
    pedido = await crearPedido(request, tokens, STAMP, HOY)
    const rutas = async () => (await api(request, 'liderbodega', 'GET', '/home/rutas-dia')).body.data as { order_number: string; customer: string; stage: string; repartidor: string | null }[]
    const fila = (await rutas()).find(r => r.order_number === pedido.pedidoNumero)
    expect(fila, 'el pedido con entrega comprometida hoy está en la ruta del día').toBeTruthy()
    expect(fila!.repartidor, 'sin repartidor asignado').toBeNull()

    expect((await api(request, 'vendedor', 'GET', '/home/rutas-dia')).status, 'el vendedor no ve las rutas').toBe(403)
    for (const rol of ['lidercompras', 'gerencia', 'auxiliarbodega', 'transporte'] as const) {
      expect((await api(request, rol, 'GET', '/home/rutas-dia')).status, `${rol} sí las ve`).toBe(200)
    }
  })

  test('3. al entregar el pedido sale de la ruta y el Kardex registra la salida', async ({ request }) => {
    await entregarYCobrar(request, tokens, pedido)
    const rutas = (await api(request, 'liderbodega', 'GET', '/home/rutas-dia')).body.data as { order_number: string }[]
    expect(rutas.find(r => r.order_number === pedido.pedidoNumero), 'entregado: ya no está en la ruta').toBeUndefined()

    type Mov = { id: number; tipo: string; cantidad: number; referencia: string; bodega: string; saldo_inicial: number; saldo_resultante: number; producto: { id: number } }
    const kardex = await api(request, 'liderbodega', 'GET', '/kardex?per_page=100')
    expect(kardex.status).toBe(200)
    const salida = (kardex.body.data as Mov[]).find(m => m.referencia.includes(pedido.pedidoNumero))
    expect(salida, 'el despacho dejó un movimiento en el Kardex').toBeTruthy()
    expect(salida!.tipo).toBe('Salida')
    expect(salida!.cantidad, 'sale negativo').toBe(-pedido.unidades)
    expect(salida!.bodega).toBe('Bodega Central')
    expect(salida!.saldo_resultante, 'el saldo cuadra con el movimiento').toBe(salida!.saldo_inicial + salida!.cantidad)

    // Filtros: por tipo, por bodega y por producto (búsqueda por referencia).
    const porTipo = (await api(request, 'liderbodega', 'GET', '/kardex?per_page=50&tipo=Salida')).body.data as Mov[]
    expect(porTipo.length).toBeGreaterThan(0)
    expect(porTipo.every(m => m.tipo === 'Salida')).toBe(true)
    const porBodega = (await api(request, 'liderbodega', 'GET', `/kardex?per_page=50&warehouse_id=${pedido.bodegaCentral}`)).body.data as Mov[]
    expect(porBodega.every(m => m.bodega === 'Bodega Central')).toBe(true)
    const unaBodega = (await api(request, 'liderbodega', 'GET', `/kardex?per_page=50&warehouse_id=${sala}`)).body.data as Mov[]
    expect(unaBodega.find(m => m.referencia.includes(pedido.pedidoNumero))).toBeUndefined()

    // Cadena de saldos: dentro de un producto y una bodega, el saldo inicial de cada movimiento es el resultante del anterior.
    const delProducto = (await api(request, 'liderbodega', 'GET', `/kardex?per_page=100&warehouse_id=${pedido.bodegaCentral}`)).body.data as Mov[]
    const mismos = delProducto.filter(m => m.producto.id === salida!.producto.id).reverse() // del más viejo al más nuevo
    for (let i = 1; i < mismos.length; i++) expect(mismos[i].saldo_inicial, `movimiento ${mismos[i].id} continúa al anterior`).toBe(mismos[i - 1].saldo_resultante)

    expect((await api(request, 'vendedor', 'GET', '/kardex')).status, 'el vendedor no ve el Kardex').toBe(403)
    for (const rol of ['lidercompras', 'gerencia', 'auxiliarbodega', 'asistentebodega'] as const) {
      expect((await api(request, rol, 'GET', '/kardex')).status).toBe(200)
    }
  })
})
