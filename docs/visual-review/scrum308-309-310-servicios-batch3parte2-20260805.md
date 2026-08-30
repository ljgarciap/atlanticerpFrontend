# Visual Review — SCRUM-308/309/310 (REQ-245/246/247) — 2026-08-05

Mockup: `5A__Servicios_Tickets.html` (attachment 10578/10580/10581, SCRUM-308/309/310). Alcance:
modal "Nuevo ticket" completo (`buildNuevoTicketFormHtml()`), buscador Cliente Master→Subcliente→
Proyecto (`buildNuevoClienteSectionHtml()`, `openSearchPickerModal()`), checklist de requerimientos
(`renderNuevoRequisitosHtml()`), sección de productos (`buildNuevoProductosHtml()`).

## Checklist funcional del mockup — formulario "Nuevo ticket"

| Elemento (mockup) | ¿Presente en el desarrollo? |
|---|---|
| Tipo de servicio / Subtipo / Tipo de instalación / Breve descripción | Sí, mismos 4 campos, mismo layout en grid |
| Sección "Cliente" — Cliente Master (buscador) → Subcliente (buscador) → Proyecto (select) | Sí, cascada idéntica: subcliente solo aparece tras elegir master, proyecto solo tras elegir subcliente |
| Contacto — nombre / teléfono / Email / Dirección completa | Sí |
| Requerimientos especiales — checklist de 18 + "+ Agregar otro" | Sí, mismas 18 etiquetas (extraídas literalmente de `REQ_LABELS` del mockup) |
| Productos reclamados/afectados — buscador + lista con cantidad reclamada editable + quitar | Sí |
| Observaciones | **Diferido a propósito** — REQ-247/245/246 no lo cubren; el desglose de PM (`docs/architecture/servicios-fase4-diseno.md` sección 8) lo asigna a REQ-248/Batch 4 junto con Adjuntos. No es un gap de este batch. |
| Fotos/videos/adjuntos | **Diferido a propósito** — mismo REQ-248/Batch 4 que Observaciones. |
| Botones Cancelar / Crear ticket | Sí |

## Divergencias intencionales vs. el mockup (no son gaps)

- **Creación de cliente/proyecto nuevo:** el mockup permite escribir un proyecto libre y lo
  "crea" en el array local (`subObj.proyectos.push(...)`, simulación sin backend real). REQ-246
  RN1 prohíbe esto explícitamente ("Servicios NO puede crear un Cliente Master, Subcliente ni
  Proyecto nuevo"). Se sigue el REQ, no el prototipo — mismo criterio que otros batches (el mockup
  es de layout/interacción, el REQ es la fuente de verdad de reglas de negocio).
- **Cantidad recibida/pendiente al agregar un producto:** el mockup las inicializa en el buffer
  local pero no las muestra en el formulario de creación (coincide con REQ-247 RN5, ya está
  alineado).

## Checklist — permisos (REQ-245 RN4)

| Rol | Mockup | Desarrollo |
|---|---|---|
| Aaron/Líder de Servicios, superadmin | Botón visible (mockup no modela roles) | Visible — verificado en Playwright |
| Gerencia (`management`) | — | Visible — `test_management_puede_crear_ticket` |
| Vendedor/Diseñador | — | Visible — verificado en Playwright con login real (`milena.e@grupolafayette.com`) |
| Técnico interno / Garantías | — | Ausente — verificado en Playwright (`carlos@illuminations.com.pa`, sin el botón) |

## Veredicto

**APROBADO.** Ningún elemento del mockup ausente dentro del alcance de REQ-245/246/247.
Observaciones/Adjuntos están en el mockup pero corresponden a REQ-248 (Batch 4), no a este batch —
confirmado contra el desglose de PM antes de marcarlo como gap. La única divergencia real
(creación de cliente/proyecto) es una restricción exigida explícitamente por el REQ, no un olvido.
Pasa a Pre-QA/QA.
