# Visual Review — Cotización-A: Cliente Master / Subcliente / Entrega (batch 2, 2026-07-29)

**Tickets:** SCRUM-116 (REQ-024, Cliente Master — buscar y crear), SCRUM-117 (REQ-025, Subcliente
— buscar y crear acotado al Cliente Master), SCRUM-124 (REQ-032, Entrega — completa o parcial).
**Commit revisado:** `a45f41e` (rama `dev`, `atlanticerp-frontend`) — desplegado y confirmado en
`dev.atlanticerp.ai` vía CI (`CI — Build + Tests` y `CD — Deploy dev.atlanticerp.ai`, ambos verdes).
**Mockup de referencia:** `1E__Ventas_Disen_o_Cotizacion.html` (compartido por los 3 tickets) +
4 capturas de pantalla de Daniela Amaya (2026-07-23, adjuntas a SCRUM-116) + `Requerimientos
Ventas Diseño.xlsx`.
**Método:** Playwright CLI contra `https://dev.atlanticerp.ai`, usuario `designer@illuminations.test`
(rol `vendedor_disenador`). UI observada en inglés (toggle EN activo en la sesión de prueba) —
mismos componentes/labels que la versión en español, ver nota en "ACEPTABLE" abajo.

Este batch corrige 3 gaps puntuales encontrados en el gate de fidelidad funcional (no cambia el
diseño general de la pantalla, ya revisado en un batch anterior): (a) "+ Crear cliente" no
aparecía con el campo Cliente Master recién enfocado y vacío; (b) borrar el texto de Cliente
Master a mano no limpiaba/deshabilitaba Subcliente; (c) "+ Nuevo Subcliente" no aparecía cuando la
búsqueda de Subcliente sí traía resultados; (d) cambiar Tipo de Entrega de "Parcial" (2 fechas
cargadas) a "Única" dejaba las 2 fechas viejas en pantalla en vez de resetear a 1.

## Checklist funcional — REQ-024 (SCRUM-116, Cliente Master)

| Criterio de aceptación | Implementado | Funciona en dev.atlanticerp.ai |
|---|---|---|
| Buscar Cliente Master muestra coincidencias mientras se escribe | Sí (dropdown inline bajo el input, variante de layout vs. el modal del mockup — ver ACEPTABLE) | Sí, verificado con query "QA" → 6 resultados en vivo |
| "+ Crear cliente" visible con el campo recién enfocado y VACÍO (fix de este batch) | Sí | Sí — confirmado con el campo limpio recién enfocado, opción visible en el dropdown |
| "+ Crear cliente" visible con texto escrito sin match exacto | Sí | Sí |
| Click en "+ Crear cliente" abre formulario con Subcliente, Dirección, RUC y Contactos | Sí — modal "Create client" con Master Client, Sub Client (Business Name), Delivery Address, Tax ID, Contactos (+ Category/Price Type adicionales, no piden nada del mockup) | Sí, confirmado abriendo el modal |
| Guardar cliente nuevo copia RUC y primer contacto al formulario de cotización | Sí (`linkNewClientMutation`, ver código) | No re-ejecutado en este batch (sin cambios de código en ese tramo; ya validado en review anterior de esta pantalla) |

## Checklist funcional — REQ-025 (SCRUM-117, Subcliente)

| Criterio de aceptación | Implementado | Funciona en dev.atlanticerp.ai |
|---|---|---|
| Sin Cliente Master elegido, lupa/búsqueda de Subcliente deshabilitada | Sí | Sí, confirmado: `disabled=true` en el campo Sub Client con Master Client vacío |
| Con Cliente Master elegido, Subcliente solo muestra los de ese cliente | Sí (`searchSubClients` scoped por `masterClient.id`) | Sí |
| Seleccionar/crear Subcliente autocompleta RUC | Sí | Sí, confirmado: seleccionar "Marly Rangel" autocompletó Tax ID = "123456" |
| Borrar el texto de Cliente Master a mano limpia Y deshabilita Subcliente (fix de este batch) | Sí (`onClear` en `SimpleSearchPicker`) | Sí — tras seleccionar un Master y borrar el texto a mano, Sub Client quedó `disabled=true` y con valor vacío |
| "+ Nuevo Subcliente" visible aunque la búsqueda SÍ traiga resultados (fix de este batch) | Sí | Sí — con query "a" trayendo 4 resultados reales, "+ New sub client" apareció igual como 5ta opción de la lista |

## Checklist funcional — REQ-032 (SCRUM-124, Entrega)

| Criterio de aceptación | Implementado | Funciona en dev.atlanticerp.ai |
|---|---|---|
| "Entrega parcial" muestra al menos 2 campos de fecha | Sí | Sí, confirmado: 2 inputs `type=date` al elegir "Partial" |
| Botón para agregar más fechas | Sí (botón "+") | Sí, confirmado: click agrega un 3er campo de fecha (2→3) |
| Cambiar de "Parcial" (2 fechas cargadas) a "Única" resetea a exactamente 1 campo (fix de este batch) | Sí | Sí — con las 2 fechas llenas (y una 3ra agregada), cambiar a "Single" dejó exactamente 1 campo de fecha, vacío |
| No indicar fecha de entrega bloquea generación, marcado como faltante | Sí (`validation.missing` del backend) | Sí — botón "Check quote" con fecha vacía devolvió banner "Missing information: ..., Fecha de entrega, ..." |

## CRÍTICO

Ninguno. Los 3 fixes de este batch (empty-state de "+ Crear cliente", cascada de limpieza de
Subcliente al borrar Cliente Master, "+ Nuevo Subcliente" con resultados, y reset de fechas
Parcial→Única) están confirmados funcionando contra la app real en `dev.atlanticerp.ai`, y el resto de
los criterios de aceptación de REQ-024/025/032 (no tocados en este batch) siguen operativos.

## ACEPTABLE (notas, no bloquean)

- **Buscador de Cliente Master/Subcliente como dropdown inline bajo el input, en vez del modal
  "Buscar Cliente Master"/"Buscar Subcliente" del mockup.** Mismo conjunto de funcionalidad
  (buscar mientras se escribe, seleccionar, crear) — variante de layout ya aceptada para esta
  pantalla en un review previo, no se repite como hallazgo nuevo.
- **Sesión de prueba en inglés (toggle EN activo).** La app soporta ES/EN vía i18next; los labels
  vistos ("MASTER CLIENT", "SUB CLIENT", "+ Create client", "+ New sub client") son la traducción
  1:1 de los strings en español que usa el mockup — no es una variante funcional, solo el idioma
  de la sesión de prueba usada para este review. No verificado explícitamente en ES en esta
  sesión (ya lo estaba en reviews previos de la misma pantalla).
- **Banner de validación mezcla inglés/español** ("Missing information: Proyecto, Descripción,
  Arquitecto, Contacto, Fecha de entrega, Ítems" — el prefijo en inglés, los nombres de campo en
  español). Preexistente, no introducido por este batch ni relacionado a los 3 fixes revisados —
  se documenta como nota, no como hallazgo de este ticket.
- **Modal "Create client" incluye Category y Price Type**, campos que el mockup no pide para REQ-024
  — no elimina nada del mockup, es una ampliación ya presente antes de este batch.

## Lo que sí cumple

Los 3 tickets de este batch (SCRUM-116, SCRUM-117, SCRUM-124) tienen fidelidad funcional completa
respecto al mockup `1E__Ventas_Disen_o_Cotizacion.html` y al Excel de requerimientos: los 3
comportamientos específicamente corregidos en el commit `a45f41e` se confirmaron en vivo contra
`dev.atlanticerp.ai`, y el resto de los criterios de aceptación de REQ-024/025/032 (búsqueda en vivo,
scoping de Subcliente por Cliente Master, autocompletado de RUC, campos del formulario de creación,
mínimo 2 fechas + botón de agregar en Entrega Parcial, validación de fecha faltante) siguen
operativos. Los 3 tickets quedan aprobados para pasar a Pre-QA.
