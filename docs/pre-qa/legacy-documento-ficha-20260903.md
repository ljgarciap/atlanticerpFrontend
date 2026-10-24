# Pre-QA — Vista "gemela" tipo documento (Historial ICG + Pagos ICG)

**Fecha:** 2026-09-03
**Alcance:** Sin ticket Jira formal — feature acordada directamente con Luis en chat (épica
SCRUM-749, Migración ICG→AtlanticERP). Cabecera + líneas al hacer click en una fila de Historial ICG
(Cotizaciones/Pedidos/Albaranes/Facturas) y ficha al hacer click en una fila de Pagos ICG.
**Ambiente:** LOCAL (`http://localhost:8090`, nginx + build fresco de React) — mismo criterio que
el resto de Pre-QA del proyecto.

## Resultado: PASA, con 1 hallazgo real corregido en la misma sesión

### Hallazgo — CRÍTICO, corregido (no bloqueante al cierre)

**Todas las etiquetas de "Historial ICG" (título, tabs, columnas, "Sin historial") se rendeaban
como la clave cruda de i18n en vez del texto traducido — bug preexistente de SCRUM-762, no
introducido por este batch.**

- **Causa raíz:** el JSON de traducciones anida `icgHistoryModal` DENTRO de `clients`
  (`clients.icgHistoryModal.*`, ver `src/i18n/locales/es/ventasDiseno.json`), pero
  `SubClientIcgHistoryModal.tsx` llamaba a `t('ventasDiseno:icgHistoryModal....')` — sin el
  prefijo `clients.` — desde que se implementó SCRUM-762. i18next no encuentra la clave y devuelve
  el string literal pasado a `t()`.
- **Cómo se encontró:** un test de Playwright (`getByRole('button', { name: 'Pedidos' })`) falló
  por *strict mode violation* — dos botones "Pedidos" en pantalla, uno del Sidebar y otro del tab
  de Historial ICG mostrando literalmente `icgHistoryModal.entidad.pedidos`. Sin ese test real
  contra el navegador, el bug seguía invisible — los tests unitarios existentes mockean `t()` para
  devolver la clave tal cual, así que nunca lo hubieran detectado.
- **Impacto real:** afectaba TODO el modal de Historial ICG en producción desde que se implementó
  (dev/test/prod) — título, los 4 tabs, encabezados de columna, estado vacío. Nadie lo reportó
  porque el layout seguía siendo funcional (solo el texto era la clave cruda en vez del label).
- **Fix:** `sed` sobre los 31 call sites de `t()` en `SubClientIcgHistoryModal.tsx`, agregando el
  prefijo `clients.` faltante. Actualizados los 2 archivos de test que mockeaban `t()` devolviendo
  la clave literal (asserts sobre el string exacto).
- **Verificado en vivo:** re-build + re-corrida completa de este mismo spec — los 6 tests pasan con
  las etiquetas ya traducidas correctamente ("Pedidos", "Volver a la lista", etc., no las claves).

### Checklist adversarial cubierto (Playwright, `e2e/preqa-legacy-documento-ficha-20260903.spec.ts`)

| # | Caso | Resultado |
|---|---|---|
| 1 | Cotizaciones: cabecera completa (folio 4 segmentos, cliente resuelto por nombre — no el código crudo, total) + líneas con descuento, sin ningún control de edición | ✅ |
| 2 | Pedidos: cabecera muestra el albarán relacionado (`icg_seriealbaran-icg_numeroalbaran`) | ✅ |
| 3 | Albaranes: `facturado` boolean se muestra "Sí"/"No" (no `undefined`), factura relacionada visible | ✅ |
| 4 | Facturas: **nunca** renderiza una tabla de ítems — se ve la nota explicando que ICG no tiene tabla de líneas para este documento (distingue `items: null` de `items: []`) | ✅ |
| 5 | "Volver a la lista" regresa al tab activo sin volver a pedir el detalle; "Cerrar" cierra específicamente el modal de Historial ICG, no el ClientDetailModal de fondo (2 modales apilados) | ✅ |
| 6 | Pagos ICG: click en fila abre ficha con campos crudos + hipótesis en texto (nunca traducción definitiva), sin backend call adicional (usa la fila ya cargada), cierra correctamente | ✅ |

### Autorización — verificada por tests feature (backend), no repetida en Playwright

Ya cubierto por `SubClientHistoryControllerTest` (`test_show_nunca_expone_documento_de_otro_subcliente`,
`test_show_entidad_invalida_retorna_404`) — un `id` real de otro Subcliente, o una entidad como
`pagos` (que nunca tiene endpoint `show`), devuelve 404. No se repitió en Playwright porque ya es
determinístico a nivel HTTP, sin necesidad de UI para probarlo.

### Datos sembrados para esta corrida (vía tinker, no vía UI)

SubClient "PreQA Ficha Legacy Sub" con 1 Cliente ICG matcheado (`icg_codcliente=555001`), 1
Cotización + 1 línea, 1 Pedido + 1 línea (enlazado al Albarán), 1 Albarán + 1 línea (`facturado=true`,
enlazado a la Factura), 1 Factura sin líneas, 1 Pago (`icg_serie=PQ, icg_numero=9005`). Folios con
prefijo `PQ-` para no colisionar con datos reales de ICG ya migrados.

### Gate automatizado (previo a esta corrida)

- Backend: 2987 tests / 12219 assertions, PHPStan Level 8 limpio (full-project).
- Frontend: 1699 tests / 153 archivos, `tsc --noEmit` limpio.
- Ambos vueltos a correr en verde después del fix del hallazgo de arriba (22 tests scoped:
  `SubClientIcgHistoryModal.test.tsx`, `ClientDetailModal.test.tsx`, `LegacyPagosPage.test.tsx`).

### Visual Review

N/A — sin mockup adjunto (feature sin ticket Jira formal), mismo criterio que SCRUM-816/827.
