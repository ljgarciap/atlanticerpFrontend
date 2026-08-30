# Visual Review — Batch 11 Servicios: Cotización de Servicio

**Tickets:** SCRUM-292→297 (REQ-229→234)
**Fecha:** 2026-08-12
**Mockup:** `5A__Servicios_Tickets.html` (adjunto en SCRUM-292) — SÍ contiene las pantallas de
Cotización (funciones `buildCotizacionFormHtml`/`buildCotizacionReadOnlyHtml`/`buildDocPageHtml`,
líneas 2118-2690), pese a que el nombre del archivo dice "Tickets" — es un mockup combinado que
cubre varias pantallas de Servicios, confirmado explícitamente.
**Excel:** `5__Requerimientos_Servicios.xlsx` (mismo adjunto) — cruzado contra cada RN de cada
ticket, sin discrepancias encontradas contra el texto de Jira.
**Entorno:** stack Docker aislado propio (`batch11review`, puertos 5534/8094), NO dev.atlanticerp.ai.

## Checklist funcional (mockup) vs desarrollo

| Elemento del mockup | Desarrollo | Veredicto |
|---|---|---|
| Badge/link "🔒 Cotización" cuando informe pendiente | `QuoteIndicator` estado `locked`, ícono + tooltip | Cumple |
| Link "+ Generar cotización" cuando gate abierto | `QuoteIndicator` estado `null` | Cumple |
| Badge de estado coloreado (Borrador/Enviada/Aprobada/Rechazada) + monto | `QuoteIndicator` con `ESTADO_BADGE` | Cumple |
| N° de cotización "(se asigna al guardar)" antes / real después | Backend asigna folio en `startNew()`, frontend solo lo pide tras click "Generar cotización" (variante de layout, no funcional) | Cumple (variante aceptable) |
| Cliente/Contacto/Dirección precargados, solo lectura | `ReadOnlyField` × 3 | Cumple |
| Nota RN4 (productos a reemplazar, texto distinto Retrofit vs otros) | `ServiceQuoteService::notes()` | Cumple, texto verificado en vivo |
| Nota RN6 (instalación subcontratada) | Idem | Cumple |
| Botones + Producto / + Mano de obra / + Subcontratado | Idem, mismo texto | Cumple |
| Selector de producto con "Otro (referencia libre)" | Checkbox "Otro (referencia libre, sin catálogo)" + picker de catálogo en modal aparte (variante de layout — mockup usa `<select>` inline) | Cumple (variante aceptable, mismo resultado funcional) |
| Indicador visual de margen bajo en el precio (mockup: borde rojo, solo aviso) | Bloqueo duro real con toast (RN4 lo exige explícitamente como corrección al mockup) | Cumple — mejora exigida por el ticket, no una regresión |
| Selector de técnico externo, solo activos | `<select>` filtrado a `estado: 'active'` | Cumple, inactivo confirmado ausente |
| Campo Observaciones, precargado con recomendación del informe | `<textarea>` | Cumple |
| Subtotal / Descuento (%) / Total | Presentes | Cumple |
| **ITBMS explícito en el formulario** (mockup lo omitía — corregido a propósito por REQ-233 RN5) | `ITBMS (7%)` visible entre Descuento y Total | Cumple — corrección exigida por el ticket, confirmada en pantalla |
| Botones Cancelar/Generar cotización (nuevo) o Cancelar/Guardar (edición) | Cancelar/Guardar/Enviar al cliente/Aprobar/Rechazar según estado y permisos | Cumple, con más granularidad que el mockup (correcto, ya que el mockup no separaba Guardar de Enviar — corrección RN3 de REQ-234) |
| Documento formal (logo, tabla de ítems, condiciones, firma) | **No implementado** — botón "Ver/Imprimir" no existe en el modal | **Fuera de alcance a propósito** (SCRUM-298/299/300 = Batch 12, REQ-235 PDF/print) |
| Sección "Condiciones" estática (garantía/forma de pago/validez) dentro del formulario en edición | **No implementada** | **Fuera de alcance a propósito** (REQ-237 = Batch 12 "condiciones configurables" — el mockup la tiene hardcodeada, Batch 12 la reemplaza por una versión parametrizable, consistente con la regla de "nunca hardcodear valores de negocio") |
| Historial de cotizaciones del ticket (lista clickeable de cotizaciones previas) | **No implementado** — el backend solo expone la cotización más reciente (`current()`) | **Fuera de alcance a propósito** (REQ-250 "historial de cotizaciones", diferido explícitamente desde el cierre del Batch 4, dependiente de que Cotización existiera — sigue pendiente, no es parte de SCRUM-292→297) |
| "Generar nueva cotización" tras Rechazada | Botón presente, condicionado a `quote.estado === 'rejected'` | Cumple, verificado en vivo |
| Desglose de subcontratación "uso interno" (costo/margen), visible solo a roles específicos | `ItemRow` gatea `margin_percent`/`cost_reference` por `can_view_cost_breakdown` | Cumple, verificado con y sin el permiso |

## Clasificación de diferencias

**CRÍTICO:** ninguno.

**ACEPTABLE (notas, no bloquean):**
1. El selector de producto usa un modal de búsqueda aparte en vez de un `<select>` inline con
   todas las opciones — mismo resultado funcional (elegir un producto del catálogo), variante de
   layout coherente con el resto del módulo Servicios (mismo patrón `ServiciosSearchPickerModal`
   ya usado en Nuevo Ticket).
2. El indicador de margen bajo dejó de ser un simple borde rojo de aviso y pasó a ser un bloqueo
   duro con toast — el propio ticket (REQ-230 RN4) exige esto como corrección explícita al
   mockup, no es una desviación no autorizada.
3. Ausencia del documento formal/PDF, la sección "Condiciones" y el historial de cotizaciones
   dentro del formulario — las tres son alcance explícito de Batch 12 (SCRUM-298/299/300,
   REQ-235/236/237) o de REQ-250 (ya diferido desde antes de este batch), no vacíos accidentales.
   Ver `docs/architecture/servicios-fase4-diseno.md` para la fuente de esta división de alcance.

## Veredicto

**APROBADO.** Sin hallazgos CRÍTICOS. El desarrollo cumple funcionalmente con el mockup en las
6 historias de este batch; las tres ausencias notadas están correctamente fuera de alcance (Batch
12 / REQ-250) y no ocultan ninguna funcionalidad exigida por SCRUM-292→297. Pasa a Pre-QA (mismo
gate, corrido en la misma sesión — ver `docs/pre-qa/scrum292-297-servicios-batch11-cotizacion-20260812.md`).
