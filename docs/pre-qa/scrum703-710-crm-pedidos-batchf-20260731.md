# Pre-QA — Batch F, Epic CRM (SCRUM-703→710, REQ-623→630) "Pedidos"

3 corridas, loop cerrado. Conclusión final: **listo para QA**.

## Corrida 1

- 🔴 CRÍTICO — `OrdersService::resolveInvoicedCosts()` atribuía el costo facturado de una
  `PurchaseOrderReceiptLine` compartida a DOS Pedidos distintos cuando una misma orden de compra
  repartía el mismo `catalog_product_id` entre 2+ `sales_project_id` (ej. 5 unidades para el
  Pedido A, 3 para el Pedido B, en la misma PO). Generaba "Margen bajó" falso en ambos. RN6 de
  REQ-630 ("1 factura por producto por Pedido") no cubre este caso — un producto repartido entre
  pedidos distintos en la misma orden de compra.
  **Fix:** si el par (purchase_order_id, catalog_product_id) tiene líneas de más de un
  `sales_project_id` — considerando TODAS las líneas de esa PO, no solo las visibles para el
  usuario actual —, no se resuelve costo para ninguno de los dos: quedan "Pendiente de compra" en
  vez de arriesgar un número financiero incorrecto. La atribución real (prorrateo o vínculo
  explícito por unidad) requiere una decisión de diseño/negocio, pendiente de escalar a
  Analista/Arquitecto si se necesita en el futuro.
- 🟡 MEDIO — "qué recepción confirmada gana" cuando hay más de una `PurchaseOrderReceiptLine`
  confirmada para el mismo producto no tenía `ORDER BY` explícito, dependía del orden físico de
  fila de Postgres (no garantizado). **Fix:** resolución explícita por `confirmed_at` más antiguo.

Ambos con test de regresión en `OrdersControllerTest.php`.

## Corrida 2

Confirmó los 2 hallazgos de la corrida 1 cerrados con datos reales (tinker + curl). Al correr el
checklist COMPLETO (no solo los 2 puntos corregidos) encontró un hallazgo nuevo:

- 🔴 CRÍTICO — REQ-629 RN4 dice que Pedidos no tiene selector Mías/Equipo (el frontend nunca manda
  `scope`). `OrdersService::list()` defaulteaba a `'own'` cuando el filtro no venía — como nadie
  manda `'team'` explícito, Líder/Gerencia/Mark quedaban viendo solo sus propios pedidos en la app
  real, nunca el equipo completo. Confirmado en vivo con Playwright logueado como
  `management@illuminations.test` contra `localhost:5173`, sin query params.
  **Fix:** el default pasó de `'own'` a `'team'` — sin selector en el frontend, pedir siempre
  `'team'` es correcto porque `buildOrders()` ya baja a `'own'` internamente para quien no tenga
  `canViewTeamV2('ventas_diseno')` (esa lógica no se tocó, ya estaba bien).

Test de regresión agregado: `test_gerencia_ve_todo_el_equipo_sin_mandar_scope_explicito_como_hace_el_frontend_real`
— el test anterior (`test_gerencia_ve_los_pedidos_de_todo_el_equipo`) pasaba `?scope=team` a mano y
por eso no detectó el bug; el nuevo replica el request real del frontend.

## Corrida 3 — final

Confirmó los 3 hallazgos anteriores (2 de la corrida 1 + 1 de la corrida 2) cerrados con datos
sembrados en fresco. Re-corrió el checklist completo (REQ-623 RN1, REQ-624, REQ-625, REQ-626,
REQ-627, REQ-628, REQ-629 RN1/RN3) con verificación real (curl/tinker/Playwright) en cada punto.
**Sin hallazgos nuevos.**

Nota: la corrida 3 generó un spec Playwright pensado para promoverse a `e2e/` permanente
(`preqa-batchf-scrum703-710-corrida3-20260731.spec.ts`), pero dependía de datos sembrados a mano
por tinker que ya se habían limpiado al terminar la corrida — no hay fixture durable de "pedido
aprobado" en los seeders demo locales, y no hay precedente en este repo de specs que siembren su
propia data vía shell dentro del test. Como quedó, el spec fallaría en cualquier corrida futura —
no cumple la barra de "test permanente reproducible" (a diferencia de los specs promovidos contra
`dev.atlanticerp.ai` con cuentas/datos reales durables, ver `preqa-scrum684-689-dashboard-crm-batchc.spec.ts`
como referencia del patrón correcto). Se eliminó en vez de dejarlo commiteado roto. La cobertura
que hubiera dado ese spec (scope de Gerencia sin `?scope=team`, modal de detalle con fila TOTAL y
alertas rojo/verde) ya está cubierta por `OrdersControllerTest.php` (backend, HTTP real) y
`PedidoDetailModal.test.tsx` (frontend, componente).

## Mecánico (estado final)

- `infra/test.sh --filter=OrdersControllerTest`: 20/20 (84 assertions)
- `infra/test.sh --filter=VentasDiseno` (suite completa del módulo): 338/338 (1289 assertions)
- PHPStan Level 8: sin errores en todo el proyecto
- Vitest frontend: 765/765 (incluye 12 tests de `PedidosPage.test.tsx` + 6 de `PedidoDetailModal.test.tsx`)
- `npx tsc --noEmit` y `npm run build`: limpios
