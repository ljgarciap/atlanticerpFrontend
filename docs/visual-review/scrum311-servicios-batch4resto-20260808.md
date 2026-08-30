# Visual Review — SCRUM-311 (REQ-248 Observaciones y Adjuntos, Servicios Batch 4)

**Fecha:** 2026-08-08
**Revisor:** Visual Reviewer (subagente)
**Resultado:** ✅ PASA LIMPIO — sin CRÍTICOs

## Alcance

Compara la implementación real de REQ-248 contra el mockup adjunto de SCRUM-311
(`5A__Servicios_Tickets.html`, bajado de Jira vía `jira_get_attachments`), en dos pantallas:

1. Formulario "Nuevo ticket" (`TicketCreateModal.tsx`) — sección Observaciones + sección
   Adjuntos, líneas ~1258-1263 del mockup.
2. Modal de detalle del ticket (`TicketDetailModal.tsx`) — visualización de ambos campos,
   líneas ~711-715 del mockup.

Commits revisados: backend `3283c8d` + `0ff3e21` (fix de concurrencia, Senior Review), frontend
`7542e65`, rama `dev` en ambos repos. Senior Review ya aprobado antes de este gate.

## Checklist funcional del mockup

**Nuevo ticket:**
- [x] Campo "Observaciones" — textarea, opcional
- [x] Sección "Fotos, videos o archivos adjuntos" — agregar archivo(s), cada uno listado por
      nombre con ícono de archivo (mockup simula un adjunto a la vez vía `prompt()`; el
      desarrollo real permite selección múltiple real de archivos, que es un superset funcional,
      no una pérdida)
- [x] Poder quitar un adjunto antes de crear el ticket (no está en el mockup explícitamente,
      pero no contradice nada — el desarrollo lo agrega como mejora)

**Detalle del ticket:**
- [x] Sección "Observaciones" muestra el texto cargado
- [x] Sección "Fotos, videos o archivos adjuntos" lista el/los archivo(s) reales por nombre, con
      ícono
- [x] Estado vacío ("Sin adjuntos" en el mockup / traducción equivalente en el desarrollo)
      cuando no hay archivos — confirmado en código (`tickets.detail.fields.adjuntosEmpty`,
      `TicketDetailModal.tsx` línea 328-330), no ejercitado en este script porque el ticket de
      prueba sí tenía adjunto (cubierto ya por el flujo feliz — no se considera gap dado que es
      un string estático condicional, no lógica de negocio)
- [x] Clic en el adjunto abre/descarga el archivo real sin error

## Validación realizada (Playwright CLI, stack real)

Script descartable (no promovido a `e2e/`, se corrió y se borró — ver protocolo, Paso 5).
Backend Docker local (nginx/laravel/horizon/postgres/redis) + frontend Vite dev server real en
`localhost:5173`. Login real con `servicio@illuminations.com.pa` (Aaron Leis, `lider_servicios`).

Fixture mínima `[VISUALREVIEW]` sembrada a mano vía tinker (MasterClient/SubClient/SalesProject
— Postgres local no tenía datos de Ventas & Diseño, mismo gotcha que SCRUM-308/309/310) y
**borrada al terminar** (cascada de MasterClient limpió SubClient/SalesProject/tickets/adjuntos;
0 filas remanentes verificado por SQL directo).

Flujo ejercitado end-to-end:
1. Login → Servicios → Tickets → "+ Nuevo ticket"
2. Completar datos generales + Cliente Master → Subcliente → Proyecto (búsqueda real en cascada)
3. Confirmar que "Crear ticket" queda habilitado con Observaciones/Adjuntos vacíos (ambos
   opcionales, no bloquean el submit)
4. Escribir observación real + subir `foto1.png` (imagen real, fixture existente en
   `e2e/fixtures/`)
5. Subir un segundo archivo (`design1.png`) y quitarlo — confirmado que el primero
   (`foto1.png`) permanece intacto en la lista
6. Crear el ticket real
7. Abrir el detalle del ticket recién creado — confirmado que "Observaciones" muestra el texto
   exacto cargado y "Fotos, videos o archivos adjuntos" lista `foto1.png`
8. Clic en `foto1.png` — abre pestaña nueva con URL real de S3
   (`atlanticerp-dev.s3.amazonaws.com/private/servicios/tickets/{id}/...`), firmada
   (`X-Amz-Expires=900` = 15 min, consistente con el patrón documentado de share-links/
   documentos)

Capturas de pantalla (formulario con Observaciones+Adjuntos poblados, y detalle con ambos
campos visibles) comparadas 1:1 contra las secciones correspondientes del mockup — mismo orden
de secciones (Requerimientos especiales → Productos → Observaciones → Adjuntos en el
formulario; mismos labels en el detalle), mismo ícono de tipo "archivo"/paperclip.

## Diferencias encontradas

Ninguna CRÍTICA.

**ACEPTABLE (no bloquea):**
- El mockup simula "agregar adjunto" de a uno por vez vía `prompt()` de texto (es un prototipo
  estático sin backend real); el desarrollo permite selección múltiple real de archivos del
  sistema de archivos del usuario. Es un superset funcional — todo lo que el mockup permite
  hacer, el desarrollo lo permite y además más.
- El mockup no muestra explícitamente una forma de quitar un adjunto antes de crear; el
  desarrollo sí la tiene. No es una funcionalidad perdida, es una agregada.

## Lo que sí cumple

- Campo Observaciones: textarea opcional, mismo label, misma posición relativa (tras
  Productos, antes de Adjuntos) en ambas pantallas.
- Sección Adjuntos: mismo label exacto ("Fotos, videos o archivos adjuntos"), listado por
  nombre de archivo con ícono, en ambas pantallas.
- Detalle: ambos campos visibles y pobladas con datos reales tras crear el ticket.
- Adjunto real clickeable, abre URL firmada de S3 sin error (15 min de expiración, mismo
  patrón que documentos/share-links del CRM).
- Ninguna funcionalidad del mockup está ausente o rota.

## Veredicto

✅ Aprobado — el ticket puede avanzar a Pre-QA (sujeto también al resultado de Senior Reviewer,
gates independientes en paralelo — Senior Reviewer ya está aprobado según contexto recibido).
