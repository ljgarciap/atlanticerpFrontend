# Pre-QA — SCRUM-194 (REQ-131): validación de referencia duplicada en "+ Producto nuevo" (2026-08-04)

Gate que ya se rompió 3 veces en este mismo ticket: QA rechazó 2026-07-17 (aceptaba duplicado sin
aviso), Daniela Amaya encontró un gap nuevo 2026-07-30 (2 líneas nuevas duplicadas dentro del mismo
borrador), y volvió a reportar "AUN ME SIGUE DEJANDO CREAR PRODUCTOS NUEVOS CON LA MISMA
REFERENCIA" hoy 2026-08-04. Fix bajo revisión: precheck async (`comprasApi.products.search`) en
`NewProductModal.tsx`, aprobado en Senior Review hoy mismo (19:12).

Entorno: local (Docker `:8090` + Vite `:5173`, código de `dev` local con el fix ya mergeado).
Usuario: `gerencia2@atlantic.com.pa` (lider_compras, Yirena Teng) — password = email, funcionó
al primer intento, sin fallback necesario. Smoke test permanente:
`atlanticerp-frontend/e2e/preqa-scrum194-nuevaorden-20260804.spec.ts` (1 test con 7 `test.step()`,
corrido con `npx playwright test e2e/preqa-scrum194-nuevaorden-20260804.spec.ts --workers=1
--reporter=list --retries=0`).

## Nota de proceso — 2 rondas de corrección al test antes de resultados reales

La primera corrida completa (8 tests separados) dio 8/8 fallidos por bugs del test, no del
producto: (a) los inputs de texto del modal no tienen `type="text"` explícito en el JSX, así que
el selector CSS `input[type="text"]` solo matcheaba el buscador de catálogo fuera del modal —
corregido escopeando a `form.getByRole('textbox')`; (b) el botón "Agregar" es ambiguo (mismo string
i18n en las filas del buscador de catálogo Y en el submit del modal) — corregido escopeando a
`form.getByRole('button', {name:'Agregar'})`. Una segunda corrida (8 tests separados) bajó a 4
fallos, pero esos 4 eran un problema estructural distinto: Playwright recicla el worker (y
reimporta el módulo, regenerando `STAMP = Date.now()`) apenas un test previo falla — el test de
"setup" que crea el producto colisionable terminó usando un `STAMP` diferente al de los tests que
dependían de esa referencia ya existiendo en catálogo, así que el precheck correctamente no
encontraba colisión (porque la referencia realmente no coincidía). Se resolvió consolidando los 7
escenarios en **un solo `test()` con `test.step()`**, eliminando el riesgo de reimport entre pasos.
La corrida final fue determinística y reproducible.

## Resultado por escenario

| # | Escenario | Resultado |
|---|---|---|
| 0 | Setup — crear producto persistido en catálogo (LightCorp, referencia pública + de fábrica) | Producto creado al "Crear orden" (`Orden creada`), disponible para los escenarios siguientes |
| 1 | Visual — 10 campos del modal presentes (incl. Categoría/Rotación/toggle $-%) | Confirmado, ver `docs/visual-review/scrum194-nuevaorden-20260804.md` |
| **2** | **Escenario de ruptura 1 — referencia pública ya existente (mismo proveedor) bloquea INLINE** | **Bloquea.** Mensaje "Esta referencia pública ya está en uso" bajo el campo, ANTES de llegar a "Crear orden". Modal no se cierra, no se agrega línea |
| **3a** | **Escenario de ruptura 2a — referencia de fábrica repetida, MISMO proveedor** | **Bloquea.** Mensaje "Esta referencia ya existe para este proveedor" |
| **3b** | **Escenario de ruptura 2b — referencia de fábrica repetida, proveedor DISTINTO** | **SÍ se permite** (correcto — la unicidad de fábrica es solo dentro del mismo proveedor, Escenario 2 del criterio de Jira). Línea se agrega sin error |
| **4** | **Gap conocido — 2 líneas NUEVAS con la misma referencia pública en el mismo borrador (ninguna existe todavía en catálogo)** | El precheck **NO** las atrapa (por diseño — solo consulta catálogo persistido, documentado como limitación no bloqueante en el Senior Review de hoy). Ambas líneas se agregan sin aviso. Al pulsar "Crear orden", el **backend SÍ bloquea** (422) con mensaje específico: *"La referencia pública '...' se repite en más de un producto nuevo de esta misma orden."* — no es el mensaje genérico, es el mensaje de campo real que `createOrderErrorMessage()` extrae del primer error estructurado del backend |
| **5** | **Escenario de ruptura 3 — falla de red en el precheck (`route.abort`)** | **NO bloquea.** La línea se agrega igual (el precheck es solo UX, backend sigue siendo la fuente de verdad final) |
| **6** | **Escenario de ruptura 4 — el error de duplicado se limpia al editar el campo** | Confirmado: tras el error inline, editar el campo de referencia pública limpia el mensaje sin necesidad de reintentar el submit |

## Hallazgo CRÍTICO encontrado y CORREGIDO en esta misma sesión (fuera del foco original, dentro del mismo modal)

Ver detalle completo en `docs/visual-review/scrum194-nuevaorden-20260804.md`. Resumen: el campo de
monto de "Costo adicional estimado" renderizaba a ~26px de ancho (bug de cascada CSS entre
`w-full` y `w-32` en el `<select>` vecino) — coincide con el reclamo de Daniela Amaya de hoy ("el
campo quedó muy pequeño"). Fix aplicado en el mismo archivo (`NewProductModal.tsx`), verificado con
`getComputedStyle` antes/después (428px→128px en el select, input de monto pasa a ser usable),
checklist completo de los 7 pasos re-corrido tras el fix (pasada limpia), `tsc --noEmit` limpio,
`NewProductModal.test.tsx` 5/5, suite completa frontend 866/866 verde.

## Hallazgo CRÍTICO — NO corregido, fuera del alcance instruido de esta sesión

La tabla de "Líneas de la orden" no tiene columnas separadas "Ref. fábrica" / "Referencia pública"
como exige el mockup (`2H__Compras_NuevaOrden.html`) — ambas referencias aparecen concatenadas sin
etiqueta bajo la descripción. Mismo comentario de Daniela Amaya de hoy lo señala explícitamente.
Esto es sobre `OrderLinesEditor.tsx` (la tabla de líneas), no sobre `NewProductModal.tsx` (el modal
que este Pre-QA tenía instrucción explícita de revisar) — **no se corrige en esta sesión** por ser
un cambio de alcance mayor (agregar 2 columnas a una tabla ya con 5, revisar breakpoints). Queda
como hallazgo bloqueante pendiente, notificado a PM/Luis: si el criterio de cierre de SCRUM-194
incluye la tabla (el reporte de Daniela mezcla ambos temas bajo el mismo ticket), este ticket NO
puede darse por completamente cerrado sin ese fix o sin que PM/Luis lo derive explícitamente a
alcance separado.

## Loop de Pre-QA — estado

Checklist de los 7 escenarios de arriba: **pasada limpia tras 1 fix aplicado y re-verificado en la
misma sesión** (regla dura: fix chico → se corrige en el momento, se vuelve a correr el checklist
completo, no se documenta y se sigue de largo). El hallazgo de la tabla de líneas es la excepción
explícita de la misma regla ("si el fix es grande... no lo arreglás vos, notificás a PM en el
momento") — no bloquea el veredicto sobre el modal, pero sí bloquea dar el ticket por 100% cerrado
sin decisión de PM/Luis sobre su alcance.

## Estado de despliegue

Fix del campo de monto aplicado y verificado **solo en local** (`dev` local, working tree). **NO
pusheado a `dev` remoto todavía** — pendiente de confirmación explícita antes de push (regla de
workflow: push solo tras OK de Luis). El fix del precheck (motivo original del ticket) ya estaba
mergeado a `dev` local antes de arrancar esta sesión, según lo indicado en las instrucciones de
entrada; no se confirmó en esta sesión si esa parte ya está pusheada a `dev` remoto.

## Veredicto

**Los 5 escenarios de ruptura de la validación de referencia duplicada (bloqueo mismo proveedor,
permitido proveedor distinto, gap conocido de 2 líneas nuevas no bloqueado por el precheck pero sí
por el backend, fallo de red no bloquea, limpieza de error al editar): PASA LIMPIO.**

**El modal "+ Producto nuevo" en su conjunto: PASA LIMPIO tras el fix del campo de monto aplicado
en esta sesión.**

**SCRUM-194 completo: NO recomendado pasar a QA todavía** — el hallazgo de la tabla de líneas
(columnas Ref. fábrica/Referencia pública ausentes, reportado por Daniela hoy mismo) sigue abierto
y no fue autorizado a diferirse por PM/Luis en esta sesión. Recomendación: confirmar con PM/Luis si
esa tabla es parte del alcance de SCRUM-194 antes de transicionar el ticket — si se confirma como
alcance separado, el modal en sí ya está listo para QA.
