# Pre-QA + Visual Review (fusionados) — SCRUM-286 (REQ-223: Navegación Tabla/Tablero ↔ Historial de cotizaciones ↔ Técnicos externos)

**Fecha:** 2026-08-12
**Entorno:** stack local (nginx `http://localhost:8090`, vite `http://localhost:5173`)
**Usuario:** `servicio@illuminations.com.pa` (Aaron Leis, `lider_servicios`, acceso completo a Servicios)
**Herramienta:** Playwright CLI — `atlanticerp-frontend/e2e/preqa-scrum286-servicios-navegacion-tickets-20260812.spec.ts`

## Por qué esta pasada es distinta
REQ-223 no se implementó en un batch nuevo — el código ya existe, repartido entre Batch 1
(navegación base), Batch 2, Batch 3 (botón "Ver cotizaciones" habilitado), Batch 12 (Historial de
cotizaciones real) y Batch 19 (`ServiciosNavMenu`). Esta pasada verifica en vivo que las 4 RN y los
3 escenarios de aceptación del ticket funcionan de punta a punta con el código ya desplegado.

## Nota de arquitectura (no objetada)
La implementación usa 3 rutas React Router separadas (`/servicios/tickets`,
`/servicios/cotizaciones`, `/servicios/tickets/externos`) bajo el mismo `ServiciosNavMenu`
compartido, en vez de un único archivo con tabs internos — mismo patrón que el resto de pestañas
del módulo (Inicio, Técnicos internos, Insumos, Reportes, Ajustes). Se acepta como equivalencia
funcional válida del "vive dentro de la misma pantalla/archivo" del texto literal del ticket: lo
que se verifica es el comportamiento real (sin pasos intermedios, sin perder contexto, header
correcto), no la forma literal de un solo archivo.

## Mockup (Jira attachment 10534, `5A__Servicios_Tickets.html`)
Confirmados presentes en el mockup: toggle "Tabla"/"Tablero", botón "Ver cotizaciones", entrada
"Técnicos externos", botón "+ Nuevo ticket", botón "Agregar técnico externo" — mismo set que la
implementación real (ver screenshots).

## Checklist

| # | Regla/Escenario | Escenario de ruptura intentado | Resultado |
|---|---|---|---|
| RN1 / Escenario 1 | Filtro Estado=Agendado activo en Tabla, cambiar a Tablero, ¿se pierde? | Se sembraron/usaron 4 tickets reales con estado Agendado (fixture RET/INS pre-QA existente); filtro aplicado en Tabla → "Mostrando 4 de 4"; toggle a Tablero → columna "Agendado" muestra los mismos 4, resto de columnas "Sin tickets"/0, select sigue en "Agendado". El filtro NO se reinició. | PASA |
| RN2 / Escenario 2 | "Ver cotizaciones" desde Tickets | Click → navega a `/servicios/cotizaciones`, título cambia a "Historial de cotizaciones", botones Tabla/Tablero/Nuevo ticket ya no están presentes (0 matches confirmados) | PASA |
| RN3 / Escenario 3 | "Técnicos → Técnicos externos" desde OTRA pantalla del módulo (no desde Tickets) | Se arrancó desde `/servicios/inicio` a propósito (no desde Tickets, para probar "desde cualquier pantalla") → click Técnicos → Técnicos externos → navega directo a `/servicios/tickets/externos`, sin pantalla intermedia | PASA |
| RN4 (Tickets) | Header de Tickets tiene Tabla/Tablero + Ver cotizaciones + Nuevo ticket | Confirmado visible | PASA |
| RN4 (Historial de cotizaciones) | Header cambia — título nuevo, botones de Tickets desaparecen | Confirmado título "Historial de cotizaciones", 0 matches de "Tabla"/"Nuevo ticket" | PASA |
| RN4 (Técnicos externos) | Header cambia — "Ver cotizaciones"/"+ Nuevo ticket" desaparecen, aparece "+ Agregar técnico externo" | Confirmado 0 matches de "Ver cotizaciones"/"Nuevo ticket", "+ Agregar técnico externo" visible | PASA |

## Lo que sí cumple
Las 4 RN y los 3 escenarios de aceptación completos, verificados en vivo (no solo lectura de
código) contra datos reales, incluyendo el caso de ruptura más relevante del ticket (filtro
persistido al cambiar de vista, con conteo verificado, no solo "no crashea").

## Hallazgos
Ninguno. 0 CRÍTICOS, 0 MEDIOS.

## Screenshots
`atlanticerp-frontend/e2e/.tmp/scrum286/01-tickets-header.png` .. `06-tecnicos-externos-header.png`
(no versionados — artefactos de la corrida, referencia visual de esta sesión).

## Resultado
Pasada limpia. Ticket transicionado de `Dev Testing` a `QA`.
