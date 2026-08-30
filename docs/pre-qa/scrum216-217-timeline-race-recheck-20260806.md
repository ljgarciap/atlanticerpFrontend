# Pre-QA — SCRUM-216 (REQ-153) + SCRUM-217 (REQ-154), timeline de Logística (2026-08-06)

**Alcance:** gate de comportamiento en runtime, después de que Senior Review (self) y Visual
Reviewer ya dieron pasada limpia sobre fidelidad visual/funcional contra el mockup
(`docs/visual-review/scrum216-217-timeline-recheck-20260805.md`). Esta pasada rompe la feature por
los costados que un chequeo visual no cubre: condiciones de carrera, inmutabilidad a nivel de API
(no solo de UI), reintentos, datos pre-migración, recarga a mitad de flujo, gate de permiso por API
directa, y sincronización cross-page.

**Commits revisados:** backend `28461c8` (estado inicial), frontend `51e505b`, ambos en
`origin/dev` al momento de arrancar. Confirmado que el stack local (`docker compose`) corría
exactamente `28461c8` en el contenedor `laravel` y que el bundle servido por `nginx`
(`index-CTX_stTA.js`) contenía `ShipmentTimeline` antes de tomar cualquier resultado como válido.

**Método:** `curl` directo contra la API (incluyendo llamadas verdaderamente concurrentes con `&`+
`wait` de shell, no simuladas) para los escenarios de ruptura de bajo nivel, y Playwright CLI
(nunca Claude in Chrome, desinstalada) para los escenarios de UI — timeline con datos viejos,
recarga, doble clic, gate de rol, sincronización cross-page.

---

## CRÍTICO — encontrado y corregido en esta sesión

### Condición de carrera real en `advance()` — reproducida con curl concurrente, no hipotética

**Escenario probado:** 5 llamadas `PATCH /api/compras/orders/{id}/advance` disparadas en paralelo
de verdad (`curl ... & curl ... & ... ; wait`) contra la MISMA orden, en su penúltima etapa
(`en_transito_local`, con 1 línea de ingreso "Por ingresar" de 10 unidades pendiente de confirmar).

**Resultado ANTES del fix:**
- 4 de las 5 llamadas devolvían `200` con `status=recibido` (solo 1 debería haber podido avanzar
  la orden — las otras 4 deberían haber visto `next_status === null` y recibido `422`).
- `catalog_products.stock_quantity` terminó en **40** en vez de **10** — la línea de ingreso
  pendiente se confirmó 4 veces.
- 4 movimientos de Kardex "Entrada" idénticos (`Orden #241 recibida`, 10 unidades c/u) para un solo
  ingreso físico.

**Causa raíz:** `PurchaseOrderController::advance()` leía `$order->nextStatus()` y hacía el
`update()` SIN transacción ni lock — 3-4 de las 5 llamadas leían el mismo `status` "antes" antes de
que cualquiera escribiera el `status` "después". `GoodsReceiptConfirmationService::
confirmPendingForOrder()` agravaba el problema: su SELECT de líneas `whereNull('confirmed_at')`
corría FUERA de cualquier lock, así que las 4 llamadas veían la misma línea como "todavía
pendiente" y la confirmaban cada una.

**Fix aplicado (commit backend `0fdec68`, pusheado a `dev`):**
- `advance()` ahora envuelve el chequeo de estado + `update()` en `DB::transaction()` con
  `PurchaseOrder::lockForUpdate()->find($id)` — mismo patrón exacto ya usado en
  `AdjustmentRequestController::approve()/reject()` y `ComprasZonaLibreRequestController::approve()`
  para esta misma clase de bug (documentado en el propio código de ese controller).
- `GoodsReceiptConfirmationService::confirmPendingForOrder()` ahora hace su SELECT con
  `lockForUpdate()` DENTRO de su propia transacción, por defensa en profundidad si el método se
  reusa desde otro lado en el futuro.

**Resultado DESPUÉS del fix (mismo repro, 5 llamadas concurrentes):**
- Exactamente 1 de 5 devuelve `200`; las otras 4 devuelven `422` limpio
  (`"Esta orden no tiene un siguiente estado disponible."`) — nunca `500`, nunca un avance
  fantasma.
- `stock_quantity` termina en exactamente **10**.
- 1 solo movimiento de Kardex.

**Cobertura de regresión agregada:**
- Backend: `test_confirmar_pendientes_dos_veces_no_duplica_stock`
  (`tests/Feature/Compras/PurchaseOrderLifecycleTest.php`) — cubre el ángulo determinístico (una
  carrera real de Postgres no es reproducible dentro de un test PHPUnit síncrono de un solo
  proceso). Suite completa verde tras el fix: **1595/1595 backend**, PHPStan Level 8 limpio.
- E2E: `atlanticerp-frontend/e2e/preqa-scrum216-217-timeline-race-recheck-20260806.spec.ts` (nuevo,
  permanente) — doble clic real a nivel de UI sobre el botón de avance, confirmado contra el
  backend que la orden avanzó UNA sola etapa.

---

## Checklist completo — qué se intentó romper

| # | Escenario | Método | Resultado |
|---|---|---|---|
| 1 | Doble clic rápido en "Completar etapa actual" (UI) | Playwright, 2 clics disparados en el mismo `Promise.all` | El botón se deshabilita (`loading`) tras el primer clic — la orden avanza UNA sola etapa (`en_transito` → `en_aduana`, confirmado contra backend), no 2. Test permanente agregado. |
| 1b | 2 llamadas API directas a `advance()` en la misma orden (sin UI) | curl secuencial inmediato | 1ª avanza, 2ª avanza a la SIGUIENTE etapa real (no hay bug — son 2 acciones legítimas distintas, no una carrera) |
| 1c | 5 llamadas API **verdaderamente concurrentes** a `advance()` | curl en paralelo (`&`+`wait`) | **CRÍTICO real, encontrado y corregido** — ver arriba |
| 2 | RN4 — `PATCH .../shipping-info` con `actual_arrival_date` manipulado, sobre una orden ya `recibido` | curl directo con `actual_arrival_date: "2020-01-01"` | `200 OK`, pero el valor real en BD no cambia (sigue siendo la fecha real de cuando se recibió) — el endpoint ya no acepta ese campo en absoluto (`updateShippingInfo()` solo valida `container_number`/`carrier`), lo ignora en silencio en vez de fallar. Confirmado a nivel de dato persistido, no solo "la UI no lo muestra". |
| 3 | Reintento de `advance()` sobre una orden ya en `recibido` | curl directo | `422` limpio (`"Esta orden no tiene un siguiente estado disponible."`), nunca `500` ni avance fantasma |
| 4 | Orden vieja sembrada antes de la migración (`ordenado_at`/etc. NULL, `status` ya avanzado a `en_aduana`) | Playwright contra un fixture creado directo por `update()`, saltando `advance()` | El timeline no rompe: pasos ya alcanzados (`ordenado`, `en_transito`) se pintan `data-state="done"` pero muestran `—` en vez de una fecha inventada. Test permanente agregado. |
| 5 | Recargar la página a mitad del timeline | Playwright: `page.reload()` con una orden en la penúltima etapa | El botón sigue reflejando la etapa correcta (`Completar etapa actual → Recibido`) y el timeline sigue marcando el paso actual como `current` tras el reload — no se pierde estado. Test permanente agregado. |
| 6 | Rol sin `compras.edit` intenta el POST de avance directo por API | curl con JWT real de `neil.quiel@illuminations.com.pa` (`vendedor_disenador`, 0 permisos `compras.*` en el token) | `403` real (`"No tienes permiso para realizar esta acción."`) tanto en `/advance` como en `/shipping-info` — bloqueo real de middleware, no solo el botón oculto. También confirmado a nivel de DOM cuando el rol logra llegar a la pantalla: timeline visible, botón ausente (conteo 0). |
| 7 | Proveedor local — backend nunca deja `en_transito_at`/`en_aduana_at` poblados | curl: `advance()` sobre una orden de proveedor `local` en `ordenado` | Salta directo a `en_transito_local` (`next_status: recibido`), con `en_transito_at`/`en_aduana_at` en `null` — la secuencia (`PurchaseOrder::statusSequence()`) es la única fuente de verdad de a qué etapa se puede avanzar, no hay forma de que el frontend la fuerce fuera de orden. |
| 8 | Cross-screen sync (Logística → Ver Órdenes, sin recargar) | Playwright: avanzar en Logística, abrir Ver Órdenes en una pestaña nueva del mismo contexto sin recargar Logística | La fila de la orden en Ver Órdenes ya muestra "Recibido" — mecanismo de invalidación de query compartida (`['compras/orders']`) sigue funcionando con el timeline nuevo agregado. |
| 9 | Timeline de 3 pasos para proveedor local | Playwright | Exactamente 3 pasos (`ordenado`→`en_transito_local`→`recibido`), primer paso rotulado "Ordenado" (no "Salió de origen") |
| 9b | Auto-fill de "Llegada real" + botón desaparece del DOM al llegar a Recibido | Playwright: click real sobre una orden en su penúltima etapa | Tras el click, "Llegada real" pasa de "Pendiente" a la fecha real de HOY sin intervención manual; el botón de avance tiene conteo 0 en el DOM (no `disabled`) |

**Nota de alcance heredada (no de este batch):** RN7 (visibilidad del timeline para roles fuera de
Compras/Gerencia que SÍ tengan acceso al módulo) sigue sin un usuario real en el roster que lo
ejercite de forma natural — bandera ya señalada por Visual Reviewer en la auditoría del 08-05, no
bloqueante para este batch (REQ-153 original ya limitaba el acceso a "Compras y Gerencia").

## Lo que sí funciona (síntesis, sin duplicar el detalle ya confirmado por Visual Reviewer)

- Timeline de 5/3 pasos, estados done/current/pending, fechas reales por paso — confirmado en vivo.
- RN3/RN4 de "Llegada real" (solo lectura, auto-fill al llegar a Recibido, inmutable incluso vía
  API directa) — confirmado a nivel de dato persistido.
- RN6 (no se puede reabrir un envío ya Recibido) — `422` real, sin excepción.
- RN7 (gate de permiso sobre el botón) — `403` real por API, no solo UI.
- Secuencia local vs. internacional — el backend es la única barrera real, confirmado sin atajos.
- Sincronización cross-page — sigue funcionando con el timeline nuevo.
- Render defensivo contra datos pre-migración — no rompe, no inventa fechas.

## CRÍTICO

Uno — encontrado y corregido en esta misma sesión (condición de carrera en `advance()`, ver
arriba). Checklist completo vuelto a correr tras el fix: pasada limpia.

## Veredicto

**SCRUM-216 y SCRUM-217: pasada limpia tras 1 vuelta de corrección.** Loop cerrado (hallazgo →
fix → checklist completo re-corrido → limpio) en la misma sesión, según el protocolo. Ambos
tickets pasan a `QA`.
