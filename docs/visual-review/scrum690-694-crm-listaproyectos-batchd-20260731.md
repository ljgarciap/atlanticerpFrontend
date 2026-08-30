# Visual Review — Epic CRM (SCRUM-332) Batch D: SCRUM-690→694 — Lista de Proyectos (2026-07-31)

**Tickets:** SCRUM-690→694 (REQ-610→614, epic SCRUM-332, proyecto SCRUM), ticket ancla SCRUM-690.
**Estado del código:** `atlanticerp-frontend` (`src/pages/crm/ProjectsListPage.tsx` + i18n `crm.json` es/en +
`ventasDisenoApi.ts` + `types/ventasDiseno.ts`) y `atlanticerp-backend`
(`ProjectsListController.php`/`ProjectsListService.php`) — sin commitear, rama `dev`, working tree
local. Reemplaza el placeholder "próximamente".
**Mockup de referencia:** `2B__CRM_Lista_Proyectos.html` (attachment 11545 de SCRUM-690).
**Método:** Playwright CLI contra la app LOCAL (`http://localhost:5173`, proxy a `infra-nginx-1`
puerto 8090, contenedores Docker ya corrientes). Cuentas reales: Daniela Amaya
(`daniela@atlantic.com.pa`, Gerencia) y Neil Quiel (`neil.quiel@atlantic.com.pa`,
Vendedor/Diseñador).
**Nota de datos:** `pipeline_cards` estaba vacía en la BD local (0 filas) al empezar — no permitía
ejercitar filtros/scope/click-de-fila/CSV con datos reales. Se corrió `db:seed --force` en el
tenant (`VentasDisenoDemoSeeder`, ya gateado a `local/dev/testing`, mecanismo estándar del
proyecto) y se reasignó 1 tarjeta demo a `neil.quiel` vía tinker para poder probar el escenario
"Mías" con datos propios — cambios solo en la BD local (fixtures descartables), ningún archivo de
código tocado.

## Checklist funcional del mockup

Extraído literalmente de `2B__CRM_Lista_Proyectos.html` (tabla `proj-list-table` + script
`renderList()`):

| Elemento del mockup | Implementado | Nota |
|---|---|---|
| 10 columnas exactas: Proyecto, Cliente, Etapa, Etiqueta, Responsable, Valor, Superficie, Días en etapa, Entrega, Archivos | Sí | Mismo orden exacto, confirmado en pantalla y en el `<thead>` |
| Etapa con color por etapa (Lead/Diseño/Cotización/Propuesta/Aprobado/Perdido) | Sí | Usa `PIPELINE_STAGES` — mismos colores que Pipeline (REQ-610 lo exige explícitamente) |
| Etiqueta = Diseño / Cotización / Diseño+Cotización / vacío | Sí | Mapea a `dashboard.tagLabels` (mismo vocabulario que Dashboard CRM Batch C); vacío → "—" |
| "—" cuando falta Valor o Superficie | Sí | Confirmado con datos reales (`amount`/`worked_area_m2` null) |
| Alcance Mías/Equipo — Vendedor ve solo lo suyo | Sí | `neil.quiel` (Vendedor): 1 fila, exactamente su propia tarjeta reasignada, sin toggle de alcance ni filtro Responsable visibles |
| Alcance Mías/Equipo — Líder/Gerencia ve todo el equipo | Sí | `daniela` (Gerencia): toggle "Inicio"/"Equipo" visible, 2 filas propias → 6 al cambiar a Equipo (paginado 5/pág) |
| Buscador texto libre (proyecto o cliente) | Sí | Filtra en vivo (`onChange`, sin botón — igual que el mockup, que también filtra con `oninput`, sin submit) |
| Filtro Etapa | Sí | Mismas 6 opciones + "Todas las etapas", mismo orden que el mockup |
| Filtro Etiqueta | Sí | Mismas 3 opciones + "Todas las etiquetas", mismo orden y texto ("Diseño + Cotización") |
| Filtro Responsable, solo con efecto para Líder/Gerencia | Sí | Oculto por completo para Vendedor (backend `can_view_team=false`); visible con opciones reales (`distinctOwners()`) para Gerencia, filtra correctamente al seleccionar |
| Conteo "X proyectos" (filtrado) | Sí | `resultsCount`, reubicado debajo de los filtros (mockup lo pone dentro de la fila de filtros) |
| Conteo "Y proyectos en total" | Sí | `totalCount`, reubicado debajo de la paginación (mockup lo pone junto al título) — mismo dato (respeta scope, ignora el resto de los filtros), solo cambia de posición |
| Mensaje "sin resultados" cuando no hay coincidencias | Sí | "Sin resultados para los filtros actuales" — texto idéntico al del mockup |
| Click en cualquier parte de la fila → navega a Pipeline con la tarjeta resaltada | Sí | Navega a `/ventas-diseno/pipeline?card={id}`, abre el modal de detalle de esa tarjeta automáticamente (mismo mecanismo ya usado por REQ-022/065 desde Clientes) |
| Botón "Exportar CSV" que respeta filtros/alcance activos | Sí | Confirmado descargando el CSV en scope "Mías" de Gerencia: solo sus 2 proyectos, mismos que la tabla en pantalla |
| CSV con las mismas 10 columnas, sin RUC/teléfono | Sí | Cabecera exacta: `Proyecto,Cliente,Etapa,Etiqueta,Responsable,Valor,Superficie trabajada,Días en etapa,Fecha de entrega,Archivos` — BOM UTF-8, acentos correctos |
| Botón "+ Nuevo Proyecto" → Pipeline con modal de creación abierto automáticamente | Sí | Navega a `/ventas-diseno/pipeline?openNewProject=1`, modal "Nuevo Proyecto" se abre sin clic adicional — confirmado con ambas cuentas |

## Aceptable (variante de layout/estilo, no bloquea)

- **Etapa: punto de color + texto, en vez de badge/pill con fondo de color.** El mockup usa
  `<span class="stage-tag">` con fondo de color sólido; el desarrollo usa un punto (`●`) del color
  de la etapa + texto del mismo color, sin fondo. Mismo código de color por etapa (`PIPELINE_STAGES`,
  el mismo que usa Pipeline — cumple el requisito explícito de REQ-610 de "igual que Pipeline"),
  solo cambia la forma de la marca visual.
- **Etiqueta y Responsable: texto plano, sin pill/avatar.** El mockup usa un pill de color para la
  Etiqueta y un avatar circular con iniciales junto al nombre del Responsable; el desarrollo muestra
  ambos como texto plano. Mismo dato, mismo texto, solo cambia el adorno visual.
- **Buscador sin botón "Buscar" explícito.** No es una desviación — el mockup mismo filtra con
  `oninput="renderList()"` (sin botón de submit); el desarrollo hace lo mismo (filtra en cada
  tecleo). Nota aparte: el código tenía hasta hace unos minutos un botón "Buscar" + estado `query`
  separado (búsqueda solo al hacer click o Enter) — el archivo cambió durante esta misma revisión
  (mismo repo, sin worktree) a la versión actual de búsqueda en vivo, más fiel al mockup que la
  versión anterior. Ver nota de coordinación abajo.
- **Toggle de alcance "Inicio"/"Equipo" y filtro Responsable: no existen en el mockup de esta
  pantalla.** El mockup de Lista de Proyectos no modela ningún control de alcance (es una tabla
  estática con un solo dataset) — el desarrollo agrega el toggle real "Inicio/Equipo" (mismas
  etiquetas que ya usa el toggle de Pipeline, reutilizado tal cual) para poder cumplir la RN de
  alcance del REQ-610/611 en runtime. Es una adición, no le quita nada al mockup.
- **Dos contadores reposicionados.** "X proyectos" (filtrado) y "Y proyectos en total" existen en
  el mockup pegados al título/fila de filtros; el desarrollo los separa (uno arriba de la tabla,
  otro debajo de la paginación). Mismos dos números, misma semántica, solo cambia dónde viven en la
  pantalla.
- **Paginación real server-side** (`Pagination` component, no existe en el mockup, que es una tabla
  completa sin paginar con datos ficticios). Decisión de arquitectura ya documentada en el propio
  código (política global `App\Shared\Http\Pagination`, aprobada por Luis 2026-07-31) — no le quita
  nada al mockup, agrega control de volumen real.
- **Sidebar vs. subtabs superiores del mockup.** Mismo patrón ya aceptado en Batches A/B/C de este
  epic — "Lista de Proyectos" vive en el sidebar (`crm-projects`) junto a Dashboard CRM/Pipeline/
  Clientes, mismo conjunto de navegación que el mockup, solo cambia dónde vive.

## Nota de coordinación (no es un hallazgo de fidelidad)

Durante esta revisión, `ProjectsListPage.tsx` cambió de contenido en disco (confirmado por lectura
completa del archivo en dos momentos distintos de la misma sesión, con diferencias reales de
código: eliminación del botón "Buscar" + estado `query` separado, paso a búsqueda en vivo). El
`mtime` del archivo quedó estable después de ese cambio y no volvió a moverse en los ~10 minutos
siguientes de trabajo. No se tocó ningún archivo de código desde este review — es una nota para
Luis/PM: parece haber otro proceso (sesión de Frontend Dev u otro agente) editando este mismo
archivo, sin `isolation:worktree`, en paralelo a este Visual Review. La versión final revisada acá
es la que quedó estable y es la que efectivamente sirve el Vite dev server (confirmado contra el
DOM real, no solo contra el archivo). Recomendación: confirmar con quien haya hecho ese cambio que
no queda ningún ajuste pendiente antes de dar este batch por cerrado para Pre-QA.

## CRÍTICO

Ninguno. Las 5 historias del batch (SCRUM-690→694, REQ-610→614) tienen su contraparte funcional
completa — campos, columnas, filtros, navegación y exportación del mockup presentes y operativos,
confirmado en vivo contra la app local con datos reales (no solo lectura de código).

## Lo que sí cumple

- REQ-610 (tabla): 10 columnas exactas, Etapa con color de Pipeline, Etiqueta con las 4 variantes
  correctas, "—" en Valor/Superficie faltantes, alcance Mías/Equipo real (Vendedor sin fuga de
  datos del equipo, confirmado con cuenta real sin proyectos propios + 1 reasignado a propósito
  para la prueba).
- REQ-611 (filtros): buscador en vivo, filtro Etapa (6 opciones), filtro Etiqueta (3 opciones),
  filtro Responsable con efecto real solo para Gerencia (`can_view_team` del backend, no un
  heurístico de rol en frontend — ya corregido este mismo gotcha en tickets previos del epic),
  ambos contadores, mensaje de sin resultados.
- REQ-612 (navegación): click en fila abre Pipeline con el modal de detalle de esa tarjeta ya
  abierto, confirmado con `?card={id}` real.
- REQ-613 (export CSV): mismas 10 columnas, respeta scope/filtros activos al momento del click,
  sin RUC/teléfono, confirmado descargando y leyendo el archivo real.
- REQ-614 (nuevo proyecto): navega a Pipeline y abre el modal de creación sin clic adicional,
  confirmado con ambas cuentas.

## Resultado

**Aprobado — pasa a Pre-QA/QA.** Sin hallazgos CRÍTICOS de fidelidad visual/funcional contra el
mockup. Ver "Nota de coordinación" arriba — no bloquea el pase a Pre-QA, pero vale la pena que PM
confirme que no hay una edición en curso sin cerrar antes de considerar el batch completamente
listo.
