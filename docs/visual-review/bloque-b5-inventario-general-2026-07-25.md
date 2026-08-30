# Visual Review — Bloque B5 "Inventario general / Conteos generales" (SCRUM-460→466)

**Fecha:** 2026-07-25 (sesión retomada tras corte a medio camino — el fix ya estaba escrito sin
commitear, esta corrida lo valida y lo cierra)
**Reviewer:** Visual Reviewer (sesión retomada)
**Mockup de referencia:** REQ-390→396 (Bodega — Inventario general)
**Entorno:** local, Docker Compose (`infra-nginx-1`), frontend build estático servido en
`http://localhost:8090`.
**Herramienta:** Playwright CLI (`npx playwright test`, config y specs temporales dentro de
`atlanticerp-frontend/` — `playwright.tmp.config.ts` + `e2e-tmp/b5-inventario-general.spec.ts` +
`e2e-tmp/b5-inventario-general-mark.spec.ts` —, borrados al cierre de la revisión, nunca
commiteados).
**Fix verificado (commiteado en esta sesión, ver commits abajo):**
- Backend `GeneralCountController::store()` — `cantidad_sistema` ahora se popula con el snapshot
  de `ProductWarehouseStock` al crear las líneas (antes quedaba `NULL` hasta "Evaluar"), para que
  la columna "Cantidad en sistema" del mockup se vea poblada desde la primera carga de la tabla,
  no recién tras el primer click en Evaluar. `evaluate()` sigue re-tomando el snapshot FRESCO en
  el momento de evaluar, sin cambios.
- Frontend — rename `pendiente` → `pendiente_evaluacion` en `types/bodega.ts`,
  `BodegaInventarioGeneralPage.tsx` (badge + test) y ambos i18n (`en`/`es`), para alinear con el
  enum real del backend (`GeneralCountRequest::ESTADO_PENDIENTE_EVALUACION`) — el frontend tenía un
  valor obsoleto de una iteración anterior del contrato.
**Usuarios de prueba:** `almacen@illuminations.com.pa` (Esteban Cardenas, rol con `bodega.write`) y
`mbekhar@illuminations.com.pa` (Mark Bekhar, único con `bodega.approve` en este entorno).
**Datos de prueba:** productos `VR-B5-TEST-001` (sin cruce, stock 10 en Bodega Central id 6) y
`VR-B5-TEST-002` (con cruce, stock 20 en Bodega Central), + `AdjustmentRequestLine` pendiente sobre
el segundo (creada con fecha 2026-06-26 para probar RN1 REQ-391) — sembrados a mano vía tinker.
**Todo el dato de prueba fue limpiado al cierre** (productos, stock, general counts, adjustment
request/line — ver limpieza al final de este documento).

---

## Resultado general

**PASADA LIMPIA — puede avanzar a Pre-QA.** 5 escenarios de Playwright cubriendo el flujo completo
(Iniciar conteo → aviso de cruce → evaluar/editar/reenviar → enviar con confirmación de cruce →
bandeja con chips → gate de permisos → rechazo con validación de motivo → aprobación → aplicar
ajuste idempotente), todos en verde tras el fix. Un locator del harness temporal (no del código de
producción) estaba mal armado y se corrigió en el propio spec descartable — ver nota en sección 3.

---

## 1. Fix específico — "Cantidad en sistema" visible al cargar (REQ-390)

- Encabezados de tabla al cargar: `["ref. pública", "descripción", "cantidad en sistema",
  "cantidad contada"]` presentes, **"diferencia" ausente** hasta evaluar — confirmado leyendo el
  DOM real.
- Fila de cada producto sembrado muestra la cantidad en sistema correcta desde la primera carga
  (10 y 20 respectivamente), sin necesidad de tocar "Evaluar" primero.
- Tras evaluar, la columna "Diferencia" aparece con el valor correcto (-2 / +2 sobre los valores de
  prueba); editar cualquier cantidad tras evaluar vuelve a ocultarla (RN2 REQ-392) hasta
  reevaluar — sin regresión.

## 2. Aviso de cruce con solicitud cíclica pendiente (REQ-391)

- Solo el producto con `AdjustmentRequestLine` pendiente muestra el aviso "Ya tiene una solicitud
  cíclica pendiente" + la fecha de esa solicitud (2026-06-26) — el producto sin cruce no lo
  muestra.
- Enviar con cruce pendiente abre un modal propio ("Solicitudes cíclicas pendientes", nunca
  `confirm()` nativo — confirmado con listener de `dialog` que nunca se disparó) listando
  únicamente el/los productos con cruce; cancelar no envía nada y conserva el panel.
- Confirmar el envío consume el cruce: `AdjustmentRequestLine` pendiente se elimina (RN de
  REQ-394) y, al armar un segundo conteo sobre la misma bodega, el aviso ya no aparece para ese
  producto — confirmado en vivo.

## 3. Ciclo de Mark — rechazar / aprobar / aplicar (SCRUM-465/466)

- Rechazar sin motivo bloquea con el mensaje de validación; con motivo, pasa a "Rechazada" y
  desaparece de "Pendientes"; "Ver motivo" (tooltip vía `title`, no `alert()`) muestra el motivo
  real.
- Aprobar mueve el conteo a "Aprobadas"; "Realizar ajuste" (permiso `bodega.write`, no
  `bodega.approve`) aplica el ajuste, responde 200, deshabilita el botón y muestra "Ajuste
  aplicado"; reintentar tras reload sigue idempotente (backend no vuelve a aplicar).
- Gate de permisos: `almacen` (sin `bodega.approve`) intenta aprobar y el backend responde 403 —
  confirmado leyendo la respuesta real, no solo el estado de la UI.
- Sin emoji en ninguna fila de la bandeja (regla SCRUM-56) — confirmado con regex Unicode sobre el
  texto completo de la fila, incluyendo el candado de "Rechazar"/"Aprobar" (SVG, no 🔒 literal).

**Nota sobre el harness (no es un hallazgo de producto):** el primer intento de correr
`b5-inventario-general-mark.spec.ts` colgó en el click del botón "Rechazar" del modal. Causa: el
spec localizaba el modal con `page.locator('div', {hasText: 'Rechazar conteo general'}).last()`,
que resuelve al `<div>` del encabezado (contiene el `<h2>` del título) en vez de al contenedor
completo — el botón de envío real vive en un `<div>` hermano (footer), no dentro del header. El
snapshot de Playwright confirmó que la app SÍ renderiza el modal correctamente (título, textarea,
botones Cancelar/Rechazar todos presentes y funcionales); se corrigió el locator del spec temporal
(`div.fixed.inset-0`, el overlay que sí envuelve todo) y la corrida completa pasó limpia.

---

## Limpieza de datos de prueba

Verificado tras la limpieza: `CatalogProduct::where('reference', 'like', 'VR-B5-TEST%')->count()`,
`ProductWarehouseStock` asociado, `GeneralCountRequest`/`GeneralCountRequestLine` y
`AdjustmentRequest`/`AdjustmentRequestLine` creados en esta sesión — todos en 0.

---

## Veredicto

**Pasada limpia — avanza a Pre-QA.** El fix de "cantidad en sistema" (REQ-390) y el rename de
estado (`pendiente_evaluacion`) quedaron verificados end-to-end en las dos capas (backend +
frontend), sin regresiones sobre el resto del flujo de Bloque B5 ya construido en la sesión
anterior. No hay hallazgos nuevos que reportar.
