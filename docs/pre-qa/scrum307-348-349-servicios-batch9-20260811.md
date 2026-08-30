# Pre-QA — Fase 4 Servicios, Batch 9 (REQ-244/278/279)

**Fecha:** 2026-08-11
**Tickets:** SCRUM-307 (REQ-244), SCRUM-348 (REQ-278), SCRUM-349 (REQ-279)
**Entorno:** stack Docker local (`localhost:8090`), checkout sin commitear. Senior Review y
Visual Review ya habían pasado limpio antes de esta pasada.

## Resumen del veredicto

**LISTO PARA QA FORMAL** — 1 hallazgo MEDIO real encontrado y corregido en el momento, checklist
completo re-corrido 3 veces consecutivas sin regresiones.

| Ticket | Veredicto |
|---|---|
| SCRUM-307 (REQ-244) | PASA — toggle blanco/lleno correcto por estado, permisos server-side y ahora también frontend (fix aplicado, ver abajo) |
| SCRUM-348 (REQ-278) | PASA — RN1 (solo tipo=claim), RN4 (obligatoriedad diagnóstico+firma, 3 combinaciones + whitespace), RN5 (lock total incluso para superadmin), RN6 (ownership real por técnico asignado, no solo UI) |
| SCRUM-349 (REQ-279) | PASA — RN1 (formato 4 secciones), RN2 (404 limpio sin hoja completada), RN3 (PDF visible a roles sin permiso de edición) |

## Hallazgo MEDIO — encontrado y corregido en esta sesión

### El botón "Ver plantilla en blanco" no gateaba por rol en el frontend (solo el backend bloqueaba)

**Criterio incumplido:** REQ-244, permisos — "Descargar plantilla en blanco: Aaron y técnico
interno" (no Gerencia, no Vendedor/Diseñador, no Garantías).

**Cómo se reprodujo:** login como `daniela@illuminations.com.pa` (rol `management`) → abrir un
ticket de instalación sin informe completado → el botón "Ver plantilla en blanco" se mostraba
igual. Al hacer clic, el backend rechazaba correctamente con 403 (la defensa real ya estaba
intacta), pero el usuario solo veía un toast de error genérico sin explicar que era un tema de
permiso — 3 de los 5 roles con acceso de lectura al módulo veían un botón condenado a fallar.

**Fix:** nuevo prop `canDownloadBlank` en `InspectionReportModal.tsx`, calculado en
`TicketDetailModal.tsx` vía `canDownloadBlankInspectionReport(role)` con el mismo roster que la
ruta backend (`role:superadmin,lider_servicios,tecnico_servicios`, sin `garantias_servicios`). El
botón "Ver / Imprimir" (informe ya completado) sigue visible para todos los roles con lectura —
RN3 de REQ-244 es de solo lectura para ese caso, no requiere el roster angosto.

**Archivos:** `src/components/servicios/InspectionReportModal.tsx`,
`src/components/servicios/TicketDetailModal.tsx`

## Camino de ruptura verificado

| # | Escenario de ruptura | Resultado |
|---|---|---|
| 1 | RN4 — diagnóstico vacío + firma llena | 422, bloqueado |
| 2 | RN4 — diagnóstico lleno + firma vacía | 422, bloqueado |
| 3 | RN4 — ambos vacíos | 422, bloqueado |
| 4 | RN4 — firma con solo espacios en blanco | 422 (Laravel `required` hace trim), botón Guardar deshabilitado en UI |
| 5 | RN5 — superadmin intenta `PUT` sobre una hoja ya `completed` vía API directa | 409, sin excepción de rol |
| 6 | RN5 — UI de una hoja completada | campos `disabled` en el DOM, sin botón Guardar |
| 7 | RN6 — técnico interno NO asignado a un ticket puntual intenta editar su Hoja de Reclamo | 403 real del backend, `<select>`/input de firma también `disabled` en el DOM (no solo botón escondido) |
| 8 | RN6 — técnico SÍ asignado | 200, completa normalmente |
| 9 | RN6 — rol fuera del roster (`garantias_servicios`, `management`) | 403 por el gate de ruta |
| 10 | RN1 (SCRUM-348) — GET/PUT `claim-sheet` sobre un ticket `tipo≠claim` | 422 en ambas direcciones |
| 11 | REQ-244 — `/pdf/blank` con rol fuera de roster (management/vendedor_disenador/garantias_servicios) | 403 |
| 12 | REQ-244 — botón "Ver plantilla en blanco" para esos mismos roles | **MEDIO encontrado y corregido** — ver arriba |
| 13 | SCRUM-349 RN2 — PDF de Hoja de Reclamo sin hoja creada | 404 limpio |
| 14 | SCRUM-349 RN3 — rol `management` (no puede editar) descarga el PDF de una hoja completada | 200, descarga real |
| 15 | Concurrencia — 5 `PUT` simultáneos sobre una hoja nueva | 1×200 + 4×409 (confirma en vivo el fix de Senior Review de esta misma sesión) |
| 16 | `fecha_reclamo` malformada (2 variantes) | 422 limpio |
| 17 | `diagnostico` con valor fuera del catálogo | 422 limpio |
| 18 | Reload a mitad de flujo (sin guardar) | sin borrador ni estado corrupto — por diseño no hay persistencia intermedia |
| 19 | Doble clic rápido en Guardar | botón deshabilitado durante el request (`mutation.isPending`), 1 sola fila en BD |

## Lo que sí funciona (verificado en runtime)

- Precarga real de secciones 1-2 de Hoja de Reclamo con datos reales de `ticket_products` (no
  mock) — el dato fluye correctamente desde un batch anterior.
- Botón blanco→lleno de Informe de Inspección cambia según exista o no el informe, nunca vuelve a
  ofrecer la plantilla en blanco tras completar.
- PDF de Hoja de Reclamo replica el formato de 4 secciones esperado (verificado con `pdftotext`).

## Test permanente promovido

`e2e/preqa-scrum307-348-349-servicios-batch9-20260811.spec.ts` — 7 tests: precarga (RN1/RN2),
RN4 (obligatoriedad), RN6 (ambos casos de ownership, autosembrado para ser re-corrible), RN3 de
impresión cross-role, toggle blanco/lleno, y el hallazgo de permisos que motivó el fix de esta
sesión. Confirmado idempotente en 3 corridas consecutivas, y re-verificado de forma independiente
tras el cierre de Pre-QA (`npx playwright test e2e/preqa-scrum307-348-349-...` → 7/7).

## Deuda registrada (no bloqueante)

- Sin tests PHPUnit dedicados para `ClaimSheetService`/`ClaimSheetController` (mismo patrón de
  deuda ya registrado para `InspectionReportModal.tsx` en Batch 8).
- Wording del PDF de Hoja de Reclamo y label de diagnóstico "defectuoso" no calcan literalmente
  el texto de la RN — ya evaluado y aceptado por Visual Review, no es un hallazgo de
  comportamiento.
