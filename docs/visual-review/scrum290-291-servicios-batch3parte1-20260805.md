# Visual Review — SCRUM-290/291 (REQ-227/228) — 2026-08-05

Mockup: `5A__Servicios_Tickets.html` (attachment 10578/10580, SCRUM-308/309). Alcance: botones
"Cancelar ticket" y "Ver/Imprimir" en el detalle del ticket, modal de confirmación de cancelación,
contenido del PDF.

## Checklist funcional del mockup — header del detalle del ticket

| Elemento (mockup, `renderTicketModalBody()`) | ¿Presente en el desarrollo? |
|---|---|
| Botón "Ver/Imprimir" (siempre visible, cualquier rol) | Sí |
| Botón "Cancelar ticket" (solo si `!modoEdicionTicket && estado !== 'cancelado'`) | Sí — mismo gate `estado !== 'cancelled'`, más el gate de rol (`canEdit`, RN1) que el mockup no modela porque es un prototipo sin roles reales |
| Orden de botones: Ver/Imprimir, Cancelar ticket, Editar | Sí, mismo orden |
| Modal de confirmación con motivo obligatorio | El mockup usa `confirm()` nativo del navegador (sin campo de motivo) — RN6 del REQ escrito exige motivo obligatorio, más estricto que el mockup. Se sigue el REQ, no el prototipo (mismo criterio que otros batches: el mockup es de layout, el REQ es la fuente de verdad de reglas de negocio) |

## Checklist funcional del mockup — contenido del PDF (`printTicket()`)

| Campo (mockup) | ¿Presente en el PDF real? |
|---|---|
| Cliente | Sí |
| Email de contacto | Sí |
| Proyecto asociado | Sí |
| Contacto (nombre · teléfono) | Sí |
| Dirección completa | Sí |
| Fecha y hora de servicio | Sí |
| Horario de trabajo / visita | Sí |
| Requerimientos especiales | Sí |
| Productos reclamados / afectados (tabla o "No aplica") | Sí (siempre "No aplica" hoy — `productos` vacío hasta Batch 3 parte 2/Batch 4) |
| Informe de inspección (estado) | Sí |
| Observaciones | Sí |
| Adjuntos | Sí |

Verificado extrayendo el texto real del PDF descargado (`pdftotext`), no solo la apariencia — ver
`docs/pre-qa/scrum290-291-servicios-batch3parte1-20260805.md` para el hallazgo del subtipo sin
traducir, encontrado y corregido en esta misma sesión.

## Veredicto

**APROBADO.** Ningún elemento del mockup ausente. La única divergencia (modal de confirmación con
campo de motivo vs. `confirm()` nativo del mockup) es una mejora exigida explícitamente por el
texto del REQ (RN6), no un gap — documentada, no bloqueante. Pasa a Pre-QA/QA.
