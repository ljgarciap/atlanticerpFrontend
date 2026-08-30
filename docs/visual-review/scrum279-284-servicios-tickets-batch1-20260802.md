# Visual Review — Fase 4 Servicios, Batch 1 (Tickets: tabla, filtros, gate de cierre, indicadores, tablero)

Fecha: 2026-08-02
Tickets: SCRUM-279 (REQ-216 Vista Tabla), SCRUM-280 (REQ-217 Filtros), SCRUM-281 (REQ-218 Gate de
cierre), SCRUM-282 (REQ-219 Indicador Cotización), SCRUM-283 (REQ-220 Indicador Informe), SCRUM-284
(REQ-221 Vista Tablero) — todos parte del Epic SCRUM-330 (Servicios). Nav de Batch 19
(REQ-287→290) comparado contra descripción textual, sin mockup HTML propio.
Mockup: `5A__Servicios_Tickets.html` (adjunto de SCRUM-279).
Entorno: local, `http://localhost:8090` (nginx, build de producción del frontend + proxy backend).
Cuenta usada: `servicio@atlantic.com.pa` (lider_servicios / Aaron Leis).
Herramienta: Playwright CLI (script descartable, node directo con `playwright` importado desde
`atlanticerp-frontend/node_modules`), 6 tickets de prueba ya sembrados repartidos en las 6 columnas.

Screenshots: `real-tickets-table.png`, `real-tickets-board.png` (ver scratchpad de la sesión;
adjuntados también en el comentario de Jira).

---

## CRÍTICO

**1 — Indicador de Cotización roto para el estado real que envía el backend (`pending`)**
Afecta: Vista Tabla (columna "Cotización") y Vista Tablero (bloque de cotización en la tarjeta) —
mismo componente `QuoteIndicator` en ambas vistas.

Qué se ve: en vez del botón bloqueado con candado ("🔒 Generar cotización", RN2 de REQ-219,
Escenario 2) o el botón activo "Generar cotización" (RN3, Escenario 3), la columna/tarjeta muestra
el texto crudo sin traducir `tickets.quote.pending`, sin estilo de badge. Reproducido en 4 de 6
tickets sembrados (GAR-2026-0001, GAR-2026-0002, RET-2026-0001, REC-2026-0001) — los únicos 2 que
se ven bien son el que es "No aplica" por tipo (INS-2026-0001, Instalación/Instalación) y el que ya
tiene una cotización generada con estado "Aprobada" (INS-2026-0002).

Causa raíz (confirmada leyendo código, no solo inferida): contrato desincronizado entre frontend y
backend.
- Backend (`app/Modules/Servicios/Models/Ticket.php` `QUOTE_STATUSES`): `not_applicable`,
  `pending`, `draft`, `sent`, `approved`, `rejected`. `pending` es el estado inicial real y
  esperado para todo ticket que sí requiere cotización (`TicketService::deriveInitialStatuses`) —
  nunca envía `null` ni ningún valor `locked`.
- Frontend (`src/types/servicios.ts` `QuoteStatus`): `'not_applicable' | 'locked' | 'draft' |
  'sent' | 'approved' | 'rejected' | null`. El componente `QuoteIndicator`
  (`src/components/servicios/TicketIndicators.tsx`) solo tiene ramas explícitas para
  `not_applicable`, `locked` y `null` — como el backend nunca manda ninguno de esos dos últimos,
  `pending` cae siempre a la rama genérica final, que llama `t('tickets.quote.pending')` (clave
  inexistente en `src/i18n/locales/{es,en}/servicios.json` — ahí solo están `notApplicable`,
  `locked`, `generate`, `comingSoon`, `draft`, `sent`, `approved`, `rejected`) y a
  `QUOTE_BADGE_CLASSES['pending']` (tampoco existe, por eso no tiene estilo de pill).

Impacto contra criterio de aceptación: rompe directamente Escenario 2 y Escenario 3 de SCRUM-282 —
el botón "Generar cotización" (bloqueado o activo) nunca aparece en la app real para ningún ticket
que sí requiere cotización, con o sin informe completado. Esto también deja sin poder probarse en
la práctica el flujo de bloqueo por candado (RN2: clic en el candado debe abrir el informe con
explicación) porque el candado nunca se renderiza.

No es solo un tema de traducción — es un mismatch de tipos: aunque se agregue la clave i18n
`tickets.quote.pending`, seguiría sin distinguir "bloqueado por informe pendiente" (candado) de
"listo para cotizar" (botón activo), que es la regla de negocio central de REQ-219 RN2/RN3.
Corrección sugerida (a validar por Backend/Frontend Dev + Arquitecto si cambia el contrato): el
frontend debe tratar `pending` como el estado "aún sin generar" y derivar bloqueado/activo
comparando con `inspection_report_status` (mismo dato que ya reciben en el ticket), en vez de
esperar un valor `locked` que el backend no envía.

---

## ACEPTABLE (nota, no bloquea)

- **Fila de chips de Tipo ausente** — el mockup adjunto la tiene (Todos/Instalaciones/
  Garantías/Reclamos/Retrofit), pero SCRUM-280 (REQ-217 RN5) documenta explícitamente que se quitó
  a propósito por ser redundante con el select de Tipo. Confirmado en código
  (`TicketFiltersBar.tsx`, comentario explícito). No es un hallazgo.
- **Botón "Limpiar filtros"** solo visible cuando hay al menos un filtro activo (mockup lo muestra
  siempre, deshabilitado o no). Funcionalidad preservada — al aplicar cualquier filtro el botón
  aparece y limpia todo en un clic (verificado en código, `hasActiveFilters`). Variante de UX, no
  pérdida de funcionalidad.
- **Select de Estado sin color de fondo por estado** — el mockup pinta el `<select>` con el color
  del estado (rojo/ámbar/teal/gris); la implementación real usa un select neutro (blanco/borde
  gris) para las 6 opciones. El Tablero sí usa color (punto de color + texto) para diferenciar
  columnas. Variante de estilo, no funcional.
- **Botones "Ver cotizaciones" y "+ Nuevo ticket"** del header del mockup no existen en la
  implementación. Confirmado como fuera de alcance de este batch: SCRUM-279 (REQ-216) remite
  explícitamente la numeración/creación al "requerimiento de Nuevo ticket" (historia separada, no
  parte de SCRUM-279→284), y "Ver cotizaciones" (historial cross-ticket) depende del módulo
  completo de Cotización, tampoco construido todavía (mismo criterio de exclusión ya indicado para
  el flujo de "Generar cotización"/"Generar informe"). No se reporta como hallazgo.
- **"Agendar"/"Reagendar" deshabilitado** (placeholder con tooltip) en vez del formulario del
  mockup — documentado en código como REQ-222/226, Batch 2, fuera de alcance de este batch.
- **Etiquetas de tipo en singular** ("Instalación", "Garantía", "Reclamo") vs. plural del mockup
  ("Instalaciones", "Garantías", "Reclamos") en el filtro y en los type-tags. Cosmético.
- **Columna Técnico muestra "Sin asignar" en los 6 tickets sembrados** — comportamiento correcto
  de RN5/REQ-216 (fallback documentado), la ausencia de técnico es un dato de siembra, no un bug
  de la columna en sí (el fallback visual sí se ve y es correcto).

---

## Lo que sí cumple

- **Vista Tabla** — las 10 columnas del mockup están presentes y con el contenido esperado:
  N° Ticket, Cliente (+descripción breve), Tipo, Subtipo (con "—" para tipos sin subtipo, Reclamo/
  Retrofit), Técnico (avatar+iniciales+nombre o "Sin asignar"), Estado (select inline), Cotización,
  Informe de inspección, Reportado (fecha), Fecha agendada, más columna de acceso a detalle.
- **Barra de filtros** — buscador de texto libre + selects de Tipo/Técnico/Estado + contador
  "Mostrando X de Y tickets", tal como el mockup (menos la fila de chips, ver ACEPTABLE arriba).
- **Vista Tablero** — 6 columnas fijas (Reportado, Agendado, En sitio, Resuelto, Cerrado,
  Cancelado — confirmado `TICKET_STATUSES` en `types/servicios.ts` y renderizado real), cada una
  con su conteo. Tarjetas muestran N° ticket, cliente, tipo/subtipo con color, indicador de
  cotización (con el mismo bug de arriba), avatar del técnico, fecha agendada o link "Agendar".
  Drag-and-drop implementado con `@hello-pangea/dnd`, mismo endpoint que el select de la tabla.
- **Indicador de bloqueo usa ícono SVG (`IcoLock`)**, nunca el emoji 🔒 literal — cumple la regla
  SCRUM-56 de no-emoji. Confirmado tanto por lectura de código (`TicketIndicators.tsx` importa
  `IcoLock` de `@/components/icons`) como por inspección del DOM real vía Playwright (sin el
  carácter 🔒 en el texto de la página) — aunque, dado el bug CRÍTICO de arriba, este ícono nunca
  llega a renderizarse en la práctica porque el estado `locked` nunca ocurre.
- **Indicador de Informe de Inspección** — funciona correctamente para los 3 casos (No aplica /
  Generar informe / Completado), porque acá sí coincide el contrato: `InspectionReportStatus`
  incluye `'pending'` en el frontend y el componente lo maneja explícitamente.
- **Menú de navegación (Batch 19, REQ-287→290)** — 5 tabs (Inicio, Tickets, Técnicos▾, Insumos y
  Herramientas, Reportes) con "Técnicos" como desplegable (Internos/Externos), coincide con la
  descripción textual del requerimiento; rol limitado (`vendedor_disenador`) recorta a 3 tabs +
  una sola opción de Técnicos, según REQ-288 (verificado en código, no re-testeado en vivo con esa
  cuenta en esta sesión — la lógica de gating está clara y no ambigua).

---

## Resultado

**Con hallazgos — bloquea el paso a Pre-QA.** 1 CRÍTICO (indicador de Cotización roto por mismatch
de contrato `pending` vs `locked`/`null`, afecta SCRUM-282 y de rebote la vista Tablero de
SCRUM-284). Vuelve a PM para reasignar a Backend/Frontend Dev — el fix probablemente implica
decidir en el frontend cómo derivar "bloqueado" vs "activo" a partir de `pending` +
`inspection_report_status`, sin asumir que el backend vaya a emitir `locked`. Una vez corregido,
re-correr el checklist completo de Cotización en Tabla y Tablero (no solo el ítem puntual) antes de
dar luz verde.

---

## RE-CHECK — 2026-08-02 (segunda pasada, checklist completo)

Motivo: regla del proyecto — un hallazgo bloqueante no se cierra solo verificando el fix puntual,
se corre el checklist completo de nuevo antes de dar luz verde.

Fix aplicado: commit `0ec23f5` (`fix(servicios): derive quote indicator display state from raw
backend status`) — agrega `deriveQuoteDisplayStatus()` en `src/types/servicios.ts` (deriva
`locked`/`null`/passthrough a partir de `quote_status` crudo + `inspection_report_status`) y
actualiza `TicketTable.tsx`/`TicketBoard.tsx` para pasarle a `QuoteIndicator` el valor ya resuelto,
nunca el crudo. `npx tsc --noEmit` limpio, `npx vitest run` 820/820 (incluye
`TicketIndicators.test.tsx` con 6 casos nuevos para `deriveQuoteDisplayStatus`), `npm run build`
corrido después del fix (dist `index-DnCVQI4r.js`, timestamp 22:20:34, coincide exactamente con el
commit del fix).

Entorno: local, `http://localhost:8090`, mismos 6 tickets sembrados (sin re-siembra, confirmados
intactos vía consulta directa a `atlantic_servicios.tickets`). Cuenta:
`servicio@atlantic.com.pa`. Herramienta: Playwright CLI (script descartable).

**Verificación punto por punto del criterio del hallazgo original:**

| Ticket | `quote_status` / `inspection_report_status` (BD) | Esperado | Resultado real |
|---|---|---|---|
| GAR-2026-0001 | pending / pending | 🔒 Bloqueada | 🔒 Bloqueada ✓ |
| GAR-2026-0002 | pending / pending | 🔒 Bloqueada | 🔒 Bloqueada ✓ |
| INS-2026-0001 | not_applicable / not_applicable | No aplica | No aplica ✓ |
| INS-2026-0002 | approved / completed | Badge "Aprobada" | Badge "Aprobada" ✓ |
| REC-2026-0001 | pending / not_applicable | Botón activo "Generar cotización" | Botón activo "Generar cotización" ✓ |
| RET-2026-0001 | pending / pending | 🔒 Bloqueada | 🔒 Bloqueada ✓ |

Confirmado en **ambas vistas** (Vista Tabla y Vista Tablero, mismo componente `QuoteIndicator`
compartido) — ningún texto crudo de i18n (`tickets.quote.pending` ni ningún otro
`tickets\.quote\.\w+` sin resolver) aparece en el DOM de ninguna de las dos vistas (verificado
programáticamente sobre `body.textContent`, no solo visualmente).

Confirmado también que el ícono de bloqueo sigue siendo SVG (`IcoLock`), nunca el emoji 🔒 literal
— inspeccionado el `outerHTML` real del botón "Bloqueada": `<svg ...><rect.../><path.../></svg>`,
sin el carácter Unicode U+1F512 en ningún lugar del body. Cumple regla SCRUM-56.

**Resto del checklist original, re-confirmado sin cambios:**
- Vista Tabla: 10 columnas presentes y con contenido correcto (N° Ticket, Cliente, Tipo, Subtipo,
  Técnico, Estado, Cotización, Informe de Inspección, Reportado, Fecha agendada + acceso a
  detalle).
- Barra de filtros: buscador + selects Tipo/Técnico/Estado + contador "Mostrando X de Y" — probado
  en vivo aplicando filtro Tipo=Garantía, el contador bajó a "Mostrando 2 de 2 tickets" y el botón
  "Limpiar filtros" apareció correctamente.
- Vista Tablero: 6 columnas (Reportado/Agendado/En sitio/Resuelto/Cerrado/Cancelado) confirmadas
  visibles con viewport ancho (1920px) — la columna "Cancelado" que quedaba cortada en la captura
  anterior (viewport 1440px) es solo recorte de la captura, no un bug de layout.
- Menú de navegación: 5 tabs (Inicio, Tickets, Técnicos▾, Insumos y Herramientas, Reportes)
  presentes sin cambios.

**Punto 3 del re-check — verificación de que el fix no rompió nada colateral (`showAmount` en
Tablero):** confirmado en código (`TicketIndicators.tsx` línea 73: `{showAmount && amount != null
&& ...}`) que la lógica de mostrar el monto no fue tocada por el fix — sigue intacta. Nota nueva
(no bloqueante, ya implícita en el comentario `quote_amount: puede faltar en este batch` de
`types/servicios.ts`): la tabla `atlantic_servicios.tickets` en la base real **no tiene
columna `quote_amount`** (confirmado vía `\d atlantic_servicios.tickets`), así que el monto
nunca se renderiza con los datos sembrados actuales — no es un bug de este batch ni del fix, es un
campo que depende de un batch posterior del módulo de Cotización (ya documentado como fuera de
alcance). Se deja registrado acá para que quede explícito, no como hallazgo nuevo.

### Resultado del re-check

**Visual Review APROBADO.** El hallazgo CRÍTICO original está resuelto y verificado en ambas
vistas con los 6 casos reales de datos sembrados; el resto del checklist funcional pasa limpio sin
regresiones nuevas. Listo para pasar a Pre-QA.
