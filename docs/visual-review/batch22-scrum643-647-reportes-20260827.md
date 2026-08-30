# Visual Review — Batch 22 Admin&Cont (SCRUM-643→647, REQ-566→570) — home de Reportes

Mockup: `4M__Admin_Contabilidad_Reportes.html` (bajado del ticket, ver
`requerimientos.xlsx` para el detalle de REQ-566→570). Corrido en LOCAL (`localhost:5173`), ver
`docs/pre-qa/batch22-scrum643-647-reportes-20260827.md` para el detalle de comportamiento/Pre-QA —
este documento es la fidelidad funcional/visual contra el mockup específicamente.

**Alcance real vs. mockup, aclarado a propósito:** el mockup real trae más tarjetas de las que
corresponden a este batch — Comisiones (Internas vs Externas), Notas de Crédito, y 4 accesos a
sub-reportes (Mensual por cliente, Acumulado, Libro de Facturas, Ventas por medio de pago). Esas
son Batch 23+ del plan (`docs/architecture/admin-contab-batches.md`) — su ausencia en el desarrollo
es correcta, NO es un hallazgo. Este review evalúa únicamente el encabezado + las 5 tarjetas que sí
corresponden a REQ-566→570.

## CRÍTICO

**Ninguno de fidelidad visual/funcional contra el mockup.** El único CRÍTICO real de esta pasada
fue de comportamiento/gate de rol (vendedor_disenador alcanzaba la pantalla completa por URL
directa) — documentado y ya corregido en
`docs/pre-qa/batch22-scrum643-647-reportes-20260827.md`, no se repite acá para no duplicar.

## Checklist funcional del mockup — confirmado en la app real (acotado a Batch 22)

| Elemento del mockup | ¿Existe y funciona en el desarrollo? |
|---|---|
| Encabezado "Reportes" + subtítulo | Sí, texto equivalente |
| Selector de período (Hoy/3 meses/6 meses/Año) | Sí, mismas 4 opciones, mismo orden, default "Hoy" |
| Tarjeta "Comisión por gestión de cartera +90 días — Felix" (wide) | Sí |
| — 3 KPIs (cobrado del mes / rango actual / comisión) | Sí |
| — 3 tramos con el actual resaltado + check | Sí — check es icono SVG propio (`IcoCheck`), no el glyph `✓` del mockup (regla SCRUM-56, ya corregido en Senior Review) |
| — footnote explicativo | Sí, texto equivalente |
| Tarjeta "Cartera por cobrar" (donut, 4 rangos) | Sí, colores y leyenda correctos, navega a Facturación al click |
| Tarjeta "Cobrado de cartera +90 días" (KPI + pendiente) | Sí, navega a Facturación al click |
| Tarjeta "Ventas" (wide) — Hoy: KPI simple | Sí |
| Tarjeta "Ventas" (wide) — período: barras + último mes resaltado + variación % | Sí, confirmado con datos reales sembrados (ver Pre-QA) |
| Tarjeta "Arqueo de Caja" (wide) — flujo neto por mes + saldo hoy/proyectado 30d | Sí, navega a Arqueo de Caja al click |
| Comisiones (Internas vs Externas) | Correctamente ausente — Batch 23+ |
| Notas de Crédito | Correctamente ausente — Batch 23+ |
| 4 accesos a sub-reportes | Correctamente ausentes — Batch 23+ |

## Variantes ACEPTABLES (no bloquean)

- Layout: 2 columnas (`sm:grid-cols-2`) con las tarjetas "wide" ocupando ambas columnas — mismo
  orden y agrupación visual que el mockup (Comisión Felix arriba wide, las 2 de Cartera lado a
  lado, Ventas wide, Arqueo de Caja wide). Sin diferencias de jerarquía.
- Formato de moneda `Intl.NumberFormat('es-PA', ...)` → `USD 17,000.00` en vez del `$17,000` corto
  del mockup — mismo patrón ya usado y aceptado en el resto de Admin&Cont (Arqueo de Caja, Cobros,
  Caja Chica).
- Labels con matiz distinto pero mismo significado: mockup dice "Cobrado de cartera +90 días
  (jul.)" (con abreviatura de mes hardcodeada al dato de ejemplo) vs. desarrollo "... (mes
  actual)" — genérico y siempre correcto sin importar el mes real, mejor que el mockup en ese
  sentido.
- Iconografía propia del set `components/icons/` (`IcoBarChart`, `IcoTrendingUp`, `IcoCheck`,
  `IcoChevronRight`) en vez de los SVG inline del mockup — cumple SCRUM-56, mismo criterio ya
  aceptado en el resto del sistema.
- Dark mode — sanity check visual sin roturas de contraste, layout ni brand colors (fuera del
  alcance literal del mockup, que es solo light, pero se verificó igual por ser un patrón ya
  soportado en el resto de la app).

## Capturas

- `docs/visual-review/screenshots/SCRUM-643-647-1-hoy.png` — período "Hoy", datos reales
  sembrados (tramo 2 de comisión resaltado, 4 rangos de antigüedad poblados).
- `docs/visual-review/screenshots/SCRUM-643-647-2-6meses.png` — período "6 meses", barras de
  Ventas con el último mes resaltado + variación `+100% vs. mes anterior`, Comisión Felix/Cartera
  sin cambios (mismos valores que en "Hoy") confirmando RN3/RN4 también visualmente.

## Veredicto

Aprobado — fidelidad funcional completa contra las 5 tarjetas + encabezado de Batch 22. El único
hallazgo de esta pasada fue de comportamiento (gate de rol), no de fidelidad visual, y ya está
resuelto (ver Pre-QA).
