# Pre-QA — SCRUM-738: Ajustar distribución de campos en tarjetas de detalle de proyectos

**Fecha:** 2026-08-07
**Componente:** `src/components/PipelineCardModal.tsx`
**Veredicto:** 🟢 PASADA LIMPIA (1 vuelta) — transicionado a QA

## Contexto

Fix estructural: se unificaron 4 bloques `<div className="grid ...">` independientes (uno de
ellos a `sm:grid-cols-3`, desalineado respecto a los demás `sm:grid-cols-2`) en un único
`<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">`. Senior Reviewer y Visual Reviewer
ya aprobaron (marcadores `~/.claude-senior-review-markers/SCRUM-738` y
`~/.claude-visual-review-markers/SCRUM-738`). Este documento cubre exclusivamente la capa de
Pre-QA: robustez del grid unificado contra datos reales (largos/vacíos), las 6 etapas del
pipeline, modo edición vs. vista, mobile y ataques genéricos — no vuelve a revisar fidelidad
visual contra el mockup (ya hecho por Visual Reviewer) ni causa raíz de código (ya hecho por
Senior Reviewer).

## Paso 0

N/A — cambio de layout puro. No hay permisos angostos por persona ni umbrales/márgenes de
negocio nuevos involucrados en este ticket.

## Fixtures sembrados (tinker, prefijo `[PREQA738]`)

| Caso | Etapa | Detalle |
|---|---|---|
| Valores largos | `design` | Nombre de proyecto (150+ car.), Cliente Master y Subcliente (90-100+ car.), observaciones multilínea (200+ car.), monto/superficie con muchos dígitos, contacto con nombre/email largos |
| Valores vacíos | `lead` | Sin Cliente Master, sin Subcliente, sin superficie, sin tipo de entrega, sin observaciones, sin contactos |
| Una tarjeta por etapa | `lead`, `design`, `quote`, `proposal`, `approved`, `lost` | Valores normales; `proposal`/`approved` con `delivery_type='partial'` + 2 `PipelineCardDeliveryDate` para ejercitar el bloque condicional de fechas |

Login real: `milena.e@grupolafayette.com` (Vendedor/Diseñador, password = email).

## Escenarios de ruptura intentados

| # | Escenario de ruptura intentado | Resultado |
|---|---|---|
| 1 | Valores largos (nombre, Cliente Master, Subcliente, observaciones) en modo vista | Texto envuelve dentro de su celda, sin desalinear la columna vecina, sin overflow horizontal |
| 1b | Mismos valores largos en modo edición | Inputs truncan visualmente el valor pero lo conservan completo; sin overflow |
| 2 | Valores null/vacíos (Cliente Master, Subcliente, superficie, tipo de entrega, observaciones, sin contactos) | Cada campo muestra su placeholder correcto ("—", "Sin definir aún", "Se define en Cotizaciones") sin huecos ni romper la grilla |
| 3 | Las 6 etapas del pipeline (lead/design/quote/proposal/approved/lost) | Grid de 2 columnas se sostiene igual en las 6; bloque condicional de "Fecha(s) de entrega" (solo proposal/approved) no desalinea la grilla principal; banners de solo-lectura (`approved`/`lost`) correctos vía `isEditableBy()` |
| 4 | Modo edición vs. modo vista en etapa editable | Mismo grid en ambos modos, inputs alineados igual que el texto plano equivalente |
| 5 | Mobile 375px (`grid-cols-1`) con valores largos y con valores vacíos | Colapsa correctamente a 1 columna, sin overflow horizontal en ningún caso |
| 6 | Doble clic en "Editar" | No duplica el formulario ni el botón "Guardar". El único otro elemento que matchea "Editar" tras entrar en modo edición es el link legítimo "Editar" por contacto (`ventasDiseno:clients.detail.editContact`) — comportamiento esperado, no bug |
| 7 | Redimensionar la ventana en vivo (1280px → 400px) con el modal abierto | Re-fluye a 1 columna sin overflow ni pérdida de contenido |
| 8 | Recargar la página a mitad de una edición (cambio sin guardar en Observaciones) | El cambio se pierde, el modal vuelve a estado inicial — comportamiento esperado, no hay borrador persistido |

## CRÍTICO
Ninguno.

## MEDIO
Ninguno.

## Lo que sí funciona
Ver tabla de escenarios arriba — cada fila es una confirmación específica, no un "todo bien"
genérico.

## Evidencia
Spec Playwright descartable `e2e/_scratch-preqa-scrum738.spec.ts` (12/12 tests verdes), 15
screenshots en `e2e/_scratch-out/`. Ambos artefactos + los fixtures `[PREQA738]` de BD se borran
al cerrar esta revisión (ninguno de los escenarios de este ticket es de los que ya se rompieron
una vez en producción — no aplica la regla de promover a test permanente en `e2e/`).

## Cierre
- Marcador creado: `~/.claude-preqa-markers/SCRUM-738`
- Ticket transicionado a `QA` en Jira (transición id 2), comentario final agregado
- Fixtures `[PREQA738]` y artefactos descartables de esta revisión, borrados
