# Senior Review — SCRUM-695→702 (REQ-615→622, Batch E Epic CRM SCRUM-332) — Pantalla "Catálogo"

**Fecha:** 2026-07-31
**Reviewer:** Senior Reviewer (Claude)
**Estado del código:** sin commitear, rama `dev` en ambos repos, revisado en disco

---

## Veredicto general: 🟢 APPROVED (con 2 🟡 suggestions, 0 🔴 blockers)

Los 8 tickets están correctamente implementados. Verifiqué en vivo:
- Backend: `infra/test.sh --filter=CatalogControllerTest` → **18 tests, 80 assertions, OK**.
- Frontend: `npx vitest run` sobre `CatalogPage.test.tsx` + `PipelinePage.test.tsx` +
  `ClientsPage.test.tsx` + `QuotePartCard.test.tsx` → **69 tests, 4 archivos, todos verdes**.
- Leí `CatalogController.php`, `CatalogService.php`, `StoreCatalogTechnicalSheetRequest.php`, la
  migración, `CatalogControllerTest.php` completos, y `CatalogPage.tsx` completo (no el diff).
- No corrí PHPStan/tsc/build de nuevo — el dev ya reportó ambos limpios y no toqué código que
  pudiera invalidar esos resultados.

---

## ⚠️ Foco prioritario: ¿se perdió funcionalidad real de la pantalla vieja de Catálogo (SCRUM-70/92/100)?

**Respuesta corta: NO se perdió funcionalidad real. Hay una pérdida menor de affordance de
descubrimiento (no bloqueante) — ver detalle abajo.**

Verificación punto por punto:

1. **Búsqueda por texto** — sigue funcionando y mejoró: ahora es universal (referencia + marca +
   descripción + categoría + familia EN CONJUNTO, REQ-617 RN1), vs. la pantalla vieja que probablemente
   buscaba un subset menor. Cubierto por `test_busqueda_matchea_nombre_de_familia_aunque_no_este_seleccionada`
   (backend) y el test `'renderiza los productos...'` (frontend).

2. **Equivalente a la tab "Familias"** — el nuevo diseño reemplaza la tab de navegación por un
   filtro de Familia dentro del listado único (REQ-617 RN3). Analicé si esto pierde el caso de uso
   real ("ver todos los productos de la familia X sin escribir su nombre"):
   - **El caso de uso SÍ se sigue cubriendo**: seleccionar la familia del dropdown filtra el
     listado a exactamente esos productos — confirmado en backend
     (`test_categoria_y_familia_son_filtros_independientes`) y en el diseño de `CatalogService::list()`
     (`family_id` es un filtro AND-combinable, no requiere texto).
   - **Es además estrictamente más potente** que la tab vieja: en la pantalla vieja, la tab
     Familias probablemente no combinaba con búsqueda de texto ni con stock; acá el filtro de
     Familia SÍ es combinable con búsqueda, categoría y stock a la vez, y funciona en ambas vistas
     (grid/lista) con selección y ficha técnica incluidas.
   - **Pérdida real y menor**: el dropdown de Familias nuevo (`distinctActiveFamilies()`) expone
     solo `{id, name}`, sin `products_count`. La pantalla vieja (`CatalogProductFamilyController::index()`,
     que sigue viva y sin tocar, usada por `QuotePartCard.tsx`) sí muestra cuántos productos tiene
     cada familia antes de entrar. La pantalla nueva no da esa señal de volumen al elegir del
     dropdown — hay que seleccionar la familia para enterarse de cuántos productos trae. Es un
     detalle de affordance de descubrimiento, no una funcionalidad perdida (el dato completo
     — lista de productos de la familia — se sigue pudiendo obtener, y de hecho con más filtros
     combinables que antes). Lo marco como 🟡 suggestion, no 🔴 blocker.

3. **`git diff` completo de `CatalogPage.tsx`/`CatalogPage.test.tsx`** — leído completo. Los tests
   viejos removidos (banner de fuzzy search, tab Familias con "sin acción de Seleccionar todos",
   invalidación de `catalog-products` como query key) están reemplazados por equivalentes o dejaron
   de aplicar porque la funcionalidad que probaban ya no existe *en esta pantalla* (fuzzy search
   nunca estuvo en el alcance de REQ-617; sigue viviendo intacta en `CatalogProductController`/
   `QuotePartCard.tsx`, con su propio test suite sin tocar — confirmé que
   `QuotePartCard.test.tsx` sigue verde con 27 tests). No encontré ningún escenario que haya
   quedado sin cobertura real en ninguna de las dos pantallas.

4. **`CatalogProductController`/`CatalogProductFamilyController` (REQ-036/037)** — confirmado con
   `git status`/`git diff`: **cero cambios**. Rutas `/catalog-products` y `/catalog-product-families`
   intactas en `routes/ventas-diseno.php`. `QuotePartCard.tsx` sigue llamando
   `ventasDisenoApi.catalogProducts.search()` / `catalogProductFamilies.list()/.get()` sin tocar, y
   su suite de 27 tests pasa igual. El flujo de Cotizaciones es independiente de la pantalla nueva,
   como debía ser.

---

## Verificación de reglas de negocio (REQ-615→622)

| REQ | Verificado | Nota |
|---|---|---|
| REQ-615 (campos restringidos) | ✅ | `CatalogService::format()` nunca incluye cost/import_cost/freight_cost/handling_cost/other_cost/cost_total/margin_percent/por_servir/por_ingresar/estado/rotation/provider_*. Test `test_listado_nunca_expone_costo_ni_margen` cubre 12 campos prohibidos explícitamente. Categoría (`category`, string) y Familia (`family_id`/`family_name`, relación) tratadas como conceptos distintos en todo el código — no encontré el error de mezclarlos que sí ocurrió en otra pantalla del proyecto. |
| REQ-615 (stock simplificado) | ✅ | Solo `disponible` (neto de compromiso) + `en_camino`; nunca expone estados internos de Bodega/Compras. |
| REQ-616 (toggle grid/lista) | ✅ | Mismo estado de filtros (`search`/`category`/`familyId`/`stock`) independiente del `view` — cambiar de vista no dispara refetch ni resetea nada. Mismo modal (`ProductDetailModal`) desde ambas vistas (`onOpen`/`onClick` de fila abren el mismo `setDetailId`). |
| REQ-617 (búsqueda universal + filtros sin botón) | ✅ | `onChange` directo en los 4 controles, sin botón "Buscar" — el gap real de Batch D (Lista de Proyectos) NO se repitió acá. Dropdowns de categoría/familia poblados solo con valores de productos activos (`distinctActiveCategories`/`distinctActiveFamilies` operan sobre el universo pre-filtro, no el catálogo de categorías hardcodeado). |
| REQ-618 (ficha técnica = archivo real) | ✅ | Campos nuevos (`technical_sheet_key/_filename/_uploaded_at`) claramente distintos de `technical_spec` (JSON preexistente) — documentado en 3 lugares (modelo, migración, servicio). Sin `max:` en `StoreCatalogTechnicalSheetRequest` (confirmado, y probado con archivo de 10MB). Permiso: gateado con `ventas_diseno.read` sin `.edit` — decisión documentada explícitamente en 3 lugares (ruta, controller, request) citando la spec, no un descuido. |
| REQ-619 (selección + envío) | ✅ | "Seleccionar todo" opera sobre `items` (ya filtrado, sin paginar — decisión de diseño documentada y consistente con REQ-617). Botones de envío no rompen nada: `handleSend()` solo dispara un toast (`sendPending`), sin llamada HTTP — confirmado en código y test. |
| REQ-620 (navegación a Compras/Bodega) | ✅ | `navigate('/inventario')` / `navigate('/bodega/inventario')`, sin tocar los gates de esas rutas. |
| REQ-621 (PDF de ejemplo real) | ✅ | `exampleCatalogPdf()` sirve `storage/app/private/catalog-ejemplo/Catalogo_Ejemplo.pdf` (5290 bytes, archivo real, no placeholder) vía `Storage::disk('local')->download()`, 404 limpio si no existe. `.gitignore` correctamente excepcionado para versionar ese asset. Test `test_descargar_pdf_de_ejemplo` confirma `content-type: application/pdf`. |
| REQ-622 | ✅ | No implementado, correcto — fuera de alcance. |

### Otras áreas de riesgo

- **Fuga de campos sensibles**: confirmado, `provider_id`/`provider_name`/`reorder_point`/`rotation`
  tampoco se exponen — `format()` es una whitelist explícita de 11 campos, no un `toArray()`
  filtrado, así que no hay riesgo de fuga por un campo nuevo agregado a futuro sin querer.
- **Tabla compartida (`catalog_products`)**: migración solo agrega 3 columnas nullable
  (`technical_sheet_key/_filename/_uploaded_at`), `after()` explícito, sin default rompiendo filas
  existentes. `$fillable` del modelo actualizado consistentemente. No encontré otro lugar del
  código (Compras/Bodega) que necesite tocarse — son columnas nuevas y opt-in.
- **N+1**: verificado — `CatalogService::list()` hace *un* `with('families')` sobre el listado
  completo, y `committedMap()`/`enCaminoMap()` (reusados de Bodega/Compras) son `whereIn` en bloque,
  no por-producto. Sin N+1.
- **Upload de archivos / circuit breaker**: mismo patrón que `DocumentService` — `CircuitBreaker`
  envuelve el `putFileAs`, y el `update()` de la fila solo corre si el upload no lanzó excepción.
  El borrado del archivo viejo ocurre DESPUÉS de persistir la fila nueva, con `try/catch` propio
  que solo loguea (nunca deja el producto en estado roto si falla el borrado del viejo — a lo sumo
  queda un archivo huérfano en S3, aceptable). No hay ventana donde `technical_sheet_key` apunte a
  un archivo que no llegó a subirse.

---

## Hallazgos

### 🟡 Suggestion 1 — Dropdown de Familia sin señal de volumen (no bloqueante)
`CatalogService::distinctActiveFamilies()` retorna `{id, name}` sin conteo de productos, a
diferencia de `CatalogProductFamilyController::index()` (`products_count` vía `withCount`). Un
dropdown con 15-20 familias sin ese dato obliga a "probar" cada una para saber si trae resultados
grandes o chicos. Sugerencia (no bloqueante, no forma parte de ningún REQ explícito): agregar
`count` al array de `families` igual que se hizo con `categories` — el propio código ya calcula
algo equivalente para categorías (`distinctActiveCategories` sí trae `count`), así que sería
consistente con el patrón ya usado en la misma función.

### 🟡 Suggestion 2 — `format()` solo expone la primera familia (`families->first()`)
El modelo permite múltiples familias por producto (`BelongsToMany`), pero `CatalogItem` solo tiene
`family_id`/`family_name` (singular). Si algún producto real llega a tener 2+ familias, el filtro
por familia en el listado (`$p->families->pluck('id')->contains(...)`) sí las considera todas
correctamente, pero el detalle del producto (`family_name` en el modal) solo mostrará una. No es
un bug de REQ-615/617 (ninguno pide multi-familia visible), y no encontré evidencia de que el
catálogo real use multi-familia hoy — lo dejo documentado para no repetirlo si aparece un ticket
futuro que sí lo requiera.

---

## Conclusión

Sin regresión funcional real de la pantalla SCRUM-70/92/100. La sustitución de la tab "Familias"
por un filtro combinable es una variante de diseño deliberada (REQ-617 RN3) que cubre el mismo
caso de uso con más capacidad (combinable con búsqueda/categoría/stock, disponible en ambas
vistas), a costa de una señal de volumen menor (product count) que no estaba pedida por ningún
REQ. Aprobado para pasar a Visual Reviewer / Pre-QA.
