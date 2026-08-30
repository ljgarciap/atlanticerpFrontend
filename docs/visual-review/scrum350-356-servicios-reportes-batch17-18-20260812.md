# Visual Review — Reportes de Servicios (SCRUM-350→356 / REQ-280→286)

**Fecha:** 2026-08-12
**Batch:** 17/18 — Fase 4 Servicios, pantalla "Reportes"
**Mockup de referencia:** `5E__Servicios_Reportes.html` (adjunto de SCRUM-356)
**Entorno probado:** stack local (Docker, API `http://localhost:8090`) + Vite propio en `:5182`
sobre el checkout principal de `atlanticerp-frontend` en `dev` (NO el dev server de otra sesión en 5173).
**Herramienta:** Playwright CLI (scripts descartables + capturas full-page). Cuentas reales
(Aaron `lider_servicios`, Daniela `management`, Carlos `tecnico_servicios`, Pedro
`tecnico_servicios`, Milena `vendedor_disenador`, Yirena `lider_compras`) — nunca cuentas demo.

**Veredicto: APROBADO** tras corregir 4 hallazgos CRÍTICOS en el momento y re-correr el checklist
completo (ver "Fixes aplicados" al final).

---

## Checklist funcional del mockup vs. desarrollo

| # | Elemento del mockup | Estado | Nota |
|---|---|---|---|
| 1 | Selector de período (arriba a la derecha) | ✅ | Mes/año concreto, mes actual + 5 anteriores. La 3ra opción "Últimos 3 meses" NO se implementó — decisión de producto ya tomada (sin regla de negocio), no es hallazgo |
| 2 | Tarjeta "Servicios completados — 34 / de 52 tickets del mes" | ✅ (tras fix) | Mostraba `61.9%`. Corregido: ahora "13 / de 21 tickets del mes" |
| 3 | Tarjeta "Resuelto en 1ra visita — 78% / sin necesitar 2da visita" | ✅ | 83.3%, idéntico a Inicio |
| 4 | Tarjeta "Tiempo promedio — 2.4 días / reporte → resolución" | ✅ | 3.4 días, subtítulo "Todos los tipos de ticket" (RN3 exige distinguirlo de Inicio) |
| 5 | Tarjeta "Informes pendientes — 4 / esperando generarse" | ✅ (tras fix de copy) | El subtítulo decía "Informes de inspección por completar", ya no describía el número (ahora incluye Hojas de Reclamo) |
| 6 | Tarjeta "Instalaciones cotizadas — 14 / $31,200 en cotizaciones generadas este mes" | ✅ (tras fix) | Estaban invertidas (monto arriba, "8 servicios" abajo). Corregido al orden/copy del mockup |
| 7 | Tarjeta "Instalaciones realizadas — 11 / $24,850 en instalaciones resueltas/cerradas este mes" | ✅ (tras fix) | Ídem |
| 8 | Donut "Distribución por tipo" + leyenda con cantidad por tipo | ✅ | 4 tipos incl. Retrofit, colores = etiquetas de tipo en Tickets |
| 9 | "Distribución por técnico" con color propio de cada técnico | ✅ | Barras verticales (mockup: horizontales) — variante de layout, mismos datos |
| 10 | "Servicios completados — 2026": grilla de 6 columnas, 2da fila automática | ✅ | Ene–Jun fila 1, Jul–Ago fila 2 |
| 11 | 4 barras individuales por mes, **cada una con su número visible encima** | ✅ (tras fix) | Los números solo existían como tooltip (`title`) al pasar el mouse. Corregidos a números visibles |
| 12 | Total del mes debajo del nombre del mes | ✅ | |
| 13 | Sección "Comisión — Carlos Vergara" visualmente diferenciada (fondo/borde distinto) | ✅ | Panel ámbar `#FFFBF3` con borde `#f0d9a8` |
| 14 | Comisión: total del mes + los 5 criterios ponderados con peso/% obtenido/monto | ✅ | Idéntico al modal de Técnicos Internos (misma fuente, ver Pre-QA) |
| 15 | Comisión: navegación de período propia | ✅ | Botones ‹ › con el mes siguiente deshabilitado en el mes actual |
| 16 | Biblioteca: buscador + select de tipo de documento + select de estado | ✅ | Combinables |
| 17 | Biblioteca: columnas Ticket / Cliente / Tipo / Técnico / Fecha / Estado | ✅ | + columna "Ver" |
| 18 | Biblioteca: cada fila abre su documento | ✅ (tras fix) | Abría el ticket contenedor y exigía un 2do clic sobre el indicador; ahora abre directo el Informe/Hoja de Reclamo |
| 19 | Iconografía sin emoji (regla SCRUM-56) | ✅ | El mockup usa 🔒 en la sección de comisión; el desarrollo no lo replica — correcto |

---

## CRÍTICO

Los 4 hallazgos CRÍTICOS encontrados fueron **corregidos en esta misma pasada** y re-verificados con
el checklist completo (no quedan abiertos):

1. **CRÍTICO (SCRUM-350) — la tarjeta "Servicios completados" no mostraba el desglose del mockup.**
   Mostraba `61.9%` con subtítulo genérico; el mockup y el Escenario 1 del ticket piden "34 de 52
   tickets del mes". El endpoint solo exponía el porcentaje, así que el frontend no podía
   reconstruirlo. **Corregido** (backend + frontend, ver abajo).
2. **CRÍTICO (SCRUM-351) — tarjetas de instalaciones invertidas respecto del mockup.**
   El monto era la cifra principal y el conteo un subtítulo genérico ("8 servicios"). Además de no
   coincidir con el mockup, en un mes sin cotizaciones aprobadas la tarjeta mostraba "$0.00" como
   cifra principal con 3 instalaciones reales detrás (reproducido con julio 2026). **Corregido.**
3. **CRÍTICO (SCRUM-354) — los números por tipo del gráfico anual no eran visibles.**
   El mockup muestra los 4 números encima de las 4 barras de cada mes; el desarrollo solo los
   exponía en el `title` (tooltip al pasar el mouse). RN2 es explícita sobre el porqué ("para que el
   valor de cada tipo se lea directamente sin tener que calcular proporciones visuales").
   **Corregido** (números visibles + barras ensanchadas a 12px para que sean legibles).
4. **CRÍTICO (SCRUM-356) — la biblioteca no abría el documento.**
   El mockup y RN2 definen que cada fila lleva a su Informe/Hoja de Reclamo; el desarrollo navegaba
   a `/servicios/tickets?ticket=<id>`, que abre el ticket contenedor y deja el documento a un 2do
   clic sobre el indicador. **Corregido** con deep-link `&doc=inspection_report|claim_sheet`.

## ACEPTABLE (nota, no bloquea)

- **Distribución por técnico**: mockup con barras horizontales + nombre a la derecha; desarrollo con
  barras verticales de Chart.js y nombre debajo. Mismos datos, mismos colores por técnico.
- **Subtítulos de contexto de los 2 gráficos** ("52 tickets del mes" en el donut, "Tickets atendidos
  este mes" en el de técnicos) no están en el desarrollo. La cantidad por tipo sí está en la leyenda
  y el eje Y del otro gráfico es explícito — no se pierde información.
- **"Limpiar filtros"** de la biblioteca: el mockup tiene un botón; el desarrollo se limpia
  volviendo cada select a "Todos" y vaciando el buscador. Misma funcionalidad, un clic más.
- **"Mostrando 6 de 6 reportes"**: el desarrollo usa el componente global `Pagination` ("1–5 de 9" +
  selector de tamaño de página), política de paginación del proyecto.
- **Tarjeta "Informes pendientes" sin color de alerta** cuando es > 0 (el mockup la pinta ámbar).
  Puramente estético; la tarjeta equivalente en Tickets sí usa ámbar. Queda como nota de UX, no
  bloquea.
- **Encabezado de comisión**: el mockup agrega "de $400.00 máximo · junio 2026" y una columna "Dato
  capturado". El desarrollo replica exactamente el modal de Técnicos Internos (REQ-258, Batch 10 ya
  cerrado) — la paridad con esa pantalla es lo que RN1 exige, así que un cambio acá tendría que
  hacerse en ambas y es alcance de otro ticket.
- **Sección de comisión en modo oscuro**: mantiene el panel claro ámbar a propósito (RN3 pide
  diferenciarla visualmente). Contraste correcto (texto oscuro sobre fondo claro).
- **Responsive**: verificado a 390px — tarjetas apiladas, tabla con scroll horizontal propio, nada
  desbordado. El mockup es desktop-only.

## Lo que sí cumple (verificado en la app real)

- Las 5 secciones del mockup existen, en el mismo orden, con la identidad de marca del proyecto.
- El copy **no menciona "documentos de satisfacción"** en ningún lugar, ni en ES ni en EN (RN1 de
  SCRUM-356 lo descarta) — verificado también en el toggle EN, sin claves i18n faltantes.
- El selector de período cambia realmente los datos de las 5 secciones que dependen de él
  (verificado agosto ↔ julio ↔ marzo).
- Estados vacíos correctos: mes sin datos muestra "0 de 0 tickets del mes", "—" en los indicadores
  sin valor y "Sin datos para este período" en el donut; sin `NaN`, sin división por cero, sin
  pantalla en blanco.
- Cero errores de consola y cero respuestas HTTP ≥400 en toda la pasada, con las 6 cuentas.

## Fixes aplicados en esta revisión

| Archivo | Cambio |
|---|---|
| `atlanticerp-backend/app/Modules/Servicios/Services/ReportsService.php` | `panorama-mes` expone `servicios_completados` y `servicios_completados_total` además del `_pct` |
| `atlanticerp-backend/tests/Feature/Servicios/ReportsControllerTest.php` | Asserts de los 2 conteos crudos + caso de mes sin tickets (0/0, `_pct` null) |
| `src/types/servicios.ts` | Nuevos campos en `ReportsPanoramaMes` |
| `src/components/servicios/ReportsPanoramaCards.tsx` | Muestra el conteo y "de N tickets del mes" |
| `src/components/servicios/ReportsInstallationsCards.tsx` | Cantidad como cifra principal, monto con su significado en el subtítulo |
| `src/components/servicios/ReportsYearlyChart.tsx` | Números por tipo visibles encima de cada barra; barras a 12px |
| `src/components/servicios/ReportsCommissionSection.tsx` | Identifica al técnico por `has_bonus_plan`, no por su nombre |
| `src/components/servicios/ReportsLibraryTable.tsx` | Deep-link `&doc=` al documento |
| `src/pages/servicios/TicketsPage.tsx` + `TicketDetailModal.tsx` | Prop opcional `initialDoc` para abrir el documento directo |
| `src/i18n/locales/{es,en}/servicios.json` | Copy de las 3 tarjetas + subtítulo de "Informes por generar" en Tickets |
| `src/components/servicios/ReportsCommissionSection.test.tsx` | **Nuevo** — test permanente del gate de visibilidad de REQ-285 RN2 |
