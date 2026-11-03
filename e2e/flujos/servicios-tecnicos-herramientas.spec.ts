import { test, expect } from '@playwright/test'
import { iniciarSesion, llamar, data, type Tokens } from './apoyo/venta-cobrada'

// Flujo ejecutable de Servicios: técnicos externos, herramientas (alta por solicitud de compra, asignación, incidentes y Kardex) e insumos
// (catálogo: atlanticerp-backend/docs/flujos/servicios-tecnicos-herramientas.md). Por la API real y con la cuenta de cada rol; lo que crea
// lleva «[FLUJO]» y no se puede borrar. Correr con UN worker (npm run e2e:flujos).

const ROLES = ['vendedor', 'gerencia', 'lidercompras', 'liderservicios', 'tecnico', 'tecnicogarantias', 'contabilidad', 'superadmin'] as const
const STAMP = String(Date.now())
let tokens: Tokens

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Servicios: técnicos, herramientas e insumos', () => {
  test.beforeAll(async ({ request }) => {
    tokens = await iniciarSesion(request, ROLES)
  })

  const api = (request: Parameters<typeof llamar>[0], rol: string, method: string, path: string, payload?: unknown) => llamar(request, tokens, rol, method, `/servicios${path}`, payload)

  test('1. técnicos externos: alta, tarifa, estado y quién ve las tarifas', async ({ request }) => {
    const nuevo = { nombre: `[FLUJO] Externo ${STAMP}`, empresa: '[FLUJO] Contratista', especialidad: 'Instalación', telefono: '6000-0010', email: 'externo.flujo@example.test', tarifa_dia: 80 }
    expect((await api(request, 'vendedor', 'GET', '/external-technicians')).status, 'el vendedor no ve técnicos externos').toBe(403)
    for (const rol of ['tecnico', 'liderservicios', 'gerencia'] as const) expect((await api(request, rol, 'GET', '/external-technicians')).status).toBe(200)
    for (const rol of ['vendedor', 'tecnico', 'tecnicogarantias'] as const) {
      expect((await api(request, rol, 'POST', '/external-technicians', nuevo)).status, `${rol} no da de alta`).toBe(403)
    }
    expect((await api(request, 'liderservicios', 'POST', '/external-technicians', {})).status).toBe(422)
    expect((await api(request, 'liderservicios', 'POST', '/external-technicians', { ...nuevo, tarifa_dia: -1 })).status, 'tarifa no negativa').toBe(422)
    expect((await api(request, 'liderservicios', 'POST', '/external-technicians', { ...nuevo, email: 'no-es-correo' })).status).toBe(422)

    const alta = await api(request, 'liderservicios', 'POST', '/external-technicians', nuevo)
    expect(alta.status, JSON.stringify(alta.body).slice(0, 200)).toBe(201)
    const id = alta.body.id as number
    const antes = (await api(request, 'liderservicios', 'GET', '/external-technicians')).body.counts as { active: number; inactive: number; total: number }

    // Tarifa: la ven y la cambian solo quienes administran la operación de campo; el técnico interno ve al externo sin costos.
    const vista = (rol: string) => api(request, rol, 'GET', `/external-technicians/${id}`)
    const dePersona = JSON.stringify((await vista('tecnico')).body)
    expect(dePersona, 'el técnico interno no ve la tarifa').not.toContain('rate_history')
    expect((await vista('liderservicios')).body.rate_history, 'el líder de servicios sí ve el historial de tarifas').toBeDefined()
    expect((await api(request, 'tecnico', 'PATCH', `/external-technicians/${id}/tarifa`, { tarifa_dia: 90 })).status).toBe(403)
    expect((await api(request, 'liderservicios', 'PATCH', `/external-technicians/${id}/tarifa`, { tarifa_dia: -5 })).status).toBe(422)
    expect((await api(request, 'liderservicios', 'PATCH', `/external-technicians/${id}/tarifa`, { tarifa_dia: 95 })).status).toBe(200)
    const historial = (await vista('gerencia')).body.rate_history as { tarifa_dia: number }[]
    expect(historial.length, 'cada cambio de tarifa queda en el historial').toBeGreaterThanOrEqual(2)

    // Estado: desactivar puede pedir confirmación; con confirm se desactiva y vuelve a activarse.
    expect((await api(request, 'liderservicios', 'PATCH', `/external-technicians/${id}/estado`, { estado: 'inventado' })).status).toBe(422)
    expect((await api(request, 'tecnico', 'PATCH', `/external-technicians/${id}/estado`, { estado: 'inactive' })).status).toBe(403)
    const baja = await api(request, 'liderservicios', 'PATCH', `/external-technicians/${id}/estado`, { estado: 'inactive', confirm: true })
    expect(baja.status, JSON.stringify(baja.body).slice(0, 200)).toBe(200)
    const despues = (await api(request, 'liderservicios', 'GET', '/external-technicians')).body.counts as { active: number; inactive: number }
    expect(despues.inactive).toBe(antes.inactive + 1)
    expect(despues.active).toBe(antes.active - 1)
    expect((await api(request, 'liderservicios', 'PATCH', `/external-technicians/${id}/estado`, { estado: 'active' })).status).toBe(200)
    expect((await api(request, 'liderservicios', 'GET', '/external-technicians/99999999')).status).toBe(404)
  })

  test('2. herramientas: solicitud de compra, recepción que crea las unidades, asignación e incidentes', async ({ request }) => {
    const nombre = `[FLUJO] Escalera ${STAMP}`
    for (const rol of ['vendedor', 'tecnico', 'tecnicogarantias', 'gerencia'] as const) {
      expect((await api(request, rol, 'POST', '/tools/purchase-requests', { nombre, cantidad: 2 })).status, `${rol} no solicita herramientas`).toBe(403)
    }
    expect((await api(request, 'liderservicios', 'POST', '/tools/purchase-requests', { cantidad: 2 })).status, 'hace falta nombre o herramienta').toBe(422)
    expect((await api(request, 'liderservicios', 'POST', '/tools/purchase-requests', { nombre, cantidad: 0 })).status).toBe(422)
    const solicitud = await api(request, 'liderservicios', 'POST', '/tools/purchase-requests', { nombre, cantidad: 2 })
    expect(solicitud.status, JSON.stringify(solicitud.body).slice(0, 200)).toBe(201)
    const pendientes = (await api(request, 'vendedor', 'GET', '/tools/purchase-requests')).body.data as { id: number }[]
    expect(pendientes.map(p => p.id), 'las solicitudes las ve todo el módulo').toContain(solicitud.body.id)

    expect((await api(request, 'tecnico', 'POST', `/tools/purchase-requests/${solicitud.body.id}/recibir`)).status).toBe(403)
    const recibida = await api(request, 'liderservicios', 'POST', `/tools/purchase-requests/${solicitud.body.id}/recibir`)
    expect(recibida.status, JSON.stringify(recibida.body).slice(0, 200)).toBe(200)
    const unidades = recibida.body.tools as { id: number; codigo_unico: string; estado: string; nombre: string; responsable_incidente: string | null }[]
    expect(unidades, 'recibir crea una unidad por cada pieza solicitada').toHaveLength(2)
    expect(new Set(unidades.map(u => u.codigo_unico)).size, 'cada unidad tiene su propio código').toBe(2)
    expect(unidades.every(u => u.estado === 'good')).toBe(true)
    expect((await api(request, 'liderservicios', 'POST', `/tools/purchase-requests/${solicitud.body.id}/recibir`)).status, 'no se recibe dos veces').toBe(409)

    // Asignación a un técnico interno.
    const tecnicos = (await api(request, 'liderservicios', 'GET', '/internal-technicians')).body.data as { id: number; email: string; nombre: string }[]
    const tec = tecnicos[0] as { id: number; email: string; nombre: string }
    const [u1, u2] = unidades
    expect((await api(request, 'tecnico', 'PATCH', `/tools/${u1.id}/asignacion`, { assigned_to_technician_id: tec.id })).status).toBe(403)
    expect((await api(request, 'liderservicios', 'PATCH', `/tools/${u1.id}/asignacion`, { assigned_to_technician_id: 99999999 })).status, 'técnico inexistente').toBe(422)
    expect((await api(request, 'liderservicios', 'PATCH', `/tools/${u1.id}/asignacion`, { assigned_to_technician_id: tec.id })).status).toBe(200)
    const asignadas = (await api(request, 'vendedor', 'GET', `/tools?search=${encodeURIComponent(u1.codigo_unico)}`)).body.data as { id: number }[]
    expect(asignadas.map(t => t.id)).toContain(u1.id)

    // Incidentes: dañada o perdida atribuye el incidente a quien la tenía; una desconocida se rechaza.
    expect((await api(request, 'liderservicios', 'PATCH', `/tools/${u1.id}/estado`, { estado: 'inventado' })).status).toBe(422)
    expect((await api(request, 'tecnico', 'PATCH', `/tools/${u1.id}/estado`, { estado: 'damaged' })).status).toBe(403)
    const dano = await api(request, 'liderservicios', 'PATCH', `/tools/${u1.id}/estado`, { estado: 'damaged', detalle: 'Se cayó del andamio' })
    expect(dano.status, JSON.stringify(dano.body).slice(0, 200)).toBe(200)
    expect(dano.body.estado).toBe('damaged')
    expect(dano.body.responsable_incidente, 'el daño se atribuye a quien la tenía asignada').toBe(tec.nombre)
    const perdida = await api(request, 'liderservicios', 'PATCH', `/tools/${u2.id}/estado`, { estado: 'lost' })
    expect(perdida.status).toBe(200)
    expect(perdida.body.responsable_incidente, 'sin asignar al momento del incidente').toContain('Sin asignar')
    const desgaste = await api(request, 'liderservicios', 'PATCH', `/tools/${u2.id}/estado`, { estado: 'worn' })
    expect(desgaste.body.responsable_incidente, 'el desgaste nunca atribuye responsable').toBeNull()
    const arreglada = await api(request, 'liderservicios', 'PATCH', `/tools/${u1.id}/estado`, { estado: 'good' })
    expect(arreglada.status, 'una dañada puede volver a buen estado').toBe(200)
    expect(arreglada.body.responsable_incidente, 'y deja de tener responsable').toBeNull()

    // Kardex de herramientas: solo líder de servicios y Gerencia.
    for (const rol of ['vendedor', 'tecnico', 'tecnicogarantias'] as const) expect((await api(request, rol, 'GET', '/tools/movements')).status, `${rol} no ve el Kardex de herramientas`).toBe(403)
    const kardex = (await api(request, 'liderservicios', 'GET', '/tools/movements')).body.data as { tool?: string; nombre?: string; tipo: string }[]
    expect(kardex.length, 'ingreso, daño y pérdida quedan en el Kardex').toBeGreaterThanOrEqual(3)
    expect((await api(request, 'gerencia', 'GET', '/tools/movements')).status).toBe(200)

    // Reposición de una existente.
    const repo = await api(request, 'liderservicios', 'POST', '/tools/purchase-requests', { tool_id: u2.id, cantidad: 1 })
    expect(repo.status, JSON.stringify(repo.body).slice(0, 160)).toBe(201)
    expect((await api(request, 'liderservicios', 'POST', '/tools/purchase-requests', { tool_id: 99999999, cantidad: 1 })).status).toBe(422)
  })

  test('3. insumos: alta de un producto del catálogo, mínimo y solicitud de compra', async ({ request }) => {
    const productos = data((await llamar(request, tokens, 'vendedor', 'GET', '/ventas-diseno/catalog-products?per_page=50')).body) as { id: number; reference: string }[]
    for (const rol of ['vendedor', 'tecnico', 'gerencia'] as const) {
      expect((await api(request, rol, 'POST', '/insumos', { catalog_product_id: productos[0].id, minimo: 1, cantidad_inicial: 1 })).status, `${rol} no agrega insumos`).toBe(403)
    }
    expect((await api(request, 'liderservicios', 'POST', '/insumos', {})).status).toBe(422)
    expect((await api(request, 'liderservicios', 'POST', '/insumos', { catalog_product_id: 99999999, minimo: 1, cantidad_inicial: 1 })).status, 'producto inexistente').toBe(422)
    expect((await api(request, 'liderservicios', 'POST', '/insumos', { catalog_product_id: productos[0].id, minimo: -1, cantidad_inicial: 1 })).status).toBe(422)

    type Insumo = { id: number; catalog_product_id: number; referencia: string; minimo: number; disponible: number; estado: string; estado_solicitud: string }
    const lista = async () => (await api(request, 'tecnico', 'GET', '/insumos')).body.data as Insumo[]

    // Un producto SIN proveedor no se puede agregar: no habría a quién comprarle.
    await (async () => {
      for (const p of [...productos].reverse()) { // los últimos del demo nunca tienen proveedor
        const r = await api(request, 'liderservicios', 'POST', '/insumos', { catalog_product_id: p.id, minimo: 1, cantidad_inicial: 1 })
        if (r.status === 422 && JSON.stringify(r.body).toLowerCase().includes('proveedor')) return
      }
      throw new Error('ningún producto del catálogo está sin proveedor')
    })()

    // Alta: el primer producto con proveedor que todavía no sea insumo (cada corrida usa uno nuevo mientras haya).
    const antes = await lista()
    const yaEstan = new Set(antes.map(i => i.catalog_product_id))
    let nuevo: Insumo | undefined
    for (const p of productos.filter(x => !yaEstan.has(x.id))) {
      const r = await api(request, 'liderservicios', 'POST', '/insumos', { catalog_product_id: p.id, minimo: 3, cantidad_inicial: 5 })
      if (r.status === 201) { nuevo = r.body as Insumo; break }
    }
    const insumo = nuevo ?? (await lista())[0]
    expect(insumo, 'hay al menos un insumo para recorrer el flujo').toBeTruthy()
    if (nuevo) {
      expect(nuevo.minimo).toBe(3)
      expect(nuevo.estado, 'sin existencias por debajo del mínimo').toBe('bajo_minimo')
      expect(nuevo.estado_solicitud, 'la cantidad inicial queda como solicitud de compra pendiente').toBe('pendiente')
    }
    expect((await api(request, 'liderservicios', 'POST', '/insumos', { catalog_product_id: insumo.catalog_product_id, minimo: 1, cantidad_inicial: 1 })).status, 'un producto ya agregado no se repite').toBe(422)
    expect((await lista()).map(i => i.id), 'lo ve todo el módulo').toContain(insumo.id)
    expect((await api(request, 'vendedor', 'GET', '/insumos')).status).toBe(200)

    // Solicitar compra de más unidades.
    for (const rol of ['vendedor', 'tecnico', 'gerencia'] as const) {
      expect((await api(request, rol, 'POST', `/insumos/${insumo.id}/solicitar`, { cantidad: 2 })).status, `${rol} no solicita`).toBe(403)
    }
    expect((await api(request, 'liderservicios', 'POST', `/insumos/${insumo.id}/solicitar`, { cantidad: 0 })).status).toBe(422)
    expect((await api(request, 'liderservicios', 'POST', '/insumos/99999999/solicitar', { cantidad: 2 })).status).toBe(404)
    const pedido = await api(request, 'liderservicios', 'POST', `/insumos/${insumo.id}/solicitar`, { cantidad: 2 })
    expect(pedido.status, JSON.stringify(pedido.body).slice(0, 200)).toBe(201)
    expect((await lista()).find(i => i.id === insumo.id)?.estado_solicitud).toBe('pendiente')
  })
  test('4. técnicos internos: alta, edición completa, baja, panel del día y SLA', async ({ request }) => {
    const ficha = { nombre: `[FLUJO] Técnico ${STAMP}`, especialidad: 'general', email: `tec.${STAMP}@example.test`, telefono: '6000-0020' }
    for (const rol of ['vendedor', 'tecnico', 'gerencia'] as const) {
      expect((await api(request, rol, 'POST', '/internal-technicians', ficha)).status, `${rol} no da de alta técnicos internos`).toBe(403)
    }
    expect((await api(request, 'liderservicios', 'POST', '/internal-technicians', { ...ficha, especialidad: 'inventada' })).status, 'la especialidad sale del catálogo').toBe(422)
    expect((await api(request, 'liderservicios', 'POST', '/internal-technicians', { ...ficha, nombre: '' })).status).toBe(422)
    const alta = await api(request, 'liderservicios', 'POST', '/internal-technicians', ficha)
    expect(alta.status, JSON.stringify(alta.body).slice(0, 160)).toBe(201)
    expect(['available', 'off'], 'el estado inicial depende de la hora: fuera de jornada es «off»').toContain(alta.body.estado)
    const id = alta.body.id as number

    // La edición es un PUT completo: lo que no se reenvía se pierde.
    const upd = await api(request, 'liderservicios', 'PUT', `/internal-technicians/${id}`, { nombre: `${ficha.nombre} B`, especialidad: 'general' })
    expect(upd.status).toBe(200)
    expect(upd.body.email, 'un PUT sin correo lo borra').toBeNull()
    expect((await api(request, 'tecnico', 'PUT', `/internal-technicians/${id}`, { nombre: 'X', especialidad: 'general' })).status).toBe(403)

    // Panel: estadísticas, agenda y visitas de hoy las ve todo el módulo.
    for (const rol of ['vendedor', 'tecnico', 'liderservicios'] as const) {
      expect((await api(request, rol, 'GET', '/internal-technicians/stats')).status, `${rol} ve las estadísticas`).toBe(200)
      expect((await api(request, rol, 'GET', '/internal-technicians/agenda')).status).toBe(200)
    }
    const visitas = await api(request, 'liderservicios', 'GET', `/internal-technicians/${id}/visitas-hoy`)
    expect(visitas.status).toBe(200)
    const stats = (await api(request, 'liderservicios', 'GET', '/internal-technicians/stats')).body
    expect(stats.total_tecnicos).toBeGreaterThanOrEqual(1)

    // SLA por tipo de ticket: lo lee todo el módulo, solo Gerencia lo cambia.
    const sla = (await api(request, 'vendedor', 'GET', '/internal-technicians/sla-settings')).body.data as Record<string, number>
    expect(Object.keys(sla).sort()).toEqual(['claim', 'installation', 'retrofit', 'warranty'])
    expect((await api(request, 'liderservicios', 'PATCH', '/internal-technicians/sla-settings', { installation: sla.installation })).status, 'el líder de servicios no cambia el SLA').toBe(403)
    expect((await api(request, 'gerencia', 'PATCH', '/internal-technicians/sla-settings', { installation: sla.installation })).status).toBe(200)

    // Baja: desaparece de la lista y no se borra dos veces.
    expect((await api(request, 'tecnico', 'DELETE', `/internal-technicians/${id}`)).status).toBe(403)
    expect((await api(request, 'liderservicios', 'DELETE', `/internal-technicians/${id}`)).status).toBe(204)
    const lista = (await api(request, 'liderservicios', 'GET', '/internal-technicians')).body.data as { id: number }[]
    expect(lista.map(t => t.id)).not.toContain(id)
    expect((await api(request, 'liderservicios', 'DELETE', `/internal-technicians/${id}`)).status).toBe(404)
  })
})
