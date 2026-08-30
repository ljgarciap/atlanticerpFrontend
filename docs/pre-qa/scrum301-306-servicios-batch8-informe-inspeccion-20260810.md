# Pre-QA — Fase 4 Servicios, Batch 8: Informe de Inspección (REQ-238→243)

**Fecha:** 2026-08-10
**Tickets:** SCRUM-301 (REQ-238), SCRUM-302 (REQ-239), SCRUM-303 (REQ-240), SCRUM-304 (REQ-241), SCRUM-305 (REQ-242), SCRUM-306 (REQ-243)
**Entorno:** stack Docker local (`localhost:8090` API / `localhost:5173` Vite dev server para UI), checkout sin commitear al momento de la pasada.

## Resumen del veredicto

Pasada **LIMPIA** tras 2 rondas — 2 hallazgos CRÍTICOS reales encontrados en la primera ronda, corregidos en el momento, checklist completo vuelto a correr en la segunda ronda sin nuevos hallazgos.

| Ticket | Veredicto |
|---|---|
| SCRUM-301 (REQ-238) | PASA — datos generales, folio INF-AÑO-NNNN, precarga de técnico (fix aplicado), gate de permisos (RN5) |
| SCRUM-302 (REQ-239) | PASA — 5 combinaciones de campos dinámicos verificadas contra el catálogo exacto de RN1/RN2/RN3, sin quedar pegados entre tickets |
| SCRUM-303 (REQ-240) | PASA — RN1/RN2 verificadas (RN3/RN4 diferidas a Batch 14 por decisión de Luis, no evaluadas). Fix aplicado a un CRÍTICO real (ver abajo) |
| SCRUM-304 (REQ-241) | PASA — fotos antes/después separadas, conclusión obligatoria, próximos pasos condicional |
| SCRUM-305 (REQ-242) | PASA — firma de texto únicamente, "Pendiente de firma" en vacío |
| SCRUM-306 (REQ-243) | PASA — modo alternativo oculta el formulario, archivo obligatorio en el primer guardado |

## Hallazgos CRÍTICOS — encontrados y corregidos en esta sesión (loop cerrado)

### CRÍTICO 1 — Doble submit real produce 500 con stack trace expuesto, en vez de actualizar el informe existente

**Criterio incumplido:** REQ-238 RN1 (implícito — "Guardar informe" es una única acción, el N° se asigna una sola vez) + expectativa básica de resiliencia de cualquier endpoint de escritura.

**Cómo se reprodujo:** 2 requests `PUT .../inspection-report` concurrentes (curl en paralelo, `&` + `wait`) sobre un ticket que todavía no tenía informe. `InspectionReportService::beginUpsert()` usa `InspectionReport::where('ticket_id', ...)->lockForUpdate()->first()` — bajo READ COMMITTED, un `SELECT ... FOR UPDATE` sobre una fila que **todavía no existe** no bloquea nada, así que ambas transacciones pasaban el SELECT viendo `null` y ambas intentaban `INSERT`. La segunda perdía la carrera del lado de Postgres con `UniqueConstraintViolationException` sobre `servicios_inspection_reports_ticket_uq` — sin ningún catch, eso se propagaba como **500 con el stack trace completo expuesto al cliente** (info disclosure, además del bug funcional).

**Fix aplicado:** `InspectionReportService::withUniqueRetry()` — envuelve `save()`/`saveArchivoMode()`, captura `UniqueConstraintViolationException` de esa constraint puntual y reintenta una vez; en el reintento `beginUpsert()` ya encuentra la fila que el otro request acaba de commitear y actualiza en vez de insertar. Verificado con el mismo curl concurrente tras el fix: ambos requests devuelven 200 con el mismo `id`/`numero`, y la tabla queda con exactamente 1 fila para ese `ticket_id`.

**Archivo:** `app/Modules/Servicios/Services/InspectionReportService.php`

### CRÍTICO 2 — Una línea de materiales vacía rechaza TODO el guardado con 422, en vez de omitirse (REQ-240 RN2 roto)

**Criterio incumplido:** REQ-240 RN2 — "El botón '+ Agregar material usado' permite sumar líneas ilimitadas; las que queden vacías al guardar se omiten."

**Cómo se reprodujo:** `SaveInspectionReportRequest::rules()` tenía `'materiales.*.nombre_material' => ['required_with:materiales', ...]` (mismo para `cantidad`) — esa regla exige el campo en **cada elemento** del array apenas `materiales` está presente, así que una fila en blanco (exactamente lo que deja "+ Agregar material usado" sin completar, y exactamente lo que el frontend manda tal cual sin filtrar en `mutationFn`) tumbaba el guardado completo con 422 antes de llegar nunca a la lógica de omisión (ya correcta) en `InspectionReportService::replaceMaterials()`. 100% alcanzable desde el flujo real de UI, no solo con un payload armado a mano.

**Fix aplicado:** cambiadas ambas reglas a `nullable` (mismo criterio ya usado en `findings.*.value`), dejando que `replaceMaterials()` sea la única fuente de verdad para la omisión. Verificado: mismo payload con línea vacía ahora devuelve 200 y solo persiste las 2 líneas válidas; un array con claves totalmente ausentes tampoco rompe (sin 500).

**Archivo:** `app/Modules/Servicios/Http/Requests/SaveInspectionReportRequest.php`

## Hallazgo MEDIO — corregido en esta sesión

### MEDIO — RN4 (REQ-238, Escenario 1): "Técnico responsable" no se precargaba en un informe NUEVO

**Criterio:** "Dado un ticket de Garantías con Miguel Castillo asignado, cuando se genera su informe, entonces el campo Técnico responsable se precarga con Miguel Castillo."

`InspectionReportModal` solo hidrataba `tecnicoId` desde `existing.internal_technician_id` — para un informe que **todavía no existe**, `existing` es `undefined` y el select quedaba en blanco pese a que el ticket ya tenía un técnico asignado (`Ticket.internal_technician_id`, seteado vía Agendar/Reagendar). `TicketDetailModal` tampoco pasaba ese dato como prop al modal.

**Fix:** se agregó la prop `ticketTechnicianId` (desde `ticket.internal_technician?.id`) y se precarga `tecnicoId` con ese valor cuando no hay informe existente. Verificado en navegador (Playwright): abrir el informe nuevo de GAR-2026-0001 (técnico ya asignado = Miguel Castillo) muestra el select ya en "Miguel Castillo".

**Archivos:** `src/components/servicios/InspectionReportModal.tsx`, `src/components/servicios/TicketDetailModal.tsx`

## Camino de ruptura verificado (Paso 3, checklist completo tras los fixes)

| # | Escenario de ruptura | Resultado |
|---|---|---|
| 1 | Técnico sin ticket asignado (Carlos, ticket sin técnico) intenta `PUT` vía curl directo | 403, mensaje claro. Confirmado también en UI: sin botón Guardar, campos deshabilitados |
| 2 | Técnico owner de OTRO ticket (Carlos en ticket de Agustín) intenta `PUT` | 403 |
| 3 | Gerencia (Daniela) intenta `PUT` sobre cualquier ticket | 403 a nivel de `role:` middleware (ni siquiera llega a `assertCanEdit`) |
| 4 | Gerencia `GET` del informe (lectura) | 200/404 normal, nunca 403 — confirmado además en UI: sin botón Guardar, placeholders "Pendiente de firma" en campos vacíos |
| 5 | Técnico owner (Carlos, ticket propio) `PUT` válido | 200, folio asignado |
| 6 | Conclusión vacía / solo espacios / campo ausente | 422 con mensaje claro (nota: curl sin `Accept: application/json` cae en el redirect 302 default de Laravel — no es un bug real, Axios manda ese header por defecto) |
| 7 | Ticket tipo Reclamo (`isApplicable()=false`) — `fields` y `save` | 422 "Este tipo de ticket no genera Informe de Inspección" en ambos endpoints |
| 8 | Ticket inexistente | 404, no 500 |
| 9 | Doble submit concurrente (2 PUT simultáneos, ticket sin informe) | **CRÍTICO encontrado y corregido** — ver arriba |
| 10 | Modo archivo, primer guardado sin archivo | 422 "Adjunta un archivo..." |
| 11 | 5 combinaciones de campos dinámicos (Garantías+producto, Retrofit+producto, Instalación/inspección sin producto, Garantías/reposición sin producto, Retrofit sin producto) | Cada una devuelve exactamente el catálogo de RN1/RN2/RN3, con `is_quote_recommendation` correcto en el campo que corresponde |
| 12 | Filtro de especialidad del select de técnico (`/technicians/internal?tipo=`) | `warranty` → solo Miguel Castillo; `installation` → solo `tecnico_servicios` (sin Miguel) |
| 13 | Materiales/hallazgos con líneas vacías mezcladas con válidas | **CRÍTICO encontrado y corregido** — ver arriba. Tras el fix: solo persisten las líneas/hallazgos con contenido real |
| 14 | `proximos_pasos` enviado con `requiere_seguimiento=false` | Se ignora, queda `null` en BD (RN3 REQ-241) |
| 15 | Materiales con claves ausentes (`[{}]`) | No rompe, se omite silenciosamente |
| 16 | Gate REQ-218 antes/después de completar el informe | Antes: `inspection_report_status=pending`, no cierra. Después de completar: flag pasa a `completed` automáticamente (fix real de esta sesión, confirmado funcionando) — con `quote_status` también satisfecho, el ticket cierra correctamente |
| 17 | Campos dinámicos al cambiar de ticket sin recargar la página (abrir informe A, cerrar, abrir informe B de otro tipo) | Remount limpio — no quedan campos pegados del ticket anterior (verificado en Playwright) |
| 18 | Refrescar la página a mitad del formulario | Se pierde lo tipeado (esperado, no hay borrador/autosave), pero no rompe nada ni deja el ticket en estado inconsistente |
| 19 | Modo alternativo "Súbelo aquí" — toggle | Oculta hallazgos/materiales/fotos, muestra solo adjuntar archivo + 2 firmas; sin archivo el botón Guardar queda deshabilitado |

## Lo que sí funciona (sin cambios, verificado explícitamente)

- Folio `INF-AÑO-NNNN` estable entre guardados sucesivos del mismo informe (no se reasigna).
- `cliente`/`proyecto`/`dirección` no editables desde el informe (precargados del ticket, RN2 REQ-238).
- Fotos "antes"/"después" en secciones separadas, tanto en el formulario como en la vista de solo lectura.
- Selector de fecha/hora real (no texto libre) para fecha/hora de inspección.
- Modo elegido (formulario vs. archivo_subido) persiste correctamente y determina qué se renderiza al reabrir.

## Verificación de regresión (Paso 4/6 del protocolo — checklist completo, no solo lo que falló)

- PHPStan Level 8, código completo: **0 errores**.
- PHPUnit, suite completa: **verde** (incluye 5 tests nuevos de regresión en `tests/Feature/Servicios/InspectionReportBatch8Test.php`, cubriendo los 2 CRÍTICOS de esta sesión + el gate REQ-218).
- Vitest, suite completa: **1004/1004 verde**.
- `tsc --noEmit`: limpio.
- Playwright, spec nuevo `e2e/preqa-scrum301-306-servicios-batch8-informe-inspeccion-20260810.spec.ts` (7 tests, promovido a smoke test permanente por cubrir gates de permiso/estado ya rotos una vez — precarga de técnico, campos dinámicos no pegados, conclusión obligatoria, modo alternativo, fotos/firma en solo lectura, ownership UI, refresh mid-form): **7/7 verde**.

## Deuda registrada (no bloqueante, reportada para seguimiento)

- El componente `InspectionReportModal.tsx` no tenía ningún test unitario propio antes de esta sesión (solo cubierto indirectamente vía `TicketDetailModal.test.tsx`/`TicketIndicators.test.tsx` y ahora el e2e nuevo). No se agregó suite de vitest dedicada en esta pasada — evaluar si vale la pena en un batch futuro dado que es el componente más complejo de Fase 4 hasta ahora.
- El fix de retry en `saveArchivoMode()` puede dejar huérfano en S3 el archivo subido por el intento perdedor de una carrera de doble-submit en modo archivo (caso mucho más raro que el modo formulario, dado que requiere 2 uploads casi simultáneos del mismo archivo) — aceptado como trade-off frente a la alternativa de un 500 expuesto; documentado en el docblock de `withUniqueRetry()`.
