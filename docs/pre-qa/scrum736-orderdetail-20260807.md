# Pre-QA — SCRUM-736: Detalle de Orden de Compra vs. mockup aprobado

**Fecha:** 2026-08-07
**Commit revisado:** `95500cc` (`feat(compras): rework Purchase Order detail view to match approved mockup (SCRUM-736)`), branch `dev`, local, sin push
**Componente:** `atlanticerp-frontend/src/pages/compras/OrderDetailPage.tsx` + `PurchaseOrderPaymentsModal.tsx`
**Gates previos:** Senior Review 🟢 (`docs/reviews/scrum736-orderdetail-review-20260807.md`), Visual Reviewer 🟢, 0 CRÍTICOs (`docs/visual-review/scrum736-orderdetail-visual-review-20260807.md`)
**Entorno:** stack local (`localhost:5173` / `localhost:8090`), nunca dev/test.atlanticerp.ai
**Test permanente:** `atlanticerp-frontend/e2e/preqa-scrum736-orderdetail-20260807.spec.ts` (10 tests, 10/10 verde)

## Resultado: 🟢 PASADA LIMPIA — sin hallazgos bloqueantes. Listo para QA.

No repetí la comparación visual de los 7 elementos del mockup (ya la hizo Visual Reviewer con
checklist completo) — el foco fue el **comportamiento en runtime** contra los 7 criterios de
aceptación literales de Jira, en particular el criterio 6 ("campos de solo lectura y editables") y
los escenarios de ruptura del Paso 3 del protocolo (doble clic, recarga a mitad de flujo, rol sin
permiso, datos límite).

## Escenarios de ruptura intentados

| # | Escenario | Resultado |
|---|---|---|
| 1a | Orden en `en_transito_local`: cero `<input>/<select>/<textarea>` VISIBLES en resumen ni tabla de líneas | **PASA** — único input real en el DOM es el `<input type="file" class="hidden">` de "Subir confirmación del proveedor" (fuera de alcance de este ticket, sin cambios) |
| 1b | Orden `por_aprobar`: "Editar orden" aparece (aprobado por el mockup, `od-editar-wrap` en `mockup.html`: *"Solo se puede editar mientras la orden esté 'Por aprobar'"*) → editar → Cancelar vuelve a 0 inputs | **PASA** |
| 2a | Doble clic en "Avanzar a: Recibido" | **PASA** — 1 solo `PATCH /advance` real (contado por request interceptado), backend avanza exactamente 1 etapa (confirmado contra BD vía tinker) |
| 2b | Doble clic en "Ver Orden (PDF)" | **PASA** — 1 solo fetch de PDF, sin popup extra |
| 3 | Recargar con "Más acciones" abierto y "Incluir costo" desmarcado | **PASA** — remonta limpio, checkbox vuelve al default (`true`), sin mensaje de correo colgado de la sesión anterior |
| 4 | Modal de Pagos: "Registrar pago" con monto a medio llenar, cerrar con "X", reabrir | **PASA** — el modal es unmount real (`{showPaymentsModal && <Modal/>}`, no `display:none`), el form vuelve colapsado y vacío |
| 5 | Rol sin `compras.edit` (`lider_bodega`, vía puente `bodega.read` de `GET /orders/{id}`) | **PASA el criterio de seguridad real** (backend 403 en `update`/`liquidate`/`advance`) — **hallazgo MEDIO no bloqueante** de UI, ver abajo |
| 6 | Orden `directo`: sección "Liquidando con"/"Cambiar empresa" | **PASA** — ausente por completo, ni vacía ni oculta con CSS |
| 7 | Orden en estado final (`recibido`, sin `next_status`) | **PASA** — sin botón "Avanzar a", sin ningún resto de "último estado" |
| 8 | Línea con `catalog_product_id` NULL (producto de catálogo borrado tras haber sido pedido — escenario real, no sintético: `nullOnDelete()` documentado en la migración) | **PASA** — Ref. fábrica y Referencia pública ambas `—`, sin excepción de render, sin `undefined`/`null` crudo en el DOM |

## Hallazgos

**CRÍTICO — Ninguno.**

**MEDIO — no bloqueante para SCRUM-736 (pre-existente, fuera del diff de `95500cc`):**

1. **"Avanzar a", "Cambiar empresa" y "Editar orden" no están gateados por permiso en el
   frontend** — solo por `status`/`modalidad`, igual que antes de este ticket (a diferencia de
   "Aprobar orden", que sí tiene `usePermission('compras.approve')`, fix de S5/Senior Review
   sprint2). Confirmado en vivo con `lider_bodega` (ve el detalle vía el puente
   `permission:compras.read,bodega.read` de `GET /orders/{id}` — el mismo código que sirve el botón
   "Ver orden" del panel "Por recibir" de Bodega Home, SCRUM-371) sobre una orden con
   `next_status` y `modality=zona_libre`: ambos botones aparecen **habilitados**, pero un clic real
   dispara un 403 del backend (verificado con curl directo: `PUT /orders/{id}`,
   `PATCH .../liquidate`, `PATCH .../advance` → los 3 devuelven 403). Screenshot:
   `test-results/scrum736-10-readonly-ve-detalle.png`.
   - **Por qué no bloquea este ticket:** confirmado con `git show 95500cc` que la condición de
     render de estos 3 controles (`order.status === 'por_aprobar'`, `order.next_status !== null`,
     `order.modality === 'zona_libre'`) es idéntica antes y después del commit — SCRUM-736 solo
     cambió texto/posición, no la lógica de gating. El criterio 6 de Jira ("campos de solo lectura
     vs. editables") es sobre la TAXONOMÍA de campos, no sobre permisos por rol — eso lo cubre el
     Paso 3 del protocolo de Pre-QA como chequeo adversarial general, no como criterio del ticket.
   - **Backend seguro de todas formas:** las 3 mutaciones reales están gateadas con
     `permission:compras.edit` en `routes/compras.php` y devuelven 403 real — no hay riesgo de
     integridad de datos, solo UX (un botón que siempre va a fallar para este rol, mismo patrón ya
     corregido una vez para "Aprobar orden").
   - **Recomendación:** ticket de seguimiento para Frontend Dev — envolver "Avanzar a"/"Cambiar
     empresa"/"Editar orden" con `usePermission('compras.edit')`, mismo patrón que `canApprove`.

2. **`ProviderConfirmationCard` trata un 403 real de `GET /orders/{id}/documents` igual que "sin
   documentos subidos"** — con el mismo usuario `lider_bodega` (que tiene `bodega.read` pero no
   `compras.read` puro, y la ruta de documentos NO tiene el OR de `bodega.read`), la sección
   "Confirmación del proveedor" muestra *"Todavía no se subió la confirmación del proveedor"* +
   botón "Subir confirmación del proveedor" — indistinguible de una orden real sin documento.
   - **Por qué no bloquea:** Senior Review ya confirmó que este componente **no fue tocado** por
     `95500cc` ("Confirmación del proveedor: verificado sin cambios de código, ya cumplía el
     mockup") — viene de SCRUM-211/218, ticket distinto.
   - **Recomendación:** mismo ticket de seguimiento que el hallazgo 1, o uno propio si Luis prefiere
     separarlo — distinguir 403 de "lista vacía" en `ProviderConfirmationCard`.

## Lo que sí funciona (confirmado en vivo, no solo por lectura de código)

- Los 9 campos del resumen y la tabla de líneas son 100% de solo lectura en el estado por defecto,
  en dos estados de orden distintos (`en_transito_local` y `por_aprobar`) — el mockup aprueba
  explícitamente la excepción de "Editar orden" solo mientras `por_aprobar`, y Cancelar revierte
  limpio sin dejar ningún control editable.
- Protección real contra doble clic/envío duplicado tanto en "Avanzar a" (1 PATCH, 1 etapa) como en
  "Ver Orden (PDF)" (1 fetch) — el `disabled={disabled || loading}` de `Button.tsx` alcanza incluso
  con dos clics disparados en el mismo tick de Playwright.
- Estado de UI no persistente entre sesiones de un mismo modal/menú (Pagos, Más acciones) — ambos
  se remontan limpios, ninguno arrastra datos de un intento anterior sin guardar.
- Ausencia correcta y total de "Liquidando con"/"Cambiar empresa" en órdenes `directo` (no solo
  vacía — el bloque entero no se renderiza).
- Ausencia correcta de "Avanzar a" y de cualquier resto del mensaje viejo ("último estado") en una
  orden ya `recibido`.
- Degradación correcta de una línea con `catalog_product_id` NULL (producto de catálogo eliminado
  después de haber sido pedido) — no rompe la tabla, muestra `—` donde corresponde.
- Confirmado con el mockup real (`mockup.html`, adjunto de Jira, `od-editar-wrap`) que "Editar
  orden" con la leyenda *"Solo se puede editar mientras la orden esté 'Por aprobar'"* es
  comportamiento APROBADO por diseño, no un hallazgo — se verificó antes de escribir el checklist
  para no reportar como bug algo que el propio mockup define.

## Nota metodológica — Escenario 5 (rol sin permiso)

El candidato original para "rol de solo lectura" (`asistente_administrativa`, Nivel 1) resultó
tener **cero** acceso al módulo Compras en su JWT (`modules.compras.view: false`) — no llega ni a
cargar la pantalla, así que no sirve para probar "¿el botón se esconde o el backend responde 403?".
Investigado en vivo con una query directa a `security_level_module_permissions`/
`role_module_visibility`: hoy en el sistema **ningún rol tiene Compras en modo view-only** — los
únicos 2 roles con `compras.view=true` (`lider_compras`, `management`) tienen `can_edit=true` en
todos los security levels que los usan. El candidato real de solo-lectura es `lider_bodega`, que ve
el detalle por el puente `bodega.read` de la ruta `GET /orders/{id}` (no por `compras.view`) — ver
comentario en `routes/compras.php` línea ~55. Se documenta este desvío del roster original porque
cambia lo que se puede afirmar: no existe hoy un "Compras view-only" genérico para probar.

## Fixture

Sembrado por `tinker` (`docker exec infra-laravel-1 php artisan tinker`, mismo patrón que
`preqa-scrum216-217-timeline-race-recheck-20260806.spec.ts`) dentro de `test.beforeAll()` del spec
— nunca IDs hardcodeados, capturados del stdout (`FIXTURE_JSON:`). 6 órdenes (`A`/`B`/`C`/`E`/`F`/`G`),
2 proveedores (local + internacional), 2 productos de catálogo (uno de ellos borrado a propósito
para el Escenario 8), 1 agencia de liquidación, 1 pago parcial. Todo borrado en `test.afterAll()` —
verificado con conteos en 0 tras la corrida (`purchase_orders`/`providers`/`catalog_products` con
prefijo `PreQA736`/`PREQA736` → 0 filas).

## Siguiente paso

Transiciono SCRUM-736 a `QA` en Jira. Los 2 hallazgos MEDIO quedan documentados acá y en el
comentario de Jira para que Luis/PM decidan si abren un ticket de seguimiento (no bloquean este
ticket — pre-existentes, fuera del diff revisado por Senior Review y Visual Reviewer).
