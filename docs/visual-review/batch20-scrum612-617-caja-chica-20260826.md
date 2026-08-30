# Visual Review — Batch 20 Admin&Cont (SCRUM-612→617, REQ-535→540) — Caja Chica

Mockup: adjunto `4I__Admin_Contabilidad_CajaChica.html` de SCRUM-612 (attachment id 11325).
Corrido en LOCAL (`localhost:5173`), ver `docs/pre-qa/batch20-scrum612-617-caja-chica-20260826.md`
para el detalle de comportamiento/Pre-QA — este documento es la fidelidad funcional contra el
mockup específicamente.

## CRÍTICO

Mismo hallazgo que Pre-QA (un solo bug, ambos gates lo detectan desde su propio ángulo): tras
aprobar un reporte, el detalle del mockup debería pasar a mostrar solo "Ver / Imprimir PDF" — en el
desarrollo real, la pantalla se cae en blanco en vez de mostrar esa vista. Ver
`docs/pre-qa/batch20-scrum612-617-caja-chica-20260826.md` para la causa raíz y la sugerencia de fix
— no lo repito acá para no duplicar. Captura: `docs/visual-review/screenshots/SCRUM-617-1.png`.

## Checklist funcional del mockup — confirmado en la app real

| Elemento del mockup | ¿Existe y funciona en el desarrollo? |
|---|---|
| Botón "+ Nuevo gasto" | Sí |
| Botón "Generar reporte" (disabled sin pendientes) | Sí — disabled real confirmado cuando `pendientes_count === 0` |
| 3 tabs con contador en la etiqueta | Sí, incluye "· N sin aprobar" en Reportes cuando aplica |
| Modal Nuevo gasto — multi-línea, agregar/quitar línea | Sí — "Quitar" no aparece si solo queda 1 línea |
| Modal Nuevo gasto — fecha/solicitante/proveedor/descripción/monto bruto/ITBMS/foto por línea | Sí, los 6 campos + foto están todos presentes |
| Tabla Pendientes agrupada por solicitante, subtotal + total general | Sí |
| Columna Estado con pill | Sí (hoy solo se ve "Pendiente" — los otros 2 estados son Batch 21, ver nota abajo) |
| Columna Soporte ("Ver (N)") | Sí, cuenta de adjuntos correcta |
| Modal Generar reporte paso 1 — todo marcado por defecto, checkbox individual y por grupo | Sí |
| Modal Generar reporte paso 2 — forma de pago (4 opciones) | Sí |
| Tabla Reportes — N°/fecha/total/estado/realizado por/ver | Sí |
| Detalle de reporte — agrupado igual que Pendientes | Sí |
| Detalle de reporte — "Aprobar" solo si pendiente y sos Mark | Sí |
| Detalle de reporte — solo "Descargar" si finalizado | **No verificable — ver CRÍTICO arriba** |
| Confirmación de aprobar con número + monto | Sí — "¿Aprobar el reporte 0005-2026 por un total de USD..." |
| Tab Rechazados — panel vacío, sin romper | Sí — "No hay líneas rechazadas permanentemente." |

## Variantes ACEPTABLES (no bloquean)

- Formato de moneda `Intl.NumberFormat('es-PA', ...)` renderiza `USD 12.84` en vez del `$12.84`
  literal del mockup — mismo patrón ya usado en el resto de Admin&Cont (Arqueo de Caja, Cobros,
  etc.), consistente con el resto del sistema real, no con el mockup aislado de un solo módulo.
- Iconografía propia del set `components/icons/` en vez de los SVG inline del mockup — cumple la
  regla SCRUM-56 (sin emoji), mismo criterio ya aceptado en otros módulos.
- Solicitante es un `<select>` con el directorio real de usuarios (vía `/autocomplete/users`) en vez
  de la lista hardcodeada de 28 nombres del mockup — el propio mockup marca esa lista como "REQ
  pendiente: debe venir del directorio real", así que esto es la implementación correcta del REQ, no
  una desviación.

## RE-VERIFICACIÓN POST-FIX (26 ago 2026, misma sesión) — CRÍTICO RESUELTO

Fix aplicado por el Arquitecto (ver `docs/pre-qa/batch20-scrum612-617-caja-chica-20260826.md` en
atlanticerp-backend para el detalle técnico completo). Re-confirmado contra el mockup:

| Elemento del mockup | ¿Existe y funciona ahora? |
|---|---|
| Detalle de reporte — solo "Descargar" si finalizado | **Sí** — confirmado visualmente y por test permanente (`e2e/screenshots/batch20-reporte-finalizado.png`, spec REQ-540) |

Sin regresiones nuevas en el resto del checklist (repasado completo). **Aprobado, sin CRÍTICOs
pendientes.**

## Nota — no bloquea Visual Review, sí anotado en Pre-QA

Los botones "+ Nuevo gasto"/"Generar reporte" son visibles para Mark (rol sin permiso de escritura)
— el mockup es una demo estática de un solo persona ("Administración"), no modela esto, así que no
hay contradicción directa con el mockup. Ver la nota de Pre-QA para el detalle y la sugerencia de
pulido.
