# Pre-QA — SCRUM-308/309/310 (REQ-245 Nuevo ticket datos generales, REQ-246 búsqueda Cliente
Master→Subcliente→Proyecto, REQ-247 requerimientos especiales + productos) — 2026-08-05

Fase 4 — Servicios, Batch 3 parte 2 (segunda mitad de Batch 3, después de Cancelar/PDF — ver
`docs/pre-qa/scrum290-291-servicios-batch3parte1-20260805.md`). Mockup: `5A__Servicios_Tickets.html`
(attachment 10578/10580/10581, SCRUM-308/309/310, mismo mockup usado en todo el módulo). Entorno:
local (Docker `:8090` + Vite `:5173`), Playwright CLI
(`e2e/preqa-scrum308-309-310-servicios-batch3parte2-20260805.spec.ts`).

## Diseño técnico implementado

- **Backend:** `sales_project_id` pasa de opcional a obligatorio en `POST /servicios/tickets`
  (RN6) — el snapshot `cliente` se deriva server-side del Subcliente del proyecto elegido, nunca
  de un string libre (RN1: Servicios no puede crear cliente/subcliente/proyecto). Nueva tabla
  `ticket_products` (FK cross-schema a `ventas_diseno.catalog_products`, mismo patrón que
  `purchase_order_lines`). `requerimientos_especiales` pasa de texto libre a JSONB estructurado
  (`{catalog: string[], otros: string[]}`, migración con wrap seguro del dato existente — no había
  ninguno en local, pero dev/test pudieron tener texto de pruebas anteriores). 4 endpoints de
  solo lectura nuevos (`/servicios/lookup/master-clients`, `/master-clients/{id}/sub-clients`,
  `/sub-clients/{id}/projects`, `/lookup/products`) — mismo patrón que
  `Compras\ApprovedProjectController`/`CatalogProductSearchController` (un módulo no tiene el
  permiso del otro).
- **Permisos (REQ-245 RN4):** `POST /servicios/tickets` y los 4 endpoints de lookup pasan de
  `permission:servicios.write` a `role:superadmin,lider_servicios,management,vendedor_disenador`
  — más angosto que el permiso de módulo a propósito. Cierra un gap dejado pendiente a propósito
  en `2026_08_02_100003_grant_servicios_view_to_vendedor_disenador.php` (Batch 1): Vendedor/
  Diseñador tenía solo lectura en Servicios salvo la excepción de crear tickets, que quedó fuera
  de ese batch hasta ahora.
- **Frontend:** `TicketCreateModal` (formulario completo), `RequirementsChecklist` (checklist de
  18 ítems + "otros", **compartido** con la edición global de `TicketDetailModal` — ese modal
  usaba un `<textarea>` libre desde Batch 2, ahora usa el mismo checklist estructurado que Nuevo
  ticket, alineado con el mockup real que también usaba el checklist en ambos lados),
  `ServiciosSearchPickerModal` (buscador genérico reusado 3 veces: Cliente Master, Subcliente,
  Productos).

## Escenarios verificados (REQ-245 — datos generales)

| # | Escenario | Resultado |
|---|---|---|
| 1 | Subtipo dependiente: cambiar a "Reclamos" pasa Subtipo a "no aplica" | OK — `onNuevoTipoChange`/`onTipoChange`, mismo mapeo `SUBTYPES_BY_TIPO` ya usado en edición global |
| 2 | Creación por Ventas & Diseño sin depender de Aaron | OK — `test_vendedor_disenador_puede_crear_ticket` + Playwright paso 7 (botón visible, login real) |
| 3 | Descripción obligatoria bloquea la creación | OK — `canSave` en el frontend + `test_crear_ticket_sin_subtipo_requerido_retorna_422` (backend ya lo validaba desde Batch 1) |
| RN4 | Aaron/Gerencia/Vendedor-Diseñador crean; técnico interno no tiene el botón | OK — `test_tecnico_servicios_no_puede_crear_ticket`, `test_garantias_servicios_no_puede_crear_ticket`, `test_management_puede_crear_ticket` (403/201 backend) + Playwright paso 8 (botón ausente en la UI para `tecnico_servicios`) |

## Escenarios verificados (REQ-246 — búsqueda de cliente)

| # | Escenario | Resultado |
|---|---|---|
| 1 | Búsqueda en cascada: subclientes acotados al Master elegido | OK — `test_buscar_sub_clients_acotado_al_master` + Playwright paso 3 (fixture real vía HTTP) |
| 2 | Sin creación posible: sin resultados indica que el cliente debe existir en Ventas & Diseño | OK — `tickets.create.searchMasterEmpty`/`searchSubEmpty`, mismo texto que RN2/RN5 |
| 3 | Proyecto obligatorio del catálogo, sin poder escribir uno nuevo | OK — select puro (no input libre), `test_buscar_proyectos_acotado_al_subcliente` |
| RN6 | Master+Subcliente+Proyecto obligatorios para crear | OK — `test_crear_ticket_sin_sales_project_id_retorna_422`, botón "Crear ticket" deshabilitado en el frontend hasta elegir proyecto |

## Escenarios verificados (REQ-247 — requerimientos especiales + productos)

| # | Escenario | Resultado |
|---|---|---|
| 1 | Marcar 2 requerimientos del catálogo fijo quedan aplicables | OK — `test_crear_ticket_con_requerimientos_y_productos` + Playwright paso 4 (chips reales, verificado en el detalle post-creación: "Casco de seguridad, Arnés de seguridad") |
| 2 | Producto no duplicable: ya agregado no vuelve a aparecer en la búsqueda | OK — `test_buscar_productos_excluye_ids_dados` (backend, param `exclude`) + `test_crear_ticket_con_producto_duplicado_retorna_422` (defensa final server-side) + test frontend `RN4 — un producto ya agregado no vuelve a aparecer en el buscador` |
| 3 | Solo cantidad reclamada al crear (recibida/pendiente no se piden) | OK — formulario solo pide `cantidad_reclamo`; backend inicializa `cantidad_recibida=0`, `cantidad_pendiente=cantidad_reclamo` |
| RN6 | "+ Agregar otro" repetible, aparece igual que el catálogo fijo en detalle/PDF | OK — `RequirementsChecklist`, verificado en `TicketService::requirementsPayload()` + blade del PDF |

## Hallazgos propios encontrados y corregidos en esta misma sesión

Ninguno bloqueante. Un hallazgo de test-script (no de producto) durante la validación en
navegador: el primer borrador del spec de Playwright usaba `getByText()` sin scope para clickear
un ítem del buscador — en una segunda corrida (con un ticket ya creado en la corrida anterior, su
"cliente" derivado coincidía con el texto buscado en la tabla de fondo) el locator resolvía al
elemento equivocado, bloqueado por el overlay del modal. Corregido usando `getByRole('button', {
name })`, que solo matchea los ítems reales del picker, no celdas de tabla.

## Veredicto

**PASA LIMPIO.** 70/70 tests de Servicios (`TicketFlowTest`/`TicketBatch2Test`/`TicketBatch3Test`
actualizados por el cambio de contrato — `sales_project_id` obligatorio, `requerimientos_especiales`
estructurado, roles de creación — + 10 nuevos en `TicketBatch3Part2Test`), suite completa backend
1585/1585, suite completa frontend 881/881 (incl. 5 tests nuevos de
`TicketCreateModal`, 2 de `RequirementsChecklist`, 3 de gating del botón en `TicketsPage`),
`tsc --noEmit` limpio, `npm run build` limpio, PHPStan Level 8 sin errores, Playwright end-to-end
contra el stack local en 1 pasada (tras el fix de locator). Listo para Senior Review formal / push
a `dev`.
