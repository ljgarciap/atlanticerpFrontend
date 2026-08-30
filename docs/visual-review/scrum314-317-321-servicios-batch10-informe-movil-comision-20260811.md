# Visual Review — Batch 10: Informe móvil (SCRUM-314/315/316/317) + Comisión Carlos Vergara (SCRUM-321)

**Fecha:** 2026-08-11
**Alcance:** 5 tickets fusionados en un solo pase (Visual Review + Pre-QA), a pedido de Luis
(ver `feedback_gate_overhead_proportional_to_batch_size.md`). Este documento cubre solo el
componente Visual Review — comparación contra los mockups adjuntos de Jira. El veredicto
adversarial (Pre-QA) vive en `atlanticerp-backend/docs/pre-qa/scrum314-317-321-servicios-batch10-informe-movil-comision-20260811.md`.
**Estado:** APROBADO — ningún hallazgo CRÍTICO en los 5 tickets. Listos para Pre-QA (ya corrido,
ver documento hermano).

**Entorno:** stack local (Docker: postgres/redis/laravel/horizon/nginx en :8090 vía
`docker compose -f infra/docker-compose.yml`, `npm run dev` en :5173, proxy `/api` -> :8090).
Cambios sin commitear en el working tree de `atlanticerp-frontend`/`atlanticerp-backend`. Fixture real usada:
ticket `INS-2026-0003` (Instalación, subtipo Inspección, sin productos), técnico asignado Carlos
Vergara — ya existía en `ServiciosDemoSeeder` tras correr `db:seed --force` (DB local estaba
vacía al arrancar la sesión, 0 tickets — se sembró antes de cualquier prueba, ver Paso 0 de
Pre-QA).

**Mockups usados** (`jira_get_attachments` + `curl -L`):
- `5F__Servicios_Informe_Movil.html` (SCRUM-314/315/316/317) — mockup de 2 archivos HTML
  independientes sin base de datos compartida, simula datos vía query params. El propio mockup
  documenta en su nota de producto (`.prod-note`) que en producción debe ser "el mismo informe",
  no una copia — ver checklist abajo, punto verificado explícitamente.
- `5B__Servicios_Tecnicos_Internos.html` (SCRUM-321) — mockup de la tarjeta+modal de comisión de
  Carlos, con nota inline del propio autor (`NOTA PARA TECNOLOGÍA`) sobre el cálculo semi-
  automático de estado del técnico (no aplica a Batch 10, es de Batch 6).
- `Plan_Bonificacion_Carlos_Vergara.docx` — fuente de verdad de la fórmula real (25/25/25/15/10,
  $100/$100/$100/$60/$40, ejemplo práctico $352.00) — RN1/RN9 se verifican contra este documento,
  no solo contra el mockup HTML.

---

## SCRUM-314/315 (REQ-251/252) — Acceso y formulario del Informe móvil

### Checklist funcional del mockup

| # | Elemento del mockup | En la app real | Veredicto |
|---|---|---|---|
| 1 | Botón "Ver en móvil" solo dentro del modal de Informe de Inspección (escritorio) | Confirmado — botón en el header de `InspectionReportModal`, no existe acceso independiente en ningún menú | Cumple (RN1) |
| 2 | Header con N° de ticket, cliente, dirección | Card superior "TICKET / CLIENTE / PROYECTO / DIRECCIÓN" con datos reales (`INS-2026-0003` / `Clínica Paitilla`) | Cumple |
| 3 | Fecha de inspección, Técnico responsable, Hora inicio/fin | Los 4 campos presentes, Técnico responsable precargado con el técnico ya asignado (Carlos Vergara) | Cumple (RN3 REQ-252) |
| 4 | Bloque "Hallazgos de la inspección" con diagnóstico dinámico por producto | Ticket sin productos asociados → renderiza campos estáticos del catálogo por tipo (Checklist técnico + Recomendación para cotización) — MISMO catálogo que el informe de escritorio (`fieldsForTicket()` compartido) | Cumple (RN1 REQ-252, mapeo 1:1) |
| 5 | "+ Agregar hallazgo adicional" | Presente y funcional | Cumple |
| 6 | "Materiales / insumos utilizados" con "+ Agregar material usado" | Presente; a diferencia del mockup (que autogenera "Material #1 — cant. 1"), acá son 2 inputs de texto libre reales ("Insumo/herramienta" + "Cantidad") | Cumple, MEJOR que el mockup (RN2 REQ-252 corrige explícitamente el placeholder genérico del mockup) |
| 7 | Fotos "Antes" / "Después" con miniaturas | Presentes, 2 secciones separadas con botón "+" | Cumple |
| 8 | Conclusión, "¿Requiere seguimiento?" | Presentes | Cumple |
| 9 | "Firma / acuse de recibido del cliente" (input de nombre) | Presente | Cumple |
| 10 | Botón "Guardar informe" al fondo | Presente, gatea el paso a firma (RN4 REQ-252) — verificado que NO dispara ningún POST hasta la firma confirmada (ver Pre-QA) | Cumple |
| 11 | Diseño de una sola columna, campos grandes táctiles (viewport 420px) | Confirmado visualmente — inputs `py-3`/`text-base`, una columna en todo el formulario | Cumple (RN3 REQ-251) |

### Nota — variante aceptable
El mockup es un frame de teléfono aislado (sin header de la app real); la implementación real
mantiene el TopBar de la aplicación (menú hamburguesa, notificaciones, avatar) arriba del
formulario móvil. No elimina ninguna funcionalidad del mockup — es la cáscara de navegación
estándar de toda la SPA, esperable y consistente con el resto del sistema. **ACEPTABLE, no
bloquea.**

## SCRUM-316 (REQ-253) — Firma gráfica

| # | Elemento del mockup | En la app real | Veredicto |
|---|---|---|---|
| 1 | Pantalla "Firma del cliente" con lienzo táctil | Presente, mismo layout (ícono, título, subtítulo con el nombre del firmante) | Cumple |
| 2 | Placeholder "Firmá dentro del recuadro" / equivalente | Presente | Cumple |
| 3 | "Limpiar firma" + "Firmar" | Ambos presentes, mismas posiciones relativas | Cumple |
| 4 | Botón "Firmar" deshabilitado sin trazo | Confirmado en vivo (Pre-QA) — `disabled=true` hasta el primer trazo | Cumple (RN2) |
| 5 | Mockup permite firmar con nombre vacío → autocompleta "Cliente" | Implementación CORRIGE esto a propósito (RN1 lo pide explícitamente) — nombre vacío bloquea el avance con un toast, nunca autocompleta | Cumple — desviación intencional documentada en el propio ticket, no es un hallazgo |
| 6 | Pantalla de confirmación con fecha/hora fija de ejemplo | Implementación usa la hora real del momento de la firma | Cumple (RN6, corrige el placeholder del mockup) |

## SCRUM-317 (REQ-254) — Sincronización

No agrega pantallas nuevas — es enteramente backend/estado compartido. Verificado
funcionalmente (no visualmente) en el documento de Pre-QA: mismo registro visible desde
escritorio, indicador de tabla actualizado, PDF con firma real. **N/A para checklist visual
puro, cubierto por Pre-QA.**

## SCRUM-321 (REQ-258) — Comisión Carlos Vergara

| # | Elemento del mockup | En la app real | Veredicto |
|---|---|---|---|
| 1 | Mini-bloque "Comisión del mes" en la tarjeta de Carlos, fondo ámbar, monto + "de $400 máx." | Presente — para Carlos/Gerencia: `$XXX.XX de $400 máx. · <Mes> <Año> · visible solo para...`. Para Aaron: solo botón "Comisión del mes" (captura), sin monto — variante INTENCIONAL de permisos (RN8), no de mockup | Cumple |
| 2 | Modal de detalle: total grande, tabla Criterio/Peso/% obtenido/Bono parcial | Presente — "TOTAL DEL MES" destacado + tabla con las 5 filas (Calidad/Satisfacción/SLA/Puntualidad/Actitud), columnas Peso/% obtenido/Monto | Cumple (RN9) |
| 3 | Nota de licencia médica cuando aplica | Presente (`licenciaMedicaNote`) cuando `capture.licencia_medica=true` — verificado en vivo con captura de julio 2026 | Cumple (RN5) |
| 4 | Mini-indicador de comisión SOLO en la tarjeta de Carlos (no en las demás) | Confirmado — Miguel Castillo (`has_bonus_plan=false`) no muestra ningún bloque de comisión, Pedro/Agustín tampoco | Cumple (RN7) |
| 5 | Modal "Capturar indicadores del mes" (mockup solo lo simula con un `alert()`) | Implementación real: formulario funcional completo (Satisfacción, Puntualidad, Actitud, **+ Calidad manual**, checkbox Licencia médica, selector de período ← / →) | Cumple, MÁS COMPLETO que el mockup (el mockup marcaba esto como simulación a propósito) |
| 6 | — (no está en el mockup, es superficie nueva de Batch 10) Pantalla "Ajustes de Servicios" | Pantalla nueva con los 21 valores paramétricos del plan de bonificación + SLA + operación, agrupados en 3 secciones, editable solo Gerencia/superadmin, visible-pero-deshabilitada para el resto con nota explícita | N/A contra mockup (no existe en el mockup de Jira) — verificado funcionalmente en Pre-QA, cumple con la regla dura del CLAUDE.md de no hardcodear umbrales de negocio |

### Nota — variante aceptable
El mockup muestra "% sugerido (reincidencia)" para Calidad con un texto explicativo de que es un
proxy automático ajustable. La implementación real (decisión explícita de Luis, documentada en
`CommissionCalculationService`) hace Calidad 100% captura manual en este batch, porque REQ-211
(reincidencia) no existe todavía. Es una reducción de alcance **documentada y aprobada
explícitamente por el dueño del producto**, no un hallazgo — se corrigió el label del campo para
no decir "sugerido" cuando no hay sugerencia automática (`CALIDAD DEL TRABAJO TÉCNICO (%, CAPTURA
MANUAL)`), evitando que el usuario piense que hay un cálculo detrás que no existe. **ACEPTABLE.**

---

## Resultado

**Ningún hallazgo CRÍTICO en ninguno de los 5 tickets.** Los 3 desvíos respecto al mockup
encontrados (nombre de firma obligatorio, hora real vs. fija, Calidad manual vs. sugerida) son
correcciones **intencionales y documentadas en el propio texto de cada ticket** — el mockup mismo
señala en sus notas (`RN1`, `RN6`, docblock del backend) que esos 3 puntos son simplificaciones
del archivo HTML standalone que la implementación real debe corregir. Ninguna funcionalidad del
mockup falta o está rota. Aprobado para pasar a Pre-QA (ya corrido en el mismo pase, ver documento
hermano) — ambos gates PASA LIMPIO.

Marcadores creados: `~/.claude-visual-review-markers/SCRUM-314`, `SCRUM-315`, `SCRUM-316`,
`SCRUM-317`, `SCRUM-321`.
