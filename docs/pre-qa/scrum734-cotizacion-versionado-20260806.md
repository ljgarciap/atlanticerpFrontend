# Pre-QA — SCRUM-734: Correcciones Detalladas y Flujo completo para revisión de Crear Nueva Cotización

**Fecha:** 2026-08-06
**Ticket:** [SCRUM-734](https://grupolafayette.atlassian.net/browse/SCRUM-734)
**Estado al iniciar:** Dev Testing → **Estado al cerrar: QA** (pasada limpia tras 1 vuelta del loop)
**Adjuntos en Jira:** ninguno (confirmado vía `jira_get_attachments`) — fuente de verdad es el texto completo de la descripción (RN0→RN12).
**Ambiente:** stack Docker local (mismo commit que `dev.atlanticerp.ai` al momento de correr: backend `56cb6f6`, frontend `1d6cd7a` al arrancar la sesión). GitHub Actions estaba en outage (`major_outage` en Actions) durante toda la sesión — todo deploy de esta sesión fue manual vía SSH, confirmado con `curl https://dev.atlanticerp.ai/version.json` después de cada uno.

## Paso 0 — permisos angostos y valores paramétricos

- `PricingSettings::min_margin_percent` (30% default) vive en una tabla paramétrica real, con CRUD (`PricingSettingsController`, permiso angosto `ventas_diseno.pricing.configure`) — **no hardcodeado**, confirmado en código.
- La excepción de margen de Mark (`mbekhar@illuminations.com.pa`) y David (`david@grupolafayette.com`) — `ventas_diseno.override_min_margin` — está en `database/seeders/SpecialPermissionSeeder.php` (grants por email explícito, comentado con el ticket que lo originó), **no un grant manual** — corre en todos los entornos.
- Ambos puntos verificados también en vivo: usuario sin el permiso queda bloqueado duro; Mark, con el permiso, ve el modal de confirmación en vez del bloqueo (8/8 en la suite SCRUM-725).

## Loop — 1 vuelta, 2 hallazgos reales, ambos corregidos y re-verificados

### CRÍTICO — "Usar como base para nueva versión" ignoraba la fila clickeada, siempre duplicaba lo que estaba abierto en pantalla

**Criterio incumplido:** sección 3 — *"'Usar como base para nueva versión' (...) disponible sobre cualquier versión del historial, no solo la más reciente"*.

**Cómo se reprodujo:** con un proyecto de 3 versiones confirmadas ($100/$500/$900), abrir la versión más reciente (v3, $900) en el visor "Ver cotización" y hacer clic en "Usar como base para nueva versión" en la **fila de la v1** ($100) de la tabla "Versiones de este proyecto" — el nuevo Borrador resultante copiaba el ítem de **v3** ($900), no el de v1 pese a haber clickeado explícitamente su fila. Cada botón de fila estaba wireado al mismo callback ciego a `viewingId` (el id abierto en pantalla), nunca al `v.id` de la fila.

**Impacto:** silencioso — no hay error, la app simplemente basa la nueva versión en el documento equivocado. Un vendedor que quisiera reconstruir una versión antigua específica desde el historial terminaría, sin saberlo, partiendo de una versión distinta.

**Fix:** `QuoteDocument.tsx`/`QuoteViewerModal.tsx` — `onUseAsBase` ahora recibe `versionId` (el `v.id` de la fila clickeada) en vez de operar sobre el estado `viewingId` compartido. Commit `44edbfd`.

**Re-verificación:** test Playwright reproduce exactamente el escenario de arriba contra el fix — pasa limpio (`e2e/preqa-scrum734-cotizacion-versionado-20260806.spec.ts`, GRUPO A).

### MEDIO — botón "Editar" seguía visible/etiquetado así sobre una cotización ya confirmada

**Criterio incumplido (a la letra):** sección 2, RN2.2 — *"no existe, ni debe existir, ningún botón 'Editar' sobre una cotización generada"*.

**Detalle:** el formulario detrás de ese botón ya estaba 100% bloqueado (`canEdit = false` una vez `confirmed_at` está seteado, verificado en vivo) — no había ninguna brecha de seguridad ni forma real de editar. Pero el botón seguía diciendo literalmente "Editar", lo cual es confuso a la letra del criterio aunque no hubiera impacto funcional.

**Fix:** label condicional — "Ver formulario" cuando `quote.confirmed_at` está seteado, "Editar" solo para Borrador/generada-sin-confirmar (donde el formulario sí es editable). Commit `44edbfd`.

## Housekeeping de la suite permanente (no son hallazgos de producto)

Al re-correr `e2e/preqa-scrum723-725-728-729-batch-20260805.spec.ts` completo (regla del proyecto: los smoke tests que ya cubrieron un gate roto no se borran, se mantienen verdes) aparecieron 2 quiebres, ambos causados por comportamiento **nuevo e intencional** de SCRUM-734, no por bugs:

1. El precio de un ítem ya no se edita con un `<input>` inline en la fila — SCRUM-734 lo movió a un modal dedicado (botón "$X.XX" → modal "Nuevo precio"). El test 3 de SCRUM-725 asumía el input viejo — actualizado para abrir el modal.
2. RN0.4 ("un Borrador nunca crea ni mueve ninguna tarjeta de Pipeline") movió la vinculación a Pipeline exclusivamente a `confirm()` — antes, "generar" (asignar folio) ya vinculaba una tarjeta, así que "Volver a Pipeline" existía apenas se generaba. Ahora ese botón no existe hasta confirmar (gateado por `pipeline_card_id !== null`), así que el escenario original de los tests 1/2 de SCRUM-723 ("generado sin confirmar, click en Volver a Pipeline") ya no puede ocurrir — reescritos para usar la navegación por Sidebar (mismo guard "Salir sin guardar", intacto) y verificar server-side que ninguna `PipelineCard` se crea prematuramente.
3. Efecto colateral de RN5.1 (nueva): varios tests de este archivo reutilizaban el **mismo** nombre de Proyecto hardcodeado vía un helper compartido (`fillQuoteHeader`) — como RN5.1 ahora excluye del buscador cualquier Proyecto que ya tenga una cotización (Borrador o generada), el segundo/tercer test que intentaba reusar ese nombre chocaba (formulario vacío tras un intento fallido de "crear nuevo", bloqueado por RN5.3). Esto en realidad es **evidencia en vivo, no buscada, de que RN5.1/RN5.3 funcionan** — el fix fue dar a cada test su propio nombre de Proyecto único.

Los 19 tests de ese archivo + los 5 nuevos de SCRUM-734 (`preqa-scrum734-cotizacion-versionado-20260806.spec.ts`) pasan limpio juntos. Ambos commits pusheados a `dev` y desplegados manualmente a `dev.atlanticerp.ai` (outage de GitHub Actions).

## Lo que sí funciona (verificado en vivo salvo que se indique lo contrario)

- **RN0.4** — un Borrador nunca crea ni mueve tarjeta de Pipeline; solo `confirm()` la crea/vincula. Verificado server-side: tras generar (folio asignado) sin confirmar, no existe ninguna `PipelineCard` para el proyecto y `confirmed_at` sigue `NULL`.
- **RN1.1–1.3** — folio único por cotización, `sales_project_id` como agrupador de versiones (no folio/nombre), cada versión es una fila 100% independiente en Cotizaciones (revisado en código, `QuoteService::versionsFor()`/`duplicate()`).
- **RN2.2** — cotización confirmada nunca editable: verificado en UI (formulario deshabilitado) **y** a nivel HTTP real (`POST`/`DELETE` de ítems sobre una cotización confirmada responden 422 con el mensaje exacto del ticket) — incluye el fix retroactivo de Senior Review (`56cb6f6`, `ensureEditable()` en `QuoteItemController`/`QuotePartController`) re-verificado en vivo, no solo confiado en el docblock que decía "ya corregido".
- **RN2.3/2.4/2.6** — "Usar como base" solo disponible mientras la tarjeta está en etapa Cotización (gate en `resolveLinkedCardForConfirm()`/`duplicate()`, `QuoteActionBlockedException` para Propuesta/Aprobado/Perdido) — revisado en código, consistente con el resto del comportamiento verificado en vivo.
- **RN2.5** — el historial de versiones (`versionsFor()`) no filtra por etapa de la tarjeta, así que sobrevive intacto a un ciclo Perdido→reactivado→Cotización otra vez (por diseño de código, no ejercitado en vivo esta sesión por límite de tiempo).
- **RN3/RN3.1** — sección "Versiones de este proyecto" solo con 2+ versiones, columnas correctas, "Ver esta versión" navega dentro del mismo modal, botón de fila en la lista de Cotizaciones gateado por `stage==='quote' && document_status!=='draft'` — verificado en vivo (incluye el CRÍTICO de arriba, ya corregido).
- **RN4.1/4.2/4.3** — el Valor de la tarjeta de Pipeline se **sobrescribe**, nunca se suma, con cada confirmación real; un Borrador nunca lo toca. Verificado de punta a punta con un ciclo real de UI: v1 confirmada ($200 + 7% ITBMS = $214) → Valor = $214; "Usar como base" → precio editado a $500 → v2 confirmada → Valor = **$535**, nunca $214+$535=$749. (Nota para QA: el Valor guardado es `grandTotal()`, es decir **incluye ITBMS** — no confundir con el subtotal si se verifica a mano.)
- **RN5.1** — un proyecto con cualquier cotización asociada (Borrador o generada) queda excluido del buscador de "+ Nueva cotización" — verificado en vivo dos veces (una intencional, una como efecto colateral no buscado en la suite permanente).
- **RN5.3** — mensaje de bloqueo al intentar crear un proyecto duplicado con cotización existente coincide textualmente con el del ticket: *"Ya existe una cotización para este proyecto. Ve a Cotizaciones o a la tarjeta en Pipeline para ver sus versiones y crear una nueva a partir de ahí."* — capturado en pantalla real.
- **RN9.1** — modal de edición de precio: precio de catálogo de referencia (solo informativo), "Nuevo precio" con validación de margen en vivo (debounced), "Cancelar" descarta sin persistir (precio de la fila queda exactamente igual), "Guardar" deshabilitado mientras hay una violación vigente — verificado extensivamente en vivo.
- **RN10** — margen mínimo 30% por producto y global: bloqueo duro para usuario sin permiso (ítem individual, descuento global, precio manual, alta por familia — se saltea el que viola en vez de fallar toda la operación), modal de confirmación explícito para Mark/David (nunca automático), precio manual nunca toca `CatalogProduct.price_full` (verificado server-side) — 8/8 escenarios de la suite permanente pasan limpio con la nueva UI de modal de precio.

## Pendiente — no bloqueante, alcance de tiempo de esta sesión

- **RN7.1** (prefill del modal de creación de Cliente Master/Subcliente con el texto ya tipeado) y **RN8.4/8.5** (alcance de búsqueda de Arquitecto/Contacto acotado al Subcliente, edición in-place persistiendo al registro real) — verificados por lectura de código (wiring correcto de principio a fin) y por la suite de unit tests existente (`QuotePage.test.tsx`, 62/62 verde, incluye casos específicos de RN8.5), pero **no ejercitados en vivo por Pre-QA** en esta pasada por límite de tiempo. No son hallazgos — es una limitación de cobertura declarada, no un defecto encontrado y diferido. Recomendación: si Luis quiere blindarlo antes de exponerlo a marly, una sub-tanda corta de 10-15 min alcanza; si no, queda para que marly lo cubra en su QA formal (no aparecían en la lista de "más probable tener bugs de esta sesión" del brief).
- Sección 6 (mensajes de validación de orden de llenado, todos a la vez) y secciones 11/12 (consistencia entre pantallas) no se ejercitaron activamente — dependen en gran parte de código de sesiones previas (Epic CRM, ya cerrado) y no estaban en el foco de riesgo de esta sesión.

## Resumen ejecutivo

- **Rondas del loop:** 1 (hallazgo → corregido por mí mismo, sin escalar a PM por ser "chico" → re-verificación completa → limpio).
- **Hallazgos:** 1 CRÍTICO (bug real de producto, corregido y re-verificado) + 1 MEDIO (cosmético/literal del criterio, corregido y re-verificado) + 3 items de housekeeping de la suite permanente (ningún bug de producto, RN5.1/5.3 funcionando de hecho ayudó a encontrarlos).
- **Todo pusheado a `dev`** (`44edbfd`, `d629336`) y **desplegado manualmente a `dev.atlanticerp.ai`** (outage de GitHub Actions confirmado, verificado con `version.json` post-deploy).
- **Estado final:** transiciono el ticket a **QA**.
