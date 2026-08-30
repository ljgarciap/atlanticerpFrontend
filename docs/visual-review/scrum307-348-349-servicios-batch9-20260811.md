# Visual Review — Fase 4 Servicios, Batch 9 (REQ-244/278/279)

**Fecha:** 2026-08-11
**Tickets:** SCRUM-307, SCRUM-348, SCRUM-349
**Mockup:** `5A__Servicios_Tickets.html` (adjunto a los 3 tickets, mismo archivo — funciones
`hojaReclamo`/`openHojaReclamoModal`/`printHojaReclamo`, `printInformeBlank`/`printInforme`/
`viewInforme`)

## Veredicto: APROBADO tras 2 rondas — puede pasar a Pre-QA

Primera pasada: 3 hallazgos CRÍTICOS. Corregidos en el momento. Segunda pasada (re-check con
timing real, no solo lectura de código): los 3 confirmados resueltos.

## CRÍTICO 1 — Sección 1 de Hoja de Reclamo: faltaban "Proyecto" y "Responsable"

El mockup (`buildHojaReclamoFormHtml`/`printHojaReclamo`) muestra 6 campos en "Datos del
reclamante" (Proyecto, Responsable, Cliente, Contacto, Dirección, Email); el desarrollo solo
mostraba 4. `Responsable` = técnico interno asignado al ticket (`t.tecnico` en el mockup).

**Fix:** `ClaimSheetController::serialize()` agrega `proyecto`/`responsable` al objeto
`reclamante` (ambos ya venían disponibles vía `TicketService::detail()`/`Ticket::
internalTechnician`, solo no se propagaban); `ClaimSheetModal.tsx` y `claim-sheet-pdf.blade.php`
los renderizan. Verificado con `pdftotext` sobre el PDF real y en el modal (ticket 96, técnico
Carlos Vergara → "Responsable: Carlos Vergara").

## CRÍTICO 2 — Sección 2: faltaban "Cant. recibida" y "Cant. pendiente"

El mockup tiene 6 columnas en la tabla de productos; el desarrollo solo 4 (sin las 2 columnas de
cantidad). El dato ya viajaba en el payload (`ClaimSheetDetail.productos[].cantidad_recibida/
cantidad_pendiente`) — el modal y el blade del PDF lo descartaban.

**Fix:** ambos ahora muestran las 3 cantidades (reclamo/recibida/pendiente). Verificado con un
`ticket_products` real (Philips/LED-2026, 10/6/4) en modal y PDF.

## CRÍTICO 3 — Carrera de hidratación al reabrir un modal justo después de guardar

`InspectionReportModal.tsx`/`ClaimSheetModal.tsx` usaban un flag `hydrated` que sincroniza el
formulario desde `data` una sola vez por montaje — si `invalidateQueries()` no había resuelto
todavía cuando el modal se reabría, quedaba hidratado con datos viejos/vacíos para siempre.
Intermitente, dependiente de timing de red.

**Fix (2 estrategias distintas según qué devuelve cada mutation):**
- `ClaimSheetModal`: `save()` devuelve el registro completo sin nada pendiente → `onSuccess`
  siembra directo con `qc.setQueryData(...)`, sin ventana de carrera posible.
- `InspectionReportModal`: `save()`/`saveUpload()` no incluyen fotos recién subidas (se suben
  después) → `setQueryData` habría cacheado fotos desactualizadas; en su lugar `onSuccess` es
  `async` y hace `await qc.invalidateQueries(...)` antes de cerrar el modal, garantizando cache
  fresco antes de que se pueda reabrir.

**Verificado en el re-check** con polling de DOM de alta frecuencia (no el auto-retry de
Playwright, que puede enmascarar el bug) en ambos modales — datos correctos ya presentes ~50ms
después de reabrir, sin persistencia de estado viejo.

## Lo que sí cumple (sin cambios)

- Toggle REQ-244 blanco↔lleno funciona end-to-end, ambos disparan descarga real de PDF (200,
  `application/pdf`).
- Hoja de Reclamo: 4 secciones, precarga read-only correcta, guardado real, bloqueo total tras
  completar (RN5) confirmado — campos `disabled`, sin botón Guardar.
- Botón "Ver/Imprimir" de Hoja de Reclamo solo aparece cuando `completed`; backend también
  bloquea el PDF con 404 antes de eso (RN2).
- Fila del ticket en `TicketDetailModal` reemplaza "Informe de Inspección" por "Hoja de Reclamo"
  para `tipo=claim`.
- 4 opciones de diagnóstico presentes, semánticamente igual al mockup.

## ACEPTABLE (nota, no bloquea)

- Textos de botón distintos ("Ver plantilla en blanco" vs. "Descargar/Imprimir en blanco") —
  misma función.
- Orden de campos en Sección 3 invertido (Fecha antes de Descripción).
- Acceso a Hoja de Reclamo requiere abrir el detalle del ticket primero (mockup lo expone como
  celda clickeable directa) — funcionalidad 100% alcanzable, un clic extra.
- `InspectionReportModal` reutiliza el mismo formulario editable para ver y editar en vez de un
  HTML de solo-vista separado — correcto, alinea con RN5 de REQ-238 (editable tras Completado).
- Wording: label "defectuoso" se muestra como "Defecto de fábrica" (consistente front/back);
  encabezado del PDF dice "Hoja de Reclamo — Ticket [numero]" en vez del literal "Hoja de Reclamo
  N°: [numero]" de la RN1 de SCRUM-349 — desviación de texto, no de funcionalidad. Registrado para
  awareness, no bloquea.
