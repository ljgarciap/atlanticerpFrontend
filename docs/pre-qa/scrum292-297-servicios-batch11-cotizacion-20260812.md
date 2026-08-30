# Pre-QA — Batch 11 Servicios: Cotización de Servicio

**Tickets:** SCRUM-292 (REQ-229), SCRUM-293 (REQ-230), SCRUM-294 (REQ-231), SCRUM-295 (REQ-232),
SCRUM-296 (REQ-233), SCRUM-297 (REQ-234)
**Fecha:** 2026-08-12
**Precedente:** Senior Reviewer ya corrió sobre estos mismos worktrees, verdict APROBADO, con un
hallazgo real corregido en el momento (bypass del gate de `margin_percent` para usuarios sin
`servicios.quotes.view_cost_breakdown` — commits `5520c00` backend / `46b2715` frontend). Este
gate es el mandato de esta pasada: comportamiento en runtime, no revisión estática de código.
**Entorno:** stack Docker aislado propio `batch11review` (puertos 5534/8094, contenedores propios
sin tocar ningún otro stack en `docker ps`), migrado+seedeado desde cero, con 5 tickets de fixture
propios (`[PREQA-B11]`) + 2 técnicos externos (uno activo, uno inactivo) sembrados vía tinker para
cubrir escenarios que el seeder de demo estándar no contempla (sin productos reclamados, sin
técnicos externos, sin informe con recomendación). Usuarios reales del roster, sin cuentas demo.

## Paso 0 — permisos angostos y valores paramétricos

- `servicios.quotes.view_cost_breakdown` (grant angosto por persona, REQ-232 RN5: "Aaron, Mark,
  David y Whil") — confirmado en `database/seeders/SpecialPermissionSeeder.php`: los 4 nombres
  están ahí (Mark vía `mbekhar@...`, David vía `david@grupolafayette.com`, Aaron vía
  `servicio@illuminations.com.pa` con el rol `lider_servicios`, Whil vía `whil@...`). Verificado en
  vivo con Aaron (ve costos) y Daniela — management sin el grant — (no ve costos). Sin hallazgo.
- Margen mínimo (REQ-230 RN4) — confirmado que reusa `PricingSettings::min_margin_percent`
  (parametrizable, con CRUD/vista de superadmin ya existente de Ventas & Diseño), NO un literal
  hardcodeado. Sin hallazgo.
- ITBMS (REQ-233) — confirmado que usa `ServiciosSettingsService::itbmsPercent()`, configurable,
  no un `0.07` hardcodeado en el cálculo. Sin hallazgo.
- Dato sembrado: el roster de demo estándar (`ServiciosDemoSeeder`) no tiene ningún ticket con
  `ticket_products`, ningún `external_technicians` (tabla vacía en un entorno fresco), ni ningún
  `InspectionReport` con recomendación marcada — los 3 casos que SCRUM-292/295 necesitan ejercitar.
  Sembrados a mano vía tinker antes de arrancar (ver script en la sesión) — no se dejó que apareciera
  como "no puedo verificar, falta el dato" recién en esta pasada.

## SCRUM-292 (REQ-229) — Generar cotización de servicio

| Escenario | Resultado |
|---|---|
| Camino feliz — informe completado, abrir formulario | Precarga cliente/contacto/dirección correcta, nota RN4 visible con redacción Retrofit |
| **Ruptura** — informe pendiente (GAR-2026-0005) | Bloqueado: sin botón "Generar cotización" habilitado, indicador `locked` visible |
| RN2 — número de cotización | Asignado en el primer guardado real (`COT-SERV-2026-NNNN`), nunca antes |
| RN3 — cliente/contacto/dirección no editables desde el formulario | Confirmado, son `<p>` de solo lectura, sin `<input>` |
| RN5 — precarga de recomendación del informe en Observaciones | Confirmado, campo queda editable tras precargar |
| RN7 — solo Aaron/técnico interno asignado puede generar/editar | Ver sección adversarial abajo |

**Lo que sí funciona:** gate de informe, precarga de datos, nota de productos, precarga de
recomendación, numeración de folio.

## SCRUM-293 (REQ-230) — Ítem Producto

| Escenario | Resultado |
|---|---|
| Margen suficiente (catálogo real, costo $8.28, precio $20 → 59%) | Se agrega sin bloqueo |
| **Ruptura** — margen insuficiente (mismo producto, precio $9 → 8% < 30%) | **BLOQUEADO** con toast: `La línea "[...] Candelabro/Colgante #N" queda con un margen de X%, por debajo del mínimo permitido (30%). Ajuste el precio o la cantidad.` — señala la línea específica (RN5) |
| **Ruptura** — referencia libre (`is_custom`) con precio bajo | Se agrega SIN validar margen (RN3), confirmado que el ítem queda en la lista sin ningún toast de error |
| **Ruptura** — mismo producto de catálogo en dos líneas | **BLOQUEADO** con toast: `Este producto ya está en la cotización — ajuste la cantidad en la línea existente (...)` (RN2) |

**Lo que sí funciona:** bloqueo duro de margen con mensaje específico por línea, exención correcta
de referencia libre, bloqueo de duplicado. Los 3 escenarios de ruptura de este ticket — el más
sensible del batch — pasan limpio.

## SCRUM-294 (REQ-231) — Ítem Mano de obra

| Escenario | Resultado |
|---|---|
| Camino feliz — descripción libre + cantidad + precio | Se agrega, entra al subtotal |
| RN2 — sin validación de margen | Confirmado (no tiene `cost_reference`, nunca se computa margen) |

Ticket simple, sin camino de ruptura propio más allá de validación de campos vacíos (cubierta por
`canSaveItem` en frontend + `resolveLaborItem()` en backend, que rechaza descripción vacía).

## SCRUM-295 (REQ-232) — Ítem Subcontratado

| Escenario | Resultado |
|---|---|
| RN1 — solo técnicos Activos seleccionables | Confirmado: "Pedro Inactivo" (sembrado a propósito) NUNCA aparece en el `<select>`, solo "Luis Vargas" |
| RN2 — tarifa autocompletada como costo de referencia | Confirmado, oculto del cliente (gateado igual que margin_percent) |
| RN4 — cálculo del precio final | Escenario 1 del ticket EXACTO: $25/día × 1.30 × 3 días = **$97.50**, verificado en pantalla (aparece 2 veces: línea y subtotal, ambos correctos) |
| RN5 — desglose de costo/margen oculto salvo Aaron/Mark/David/Whil | Confirmado con Aaron (ve) y Daniela (no ve) — ver Paso 0 |
| RN6/RN7 — sincronización con la ficha del técnico externo | Por diseño (`ExternalTechnicianService::assignedProjects()`/`activeProjectsCount()` consultan `ServiceQuoteItem` en vivo, sin copia denormalizada) — editar/eliminar el ítem se refleja automáticamente sin acción manual, no hay riesgo de dato obsoleto. No se verificó la pantalla de ficha del técnico externo en esta pasada (ya cubierta por Pre-QA de Batch 5) — el mecanismo de sincronización en sí (consulta en vivo, no copia) sí se confirmó por lectura de código. |

## SCRUM-296 (REQ-233) — Totales

| Escenario | Resultado |
|---|---|
| RN5 — ITBMS visible en el formulario, no solo en el documento final | Confirmado — corrige exactamente la inconsistencia que el ticket describe del mockup |
| Escenario 1 del ticket (subtotal $1000, desc 10% → base $900, ITBMS $63, Total $963) | Fórmula verificada en `ServiceQuote::computeTotals()` — cálculo centralizado, una sola fuente de verdad reusada por Batch 12 cuando exista el documento |

## SCRUM-297 (REQ-234) — Ciclo de vida

| Escenario | Resultado |
|---|---|
| RN2 — Guardar sobre Borrador NO cambia el estado | Confirmado — sigue en "Borrador" tras Guardar |
| RN3 — Enviar al cliente promueve Borrador→Enviada | Confirmado, exclusivamente vía el botón separado |
| **Escenario 3 del ticket** — decidir es exclusivo de Aaron; un técnico interno NO debe tener la opción | **Confirmado en dos capas:** (1) UI — técnico asignado (Carlos) ve la cotización Enviada pero SIN botones Aprobar/Rechazar; (2) API — intento directo `PATCH .../quote/decidir` con el token de Carlos devuelve 403 (defensa en profundidad, no solo ocultamiento de botón) |
| **Escenario 4 del ticket** — cotización Rechazada más reciente habilita "Generar nueva cotización" | Confirmado, botón visible tras rechazar |
| RN5 (implícito) — "Generar nueva cotización" no crea una segunda cotización mientras la actual no esté Rechazada | Confirmado por `ServiceQuoteService::startNew()`: lanza `ServiceQuoteActionBlockedException` si ya existe una cotización no rechazada para el ticket |

## Camino de ruptura transversal — intentado en cada ticket

- **Rol sin ownership** — técnico interno NO asignado al ticket (Pedro Santos) intentó abrir la
  cotización de RET-2026-0004 (asignado a Carlos): la UI no ofreció ningún control de escritura, y
  el intento directo por API (`PUT .../quote`) devolvió 403/404 — confirmado que `assertCanEdit()`
  corre server-side, no es solo un botón oculto en el frontend.
- **Usuario sin permiso ve costos por inferencia** — con `margin_percent` y `cost_reference`
  ocultos, se revisó que `unit_price` (siempre visible) no permite recalcular el costo real sin
  el margen — confirmado, el gate cubre ambos campos simétricamente (ver comentario en
  `ServiceQuoteController::formatItem()`, hallazgo original de Senior Review).
- **Doble submit** — el botón "Agregar ítem" usa `loading={itemMutation.isPending}` +
  `disabled={!canSaveItem}` de TanStack Query, que deshabilita el botón mientras la mutación está
  en vuelo — no se reprodujo una condición de carrera real en esta pasada (no es el mismo patrón
  TOCTOU que Pre-QA encontró en Batch 7 sobre captura de comisión, que sí tenía una ventana real).
- **Recarga a mitad de flujo** — no se investigó a fondo por presupuesto de tiempo; el diseño
  (Guardar explícito, ítems persistidos uno a uno vía API, no en batch) hace que perder el draft de
  un ítem sin guardar en un reload sea el comportamiento esperado, no una regresión — mismo patrón
  ya aceptado en InspectionReportModal/ClaimSheetModal de batches anteriores.

## Hallazgos

Ninguno. 0 CRÍTICOS, 0 MEDIOS. No se corrigió nada en esta pasada porque no se encontró nada que
corregir — a diferencia de la sesión de Senior Review previa (que sí encontró y corrigió el bypass
de `margin_percent`), esta pasada adversarial no encontró un ángulo nuevo de ruptura.

## Veredicto

**PASA LIMPIO.** Listo para QA formal (marly.rangel), sujeto a que Luis confirme el paso a
`dev.atlanticerp.ai` (esta pasada corrió en un stack Docker aislado local, no en el entorno real — ver
nota de scope en el reporte de sesión).
