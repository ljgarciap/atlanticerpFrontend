# Visual Review — SCRUM-738: Ajustar distribución de campos en tarjetas de detalle de proyectos

**Fecha:** 2026-08-07
**Componente:** `atlanticerp-frontend/src/components/PipelineCardModal.tsx`
**Estado:** APROBADO — ningún hallazgo CRÍTICO. Listo para Pre-QA.

## Contexto del ticket

Ajuste de layout puro: los campos del modal de detalle de tarjeta del pipeline (Ventas&Diseño)
debían mostrarse en dos columnas alineadas, con espaciado consistente, sin campos flotando ni
desplazados. Criterio de aceptación explícito del ticket: "el cambio es principalmente de layout
y presentación visual... no debe modificar la información, campos, funcionalidades, botones ni
lógica existente".

Adjuntos de Jira (attachment id 11740 = mockup ideal, 11741 = estado actual/bug):

| Mockup (ideal) | Estado actual (bug, antes del fix) |
|---|---|
| Dos columnas limpias, filas alineadas | "Días en etapa" y "Valor" flotando en el medio, con anchos de columna distintos entre bloques |

## Causa raíz del bug (confirmada por el diff)

El formulario estaba armado con 4 bloques `<div className="grid ...">` separados, uno de ellos
con `sm:grid-cols-3` (distinto de los demás `sm:grid-cols-2`) — eso desalineaba "Días en etapa" /
"Valor" respecto al resto. El fix unifica los 4 bloques en un único grid `sm:grid-cols-2`, dejando
que CSS Grid alinee cada fila a la celda más alta, con o sin valores largos/vacíos. El diff
(`git diff -- src/components/PipelineCardModal.tsx`, working tree, sin commitear al momento de
esta revisión) toca exclusivamente la estructura de contenedores — ningún campo, botón, label ni
handler cambia.

## Checklist funcional del mockup (Paso 2)

| # | Elemento del mockup | En la app real (post-fix) | Veredicto |
|---|---|---|---|
| 1 | Layout en 2 columnas, filas alineadas, espaciado consistente, nada flotando | Confirmado — grid único `sm:grid-cols-2`, filas parejas (Nombre del proyecto/Etiqueta, Cliente Master/Subcliente, Responsable/Días en etapa, Valor/Superficie trabajada) | Cumple (criterio principal del ticket) |
| 2 | Botón "Editar" | Presente, top-left, abre modo edición con el mismo grid alineado | Cumple |
| 3 | Cliente Master | Presente | Cumple |
| 4 | Etapa | Header del modal ("Diseño" + indicador de color) | Cumple (variante de ubicación) |
| 5 | Responsable | Presente | Cumple |
| 6 | Total acumulado / Valor | Real solo tiene "Valor" (no "Total acumulado" separado) | Nota — mockup usa labels genéricos, no mapeo 1:1 (aclarado en el propio ticket) |
| 7 | Archivos de diseño + botón "+ Agregar archivo" | Presente — 5 categorías (diseño, cotización firmada, comprobante de aprobación, propuesta, foto), cada una con su "+ Agregar" | Cumple (más completo que el mockup) |
| 8 | Subcliente | Presente | Cumple |
| 9 | Departamento(s) | Real tiene "Etiqueta" (Ambos) en su lugar | Nota — mismo motivo que #6 |
| 10 | En etapa (días) | "Días en etapa" | Cumple |
| 11 | Entrega estimada | Real tiene "Tipo de entrega" | Nota — mismo motivo que #6 |
| 12 | Superficie trabajada | Presente | Cumple |
| 13 | Sección Contactos + warning "Falta contacto Arquitecto" | Presente, mismo warning funcional, estado vacío correcto | Cumple |
| 14 | Botones Crear cotización / Marcar como Perdido | Presentes, misma posición relativa (fila inferior) | Cumple |
| 15 | Botón "+Agregar contacto" | Presente pero gateado detrás de "Editar" (formulario Nombre/Rol/Teléfono/Email + botón) | Cumple — alcanzable, no ausente |

## Evidencia (Playwright CLI, stack local)

Fixture sembrado vía tinker (`[VISUALREVIEW] Proyecto Layout`, card id 275, tenant
`illuminations`), login real como `milena.e@grupolafayette.com` (Vendedor/Diseñador), ruta
`/ventas-diseno/pipeline`.

- `real_view_desktop.png` — modo vista, arriba del modal: dos columnas alineadas, sin floating.
- `real_view_desktop_scrolled.png` — modo vista, scroll interno al fondo: sección Archivos (5
  categorías) + Contactos (warning + estado vacío) + botones de acción.
- `real_edit_desktop.png` — modo edición: mismos campos, mismo grid, inputs alineados igual que
  la vista de solo lectura.
- `real_edit_desktop_scrolled.png` — modo edición, scroll al fondo: confirma el formulario de
  "+Agregar contacto" (Nombre/Rol/Teléfono/Email + botón) es alcanzable.
- `real_view_mobile.png` — viewport 375×800: colapsa a una sola columna apilada (comportamiento
  responsive estándar, el mockup es desktop-only, no cubre este breakpoint).

Capturas guardadas en el scratchpad de la sesión (no versionadas en el repo, son evidencia
puntual de esta revisión, no un artefacto permanente):
`/private/tmp/claude-501/-Users-lgarcia-Documents-GitHub-Softclass-Illumination-atlanticerp/feb364cf-5f9e-4dd2-8b9f-2843095aaf37/scratchpad/scrum738/`

## Clasificación de diferencias (Paso 4)

**CRÍTICO:** ninguno.

**ACEPTABLE (notas, no bloquean):**
- Labels genéricos del mockup ("Total acumulado", "Departamento(s)", "Entrega estimada") no
  calzan 1:1 con los labels reales del componente — esperado, el propio ticket aclara que el
  mockup es referencia de patrón de layout, no mapeo exacto de campos.
- "+Agregar contacto" gateado detrás de "Editar" — funcionalidad presente y alcanzable desde la
  UI, no ausente.
- Breakpoint mobile (375px) colapsa a una columna — el mockup es desktop-only, no define este
  caso; comportamiento responsive estándar y esperado.

## Resultado

Sin hallazgos CRÍTICOs. El fix cumple el criterio de aceptación de Jira (layout en dos columnas,
alineado, espaciado consistente, sin modificar información/campos/funcionalidades/botones/lógica
existente). Marcador de gate creado en `~/.claude-visual-review-markers/SCRUM-738`. Aprobado para
pasar a Pre-QA (sujeto también a la aprobación independiente de Senior Reviewer, gate en
paralelo).
