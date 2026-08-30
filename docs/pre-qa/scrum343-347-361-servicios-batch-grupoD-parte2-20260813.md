# Visual Review + Pre-QA fusionados — Fase 4 Servicios, Grupo D parte 2 "Reserva Servicios de Insumos + Kardex de herramientas"

**Fecha:** 2026-08-13
**Tickets:** SCRUM-343 (REQ-273, Listado de Insumos), SCRUM-344 (REQ-274, Solicitud de compra),
SCRUM-345 (REQ-275, Agregar insumo nuevo), SCRUM-346 (REQ-276, Kardex de herramientas), SCRUM-347
(REQ-277, Sincronización con Bodega), SCRUM-361 (REQ-291, Modelo de inventario compartido —
arquitectura, sin historia de usuario propia)

## Veredicto: PASA LIMPIO tras 1 hallazgo CRÍTICO real corregido en el mismo dispatch

Corrido contra el stack local compartido (`nginx :8090`, `vite :5173`), NO `dev.atlanticerp.ai` — código
mergeado a `dev` en ambos repos, todavía sin push. Suite Playwright permanente agregada:
`atlanticerp-frontend/e2e/preqa-scrum343-347-361-servicios-batch-grupoD-parte2-20260813.spec.ts`
(14/14 verde, ver evidencia al final).

## Alcance revisado

- Backend: `InsumoService`, `InsumoController`, `InsumoSetting`/`InsumoPurchaseRequest`,
  `SyncInsumoReservationOnPurchaseOrderReceived` (listener, `PurchaseOrderReceived`),
  `ToolController::movements()`, extensión de `InspectionReportService` para Consumo real (REQ-291
  RN3(c)/RN4), migraciones (`Reserva Servicios` como 8va bodega, `origin_module` en
  `purchase_orders`, `insumo_settings`, `insumo_purchase_requests`, `catalog_product_id` en
  `inspection_report_materials`), rutas en `routes/servicios.php`.
- Frontend: `InsumosPanel`/`InsumoTable`/`InsumoCreateModal`/`InsumoRequestModal`,
  `ToolKardexPage`, wiring en `ToolsAndSuppliesPage`, gate de ruta en `App.tsx`, contrato en
  `serviciosApi.ts`/`types/servicios.ts`.

## 🔴 CRÍTICO — encontrado y corregido en esta sesión

**REQ-274 RN3 ("la orden generada en Compras debe quedar marcada con Origen: Servicios, para
diferenciarla de solicitudes que vienen de Ventas & Diseño u otras áreas") y el Acceptance
Criteria Escenario 1 ("visible en Compras con Origen: Servicios") no se cumplían pese a que el
dato ya existía en BD.**

`InsumoService::requestPurchase()` ya guardaba `purchase_orders.origin_module = 'servicios'`
correctamente desde el primer commit del batch (`adc8e17`) — pero
`PurchaseOrderController::formatSummary()`/`formatDetail()` (Compras, módulo preexistente) nunca
lo incluían en la respuesta JSON de `GET /api/compras/orders` ni `GET /api/compras/orders/{id}`, y
ni la tabla "Ver Órdenes" (`OrdersPage.tsx`) ni el detalle (`OrderDetailPage.tsx`) lo pintaban en
ningún lado — tampoco vía el campo `notes` (que sí lo describe en texto: "Solicitud de Reserva
Servicios — …"), porque `notes` tampoco se renderiza en esas pantallas. Confirmado en vivo:
Yirena (`gerencia2@illuminations.com.pa`, `lider_compras`) no tenía NINGUNA forma de distinguir
una orden de Servicios del resto — ni badge, ni columna, ni tooltip.

**Fix aplicado (mismo dispatch):**
- Backend — `PurchaseOrderController::formatSummary()` ahora expone `origin_module` (heredado
  automáticamente por `formatDetail()`, que compone sobre `formatSummary()`).
  `app/Modules/Compras/Http/Controllers/PurchaseOrderController.php`.
- Frontend — nuevo componente `OriginBadge.tsx` (`src/components/compras/OriginBadge.tsx`),
  renderiza "Origen: Servicios" solo cuando `origin_module === 'servicios'` (único origen
  automático hoy); wireado en `OrdersPage.tsx` (columna Proveedor) y `OrderDetailPage.tsx`
  (header, junto al título). i18n agregado en `es/compras.json`/`en/compras.json`
  (`orders.originServicios`).
- Tipos: `PurchaseOrderSummary.origin_module` en `types/compras.ts` (heredado por
  `PurchaseOrderDetail`).
- Tests nuevos: 2 en `OrdersPage.test.tsx`, 2 en `OrderDetailPage.test.tsx` (badge visible/oculto
  según `origin_module`), 1 assertion HTTP nueva en `InsumoReservaTest.php` (backend, verifica el
  campo en la respuesta real de `GET /api/compras/orders/{id}`, no solo en el modelo).
- Verificado en vivo tras el fix: la orden real generada por Aaron aparece con el badge
  "Origen: Servicios" en Ver Órdenes y en el detalle (screenshot `11-orden-recibida.png` del spec
  Playwright, badge visible junto a "Orden #243"/"#244").

Suites re-verificadas tras el fix: backend 2014/2014 + PHPStan limpio; frontend 1172/1172 + tsc
limpio (ver "Verificación propia" abajo).

## Checklist Pre-QA (caminos de ruptura, no solo el camino feliz)

**REQ-273 — Listado + gate de escritura:**
- Insumo con `disponible < mínimo` → "Bajo mínimo"; `disponible ≥ mínimo` → "OK". Verificado en
  vivo con el mismo insumo en ambos estados (antes/después de recibir la orden).
- Botón "Solicitar" visible/habilitado solo para Aaron/Líder de Servicios y superadmin — Carlos
  Vergara (`tecnico_servicios`) no ve ni "+ Agregar insumo" ni "Solicitar" ni "Movimiento de
  herramientas". Ruptura API: `POST /servicios/insumos` como `tecnico_servicios` → 403.

**REQ-274/REQ-277 — Ciclo completo real hasta "Recibido":**
- Solicitar 5 unidades genera una `PurchaseOrder` REAL, visible en Ver Órdenes de Compras con
  Origen: Servicios (tras el fix), en el ciclo de estados real (LightCorp es internacional, 5
  pasos: Pendiente → Ordenado → En tránsito → En aduana → En tránsito local → Recibido — no el de
  3 pasos de un proveedor local).
- Ingreso de Mercancía real + avance a "Recibido" dispara `PurchaseOrderReceived` →
  `SyncInsumoReservationOnPurchaseOrderReceived` → 2 movimientos de Kardex `Reubicación`
  simultáneos (verificado por DB: `warehouse_id=6 (Bodega Central) cantidad=-5`,
  `warehouse_id=13 (Reserva Servicios) cantidad=+5`), en la MISMA transacción que
  `InsumoPurchaseRequest.estado → recibida`.
- Tras "Recibido": disponible pasa de 0→5, `estado_solicitud` vuelve a `null` (botón "Solicitar"
  vuelve a estar disponible, RN4), estado pasa de "Bajo mínimo" a "OK" (mínimo=3 en esta corrida).

**REQ-275 — Alta de insumo (buscador del catálogo real):**
- Buscar un producto inexistente → "Sin resultados. El insumo debe existir primero en el catálogo
  de Compras.", sin ningún input de texto libre para crearlo — verificado también como superadmin
  indirectamente (mismo componente, sin rama de excepción en el código para ningún rol).
- Un insumo ya trackeado desaparece del buscador (`exclude` server-side, confirmado también por
  curl con el mismo formato de query string que usa el frontend real —
  `exclude=<id>,<id>` comma-joined, NO `exclude[]=<id>`, que sí rompe el endpoint con "Array to
  string conversion" si algún consumidor futuro lo llamara así — anotado como nota técnica, no
  hallazgo, porque el frontend real nunca serializa el array de esa forma).
- Ruptura API: alta duplicada del mismo `catalog_product_id` → 422; `catalog_product_id`
  inexistente → 422 (`Rule::exists`).

**REQ-276 — Kardex de herramientas, gate real:**
- Carlos (`tecnico_servicios`) navegando DIRECTO por URL a `/servicios/tools/kardex` es
  redirigido (bloqueo real de `RequireRole` en `App.tsx`, no solo botón oculto). Ruptura API:
  `GET /servicios/tools/movements` como `tecnico_servicios` → 403 (gate ya corregido por Senior
  Review de esta misma sesión, restringido a `superadmin,lider_servicios,management`).
- Daniela (`management`) sí entra, ve los 3 filtros combinables (herramienta/tipo/responsable).
- Decisión de producto ya confirmada con Luis (comentario en SCRUM-346, verificado en Jira): el
  kardex NO tiene columnas de saldo inicial/resultante pese a que RN1 originalmente las pedía —
  cada herramienta es una unidad física con código único propio, sin "saldo" natural. No se marca
  como gap.

**REQ-291 — Modelo de inventario compartido (arquitectura):**
- Bodega ve exactamente el mismo `disponible` en "Reserva Servicios" que Servicios (verificado vía
  `GET /api/bodega/inventory/{id}/warehouse-breakdown` — mismo número, 5, que
  `GET /api/servicios/insumos` — sin duplicación, una sola fuente real).
- Consumo real: completar un Informe de Inspección con un material vinculado a un insumo trackeado
  (cantidad=3) resta 3 del disponible (5→2), genera 1 movimiento `Consumo` real. Guardar el MISMO
  informe una segunda vez (edición, mismos materiales) NO descuenta de nuevo — disponible se
  mantiene en 2, sigue habiendo 1 solo movimiento de Consumo. Verificado en vivo llamando
  `InspectionReportService::save()` dos veces sobre el mismo ticket (mismo código real que ejecuta
  el controller, sin mockear nada) — comportamiento documentado como limitación conocida, no bug
  (ver docblock de `finishUpsert()`), confirmado que efectivamente no duplica.
- Datos de esta verificación revertidos manualmente al terminar (informe de prueba borrado, stock
  y `tickets.inspection_report_status` restaurados) para no dejar residuos en el ticket real #1.

## Nota fuera de alcance (no es hallazgo)

El mockup adjunto (`5C__Servicios_Inventario.html`) trae tarjetas de estadísticas y muestra un
esquema de 5 estados de solicitud (`sin-solicitar → solicitado → ordenado → transito → recibido`)
— el batch anterior (Grupo D parte 1) ya dejó registrado que las tarjetas de stats están fuera de
alcance de estas historias, y el Arquitecto reconcilió el 2026-08-13 que el backend real solo
tiene 2 estados relevantes de cara al usuario (`pendiente`/`null`), no los 4-5 pasos intermedios
del mockup — la UI ya refleja esa reconciliación (`SolicitudBadge`, un solo badge ámbar). No se
marca como gap, es una decisión ya tomada y documentada en el propio código.

## Verificación propia

- PHPStan Level 8 (`--memory-limit=1G`), proyecto completo: 0 errores (antes y después del fix del
  hallazgo).
- PHPUnit backend completo (`infra/test.sh`, sin filtro): 2014/2014, corrido 2 veces (antes del
  hallazgo — 2012/2012 según el commit original — y después, con la assertion nueva de
  `origin_module`). Suite de Compras completa (347 tests) re-verificada tras tocar
  `PurchaseOrderController`.
- `tsc --noEmit` y `vitest run` (frontend completo): limpio, 1172/1172 (1168 del batch +
  4 tests nuevos del fix de `OriginBadge`).
- Playwright E2E real contra el stack local: 14/14 verde
  (`e2e/preqa-scrum343-347-361-servicios-batch-grupoD-parte2-20260813.spec.ts`), incluye 3
  pruebas de ruptura vía API directa (403 esperado) y el flujo completo REQ-274→277 de punta a
  punta contra Compras real (no mockeado).
- Leído el diff completo del batch (backend + frontend) línea por línea antes de este pase, no
  solo el resumen de los commits.

## Deuda registrada (no bloqueante)

- Ninguna nueva. El hallazgo de esta sesión (`origin_module` no expuesto) quedó resuelto, no
  diferido.
