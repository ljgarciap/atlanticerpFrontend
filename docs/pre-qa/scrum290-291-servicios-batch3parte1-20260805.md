# Pre-QA — SCRUM-290/291 (REQ-227 Cancelar ticket, REQ-228 Ver/Imprimir PDF) — 2026-08-05

Fase 4 — Servicios, Batch 3 parte 1 (dividido en 2 partes a pedido de Luis: Cancelar+PDF primero,
formulario completo de Nuevo ticket — REQ-245→247 — después). Mockup: `5A__Servicios_Tickets.html`
(attachment 10578/10580 en SCRUM-308/309, mismo mockup usado en Batch 1/2). Entorno: local
(Docker `:8090` + Vite `:5173`), Playwright CLI
(`e2e/preqa-scrum290-291-servicios-batch3parte1-20260805.spec.ts`).

## Contexto — hallazgo de estado previo a este trabajo

Al empezar la sesión, `docs/architecture/servicios-fase4-diseno.md` y el `CLAUDE.md` de AtlanticERP
marcaban **Batch 2** (REQ-222/224/225/226) como "siguiente paso" — en realidad ya estaba
implementado, en `PM Review` en Jira, con Pre-QA/Visual Review/QA formal ya pasados desde
2026-08-03. La sesión que cerró Batch 2 nunca actualizó esos documentos. Corregido antes de
empezar Batch 3 (ver `feedback_no_asumir_estado_jira_stale.md` en memoria — variante nueva de la
regla, esta vez sobre un doc del repo, no sobre Jira directamente).

## Escenarios verificados (REQ-227 — Cancelar ticket)

| # | Escenario (criterio de aceptación) | Resultado |
|---|---|---|
| 1 | Cancelación exitosa: Aaron confirma con motivo → estado pasa a Cancelado | OK — `test_cancelar_exitoso_cambia_estado_y_guarda_motivo` + Playwright paso 4 |
| 2 | Confirmación requerida: rechazar el modal no cambia el estado | OK — Playwright paso 3 (botón "Volver", el heading del modal desaparece, "Cancelar ticket" sigue disponible) |
| 3 | Sin validación de cotización/informe (a diferencia de resolved/closed) | OK — `test_cancelar_sin_gate_de_cotizacion_ni_informe`, ticket con ambos en `pending` cancela igual |
| 4 | Reactivación: cambiar estado manualmente desde Cancelado no requiere pasos especiales | OK — `test_reactivar_ticket_cancelado_cambiando_estado_manualmente` |
| RN4 | No se puede cancelar un ticket ya cancelado | OK — `test_cancelar_un_ticket_ya_cancelado_retorna_422` + botón ausente en UI tras cancelar (Playwright paso 5) |
| RN6 | Motivo obligatorio | OK — `test_cancelar_sin_motivo_retorna_422` + **hallazgo propio corregido**: un motivo de solo espacios pasaba la regla `required` de Laravel (no vacía como string, pero vacía en sentido real) — agregada regla de closure + `test_cancelar_con_motivo_solo_espacios_retorna_422` |
| RN1 | Exclusivo de Aaron/Líder de Servicios | OK — `test_tecnico_interno_no_puede_cancelar`, `test_management_no_puede_cancelar` (403), botón ausente en UI para `tecnico_servicios` (Playwright paso 6) |

## Escenarios verificados (REQ-228 — Ver/Imprimir PDF)

| # | Escenario | Resultado |
|---|---|---|
| 1 | PDF con la información completa del ticket, mismo contenido que el modal de detalle | OK — verificado con `pdftotext` sobre una descarga real: Cliente, Email, Proyecto, Contacto+teléfono, Dirección, Fecha/horario, Requerimientos especiales, Productos, Informe, Observaciones, Adjuntos, todos presentes |
| RN2 | Disponible para cualquier rol que vea el detalle, no solo quien puede editar | OK — `test_pdf_se_genera_para_cualquier_rol_que_pueda_ver_el_detalle` (tecnico_servicios, sin permiso de edición) + botón visible en Playwright para ambos roles |

### Hallazgo propio encontrado y corregido en esta misma sesión

**Subtítulo del PDF mostraba el subtipo crudo del enum (`installation`) en vez de su etiqueta en
español (`Instalación`).** Detectado extrayendo texto real del PDF descargado con `pdftotext`, no
solo verificando que la descarga ocurriera. Causa: `TicketPdfService` solo traducía `tipo`
(`TIPO_LABELS`) pero no `subtipo`. Corregido agregando `SUBTIPO_LABELS` (mismas 4 etiquetas que
`i18n/locales/es/servicios.json`, `tickets.subtypes.*`) — verificado de nuevo con `pdftotext`
tras el fix: "Instalación — Instalación" en vez de "Instalación — installation".

### Hallazgo de calidad de test (no de producto) encontrado y corregido

El primer borrador del spec de Playwright afirmaba "Motivo de cancelación" visible inmediatamente
después de clickear "Confirmar cancelación", sin esperar a que el modal de confirmación se
cerrara — como esa misma etiqueta también es el label del campo *dentro* del modal (todavía
abierto en ese instante), el assert daba un falso positivo sin haber verificado que la
cancelación realmente se aplicó. Detectado revisando el screenshot del paso (mostraba el modal
todavía abierto). Corregido esperando que el heading del modal desaparezca antes de verificar el
detalle.

## Veredicto

**PASA LIMPIO.** 11/11 tests de backend (`TicketBatch3Test`), suite completa backend 1560/1560,
suite completa frontend 871/871, `tsc --noEmit` limpio, PHPStan Level 8 sin errores, Playwright
end-to-end contra el stack local en 1 sola pasada tras los 2 fixes de esta sesión. Listo para
Senior Review formal / push a `dev`.
