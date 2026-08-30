# Visual Review — Bloque B4 "Reubicación entre bodegas" (SCRUM-454/457/458/459)

**Fecha:** 2026-07-24 (RE-CORRIDA completa tras fix del hallazgo CRÍTICO de la corrida anterior)
**Reviewer:** Visual Reviewer (subagente)
**Mockup de referencia:** `3F__Bodega_Bodegas.html` (REQ-381→389; alcance de esta revisión limitado a lo
que agregó Bloque B4: chip "Espacio libre" con datos reales, botón/modal "Reubicar", modal
"Solicitudes de reubicación", + utilidad extra "Administrar ubicaciones")
**Entorno:** local, Docker Compose (`infra-nginx-1`), frontend build estático servido en
`http://localhost:8090` (puerto 80 del host ocupado por otro proyecto en la misma máquina).
**Herramienta:** Playwright CLI (`npx playwright test`, config y specs temporales dentro de
`atlanticerp-frontend/` — `playwright.tmp.config.ts` + `e2e-tmp/b4-rerun.spec.ts` —, borrados al cierre
de la revisión, nunca commiteados).
**Fix verificado (commits ya en `origin/dev`):**
- Frontend `26f6049` — `BodegasPage.tsx`: la columna Acción de la tabla de productos ahora
  condiciona a `data.warehouse.modo_detalle === 'pendiente'`, mostrando `viewDetail` ("Ver
  detalle", deshabilitado) en vez de `relocate` ("Reubicar").
- Backend `29c03a2` — `RelocationRequestController::store()`: rechaza con 422
  (`No se puede reubicar producto desde una bodega sin ubicación física confirmada.`) si
  `origin_warehouse_id` corresponde a una bodega `modo_detalle === 'pendiente'`, cerrando el bypass
  de llamar el endpoint directo sin pasar por la UI.
- Frontend build (`npm run build`) confirmado más nuevo que el fix fuente y servido por nginx —
  verificado con `grep -o "Ver detalle" dist/assets/index-*.js`.
**Usuarios de prueba:** `almacen@atlantic.com.pa` (Esteban Cardenas, `lider_bodega`) y
`mbekhar@atlantic.com.pa` (Mark Bekhar, único con `bodega.approve` en este entorno) —
password = mismo email en ambos casos, confirmado con `Hash::check()` contra `password_hash` antes
de arrancar.
**Datos de prueba:** producto `VR-B4-TEST-001` (id 344) + 2 `WarehouseLocation` en Bodega Central
(`A1-B4TEST` ocupada, `A2-B4TEST-LIBRE` libre) + `ProductWarehouseStock` en Bodega Central (20u) y
Bodega Zona Libre (15u), sembrados a mano vía tinker (mismo patrón que la corrida anterior — este
entorno no trae stock/ubicaciones reales todavía). **Todo el dato de prueba fue limpiado al cierre**
(producto, movimientos de Kardex, solicitudes de reubicación, ubicaciones — verificado con
`RelocationRequest::count()`, `WarehouseLocation::count()` y `CatalogProduct::where('reference',
'VR-B4-TEST-001')->exists()` devolviendo 0/0/NO tras la limpieza).

---

## Resultado general

**PASADA LIMPIA — puede avanzar a Pre-QA.** Se re-corrió el checklist COMPLETO de Bloque B4 (no
solo el punto que había fallado), incluyendo el fix específico, el caso feliz de regresión, y el
resto de la funcionalidad ya validada la vez anterior. 7 escenarios de Playwright, todos en verde,
más verificación directa de base de datos para el efecto de aprobar (Kardex + stock) y de `curl`
para el rechazo server-side del endpoint. Ningún hallazgo nuevo, ninguna regresión.

---

## 1. Fix específico — botón "Reubicar" vs "Ver detalle" en modo `pendiente`

**Frontend (Playwright, `almacen@atlantic.com.pa`):**
- Bodega Zona Libre (`modo_detalle = pendiente`), fila del producto de prueba: columna Acción
  muestra **"Ver detalle"**, botón con atributo `disabled` confirmado (`toBeDisabled()`), y
  **"Reubicar" tiene 0 coincidencias** en esa fila (`toHaveCount(0)`) — confirmado leyendo el DOM
  real, no un screenshot.

**Backend (`curl` directo a `POST /api/bodega/relocations`, bypaseando la UI):**
- `origin_warehouse_id=7` (Bodega Zona Libre, pendiente) → **HTTP 422**,
  `{"message":"No se puede reubicar producto desde una bodega sin ubicación física confirmada."}`
- `origin_warehouse_id=6` (Bodega Central, ubicacion_exacta) → **HTTP 201** (creó la solicitud
  normalmente) — confirma que el guardia es específico de `modo_detalle`, no bloquea el resto.

Ambas capas (frontend oculta, backend rechaza) confirmadas funcionando — el hallazgo CRÍTICO de la
corrida anterior está resuelto en su totalidad, sin necesidad de rodeo vía llamada directa al API.

---

## 2. Regresión — caso feliz de "Reubicar" en bodegas no-pendiente

Verificado en vivo (Playwright) sobre Bodega Central (`modo_detalle = ubicacion_exacta`):
- Botón "Reubicar" visible y habilitado en la fila del producto de prueba.
- Modal abre correctamente: producto fijo/solo lectura (referencia + descripción), bodega origen
  de solo lectura ("Bodega Central"), selector de destino que **excluye correctamente** la bodega
  actual (`Bodega Central` no aparece entre las `<option>` del select).
- Validación cliente: enviar vacío dispara el mensaje de cantidad inválida y no llama al backend.
- Envío completo (cantidad 3, destino Bodega Zona Libre, motivo) crea la solicitud y el modal se
  cierra automáticamente (`onSuccess: onClose`) — sin errores de consola.

El fix del punto 1 (condicional agregado al botón/columna) **no rompió el camino feliz** en
ninguna otra bodega — confirmado no solo por lectura de código sino por el flujo real ejecutado.

---

## 3. Chip "Espacio libre" (REQ-384)

- Cabeceras de tabla al activar el chip: exactamente `["Ubicación", "Estado"]` (2 columnas).
- Con una ubicación ocupada (`A1-B4TEST`, stock 20) y una libre (`A2-B4TEST-LIBRE`) sembradas: la
  tabla muestra únicamente la libre — confirmado que la ocupada tiene 0 coincidencias en `<tbody>`.
- Exclusivo con "Todos": volver a "Todos" restaura la tabla completa de 14 columnas.

Sin regresión respecto a la corrida anterior.

---

## 4. Bandeja "Solicitudes de reubicación" (REQ-389)

- Los 4 chips (`Todas`/`Pendientes`/`Aprobadas`/`Rechazadas`) presentes y visibles.
- **Reset a "Todas" al reabrir confirmado de nuevo:** se cambió el filtro a "Pendientes", se cerró
  el modal (click en el botón X sibling del `<h2>`, localizado sin depender de un `aria-label`
  inexistente), se reabrió, y se verificó por clase CSS real (`bg-primary`, la clase que aplica
  `Button` cuando `active=true`) que "Todas" volvió a estar activo y "Pendientes" no — más robusto
  que la verificación visual de la corrida anterior.

---

## 5. Ciclo completo Aprobar / Rechazar (Mark, único con `bodega.approve`)

**5a — Rechazar (solicitud cantidad=3, creada en el paso 2):**
- Enviar sin motivo bloquea con el mensaje "Escribe un motivo para rechazar la solicitud." — RN1
  de REQ-389 confirmada de nuevo.
- Con motivo, pasa a "Rechazada": desaparece de "Pendientes", aparece en "Rechazadas" con acción
  "Ver motivo" y sin botones Aprobar/Rechazar.
- Verificado en base de datos: `RelocationRequest#11` quedó con
  `estado=rechazada`, `motivo_rechazo="Rechazado en re-corrida de Visual Review B4"`.

**5b — Aprobar (solicitud cantidad=5, creada vía `curl` directo en el paso 1):**
- Desaparece de "Pendientes", aparece en "Aprobadas".
- **Verificado contra la base de datos** (no solo la UI): generó los 2 movimientos de Kardex
  esperados —
  ```
  warehouse_id=6 (Central)     tipo=Reubicación  cantidad=-5
  warehouse_id=7 (Zona Libre)  tipo=Reubicación  cantidad=+5
  ```
  ambos con `referencia_entidad_tipo=REUBICACION`, `referencia_entidad_id=10` (la misma
  solicitud) — y `ProductWarehouseStock` quedó correctamente actualizado en ambas bodegas:
  Central 20→15, Zona Libre 15→20 (exactamente los ±5 esperados).

Sin regresión respecto al ciclo aprobar/rechazar validado la vez anterior.

---

## 6. "Administrar ubicaciones"

- Visible en Bodega Central (`ubicacion_exacta`).
- **0 coincidencias** del botón en Bodega Zona Libre (`pendiente`) — gate confirmado también desde
  el ángulo negativo (la corrida anterior solo había confirmado el positivo).

No se repitió la prueba de agregar/desactivar ubicación en esta re-corrida (ya cubierta la vez
anterior y sin relación con el área que cambió el fix); el gate de visibilidad —que sí comparte
código de bodega con el fix— se re-confirmó explícitamente en ambos sentidos.

---

## Observaciones no bloqueantes (heredadas, sin cambios — documentadas por transparencia, no de Bloque B4)

Estas ya se habían anotado en la corrida anterior y siguen sin ser hallazgos de este bloque:
1. Fallo silencioso en Aprobar/Rechazar sin `bodega.approve` (403 sin feedback visual) — deuda
   heredada de `SolicitudAjustePage.tsx`, mismo patrón que el ADR de este bloque pidió replicar.
2. `GET /api/ventas-diseno/catalog-product-families` devuelve 403 para `lider_bodega` — parte de
   REQ-381→386, ya en producción, no de este batch.
3. Tabla de la bandeja de Solicitudes se corta horizontalmente en 1280px — cosmético, tiene
   `overflow-x-auto`, el click funciona igual.

Ninguna de estas bloquea el paso a Pre-QA — quedan igual que la vez anterior, a criterio de
Arquitecto/PM si ameritan ticket aparte.

---

## Veredicto

**Pasada limpia — avanza a Pre-QA.** El hallazgo CRÍTICO de la corrida anterior (botón "Reubicar"
activo en bodegas `modo_detalle = pendiente`) está resuelto en frontend y backend, verificado en
vivo en ambas capas. El resto del checklist de Bloque B4 se re-confirmó sin regresiones. No hay
hallazgos nuevos que reportar.
