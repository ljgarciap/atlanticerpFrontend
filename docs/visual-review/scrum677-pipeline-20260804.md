# Visual Review — SCRUM-677 (REQ-597), fix "banner de dato faltante queda pegado"

**Fecha:** 2026-08-04
**Ticket:** [SCRUM-677](https://grupolafayette.atlassian.net/browse/SCRUM-677) — REQ-597, Pipeline de Ventas & Diseño
**Mockup adjunto:** `2A__CRM_Pipeline.html` (attachment 11520, Daniela Amaya)
**Componente:** `atlanticerp-frontend/src/components/PipelineCardModal.tsx`
**Commit revisado:** `0abbf69` (dev local, no pusheado a origin al momento de esta revisión)

## Alcance de esta revisión

Este ciclo de Visual Review NO es sobre una pantalla nueva — REQ-597 (estructura de botones de
transición de etapa) ya pasó por Visual Review en 2026-08-04 (comentario de Luis en Jira, PASS
"confirmado en 2 tarjetas distintas en Diseño"). Lo que cambió después es un fix de
**comportamiento**: el banner de "dato faltante" (`stageError`/`quoteGateError`) que el mockup sí
define como parte del flujo de gates de etapa (`.contact-missing` / `#moveWarning{id}` en el
mockup, ver líneas 366/1653/1711/1752/1919/2150 de `2A__CRM_Pipeline.html`) quedaba visible para
siempre incluso después de resolver el dato faltante, cuando el mockup implica claramente que el
aviso es un estado transitorio ("Debe incluir contacto antes de mover de etapa" — desaparece una
vez cumplida la condición, ver el toggle `style.display` del mockup en `hideMoveWarning()`).

## Checklist funcional (banner de dato faltante dentro del modal de tarjeta)

| Elemento del mockup | Presente en el desarrollo | Funciona |
|---|---|---|
| Banner de aviso aparece al fallar un gate de movimiento de etapa | Sí — `stageError`/`quoteGateError`, banner rojo bajo el header del modal | Sí |
| Banner desaparece al resolver el dato por la MISMA acción que lo disparó | Sí (ya funcionaba antes del fix) | Sí |
| Banner desaparece al resolver el dato por OTRA vía (Editar→Guardar, subir archivo, agregar contacto) | Sí — este es el fix de SCRUM-677 | **Sí, confirmado en vivo (ver Pre-QA abajo)** |
| Un segundo dato faltante (gate distinto) muestra su propio mensaje, sin mezclarse con el anterior | Sí | Sí, confirmado |

## Clasificación

**Sin hallazgos CRÍTICOS.** El fix es fiel a la intención del mockup (aviso transitorio, no
permanente) y no introduce ninguna variante de layout — el banner sigue siendo el mismo
componente visual (mismo estilo rojo, misma posición), solo cambia CUÁNDO se limpia su estado.

**Lo que sí cumple:**
- El banner aparece con el texto exacto del gate que falló (superficie, archivo, contacto,
  Cliente Master, Subcliente — según corresponda).
- Se limpia al resolver el dato por cualquiera de las 4 vías que lo pueden resolver
  (`changeStageMutation`, `saveMutation`, `uploadFileMutation`, `addContactMutation`).
- Gates distintos en secuencia muestran mensajes distintos, sin texto mezclado o duplicado.

## Resultado

**APROBADO.** Pasa a Pre-QA (mismo comentario de Jira que este documento — ver también
`docs/pre-qa/scrum677-pipeline-20260804.md`).
