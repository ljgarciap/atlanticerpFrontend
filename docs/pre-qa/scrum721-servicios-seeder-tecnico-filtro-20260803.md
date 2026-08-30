# Pre-QA — SCRUM-721: seeder de demo Servicios + endpoint técnicos + fix filtro (2026-08-03)

Fix deployado a `dev.atlanticerp.ai` (push a `dev` en ambos repos, CI/CD verde) para desbloquear a
Marly, que reportó 0 tickets/sin técnicos en el módulo Servicios. Tres partes:

1. `GET /api/servicios/technicians/internal?fields=options` — 4 técnicos internos reales
   (Carlos Vergara, Pedro Santos, Agustin Rodriguez, Miguel Castillo), gateado por `servicios.read`.
2. Fix del filtro de técnico: el frontend ahora manda `tecnico_id` (el nombre que el backend
   siempre esperó) en vez de `internal_technician_id` (que el backend ignoraba silenciosamente).
3. `ServiciosDemoSeeder` — 14 tickets `[DEMO]`, 4 tipos, 6 estados, 2 casos armados para ejercitar
   el gate de cierre REQ-218 (Clínica Paitilla: informe pendiente; Oficinas Grupo Melo: cotización
   enviada sin aprobar).

Entorno: `https://dev.atlanticerp.ai`. Smoke test permanente:
`e2e/preqa-scrum721-servicios-seeder-tecnico-filtro-20260803.spec.ts` (11 tests, corridos con
`PREQA_BASE_URL=https://dev.atlanticerp.ai npx playwright test e2e/preqa-scrum721-servicios-seeder-tecnico-filtro-20260803.spec.ts --retries=0`).
Screenshots en `e2e/.tmp/preqa-scrum721/` (no versionados).

## Resultado por escenario

| # | Escenario adversarial | Resultado |
|---|---|---|
| 1 | Tabla de Tickets ya no muestra "0 de 0" | 14/14 tickets `[DEMO]` visibles |
| 2 | Select "Técnico" tiene 4 opciones reales | Confirmado: Carlos Vergara, Pedro Santos, Agustin Rodriguez, Miguel Castillo |
| 3 | Filtro de técnico filtra DE VERDAD (no no-op) | 14→2 filas al filtrar por Carlos Vergara; request real manda `tecnico_id=30`, HTTP 200 |
| 4 | REQ-218 — Clínica Paitilla (informe pendiente) bloquea "Resuelto" | Bloqueado, mensaje inline "No se puede cerrar: falta completar el informe de inspección.", select vuelve a "En sitio" |
| 5 | REQ-218 — Oficinas Grupo Melo (cotización enviada no aprobada) bloquea "Resuelto" | Bloqueado, mensaje inline "No se puede cerrar: falta aprobar la cotización." |
| 6 | Tablero — 6 columnas con tarjetas (antes vacías) | Confirmado visualmente: Reportado 4, Agendado 3, En sitio 3, Resuelto 2, Cerrado 1, Cancelado 1 (=14) |
| 7 | Carlos (técnico interno) — API directa PATCH estado | 403, sin regresión de permisos |
| 8 | Carlos (técnico interno) — UI select de estado | Visible pero deshabilitado (14/14 filas) |
| 9 | Milena (vendedor_disenador) — solo lectura | Ve tabla (14 filas) + filtro técnico completo (4 opciones), selects de estado deshabilitados |
| 10 | Endpoint técnicos sin token | 401 |
| 11 | Endpoint técnicos con token `servicios.read` (Milena) | 200, 4 técnicos |

## Hallazgo no bloqueante

- **Menor — dato cosmético:** el técnico interno id 32 está sembrado como `first_name: "Agustin"`,
  `last_name: "Rodriguez"` (sin tildes), mientras que el ticket/spec original lo nombra "Agustín
  Rodríguez". No afecta funcionalidad (login, filtro, permisos todos operan igual) — es un detalle
  de captura de datos en el seeder o en el registro real del usuario. No bloquea el paso a QA;
  queda como nota para quien revise `CoreUserSeeder`/registro de usuarios si se quiere corregir la
  tilde por prolijidad.

## Nota de proceso

Durante la primera pasada, 4 de los 11 tests fallaron por supuestos incorrectos del propio test
Pre-QA (no del producto): (a) se asumió que el fix renombraba el frontend a `internal_technician_id`
cuando en realidad fue al revés — se renombró a `tecnico_id` para igualar lo que el backend ya
esperaba; (b) `selectOption({ label: /regex/ })` no es válido en Playwright, requiere string exacto;
(c) el selector de tarjetas del tablero (`data-testid`/clase adivinada) no existe en
`TicketBoard.tsx`, se confirmó visualmente con captura de pantalla ancha en su lugar. Los 4 se
corrigieron en el mismo pase y el archivo final quedó en 11/11 verde.

## Veredicto

**PASA LIMPIO.** Ningún hallazgo bloqueante. El fix resuelve el bloqueo reportado por Marly (seeder
pobló los 14 tickets y 4 técnicos, el filtro de técnico funciona de verdad, el gate REQ-218 sigue
bloqueando correctamente los 2 casos armados a propósito, y no hay regresión de permisos en
técnico interno ni en vendedor/diseñador). Listo para pasar a QA formal.
