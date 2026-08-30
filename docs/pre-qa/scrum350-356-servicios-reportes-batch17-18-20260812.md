# Pre-QA — Reportes de Servicios (SCRUM-350→356 / REQ-280→286)

**Fecha:** 2026-08-12
**Batch:** 17/18 — Fase 4 Servicios, pantalla "Reportes" (7 historias, despacho fusionado con
Visual Review — ver `docs/visual-review/scrum350-356-servicios-reportes-batch17-18-20260812.md`)
**Entorno:** stack local Docker (API `http://localhost:8090`) + Vite propio en `:5182` sobre el
checkout principal de `atlanticerp-frontend` en `dev`. Playwright CLI, navegador real.
**Cuentas reales usadas** (nunca demo): Aaron Leis `lider_servicios`, Daniela Amaya `management`,
Carlos Vergara `tecnico_servicios` (el caso de excepción de REQ-285), Pedro Santos
`tecnico_servicios`, Miguel Castillo `garantias_servicios`, Milena Estrada `vendedor_disenador`,
Yirena Teng `lider_compras`.

**Veredicto: PASA LIMPIO** — 5 hallazgos reales encontrados y **corregidos dentro de esta misma
pasada**, con el checklist completo re-corrido después de los fixes. 2 observaciones no bloqueantes
quedan documentadas abajo para PM/Luis.

---

## Paso 0 — Precondiciones

- **Permisos angostos:** ninguna de las 7 historias exige un `extra_permissions` por persona. REQ-285
  restringe por rol (`superadmin`/`management`) o por identidad del propio técnico
  (`internal_technicians.user_id`), ambos ya seedeados — no hace falta tocar
  `SpecialPermissionSeeder.php`.
- **Umbrales/valores de negocio:** ninguna historia define umbrales nuevos. Los pesos del plan de
  bonificación vienen de `CommissionCaptureService` (Batch 7/10), no se re-hardcodean acá.
- **Datos:** el entorno local estaba vacío de tickets — se sembró un fixture completo
  (21 tickets de agosto 2026 de los 4 tipos, cerrados/abiertos, 1 con 2da visita; 45 tickets
  cerrados de enero→julio 2026 y 3 de 2025; 8 cotizaciones; 5 informes de inspección
  pendientes/completados; 4 hojas de reclamo; captura de comisión de Carlos de agosto 2026) para
  poder ejercitar cada escenario positivo Y negativo, no solo "que exista algún registro".

---

## CRÍTICO (encontrados y corregidos en esta pasada)

### 1. SCRUM-350 — la tarjeta "Servicios completados" no cumplía su Escenario 1
- **Criterio:** "Dado 34 tickets resueltos/cerrados de 52 tickets del mes … entonces dice
  **34 de 52 tickets del mes**".
- **Encontrado:** la tarjeta mostraba `61.9%` con el subtítulo "Porcentaje de tickets completados en
  el período". El endpoint `panorama-mes` solo devolvía `servicios_completados_pct`, así que el
  desglose no existía en ningún lado (el propio docblock del componente lo declaraba como decisión
  de alcance).
- **Reproducción:** login como Aaron → Reportes → tarjeta 1.
- **Fix:** `ReportsService::panoramaMes()` expone `servicios_completados` y
  `servicios_completados_total` (el `_pct` se conserva); la tarjeta muestra el conteo y
  "de N tickets del mes".
- **Re-verificado:** "13 / de 21 tickets del mes", cruzado contra la BD (13 cerrados, 21 reportados).

### 2. SCRUM-351 — tarjetas de instalaciones invertidas respecto del Escenario 1
- **Criterio:** "entonces dice **'14'** con el subtexto **'$31,200 en cotizaciones generadas este
  mes'**".
- **Encontrado:** el monto era la cifra grande y el conteo el subtítulo genérico "8 servicios".
  Peor, con el período en julio 2026 (instalaciones cerradas sin cotización aprobada) la tarjeta
  mostraba **"$0.00"** como cifra principal habiendo 3 instalaciones realizadas — engañoso.
- **Fix:** cantidad como valor principal, monto con su significado explícito en el subtítulo, en ES
  y EN.
- **Re-verificado:** "8 / $10,800.00 en cotizaciones generadas este mes" y "5 / $6,000.00 en
  instalaciones resueltas/cerradas este mes"; en julio, "0 / $0.00 …" y "3 / $0.00 …".

### 3. SCRUM-354 — RN2/Escenario 3: los 4 números por tipo no eran visibles
- **Criterio:** "cada una con su propio número **visible encima**" / "aparecen 4 barras separadas con
  esos 4 números visibles".
- **Encontrado:** los valores por tipo solo existían en el atributo `title` (tooltip al pasar el
  mouse); en pantalla solo se veía el total del mes. Un usuario no puede leer el valor de cada tipo,
  que es exactamente lo que la RN quiere evitar.
- **Fix:** fila de 4 números encima de las barras de cada mes; barras ensanchadas de 6px a 12px para
  que los números sean legibles sin encimarse.
- **Re-verificado:** "5 4 2 2 / Ago / 13" — la suma de los 4 coincide con el total mostrado abajo.

### 4. SCRUM-355 — el gate de visibilidad de la comisión dependía del NOMBRE del técnico
- **Criterio (RN2):** "Visible únicamente para Carlos Vergara y Gerencia".
- **Encontrado:** el backend resuelve al técnico por `has_bonus_plan = true`, pero el frontend lo
  resolvía por `tech.nombre === 'Carlos Vergara'`. El nombre es editable desde Técnicos Internos.
- **Escenario de ruptura ejecutado:** renombré el perfil a "Carlos A. Vergara" y entré como Carlos
  → **la sección desaparecía por completo para él**, aunque el backend seguía autorizándolo (200 con
  su comisión). Su propia comisión dejaba de existir en Reportes por un renombre cosmético.
- **Fix:** el frontend usa `has_bonus_plan`, el mismo flag que el backend.
- **Re-verificado:** con el nombre alterado, la sección sigue visible para Carlos. Nombre restaurado.
- **Test permanente agregado** (`ReportsCommissionSection.test.tsx`, 4 casos): gate para Gerencia,
  para el técnico con plan aunque lo renombren, y ausencia total de sección + de llamada de red para
  otro técnico y para Aaron. Verificado que el test **falla** contra la implementación vieja.

### 5. SCRUM-356 — RN2/Escenario 2: la biblioteca no abría el documento
- **Criterio:** "clic navega al informe o a la hoja de reclamo de ese ticket, según su tipo" /
  "entonces navega directo al Informe o Hoja de Reclamo correspondiente".
- **Encontrado:** el clic navegaba a `/servicios/tickets?ticket=<id>`, que abre el modal del ticket
  contenedor; el documento quedaba detrás de un 2do clic sobre el indicador.
- **Fix:** deep-link `&doc=inspection_report|claim_sheet` + prop opcional `initialDoc` en
  `TicketDetailModal` (aditiva, no cambia el comportamiento existente de la pantalla Tickets).
- **Re-verificado:** clic en una Hoja de Reclamo abre la Hoja de Reclamo; clic en un Informe de
  Inspección abre el Informe; doble clic no duplica nada; F5 sobre el deep-link lo vuelve a abrir.

---

## MEDIO — no bloqueante, a confirmar con PM/Luis

1. **"Reportes" está oculto para `vendedor_disenador` en el menú, pero la URL directa muestra todo.**
   Los 7 tickets dicen "PERMISOS: Visible para todos los roles del módulo", mientras
   `ServiciosNavMenu.tsx` (REQ-288, Batch 19 ya cerrado y QA'd) excluye a Vendedor/Diseñador de esa
   pestaña a propósito. Verificado con Milena: la pestaña no aparece, pero navegando a
   `/servicios/reportes` la pantalla carga completa y los 6 endpoints responden 200 (tiene
   `servicios.read`). No es un leak respecto de la letra de estos tickets — es una contradicción
   entre REQ-288 y el "todos los roles del módulo" de REQ-280→286, **preexistente a este batch**
   (ninguna de las 7 historias introdujo esa lógica). Hace falta una decisión: o se le da la
   pestaña, o se bloquea la ruta. **No bloquea el batch.**
   (Contraste sano: Yirena `lider_compras` ni siquiera entra — el gate de módulo la redirige a
   Compras.)
2. **"Informes pendientes" ignora el selector de período** — es un número global "a hoy" (mismo que
   Tickets), mientras las otras 3 tarjetas de "Panorama del mes" sí respetan el período elegido.
   Es intencional y está documentado en el código; se menciona por si al ver marzo con "4 informes
   pendientes" QA lo reporta como inconsistencia. El copy ahora dice "esperando generarse" (estado
   actual), lo que reduce la ambigüedad.

---

## Escenarios de ruptura intentados (Paso 3) — y qué pasó

| Escenario de ruptura intentado | Resultado |
|---|---|
| Aaron (`lider_servicios`) entra a Reportes y busca la comisión | No ve la sección **y no se dispara la llamada de red**; el endpoint le responde 403 a nivel de ruta |
| Pedro Santos y Miguel Castillo (técnicos que no son Carlos) | Sin sección, sin llamada de red, 403 del backend ("No autorizado") |
| Renombrar al técnico con plan de bonificación y entrar como él | **Rompía** (hallazgo 4) — corregido y con test permanente |
| Carlos entra a su propia comisión pese a que su rol base no calificaría | 200, ve el detalle completo — la excepción explícita de RN2 funciona |
| Comisión de Reportes vs. Técnicos Internos, mismo período | Payload **idéntico byte a byte** (total 258, mismos 5 criterios) — RN1 cumplida, no hay cálculo paralelo |
| "Resuelto en 1ra visita" en Inicio vs. Reportes, mismo mes | 83.3% en ambas pantallas (RN2 de REQ-280, Escenario 2) |
| "Tiempo promedio" Inicio vs. Reportes | 3 días (solo Garantías) vs 3.4 días (todos los tipos) — divergencia correcta según RN3, con su subtítulo diferenciador |
| `informes_pendientes` vs. la tarjeta "Informes por generar" de Tickets | 4 = 4 — el cálculo centralizado no rompió la pantalla Tickets (efecto colateral real de este batch verificado) |
| `?month=13`, `?month=0`, `?month=`, `?month=2.5`, `?year=abc`, `?year=1999`, `?year=2028`, `?month=-1` | 422 en todos los casos (con `Accept: application/json`, que es lo que manda axios) |
| Sin token | 401 |
| `completados-anio` del año en curso | Devuelve enero→agosto, **sin meses futuros** (RN1); un mes intermedio sin actividad aparece como "0 0 0 0 / 0", no se omite |
| `completados-anio?year=2025` (año cerrado) | Devuelve los 12 meses completos |
| Cambiar el período a un mes sin ningún ticket (marzo vaciado a propósito) | "0 de 0 tickets del mes", "—" en los indicadores nulos, "Sin datos para este período" en el donut; sin `NaN`, sin división por cero, sin crash |
| Biblioteca: filtros combinados (tipo + estado + texto) | Correcto en las 6 combinaciones probadas |
| Biblioteca: buscar por N° de ticket, cliente y técnico, en minúsculas | Los 3 campos filtran, case-insensitive (RN3) |
| Biblioteca: búsqueda de solo espacios | Se trimea, devuelve el listado completo (no rompe) |
| Biblioteca: búsqueda con `<script>'%_` | Sin resultados, sin crash, sin inyección — el filtrado es `str_contains` en PHP, `%`/`_` no actúan como comodín SQL |
| Biblioteca: `tipo_documento=documento_satisfaccion` (tipo inexistente del mockup viejo) | 0 resultados, sin error 500 |
| Biblioteca: `page=99`, `per_page=0`, `per_page=-3` | Paginación defensiva, sin error (cae al default) |
| Doble clic en el botón "Ver" de la biblioteca | Idempotente, un solo modal |
| F5 a mitad del flujo (deep-link del documento) | El documento se vuelve a abrir |
| Modo oscuro y viewport 390px | Sin desbordes, contraste correcto, tabla con scroll propio |
| Toggle ES/EN | Todas las claves nuevas traducidas, sin claves crudas en pantalla |
| Rol sin acceso al módulo (`lider_compras`) por URL directa | Redirigido fuera de Servicios |

---

## Lo que sí funciona (verificado en la app real, no por lectura de código)

- Las 7 historias renderizan y consultan datos reales: 4 tarjetas de panorama, 2 de instalaciones,
  donut por tipo (4 tipos incl. Retrofit, colores iguales a las etiquetas de Tickets), barras por
  técnico (con el color propio de cada uno), gráfico anual en grilla 6×2, sección de comisión y
  biblioteca paginada.
- Selector de período (mes actual + 5 anteriores) cambia realmente los 5 paneles que dependen de él.
- Cero errores de consola y cero respuestas ≥400 en toda la pasada con 6 cuentas distintas.

## Suites tras los fixes

- Backend: `ReportsControllerTest` 61/61 (2 asserts nuevos + 1 test nuevo), grupo `Servicios`
  232/232, PHPStan level 8 limpio.
- Frontend: 1098/1098 (4 tests nuevos del gate de comisión), `tsc --noEmit` limpio.
