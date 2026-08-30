# Visual Review — SCRUM-301→306: Informe de Inspección (Fase 4 Servicios, Batch 8, REQ-238→243)

**Fecha:** 2026-08-10
**Componente:** `atlanticerp-frontend/src/components/servicios/InspectionReportModal.tsx`
**Mockup:** `5A__Servicios_Tickets.html` (adjunto en SCRUM-301) — funciones `openInformeModal`,
`buildInformeFormHtml`, `renderInformeCampos`, `saveInforme`, `buildInformeViewHtml`.
**Estado:** APROBADO — ningún hallazgo CRÍTICO. Listo para Pre-QA (Pre-QA de comportamiento ya
corrió y pasó limpio antes que este gate, ver `docs/pre-qa/scrum301-306-servicios-batch8-informe-inspeccion-20260810.md`).

## Checklist funcional del mockup

| # | Elemento del mockup | En la app real | Veredicto |
|---|---|---|---|
| 1 | N° de informe (autogenerado al guardar) | Presente, "(se asigna al guardar)" antes del primer save, folio real después | Cumple |
| 2 | Ticket/Cliente/Proyecto/Dirección de solo lectura | Presentes, no editables | Cumple |
| 3 | Fecha de inspección (selector real) | `<input type="date">` | Cumple |
| 4 | Técnico responsable (select, precargado, filtrado por especialidad) | Presente, precarga el técnico ya asignado al ticket (RN4), opciones filtradas por `technicians.internalOptions(tipo)` | Cumple |
| 5 | Hora de inicio / Hora de fin | `<input type="time">` × 2 | Cumple |
| 6 | Toggle "¿Ya tienes el informe? Súbelo aquí" | Presente, oculta el formulario completo | Cumple |
| 7 | Hallazgos dinámicos — bloque por producto (Retrofit: Estado actual + Observación técnica) | Confirmado visualmente (`vr-retrofit-con-producto.png`) | Cumple |
| 8 | Hallazgos dinámicos — bloque por producto (no-Retrofit: Diagnóstico + Observación específica) | Confirmado visualmente (`vr-garantias-con-producto.png`) | Cumple |
| 9 | Hallazgos dinámicos — 5 combinaciones sin producto (Instalación, Inspección de instalación, Garantías genérico, Inspección por reposición, Retrofit sin producto) | Confirmado por assertions del e2e permanente de Pre-QA (`e2e/preqa-scrum301-306-...spec.ts`), catálogo 1:1 con `InspectionReportService::STATIC_FIELDS_BY_TIPO` | Cumple |
| 10 | "+ Agregar hallazgo adicional" ilimitado | Presente | Cumple |
| 11 | Materiales — líneas nombre+cantidad, "+ Agregar material usado" | Presente | Cumple |
| 12 | Fotos "Antes"/"Después" en secciones separadas | Presente (confirmado en `vr-instalacion-completado` y por el e2e de Pre-QA, ticket con informe completado) | Cumple |
| 13 | Conclusión (textarea) | Presente, bloquea "Guardar informe" si está vacía | Cumple |
| 14 | "¿Requiere seguimiento?" Sí/No → muestra/oculta "Próximos pasos" | Presente | Cumple |
| 15 | Firma del técnico responsable + Firma/acuse del cliente (texto, no gráfica) | Presente en ambos modos | Cumple |
| 16 | Modo archivo: "Subir informe existente" + "+ Adjuntar archivo" + 2 campos de firma | Confirmado visualmente (`vr-modo-archivo.png`) — oculta el resto del formulario, "Guardar informe" deshabilitado sin archivo en el primer guardado | Cumple |
| 17 | Botones Cancelar / Guardar informe | Presentes | Cumple |
| 18 | "Ver en móvil" / "Ver/Imprimir" en el modal | Ausentes en este batch | Fuera de alcance a propósito (Batch 10 e REQ-244/Batch 9 respectivamente) — no es hallazgo de Batch 8 |

## Diferencias encontradas — ambas ACEPTABLES, ninguna CRÍTICA

1. **Labels de firma en modo archivo_subido.** El mockup usa "Firma del técnico"/"Firma / acuse
   del cliente" (más cortos) en este modo específico, distintos de "Firma del técnico
   responsable"/"Firma / acuse de recibido del cliente" del modo formulario. El desarrollo reusa
   los mismos labels largos en ambos modos por consistencia. Mismo campo, misma función (nombre de
   texto) — el usuario puede hacer exactamente lo que el mockup muestra. No bloquea.
2. **Placeholder del input de firma.** El mockup usa "Nombre de quien firma"/"Nombre del cliente"
   como placeholder en modo archivo_subido; el desarrollo usa "Pendiente de firma" en todos los
   casos (mismo texto que REQ-242 RN3 define para la vista de solo lectura). Variante de copy, no
   de funcionalidad.

## Evidencia (Playwright CLI, stack local `localhost:8090`)

Fixtures: tickets `GAR-2026-0001` (warranty con producto, técnico Miguel Castillo),
`RET-2026-0001` (retrofit con producto, técnico Pedro Santos), `INS-2026-0003`
(installation/inspection sin producto, informe ya completado), `RET-2026-0002` (retrofit sin
producto, técnico Carlos Vergara) — mismos fixtures que documenta el e2e permanente de Pre-QA.
Login real como Aaron Leis (`servicio@illuminations.com.pa`, Líder de Servicios).

- `vr-garantias-con-producto.png` — bloque Diagnóstico + Observación específica por producto.
- `vr-retrofit-con-producto.png` — bloque Estado actual + Observación técnica por producto.
- `vr-instalacion-completado.png` — informe ya completado (folio real, checklist técnico precargado).
- `vr-modo-archivo.png` — modo "Súbelo aquí" completo.

Capturas en `test-results/` (gitignored, no se commitean — mismo criterio que el resto de
Visual Review de este repo).

## Resultado

Sin hallazgos CRÍTICOs. Aprobado para Pre-QA (que ya corrió y pasó, ver informe de Pre-QA). Marcadores creados en `~/.claude-visual-review-markers/SCRUM-301..306`.
