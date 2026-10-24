# Pre-QA — SCRUM-818 (rebote, 2026-09-03)

Rebote de Gerencia Test sobre "Comparación de Referencias" (módulo Sustitutos, Compras). El
ticket llegó con capturas y una reproducción real en `dev.atlanticerp.ai` — el enfoque de esta pasada
fue el comentario más reciente de Daniela (2026-09-03), foco explícito de Luis.

## Causa raíz (una sola, cinco síntomas)

El proyecto tiene **dos sistemas de permisos coexistiendo**:

- **v1** (`User::hasPermission()` / `effectivePermissions()`) — lectura directa de
  `security_levels.permissions ∪ extra_permissions`. Nunca se le cargó `compras.read`/
  `compras.sustitutos.manage`/`gerencia.view` a Gerencia ni a Compras — ni por seeder ni por grant
  manual, para ningún tenant.
- **v2** (`RoleModuleVisibility` + `SecurityLevelModulePermission`, lo que arma el claim
  `permissions` del JWT vía `effectivePermissionsV2()`) — SÍ tiene el acceso real, cargado por rol
  desde la UI de administración de roles. Confirmado contra `dev.atlanticerp.ai`: `management` tiene
  `can_view=FULL` en `compras`+`gerencia`, `lider_compras` tiene `can_view=FULL` en `compras`.

`ReplacementRequestController` y `QuoteListService::hasFullComprasAccess()` seguían llamando a
`$user->hasPermission()` (v1) en vez de leer el claim `permissions` del JWT (v2) — el mismo patrón
que `InventoryController`/`CatalogProductSearchController` ya usan correctamente en otras partes
de Compras. Con datos reales de `dev.atlanticerp.ai` (David, Mark — Gerencia; Yirena — Líder de Compras)
verificados por SQL directo: ninguno tiene el string v1, los tres SÍ tienen el acceso v2 — la
brecha entre ambos sistemas es exactamente la superficie del bug, no una casualidad de estos 3
usuarios puntuales.

## Los 5 hallazgos de Daniela → el fix concreto de cada uno

| # | Síntoma reportado | Causa | Fix |
|---|---|---|---|
| 1 | Gerencia no ve solicitudes "Pendiente Gerencia" pese a que existen | `index()`/`canDecide()` en v1 | Lee `permissions` del JWT (v2); agrega `gerencia.view` como acceso completo válido, no solo `superadmin.all` |
| 2 | El picker "Proyecto de venta" no encuentra el proyecto al generar una solicitud | `QuoteListService::hasFullComprasAccess()` en v1, sin `gerencia.view` siquiera contemplado en v1 tampoco | Mismo fix — v2 + `gerencia.view` agregado |
| 3 | Compras no ve "Generar orden" en una solicitud Rechazada | El botón se mostraba con una condición de UI (`status==='rechazada' && generated_order_id===null`) que no reflejaba el rol real ni si ya se generó desde otra sesión | Nuevo campo `can_generate_order` calculado 100% server-side (superadmin.all o `role.key===lider_compras`, nunca ya generada) — el frontend solo lo pinta, no decide |
| 4 | Proyectos en etapa "Cotización" (folio ya asignado, aún sin pasar a Propuesta) no aparecían en el picker filtrado por producto | El picker de Nueva Orden y el nuevo picker de Sustitutos compartían el mismo filtro estricto `documentStatus==='approved'` | Se separa: Nueva Orden mantiene el filtro estricto (REQ-133, deliberado); el picker filtrado por producto (`catalogProductId!==null`) solo excluye `'draft'` |
| 5 | El % de margen mostrado no coincidía con el real (o quedaba en blanco para Vendedor/Diseñador) | Se recalculaba en el frontend con `(price_full-cost)/price_full`, una fórmula simplificada, y `cost` nunca viaja para roles sin acceso a costo | Backend expone `margin_percent` (fórmula real, `CatalogProduct::marginPercent()`, sobre Costo Total) en los 3 endpoints que alimentan el picker de sustitutos; el frontend deja de recalcular |

## Corrido en LOCAL contra `http://localhost:8090`, no `dev.atlanticerp.ai`

Cuentas **reales**, no `*.test` — para reproducir exactamente la cuenta que reportó el bug:
`gerencia3@test.com` (Mark, Gerencia), `lidercompras@test.com` (Yirena, Líder
de Compras), `designer@atlantic.test` (Vendedor, control negativo). Datos sembrados vía
tinker: `RoleModuleVisibility` real para `management`→`compras`/`gerencia` y
`lider_compras`→`compras` (v2, **sin tocar `extra_permissions` v1** — para reproducir el estado
real, no un estado ya parcheado a mano); 1 producto original + 1 sustituto; 1 `SalesProject` en
etapa "Cotización" con folio real y una línea de cotización que referencia el producto original
(para que el picker filtrado lo encuentre); 1 `PipelineCard` con `owner_id` del Vendedor (para que
`ownedSalesProjectIds()` lo scopee correctamente); 1 solicitud Pendiente Gerencia; 2 solicitudes
Rechazadas (una "global" sin proyecto, otra atada al proyecto del Vendedor).

## Escenarios verificados en navegador real (Playwright, 4/4 en verde)

`e2e/preqa-scrum818-permisos-sustitutos-20260903.spec.ts`

| Escenario | Resultado |
|---|---|
| Hallazgo 1 — Mark ve la solicitud Pendiente Gerencia y el botón Aprobar | Antes: lista vacía. Después: visible, botón presente |
| Hallazgo 2 — Mark, al generar una solicitud, encuentra su proyecto en el picker filtrado por producto | Antes: "No existe ningún proyecto que contenga este producto" pese a existir. Después: el proyecto aparece, seleccionable, botón "Generar solicitud" del modal queda habilitado |
| Hallazgo 3 — Yirena ve la lista y el botón "Generar orden" en la Rechazada | Antes: lista vacía (mismo síntoma que Mark). Después: visible |
| Hallazgo 3(b) — control negativo: un Vendedor ve su propia solicitud Rechazada (scopeada a su proyecto) pero NUNCA el botón "Generar orden" | `can_generate_order=false` para su rol — botón ausente, aunque la fila sí sea visible |

## Cobertura de tests (no solo el check en vivo)

- **Backend**: 7 tests nuevos que reproducen el escenario real (acceso solo por rol v2, sin grant
  v1 manual) — `ApprovedProjectControllerTest` (3, incluye el caso de etapa Cotización),
  `ReplacementRequestControllerTest` (4, incluye los 3 casos de `can_generate_order`). 2
  assertions nuevas en `CatalogProductSearchControllerTest` para `margin_percent`. Suite completa
  **3007/3007**, PHPStan Level 8 limpio.
- **Frontend**: 3 tests nuevos en `ReplacementRequestsPage.test.tsx` (margen del backend nunca
  recalculado; gating de "Generar orden" por `can_generate_order` en ambos sentidos). `tsc --noEmit`
  limpio. Suite completa **1721/1721**.

## Nota de diseño — por qué `can_generate_order` es server-side y no una condición de UI

`generateOrder()` en el backend ya exigía `superadmin.all` o `role.key===lider_compras` — la UI
nunca reflejaba esa regla real, solo `status==='rechazada' && generated_order_id===null` (visible
para cualquiera que viera la fila). El fix no cambia la regla de autorización real (ya era
correcta), cierra la brecha entre lo que el botón mostraba y lo que el backend en verdad permitía
— mismo patrón que el resto de la sesión: nunca reimplementar una regla de negocio en el
frontend, siempre reflejar lo que el backend ya decidió.
