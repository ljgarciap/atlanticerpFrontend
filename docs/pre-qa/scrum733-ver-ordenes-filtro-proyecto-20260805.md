# Pre-QA — SCRUM-733: Ver Órdenes, filtro de Proyecto no encontraba proyectos sin cotización aprobada

**Fecha:** 2026-08-05
**Commits en `dev`:** backend `5903630`, frontend `7e38408`
**Resultado: PASADA LIMPIA** (1 vuelta) — transiciona a `QA`

## Contexto
Mismo gap gemelo de SCRUM-214 (Logística): `OrdersPage.tsx` (Ver Órdenes) usaba
`approvedProjects.search()` (`QuoteListService::searchApprovedProjects()`, gateado por
`documentStatus()==='approved'`), invisible para cualquier proyecto sin cotización aprobada
vigente. El fix migra Ver Órdenes al mismo endpoint `shipment-projects` que ya usa Logística,
pero agrega un query param `active_shipments` (default `false`) para diferenciar los dos
comportamientos: Logística sigue acotando a envíos "en movimiento" (excluye Por aprobar/Pendiente
por liquidar, REQ-151), Ver Órdenes no filtra por status en absoluto — porque esa pantalla lista
órdenes en cualquier estado.

## Qué se intentó romper

| # | Escenario | Resultado |
|---|---|---|
| 1 | Camino feliz — proyecto con orden "Ordenado" aparece en el filtro y filtra la tabla | OK |
| 2 | **Camino de ruptura (foco del ticket)** — proyecto cuya única orden está "Por aprobar" (sin cotización aprobada) aparece en el filtro de Ver Órdenes | OK — aparece y filtra correctamente |
| 3 | Regresión Logística — el mismo proyecto "Por aprobar" sigue **sin** aparecer en el filtro de Logística | OK — sigue excluido, sin regresión |
| 4 | Búsqueda vacía en el input de proyecto | OK — el query ni se dispara (`enabled: projectSearch.length > 0`) |
| 5 | Búsqueda con solo espacios (`"   "`) | Ver hallazgo MEDIO abajo — no bloqueante |
| 6 | Búsqueda con string que no matchea nada | OK — dropdown vacío, sin crash |
| 7 | Combinación Proyecto + Estado en AND (proyecto "Por aprobar" + status "Ordenado" → 0 filas; + status "Por aprobar" → 1 fila) | OK — combina en AND real |
| 8 | Confirmación de querystring real (no solo lectura de código) — interceptado con `page.on('request')` | OK — `active_shipments` ausente en Ver Órdenes, `active_shipments=true` en Logística |
| 9 | Rol sin `compras.read` (`designer@illuminations.test`) contra `GET /api/compras/orders/shipment-projects` | OK — 403, igual que antes del fix |
| 10 | Tests automatizados — backend (`infra/test.sh --filter=PurchaseOrderLogisticsTest`), frontend (`OrdersPage.test.tsx`, `LogisticsPage.test.tsx`), PHPStan Level 8 | 26/26, 20/20, sin errores |

## Hallazgo — MEDIO, no bloqueante

**Búsqueda de solo espacios en blanco (`"   "`) en el filtro de Proyecto devuelve hasta 10
proyectos sin relación con lo tecleado, en vez de ningún resultado.**

Reproducido directo contra el backend (curl autenticado, `lider_compras`):
```
GET /api/compras/orders/shipment-projects?search=%20%20%20   → 8 resultados (todos los proyectos con línea de orden)
GET /api/compras/orders/shipment-projects                    → 8 resultados (mismo comportamiento sin `search`)
```
Causa: `$search = trim((string) $request->query('search', ''))` en
`PurchaseOrderController::searchShipmentProjects()` — un valor de solo espacios se normaliza a
`''`, que cae en la misma rama que "sin búsqueda", devolviendo hasta 10 proyectos sin ningún
filtro de texto. El frontend dispara el query igual (`enabled: projectSearch.length > 0`, y
`"   ".length === 3`), así que el usuario ve una lista de proyectos que no tienen ninguna relación
aparente con lo que escribió.

**No es una regresión de SCRUM-733** — la línea de `trim()` no fue tocada por este commit, el
mismo comportamiento ya existía en Logística desde SCRUM-214 (mismo endpoint, mismo código). No
bloquea ningún criterio de aceptación del ticket (ninguno de los dos pide manejo especial de
whitespace) y no es un fallo de seguridad ni de datos — es una superficie de UX menor, cosmética.
Documentado para que quede registrado y no se pierda, pero **no bloquea el paso a QA** de
SCRUM-733 según el propio criterio del ticket. Queda como candidato a un ticket chico aparte si
Luis/PM lo priorizan (afecta también a Logística, no es exclusivo de Ver Órdenes).

## Lo que sí funciona
- Filtro de Proyecto de Ver Órdenes encuentra proyectos en cualquier estado de orden, incluyendo
  "Por aprobar" (el gap original del ticket).
- Logística sigue acotada a envíos activos — sin regresión, mismo test dedicado en verde
  (`test_shipment_projects_excluye_proyecto_de_orden_no_activa_con_active_shipments`).
- El parámetro `active_shipments` viaja de verdad en la querystring — confirmado con
  interceptación de red real, no solo lectura de código.
- Combinación de filtros (Proyecto + Estado) funciona en AND real, no OR ni "el último filtro
  gana".
- Endpoint sigue protegido por `permission:compras.read` — un rol sin el permiso (`designer`)
  recibe 403 igual que antes del fix.
- Suite completa de backend (26/26), frontend (20/20) y PHPStan Level 8 sin errores.

## Test permanente
Se agregó `atlanticerp-frontend/e2e/preqa-scrum733-ver-ordenes-filtro-proyecto-20260805.spec.ts` (7
tests) como test permanente — no se descarta al cerrar el ticket, ya que cubre exactamente el tipo
de gate (filtro de proyecto por cotización aprobada vs. shipment-projects) que ya se rompió dos
veces (SCRUM-214 y este ticket gemelo).
