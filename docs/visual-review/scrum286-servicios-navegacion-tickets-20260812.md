# Visual Review — SCRUM-286 (REQ-223: Navegación Tabla/Tablero ↔ Historial de cotizaciones ↔ Técnicos externos)

**Fecha:** 2026-08-12 · **Fusionado con Pre-QA en el mismo despacho** — ver
`docs/pre-qa/scrum286-servicios-navegacion-tickets-20260812.md` para el checklist funcional
completo, screenshots y evidencia detallada. Este archivo documenta específicamente la comparación
contra el mockup adjunto (regla del rol Visual Reviewer).

**Mockup:** Jira attachment 10534, `5A__Servicios_Tickets.html` — mismo mockup ya usado y
validado en Batch 1/2.

## Nota de arquitectura (no objetada)
3 rutas React Router separadas bajo el mismo `ServiciosNavMenu`, en vez de un único archivo con
tabs internos — mismo patrón que el resto del módulo. Equivalencia funcional válida (ver detalle
en el doc de Pre-QA).

## Checklist funcional contra el mockup

| Elemento del mockup | ¿Existe en el desarrollo? | ¿Funciona? |
|---|---|---|
| Toggle "Tabla" / "Tablero" | Sí | Sí — cambia presentación sin resetear filtros (RN1) |
| Botón "Ver cotizaciones" | Sí | Sí — navega a Historial de cotizaciones (RN2) |
| Menú "Técnicos" → "Técnicos externos" | Sí | Sí — navega directo, sin pasos intermedios (RN3) |
| Botón "+ Nuevo ticket" | Sí | Sí — solo visible en Tickets, desaparece en Técnicos externos |
| Botón "+ Agregar técnico externo" | Sí | Sí — reemplaza a Ver cotizaciones/Nuevo ticket en Técnicos externos |
| Encabezado dinámico por vista (título/subtítulo/botones) | Sí | Sí — 3 headers distintos confirmados (RN4) |

## Clasificación
CRÍTICO — ninguno.
ACEPTABLE (nota, no bloquea) — ninguna variante relevante encontrada; la única diferencia
estructural (3 rutas vs. 1 archivo con tabs) ya está evaluada como equivalencia funcional válida
por decisión previa del Arquitecto, no como variante de layout a documentar acá.

## Lo que sí cumple
Todos los elementos del mockup relevantes a este ticket están presentes y funcionan.

## Resultado
Aprobado. Sin bloqueantes para Pre-QA/QA.
