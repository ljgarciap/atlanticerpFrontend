# Pre-QA — RE-CHECK FINAL — Epic CRM Batch A: SCRUM-673/674/675/676 (2026-07-31)

Tercera pasada del día sobre el mismo batch. Ver `scrum673-676-crm-batcha-20260731.md` (pasada 1,
hallazgo CRÍTICO RN5/RN6) para el detalle original — este documento cubre solo el re-check
completo tras los dos fixes aplicados hoy:

1. **Fix 1** (post-pasada 1): `Sidebar.tsx` — `isGerencia = user?.role === 'management'`,
   `canSeePedidosTab` excluyendo `lider_admin_contab`/`asistente_administrativa`; `App.tsx` —
   `/crm/dashboard` envuelto en `RequireRole roles={['management']}`.
2. **Fix 2** (post-pasada 2, estática/worktree-isolated, no pudo ejecutar en vivo): el gate del
   Fix 1 no incluía `'superadmin'`, a diferencia del precedente ya establecido en
   `/security/departments` (`roles={['superadmin', 'management']}`) y del modelo documentado
   "`superadmin.all` bypassa todo" — habría bloqueado a Luis/Andres/Luis J de su propia pantalla.
   `isGerencia = user?.role === 'management' || user?.role === 'superadmin'` en `Sidebar.tsx`,
   `roles={['management', 'superadmin']}` en `App.tsx`.

Esta pasada corre el checklist COMPLETO desde cero, en vivo, no solo el delta de los dos fixes —
un cambio a `Sidebar.tsx`/`App.tsx` puede en principio regresar algo que ya pasaba en la pasada 1
(RN1-4, cross-nav, mobile drawer, sidebar colapsado, composición vs. mockup).

**Entorno**: Docker local (`localhost:8090` backend, ya corriendo — 5 contenedores up 3 días),
`localhost:5173` frontend levantado para esta sesión vía `npm run dev`. Usuarios reales del roster
(`memory/project_roster_usuarios_reales_atlanticerp.md`), password = email. Working tree con los cambios
uncommitted de Batch A intactos (branch `dev`, sin worktree isolation — corrido directamente sobre
el checkout real para poder ejecutar contra las ediciones sin commitear).

## Verificación técnica

- `npx tsc --noEmit` — limpio, 0 errores.
- `npx vitest run` — **725/725** tests, 74/74 archivos, verde (sube de 720/720 en la pasada 1 por
  el nuevo test de regresión de `Sidebar.test.tsx` para el gate de perfil, incl. el caso
  superadmin).
- `npm run build` — limpio, build exitoso (mismo warning preexistente de chunk size, no
  relacionado).

## Checklist ejecutado en vivo (Playwright CLI, smoke test desechable, borrado al cerrar)

10/10 tests en verde, todos contra la app real corriendo:

### SCRUM-674 (REQ-594) — gate de perfil, los 3 buckets
| Escenario | Resultado |
|---|---|
| `management` (Daniela) ve "Dashboard CRM" en sidebar y navega correctamente a `/crm/dashboard` | PASA |
| `superadmin` (Luis) ve "Dashboard CRM" en sidebar Y llega por URL directa a `/crm/dashboard` (el gap específico de la pasada 2) | PASA — confirmado que ya NO queda bloqueado de su propia pantalla |
| `vendedor_disenador` (Neil) NO ve "Dashboard CRM" en sidebar Y URL directa a `/crm/dashboard` lo redirige fuera | PASA |
| `lider_admin_contab` (Felix) — no expone "Pedidos" | PASA, pero **no ejercita RN6 de forma concluyente**: Felix sigue sin ningún acceso a Ventas & Diseño en absoluto (gap preexistente, documentado en la pasada 1, no de este batch) — el grupo entero está ausente, así que "Pedidos no aparece" es trivialmente cierto por el gate de módulo, no por la exclusión de perfil que RN6 pide probar. Sigue sin poder reproducirse end-to-end hasta que Felix/Yaneth tengan `ventas_diseno.read` — decisión de negocio aparte, ya notificada a PM en la pasada 1. |

### SCRUM-673 (REQ-593) — Pipeline/Clientes zero behavior change
| Escenario | Resultado |
|---|---|
| Pipeline vía módulo CRM, URL `/ventas-diseno/pipeline` sin cambios, 4 etapas visibles (Lead/Diseño/Cotización/Propuesta) | PASA |
| Clientes vía módulo CRM, URL `/ventas-diseno/clients` sin cambios, botón "Crear cliente" presente | PASA |
| Usuario sin `ventas_diseno.read` (Esteban, `lider_bodega`): grupo CRM ausente del sidebar Y `/crm/dashboard` por URL directa redirige fuera | PASA — sin regresión introducida por los 2 fixes de perfil |

### REQ-596 — navegación real, mobile drawer, sidebar colapsado
| Escenario | Resultado |
|---|---|
| Sidebar colapsado (estado inicial real de cualquier browser nuevo, SCRUM-711) — "Dashboard CRM" accesible como botón con tooltip/título, Gerencia (Daniela) | PASA |
| Drawer móvil (390×844) — grupo CRM completo con labels de texto (Dashboard CRM, Pipeline, Clientes) | PASA |

### Otros grupos del sidebar — sin regresión
| Escenario | Resultado |
|---|---|
| Compras · Inventario y Bodega siguen presentes para Daniela (Gerencia) | PASA |

**Nota técnica de implementación descubierta en esta pasada** (no es un hallazgo, es una
corrección de mi propio script de prueba): los ítems del sidebar se renderizan como `<button>`
(`onClick` + `navigate()` programático), no como `<a href>` — accesible como `role="button"`, no
`role="link"`. La primera iteración de este re-check falló por usar `getByRole('link', ...)`
asumiendo anchors; una vez corregido a `getByRole('button', ...)` los 10 escenarios pasan. Patrón
consistente en TODO el sidebar (Pipeline, Clientes, Compras, Bodega, etc.), no es específico de
este batch — dejar registrado para que futuros specs de Pre-QA en este árbol usen `button`, no
`link`, al apuntar a ítems de sidebar.

## Lo que NO se re-verificó en esta pasada (sin cambio de código, ya cerrado en pasada 1)

- **SCRUM-675 (REQ-595)** cross-navigation — verificado por lectura estática en la pasada 1 (nota
  no bloqueante: sin datos sembrados para click real end-to-end). Ninguno de los 2 fixes de hoy
  tocó los sitios de `navigate()` de Reportes/Cotización/Inicio/Pipeline — no hay razón para
  esperar regresión, no se volvió a ejercitar clic a clic.
- **SCRUM-676 (REQ-596)** — el punto real de intersección con el hallazgo crítico (RN1: usuario
  sin perfil Gerencia no debe poder llegar a Dashboard CRM haciendo clic en "CRM") queda cubierto
  por el checklist de arriba (Neil no ve ni puede navegar a Dashboard CRM). El resto de REQ-596
  (arquitectura de acordeón vs. mockup de subtabs) no cambió — ya clasificado ACEPTABLE en la
  pasada 1, sin código nuevo que lo afecte.

## Resultado final

**PASS — batch limpio, listo para Dev Testing y push a `dev`.**

Los dos hallazgos de las pasadas 1 y 2 (gate de perfil ausente; gate de perfil sin bypass
superadmin) están corregidos y verificados en vivo, sin evidencia de regresión en el resto del
checklist original. Único punto que sigue sin poder ejercitarse end-to-end es RN6 con Felix/Yaneth
directamente — no es un bloqueante de código, es la falta preexistente de acceso base a Ventas &
Diseño para esos dos perfiles, ya notificada a PM en la pasada 1 como decisión de negocio pendiente
(fuera del alcance de este batch).

Recomendación: SCRUM-673/674/675/676 pueden pasar a `Dev Testing` y promoverse a `dev` según el
protocolo — el gap de Felix/Yaneth debe quedar registrado como pendiente de decisión de
Arquitecto/PM sobre el mecanismo de grant (rol vs. `SpecialPermissionSeeder`), no como blocker de
este batch.
