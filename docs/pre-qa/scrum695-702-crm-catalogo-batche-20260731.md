# Pre-QA — Batch E (SCRUM-695→702, REQ-615→622), pantalla "Catálogo"

Fecha: 2026-07-31
Ticket ancla: SCRUM-695
Ruta: `/ventas-diseno/catalog`
Entorno: local (Docker `infra-*` + Vite dev server), rama `dev` en ambos repos, código commiteado
localmente (backend `f435cd8`, frontend `7acafb8`) pero SIN pushear al arrancar esta sesión.
Cuenta usada: `neil.quiel@illuminations.com.pa` (Vendedor/Diseñador — `ventas_diseno.read`, sin
`bodega.read` ni `compras.read`).
Herramientas: curl directo contra la API (inspección de JSON crudo + concurrencia), `aws s3` CLI
contra el bucket real `atlanticerp-dev`, Playwright CLI (`npx playwright test`, suite promovida a
`e2e/preqa-scrum695-702-catalogo-batche.spec.ts`), PHPUnit (`infra/test.sh`), PHPStan, `npx vitest`,
`npm run build`.

Entrada: Senior Review (0 blockers) y Visual Review (1 CRÍTICO real — key de i18n cruda en
Categoría — encontrado, corregido y re-verificado limpio) ya habían corrido. Este Pre-QA no repite
esos hallazgos ya cerrados; se enfoca en romper runtime más allá de lo que código estático o
comparación visual contra mockup pueden atrapar.

---

## Paso 0 — permisos, valores paramétricos, fixtures

- Ningún criterio de este batch menciona una persona puntual con capacidad especial → no aplica
  `SpecialPermissionSeeder`.
- Ningún criterio menciona un umbral/margen/porcentaje de negocio configurable → no aplica.
- Fixtures: `infra/test.sh` corrió 2 veces durante la sesión (una para validar `CatalogService`
  tras el fix de concurrencia, otra ya contada) y ambas veces vació `catalog_products` del schema
  dev (mismo gotcha ya documentado: "`infra/test.sh` comparte Postgres con el dev local, no es
  fresh"). Se resembró con `tenants:artisan db:seed --force` + se repobló `category` en 10
  productos a mano + se recreó un producto de prueba sin familia (`PREQA-NOFAM-001`, necesario
  para el punto 6 del foco adversarial) + se recreó una Cotización con una Partida propia
  (`owner_id=23`) para el test de regresión de `QuotePartCard`. Estado final verificado con la
  suite de Playwright completa en verde contra los ids reales resultantes.

---

## Paso 1/2/3 — checklist por ticket, camino feliz + ruptura

| REQ | Camino feliz | Ruptura intentada | Resultado |
|---|---|---|---|
| REQ-615 | Grid/lista/detalle muestran solo los campos permitidos | Inspección del JSON crudo (`GET /ventas-diseno/catalog` y `/catalog/{id}`) vía curl, no solo la UI — grep de 12 campos prohibidos (`cost`, `import_cost`, `freight_cost`, `handling_cost`, `other_cost`, `cost_total`, `margin_percent`, `por_servir`, `por_ingresar`, `estado`, `rotation`, `provider_id`/`provider_name`, `reorder_point`) sobre 47 productos + detalle individual | **Limpio.** Cero coincidencias. `CatalogService::format()` es una whitelist real, no un `toArray()` filtrado. |
| REQ-616 | Toggle Cuadrícula/Lista | Cambiar de vista con un filtro de texto activo (`search=Riel`), confirmar que el input y el conteo de resultados no cambian al alternar | **Limpio.** Filtro sobrevive el cambio de vista en ambas direcciones. |
| REQ-617 Esc. 1 | — | Buscar el nombre completo de una familia ("Riel Direccionable") **sin** tocar el filtro de Familia | **Limpio.** Trae los 8 productos de esa familia. |
| REQ-617 (Categoría vs Familia) | — | Producto con Categoría poblada y **sin** Familia (`PREQA-NOFAM-001`, sembrado a propósito) — filtrar solo por Categoría | **Limpio.** El producto sigue apareciendo; Categoría y Familia son filtros independientes, no hay join implícito que excluya productos sin familia. |
| REQ-617 (edge cases) | — | Filtro con valor bogus (`category=bogus_cat_xyz`), `family_id` inexistente, búsqueda solo espacios en blanco, string tipo SQLi (`' OR '1'='1`) | **Limpio.** 0 resultados sin crashear en los 2 primeros; búsqueda en blanco = sin filtro (correcto, `trim()` la vacía); el filtrado es en memoria sobre PHP arrays, no hay superficie de inyección SQL real en este endpoint. |
| REQ-618 (tipo de archivo) | Subir PDF/PNG/JPG válido | Subir `.txt`, `.exe`, y un archivo con contenido `%PDF` pero extensión `.exe` (bypass de disfraz de contenido) | **Limpio.** 422 en los 3 casos (`extensions:` whitelist evalúa por extensión real del nombre de archivo, no por contenido/mime). **Verificado también en la UI real** (no solo curl): el `catch` de `UploadTechnicalSheetModal` muestra el mensaje de error visible, no es un rechazo silencioso (precedente SCRUM-63 no se repite acá). |
| REQ-618 (reemplazo) | Reemplazar ficha existente | Subir 1ra ficha → confirmar key en S3 → subir 2da ficha (reemplazo) → confirmar en S3 que la key vieja se borró | **Limpio.** Verificado con `aws s3 ls` real contra el bucket `atlanticerp-dev`: tras el reemplazo solo queda 1 archivo, la key vieja ya no existe. |
| REQ-618 (concurrencia) | — | **2 uploads simultáneos al mismo producto** (`curl` en paralelo, simulando doble clic antes de que el botón se deshabilite o 2 pestañas abiertas) | **🔴 CRÍTICO encontrado y corregido en el momento** — ver detalle abajo. Reproducido 4/4 veces antes del fix (siempre 2 archivos huérfanos en S3, nunca limpiados), 0/4 veces después del fix (siempre 1 archivo, consistente con la BD). |
| REQ-619 (selección + filtro) | "Seleccionar todo" con un filtro activo selecciona solo lo visible | **Seleccionar todo con Familia=A (3 productos) → cambiar a Familia=B (3 productos distintos)** — ¿el contador se ajusta? | **🟡 MEDIO encontrado y corregido en el momento** — ver detalle abajo. |
| REQ-619 (envío) | Botones habilitados/deshabilitados según selección, toast al enviar | Confirmado que ningún botón dispara una llamada HTTP real (REQ-622 fuera de alcance, toast informativo únicamente) | **Limpio**, sin error. |
| REQ-620 | Botones navegan a `/inventario` y `/bodega/inventario` | Click en "Inventario de Bodega" con un usuario **sin** `bodega.read` (`neil.quiel`) | **Limpio.** La navegación ocurre, pero `RequirePermission` de la ruta destino rebota a `FALLBACK_ROUTE` de inmediato — Catálogo no rompe nada, no expande ni restringe el permiso (RN3 cumplida). `/inventario` (Compras) es accesible en modo restringido con solo `ventas_diseno.read` por diseño preexistente de esa pantalla (`InventoryController::resolveAccess()`, SCRUM-231→244, no es parte de este batch) — confirmado que Catálogo no lo alteró. |
| REQ-621 | Descarga el PDF real | Confirmado tamaño exacto (5290 bytes) y validez (`file` → "PDF document, version 1.4, 2 pages") vía descarga real por API, no solo lectura de código | **Limpio.** |
| Regresión — `QuotePartCard` (REQ-036/037) | Buscar producto + tab Familias dentro del picker de Cotización | Abrir una Cotización real, abrir el picker, buscar por referencia (`RIEL-TRK-050`) y abrir el tab Familias | **Limpio.** Sigue funcionando igual que antes — Batch E no tocó `CatalogProductController`/`CatalogProductFamilyController` ni `QuotePartCard.tsx`, confirmado en código por Senior Review y ahora también en runtime. |

---

## 🔴 CRÍTICO — Race condition en upload de ficha técnica deja archivos huérfanos en S3

**Criterio que rompe:** REQ-618 RN "el archivo nuevo reemplaza al anterior — sin versionado
múltiple" (implícito: debe existir como máximo 1 archivo por producto en S3 en todo momento).

**Cómo se reprodujo:** 2 requests `POST .../catalog/{id}/technical-sheet` disparadas en paralelo
(mismo producto, archivos distintos) vía `curl ... & curl ... & wait`. Ambas responden `200`.

**Causa raíz:** `CatalogService::uploadTechnicalSheet()` leía `$product->technical_sheet_key`
(el "old key" a borrar) **antes** de que arrancara la carrera. Si dos requests llegan casi al mismo
tiempo, ambas leen el mismo `oldKey` (el que existía antes de que cualquiera de las dos escribiera),
suben su propio archivo nuevo con key único (`Str::uuid()`, sin colisión ahí), y cada una borra ese
mismo `oldKey` pre-carrera al terminar. La fila de la BD termina con el key de quien ganó la
escritura final (last-write-wins, normal y aceptable), pero el archivo de la request que **perdió**
la escritura de BD nunca se borra — queda huérfano en S3 para siempre, nunca referenciado por
ninguna fila.

**Verificado en S3 real (bucket `atlanticerp-dev`, no un mock):**
```
=== firing 2 simultaneous uploads to product 21 (ANTES del fix) ===
2026-07-31 14:44:39   6abb9ea4-....pdf   <- huérfano, nunca referenciado
2026-07-31 14:44:39   cea90f6f-....pdf   <- el que quedó en la BD
```

**Fix aplicado** (`atlanticerp-backend/app/Modules/VentasDiseno/Services/CatalogService.php`):
`DB::transaction()` + `CatalogProduct::query()->whereKey($id)->lockForUpdate()->value('technical_sheet_key')`
justo antes de escribir — serializa las 2 transacciones concurrentes: la segunda relee el `oldKey`
YA actualizado por la primera (el key que la primera acaba de persistir, no el pre-carrera) y lo
borra correctamente.

**Verificado el fix, 4/4 corridas limpias** (bucket real, no local):
```
iteración 1: files in S3 for product 21: 1
iteración 2: files in S3 for product 21: 1
iteración 3: files in S3 for product 21: 1
+ la corrida original post-fix: 1
```
DB (`technical_sheet_key`) siempre coincide con el único archivo sobreviviente en S3.

**PHPStan Level 8:** limpio (`vendor/bin/phpstan analyse ... --memory-limit=512M`, 0 errores).
**PHPUnit:** `infra/test.sh --filter=Catalog` (50 tests) y `--filter=VentasDiseno` (318 tests)
ambos en verde tras el fix.

**Commit:** `atlanticerp-backend`, aislado (solo `CatalogService.php`).

---

## 🟡 MEDIO — Selección fantasma al cambiar de filtro (REQ-619)

**Criterio que rompe:** REQ-619 RN1 ("Seleccionar todo" opera sobre los productos actualmente
visibles) — implícito: el contador de seleccionados debe reflejar siempre la selección
**realmente visible**, no ids que dejaron de estarlo.

**Cómo se reprodujo:** filtrar por Familia="Baño & Espejo" (3 productos) → "Seleccionar todo" →
cambiar el filtro a Familia="Oficina & Comercial" (3 productos completamente distintos). El
checkbox "Seleccionar todo" correctamente aparece destildado (ninguno de los 3 nuevos productos
visibles está en `selected`), pero el contador seguía mostrando **"3 seleccionados"** — contando
productos que el usuario ya no puede ver. Un click en "Enviar seleccionados" en ese estado habría
enviado 3 productos de la familia anterior, no los 3 que el usuario tiene delante en pantalla.

**Causa raíz:** `CatalogPage.tsx` — el estado `selected` (un `Set<number>`) nunca se podaba cuando
el universo de `items` cambiaba por un filtro nuevo; solo se leía/escribía por click individual o
por "Seleccionar todo".

**Fix aplicado** (`atlanticerp-frontend/src/pages/ventas-diseno/CatalogPage.tsx`): `useEffect` que poda
`selected` a la intersección con los `items` visibles actuales cada vez que `items` cambia.

**Verificado el fix con Playwright real** (no solo lectura de código):
```
SELECCION FANTASMA — count con filtro A: 3 seleccionados
                    | count tras cambiar a filtro B: 0 seleccionados   <- antes: seguía en "3"
                    | "Seleccionar todo" marcado tras cambiar filtro: false
```
`npx vitest run CatalogPage.test.tsx` (13 tests) y `npm run build` (tsc + vite) en verde tras el fix.

**Commit:** `atlanticerp-frontend`, aislado (`CatalogPage.tsx` + el spec e2e nuevo).

---

## Loop cerrado

Ambos hallazgos eran chicos (backend: 1 método, ~15 líneas netas; frontend: 1 `useEffect`) — se
corrigieron en el momento, se re-corrió el checklist COMPLETO (no solo lo que había fallado) contra
la app real, y solo entonces se dio la pasada por limpia. Sin hallazgos diferidos, sin deuda
pendiente para la próxima sesión de Pre-QA en este batch.

## Suite promovida a e2e/ permanente

`atlanticerp-frontend/e2e/preqa-scrum695-702-catalogo-batche.spec.ts` — 9 tests, incluye el smoke test de
fuga de datos financieros (gate de seguridad, se rompe una vez y se promueve por regla del
proyecto) y el de selección fantasma (gate de estado, ídem). Corridos en verde contra el estado
final de fixtures de esta sesión.

## Veredicto por ticket

| Ticket | Veredicto |
|---|---|
| SCRUM-695 (REQ-615) | ✅ Limpio → QA |
| SCRUM-696 (REQ-616) | ✅ Limpio → QA |
| SCRUM-697 (REQ-617) | ✅ Limpio → QA |
| SCRUM-698 (REQ-618) | ✅ Limpio tras corregir el CRÍTICO de concurrencia → QA |
| SCRUM-699 (REQ-619) | ✅ Limpio tras corregir el MEDIO de selección fantasma → QA |
| SCRUM-700 (REQ-620) | ✅ Limpio → QA |
| SCRUM-701 (REQ-621) | ✅ Limpio → QA |
| SCRUM-702 (REQ-622) | Sin cambios de estado — no implementado a propósito este sprint (confirmado contra el texto vigente del ticket, RN3: "Este modo no se construye en este sprint"). No se transiciona a QA ni a ningún otro estado; queda tal cual está, documentado acá para que quede explícito que la decisión sigue vigente. |
