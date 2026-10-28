import { describe, expect, it } from 'vitest'
import { GERENCIA_SCOPE_PERMISSION, GUARD, hasAnyPermission } from '@/lib/accessGuards'
import { IDENTITIES, type SeedIdentity } from '@/test/identities'

/**
 * Fase 1b — test de equivalencia: las guardas por PERMISO (`GUARD`) deciden igual que las reglas por NOMBRE DE ROL que
 * reemplazan, para cada identidad del seed con sus permisos efectivos REALES (`effectivePermissionsV2()` del backend,
 * fixture `src/test/fixtures/identity-permissions.json`) más una identidad con el alcance de Gerencia por persona.
 *
 * Las reglas `LEGACY_*` están CONGELADAS tal como estaban en `App.tsx`/`Sidebar.tsx` antes de la 1b. No se tocan: son la
 * referencia «antes».
 */
const MANAGEMENT_OR_SUPER = (role: string) => role === 'management' || role === 'superadmin'
const legacyScope = (i: SeedIdentity) => MANAGEMENT_OR_SUPER(i.role) || i.permissions.includes(GERENCIA_SCOPE_PERMISSION)

const LEGACY: Record<keyof typeof GUARD, (i: SeedIdentity) => boolean> = {
  ADMIN_CONTAB: i => ['superadmin', 'lider_admin_contab', 'asistente_administrativa', 'lider_operaciones', 'management'].includes(i.role),
  GERENCIA: i => MANAGEMENT_OR_SUPER(i.role),
  GERENCIA_O_ALCANCE: legacyScope,
  PEDIDOS: i => ['lider_compras', 'management', 'superadmin'].includes(i.role) || i.permissions.includes(GERENCIA_SCOPE_PERMISSION),
  SUPERADMIN: i => i.role === 'superadmin',
  TOOL_KARDEX: i => ['lider_servicios', 'management', 'superadmin'].includes(i.role),
}

/** Persona con el alcance de Gerencia por persona (SCRUM-1150): un vendedor real + el permiso individual. */
const vendedor = IDENTITIES.find(i => i.role === 'vendedor')!
const WITH_SCOPE: SeedIdentity = { email: 'alcance@test.com', role: 'vendedor', permissions: [...vendedor.permissions, GERENCIA_SCOPE_PERMISSION] }
const ALL: SeedIdentity[] = [...IDENTITIES, WITH_SCOPE]

/**
 * Divergencias ESPERADAS (`guarda@email`): usuarios cuyo ROL no concuerda con sus PERMISOS efectivos. El permiso es lo que el
 * backend ya aplica (ya no tiene ningún `role:`), así que la regla nueva alinea la pantalla con la API en vez de mostrar un menú
 * que la API rechaza. Cualquier otra diferencia hace fallar el test.
 */
const EXPECTED_DIVERGENCES = new Set([
  // Gerencia con el nivel de seguridad restringido: sin `platform.management` el backend ya le da 403 (antes la pantalla se lo mostraba).
  'ADMIN_CONTAB@gerencia5@test.com', 'GERENCIA@gerencia5@test.com', 'GERENCIA_O_ALCANCE@gerencia5@test.com',
  'PEDIDOS@gerencia5@test.com', 'TOOL_KARDEX@gerencia5@test.com',
  // Usuarios demo con `records.manage` o `superadmin.all` concedidos sin tener el rol correspondiente.
  'ADMIN_CONTAB@nivel1@atlantic.test', 'SUPERADMIN@management@atlantic.test', 'SUPERADMIN@gerencia@atlantic.test',
  // nivel8@atlantic.test: rol `management` pero nivel 8 (sin `platform.management`): un demo con rol y permisos que no concuerdan.
  'ADMIN_CONTAB@nivel8@atlantic.test', 'GERENCIA@nivel8@atlantic.test', 'GERENCIA_O_ALCANCE@nivel8@atlantic.test', 'PEDIDOS@nivel8@atlantic.test', 'TOOL_KARDEX@nivel8@atlantic.test',
])

describe('GUARD por permiso ≡ regla legada por rol (Fase 1b)', () => {
  it('hay identidades reales y la de alcance por persona', () => {
    expect(IDENTITIES.length).toBeGreaterThanOrEqual(14)
    expect(new Set(IDENTITIES.map(i => i.role)).size).toBeGreaterThanOrEqual(13)
  })

  it.each(Object.keys(GUARD) as (keyof typeof GUARD)[])('%s: mismas decisiones salvo las divergencias esperadas', guard => {
    const diffs = ALL
      .filter(i => LEGACY[guard](i) !== hasAnyPermission(i.permissions, GUARD[guard]))
      .map(i => `${guard}@${i.email}`)
    const unexpected = diffs.filter(d => !EXPECTED_DIVERGENCES.has(d))
    expect(unexpected, `divergencias no previstas: ${unexpected.join(', ')}`).toEqual([])
  })

  it('cada divergencia esperada sigue ocurriendo (si no, quitarla de la lista)', () => {
    const real = new Set(
      (Object.keys(GUARD) as (keyof typeof GUARD)[]).flatMap(g =>
        ALL.filter(i => LEGACY[g](i) !== hasAnyPermission(i.permissions, GUARD[g])).map(i => `${g}@${i.email}`)),
    )
    expect([...EXPECTED_DIVERGENCES].filter(d => !real.has(d))).toEqual([])
  })

  it('el alcance por persona abre Dashboard CRM y Pedidos, y solo eso (nunca Seguridad ni Admin & Contab)', () => {
    expect(hasAnyPermission(WITH_SCOPE.permissions, GUARD.GERENCIA_O_ALCANCE)).toBe(true)
    expect(hasAnyPermission(WITH_SCOPE.permissions, GUARD.PEDIDOS)).toBe(true)
    expect(hasAnyPermission(WITH_SCOPE.permissions, GUARD.GERENCIA)).toBe(false)
    expect(hasAnyPermission(WITH_SCOPE.permissions, GUARD.ADMIN_CONTAB)).toBe(false)
  })

  it('cada permiso de GUARD existe en el JWT de al menos una identidad (no hay guardas imposibles de cumplir)', () => {
    for (const [name, required] of Object.entries(GUARD)) {
      if (name === 'SUPERADMIN') continue
      expect(IDENTITIES.some(i => required.some(p => i.permissions.includes(p))), `${name}: nadie lo tiene`).toBe(true)
    }
  })
})

describe('Sidebar: «Servicios limitado» por permiso ≡ por rol vendedor', () => {
  it('para toda identidad con acceso a Servicios', () => {
    const conServicios = ALL.filter(i => i.permissions.some(p => p.startsWith('servicios.')))
    const dif = conServicios
      .filter(i => (i.role === 'vendedor') !== !hasAnyPermission(i.permissions, ['servicios.external_technicians.view']))
      .map(i => i.email)
    // gerencia5 (nivel restringido) y nivel8@ (sin rol): su permiso real no incluye el directorio de externos.
    expect(dif.sort()).toEqual(['gerencia5@test.com', 'nivel8@atlantic.test'])
  })
})

/**
 * Capacidades que antes se decidían por rol en componentes/páginas sueltas (helpers `canX(role)`), con su roster legado congelado.
 * `GUARD` solo cubre las guardas de ruta; esto cubre el resto de la 1b.
 */
const R = (...roles: string[]) => (i: SeedIdentity) => roles.includes(i.role)
const CAPABILITIES: Record<string, { permission: string; legacy: (i: SeedIdentity) => boolean }> = {
  'servicios.tickets.manage (agendar/estado, herramientas, insumos, alta de técnico interno)': { permission: 'servicios.tickets.manage', legacy: R('lider_servicios', 'superadmin') },
  'servicios.tickets.create': { permission: 'servicios.tickets.create', legacy: R('lider_servicios', 'superadmin', 'management', 'vendedor') },
  'servicios.field_ops.admin (técnicos externos, captura de comisión)': { permission: 'servicios.field_ops.admin', legacy: R('lider_servicios', 'management', 'superadmin') },
  'servicios.settings.configure (ajustes, meta del mes, SLA)': { permission: 'servicios.settings.configure', legacy: R('management', 'superadmin') },
  'servicios.claim_sheets.manage (plantilla en blanco)': { permission: 'servicios.claim_sheets.manage', legacy: R('superadmin', 'lider_servicios', 'tecnico') },
  'admin_contab.operations.manage (arqueo del día, subir cuenta de cobro)': { permission: 'admin_contab.operations.manage', legacy: R('superadmin', 'lider_admin_contab', 'asistente_administrativa', 'lider_operaciones') },
  'admin_contab.records.manage (historial de arqueo, gestionar comisiones externas)': { permission: 'admin_contab.records.manage', legacy: R('superadmin', 'lider_admin_contab', 'asistente_administrativa', 'lider_operaciones', 'management') },
  'admin_contab.oversight.manage (tarjeta de comisión de Reportes)': { permission: 'admin_contab.oversight.manage', legacy: R('superadmin', 'lider_admin_contab', 'management') },
  'ventas_diseno.orders.access (enlace a Pedidos)': { permission: 'ventas_diseno.orders.access', legacy: R('lider_compras', 'management', 'superadmin') },
  'servicios.tools.kardex.view': { permission: 'servicios.tools.kardex.view', legacy: R('lider_servicios', 'management', 'superadmin') },
}

/** Divergencias esperadas `permiso@email`: usuarios cuyo rol no concuerda con su permiso efectivo (el permiso es lo que aplica el backend). */
const EXPECTED_CAPABILITY_DIVERGENCES = new Set<string>([
  // gerencia5: Gerencia con nivel de seguridad restringido (el backend ya le da 403). `*@atlantic.test`: usuarios demo con permisos que no
  // concuerdan con su rol (p. ej. `superadmin.all` o un nivel recortado).
  'admin_contab.operations.manage@gerencia@atlantic.test',
  'admin_contab.operations.manage@management@atlantic.test',
  'admin_contab.operations.manage@nivel1@atlantic.test',
  'admin_contab.oversight.manage@gerencia5@test.com',
  'admin_contab.records.manage@gerencia5@test.com',
  'admin_contab.records.manage@nivel1@atlantic.test',
  'servicios.claim_sheets.manage@gerencia@atlantic.test',
  'servicios.claim_sheets.manage@management@atlantic.test',
  'servicios.claim_sheets.manage@nivel5@atlantic.test',
  'servicios.field_ops.admin@gerencia5@test.com',
  'servicios.settings.configure@gerencia5@test.com',
  'servicios.tickets.create@vendedor@atlantic.test',
  'servicios.tickets.create@gerencia5@test.com',
  'servicios.tickets.manage@gerencia@atlantic.test',
  'servicios.tickets.manage@management@atlantic.test',
  'servicios.tools.kardex.view@gerencia5@test.com',
  'ventas_diseno.orders.access@gerencia5@test.com',
  'admin_contab.oversight.manage@nivel8@atlantic.test', 'admin_contab.records.manage@nivel8@atlantic.test', 'servicios.field_ops.admin@nivel8@atlantic.test',
  'servicios.settings.configure@nivel8@atlantic.test', 'servicios.tickets.create@nivel8@atlantic.test', 'servicios.tools.kardex.view@nivel8@atlantic.test',
  'ventas_diseno.orders.access@nivel8@atlantic.test',
])

describe('Capacidades por permiso ≡ roster legado por rol (helpers sueltos de la 1b)', () => {
  const diffs = () => Object.values(CAPABILITIES).flatMap(c =>
    ALL.filter(i => c.legacy(i) !== hasAnyPermission(i.permissions, [c.permission])).map(i => `${c.permission}@${i.email}`))

  it('sin divergencias no previstas', () => {
    const unexpected = diffs().filter(d => !EXPECTED_CAPABILITY_DIVERGENCES.has(d))
    expect(unexpected).toEqual([])
  })

  it('cada divergencia esperada sigue ocurriendo', () => {
    const real = new Set(diffs())
    expect([...EXPECTED_CAPABILITY_DIVERGENCES].filter(d => !real.has(d))).toEqual([])
  })
})
