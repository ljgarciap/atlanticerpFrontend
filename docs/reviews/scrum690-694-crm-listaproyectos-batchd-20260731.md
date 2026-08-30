# Senior Review — SCRUM-690→694 (REQ-610→614, Batch D "Lista de Proyectos")

**Fecha:** 2026-07-31
**Revisor:** Senior Reviewer (agente)
**Alcance:** backend (`atlanticerp-backend`, working tree sin commitear) + frontend (`atlanticerp-frontend`, working tree sin commitear)

## Veredicto general

🟡 **Requiere un cambio antes de Pre-QA** — arquitectura, permisos, CSV y paginación están
correctos y bien alineados con los patrones ya establecidos del módulo (`PipelineService::list()`,
`DashboardController`, `App\Shared\Http\Pagination`). Hay **un hallazgo bloqueante** en el
frontend: el buscador de texto (RN5 de REQ-611) implementa un botón "Buscar" + Enter-only en vez
de filtrado en tiempo real, lo cual contradice tanto el texto explícito de la regla de negocio
como el patrón ya usado en las pantallas hermanas del mismo módulo (Pipeline, Clientes).

Tests corridos por mí mismo: `infra/test.sh --filter=ProjectsListControllerTest` → **17/17 OK**.
PHPStan Level 8 (`--memory-limit=512M`) → **sin errores**. `npx tsc --noEmit` (frontend) → **sin
errores**. Confirmo los tres resultados que ya había verificado la sesión anterior.

---

## 🔴 Blocker

### 1. Buscador de texto no es tiempo real — contradice RN5 explícita de REQ-611

**Archivo:** `atlanticerp-frontend/src/pages/crm/ProjectsListPage.tsx:39-40, 77, 109-117`

RN5 (REQ-611) dice literalmente: *"los filtros se combinan (AND), tiempo real, sin botón
'Buscar'"*. La implementación actual:

```tsx
const [search, setSearch] = useState('')
const [query,  setQuery]  = useState('')   // ← lo que realmente se manda al backend
...
const filters = { search: query || undefined, ... }   // usa `query`, no `search`
...
<input
  value={search}
  onChange={e => setSearch(e.target.value)}
  onKeyDown={e => e.key === 'Enter' && handleSearch()}
  ...
/>
<Button variant="outline" onClick={handleSearch}>{tCommon('actions.search')}</Button>
```

`query` (el valor que de verdad dispara la llamada a `ventasDisenoApi.projects.list()`) solo se
actualiza en `handleSearch()`, que solo corre por click en "Buscar" o Enter — no hay `onChange`
que dispare la query. Los otros 3 filtros (Etapa, Etiqueta, Responsable) sí son reactivos
(`onChange` que llama `setStage`/`setTag`/`setOwnerId` directo, sin paso intermedio), así que el
buscador queda como la única excepción, inconsistente con el resto de la misma pantalla.

Esto **no es una variante aceptable**: el backend (`ProjectsListService::query()`) no tiene ningún
impedimento para filtrado reactivo — es un `ilike` simple evaluado por request, sin estado ni
debounce necesario del lado del servidor. Y el patrón ya establecido en pantallas hermanas del
mismo módulo (mismo tipo de filtro, mismo REQ-group) es justamente buscador reactivo sin botón:

- `atlanticerp-frontend/src/pages/ventas-diseno/PipelinePage.tsx:104-107` — `<input onChange={e =>
  setSearch(e.target.value)} />`, sin botón.
- `atlanticerp-frontend/src/pages/ventas-diseno/ClientsPage.tsx:~90` — mismo patrón, `onChange`
  directo.

**Corrección esperada:** eliminar el botón "Buscar" y el estado intermedio `query`/`handleSearch`;
usar `search` directo en `filters` (como ya hacen `stage`/`tag`/`ownerId`), igual que Pipeline y
Clientes. Si hay preocupación de volumen de requests por tecla, ese es un problema nuevo a
resolver con debounce explícito — no existe ningún hook de debounce ya establecido en el repo
(`grep -rn "useDebounce"` no encontró nada reutilizable), así que de introducirse debounce acá
sería una decisión de UX nueva, no una que ya esté aprobada — recomiendo simplemente igualar el
patrón de Pipeline/Clientes (reactivo puro, sin debounce) para no divergir sin necesidad.

---

## 🟡 Suggestions (no bloquean, dejar registrado)

### 2. `distinctOwners()` carga todos los `PipelineCard` en memoria solo para extraer dueños

**Archivo:** `atlanticerp-backend/app/Modules/VentasDiseno/Services/ProjectsListService.php:79-92`

```php
$owners = PipelineCard::with('owner')->get()->pluck('owner')->filter()->unique('id')...
```

Sin ningún filtro de scope ni límite — trae TODAS las filas de `pipeline_cards` con su relación
`owner` cada vez que un Líder/Gerencia abre la pantalla, solo para sacar la lista de nombres
distintos. Es el mismo patrón ya usado en `PurchaseOrderController::distinctCreators()`
(`atlanticerp-backend/app/Modules/Compras/Http/Controllers/PurchaseOrderController.php:169-181`), así
que no es una invención nueva de este ticket — es una debilidad heredada y replicada
consistentemente. No la marco bloqueante porque sigue el precedente ya aceptado en el proyecto,
pero como la tabla de Pipeline puede crecer con el tiempo (a diferencia de purchase orders, que
tiene menor volumen esperado), vale la pena registrar como deuda: un `DISTINCT owner_id` a nivel
SQL sería más barato que traer todas las filas a PHP.

### 3. Eager load de `subClient` no se usa en `formatRow()`

**Archivo:** `atlanticerp-backend/app/Modules/VentasDiseno/Services/ProjectsListService.php:28`

`query()` hace `->with(['salesProject', 'masterClient', 'subClient', 'owner'])`, pero
`formatRow()` (líneas 95-119) nunca lee `$card->subClient` — ni en la respuesta JSON ni en el CSV.
Es un JOIN/query extra por página sin uso. No es N+1 (sigue siendo O(1) queries por página gracias
al eager load), solo trabajo de más. Quitar `subClient` del `with()` si de verdad no hace falta, o
documentar por qué se necesita si hay un uso futuro previsto.

### 4. Falta un test explícito de "un Vendedor no puede forzar `scope=team` mandándolo directo"

**Archivo:** `atlanticerp-backend/tests/Feature/VentasDiseno/ProjectsListControllerTest.php`

El código en `ProjectsListService::query()` (línea 39: `if ($scope !== 'team' || !
$canSeeTeam)`) ya maneja correctamente que un actor sin `canViewTeamV2()` sea ignorado aunque
mande `?scope=team` en el query string — verifiqué el comportamiento leyendo el código y es
correcto. Pero la suite actual solo prueba el caso donde el frontend simplemente no manda
`scope=team` (`test_vendedor_solo_ve_sus_propios_proyectos`), no el caso adversarial de un
Designer mandando `?scope=team` a mano. Dado que este es exactamente el tipo de escenario que
Pre-QA/QA suelen ejercitar como intento de bypass de permisos, sugiero agregar ese caso acá mismo
para dejarlo cubierto en la suite normal, no solo en la sesión manual de Pre-QA.

---

## 🟢 Aprobado (verificado explícitamente)

- **RN1/RN2 (REQ-610) — scope Mías/Equipo**: `ProjectsListService::query()` reusa exactamente el
  mismo patrón que `PipelineService::list()` (`canViewTeamV2('ventas_diseno')` +
  `owner_id`), sin reinventar la lógica de permisos — confirmado línea por línea contra
  `PipelineService.php:184-201`.
- **RN3/RN4/RN5/RN6 (REQ-610) — columnas y formato**: las 10 columnas del JSON/CSV son exactamente
  las pedidas; `amount`/`worked_area_m2`/`next_delivery_date` son `null` cuando falta el dato (el
  frontend los renderiza como `—` vía `fmtMoney`/`fmtArea`), cubierto por
  `test_fila_incluye_los_datos_esperados_y_null_cuando_falta`.
- **RN2/RN3 (REQ-611) — filtros Etapa/Etiqueta**: implementados en el backend con `where('stage',
  ...)` / `whereHas('salesProject', ...)`, cubiertos por tests dedicados.
- **RN4 (REQ-611) — filtro Responsable solo con team-view real**: el backend ignora `owner_id` si
  el actor no tiene `canViewTeamV2()`, no solo lo oculta en el frontend — confirmado en código y en
  `test_filtro_de_responsable_no_tiene_efecto_para_vendedor`.
- **RN6 (REQ-611) — conteo doble**: `meta.total` (filtrado) vs `total_unfiltered` (mismo scope,
  ignora search/stage/tag) son dos cálculos distintos, no el mismo número repetido — confirmado en
  código y en `test_total_unfiltered_ignora_filtros_de_busqueda_pero_respeta_el_scope`.
- **Escenario 3 (REQ-611) — mensaje de "sin resultados"**: el string real usado
  (`crm:projectsList.table.empty`) es literalmente `"Sin resultados para los filtros actuales"` en
  ambos locales, no un placeholder genérico — confirmado en el diff de
  `src/i18n/locales/es/crm.json`.
- **Búsqueda case-insensitive**: usa `ilike` (Postgres), no `like` — confirmado en
  `ProjectsListService.php:51-52`.
- **REQ-612 — navegación con highlight**: `navigate(`/ventas-diseno/pipeline?card=${row.id}`)`
  reusa exactamente el mismo query param (`card`) que `PipelinePage.tsx:29` ya lee para resaltar
  la tarjeta — mismo mecanismo que REQ-022/065 desde Clientes, sin endpoint propio, tal como
  documenta el controller.
- **REQ-613 — CSV sin fuga de datos**: las 10 columnas del CSV son exactamente las de RN3, sin RUC
  ni teléfono. Verificado además que `MasterClient` (el modelo que alimenta la columna "Cliente")
  ni siquiera tiene esos campos en su schema (`fillable = ['name', 'default_price_type']`), así
  que no hay ninguna vía de que se cuelen — confirmado en
  `test_exportar_csv_tiene_exactamente_las_10_columnas_visibles` y por lectura directa del
  modelo. RN1 (exporta solo lo filtrado, no toda la tabla) confirmado en
  `test_exportar_csv_respeta_los_filtros_aplicados`.
- **REQ-614 — "+ Nuevo Proyecto"**: `navigate('/ventas-diseno/pipeline?openNewProject=1')` es
  carácter por carácter idéntico al que ya usa `DashboardPage.tsx:99` para REQ-608, y
  `PipelinePage.tsx:48` ya sabe leer ese mismo param — sin duplicar el mecanismo.
- **Paginación backend**: usa `App\Shared\Http\Pagination` (política global), no un `limit()`
  client-side como Pipeline — decisión ya documentada y correcta dado que esta pantalla sí necesita
  paginación real. Cubierto por `test_listado_pagina_desde_el_backend`.
- **N+1**: `query()` eager-carga `salesProject`, `masterClient`, `owner`, `deliveryDates` y usa
  `withCount('files')` — no encontré queries N+1 al recorrer `formatRow()` por fila.
- **`resolveUser()`**: idéntico al patrón ya usado en `ArchitectController`, `AuditLogController`,
  `ClientController`, `CalendarEventController` — no es un mecanismo nuevo inventado para este
  ticket.
- **Ruta `/export`**: mismo permiso `ventas_diseno.read` que `/`, coherente (es una operación de
  lectura); sin colisión de rutas con `/{id}` (este grupo no define ese patrón, a diferencia de
  `/pipeline`).
- **401/403**: cubiertos explícitamente (`test_listar_proyectos_sin_autenticar_retorna_401`,
  `test_exportar_csv_sin_autenticar_retorna_401`, `test_listar_proyectos_sin_permiso_retorna_403`).

---

## Verificación de tests (corridos por mí, no heredados del reporte previo)

```
$ infra/test.sh --filter=ProjectsListControllerTest
...
OK (17 tests, 71 assertions)

$ docker compose -f infra/docker-compose.yml exec -T laravel vendor/bin/phpstan analyse --no-progress --memory-limit=512M
[OK] No errors

$ npx tsc --noEmit   (atlanticerp-frontend)
(sin salida — limpio)
```

## Próximo paso

PM reasigna a Frontend Dev el hallazgo 🔴 #1 (buscador reactivo, sin botón, igualar patrón de
Pipeline/Clientes). Tras el fix, no hace falta correr de nuevo la suite de backend (el cambio es
puramente frontend, no toca `ProjectsListController`/`Service`) — sí correr `npx tsc --noEmit` y
confirmar visualmente el comportamiento reactivo antes de re-solicitar Senior Review sobre ese
archivo puntual. Los hallazgos 🟡 #2-#4 quedan registrados como deuda, no bloquean el paso a
Pre-QA una vez cerrado el #1.

---

## Re-check — 2026-07-31 (mismo día, tras fix de Frontend Dev)

**Alcance:** re-verificación acotada del hallazgo 🔴 #1 únicamente. Los hallazgos 🟡 #2-#4 no se
re-tocan, quedan como estaban documentados arriba (deuda no bloqueante).

Leí `atlanticerp-frontend/src/pages/crm/ProjectsListPage.tsx` completo tal cual está en disco (working
tree sin commitear).

**Confirmado:**

- El estado `query` y la función `handleSearch()` fueron eliminados. No queda ningún `useState`
  intermedio para el buscador — línea 39 solo declara `const [search, setSearch] = useState('')`.
- `filters` (línea 48) usa `search: search || undefined` directo — el mismo objeto que dispara
  `useQuery({ queryKey: ['ventas-diseno-projects-list', filters], ... })` (línea 57-60). Cualquier
  cambio de `search` invalida la queryKey y dispara la request, sin paso intermedio.
- El `<input>` (líneas 107-113) quedó `onChange={e => { setSearch(e.target.value); setPage(1) }}`
  — sin `onKeyDown`, sin botón "Buscar" al lado (comparado contra el bloque original que tenía
  `<Button variant="outline" onClick={handleSearch}>` inmediatamente después del input — ya no
  está). Es exactamente el mismo patrón que los otros 3 filtros de la misma pantalla
  (`stage`/`tag`/`ownerId`, líneas 117/128/165), que ya eran reactivos, y coincide carácter por
  carácter con la forma de `PipelinePage.tsx:104-107` (`onChange={e => setSearch(e.target.value)}`
  directo).
- `tCommon` sigue en uso — `tCommon('loading')` (línea 81, estado de carga) y
  `tCommon('errors.generic')` (línea 66, fallback de error del export CSV). No quedó un import
  muerto ni una referencia rota a `tCommon('actions.search')` (el string del botón borrado).
- No encontré ningún otro rastro de `query`/`handleSearch` en el archivo (grep visual completo,
  257 líneas).

**Verificaciones ejecutadas por mí en este re-check:**

```
$ npx tsc --noEmit   (atlanticerp-frontend, cwd confirmado)
EXIT:0 — sin salida, sin errores

$ infra/test.sh --filter=ProjectsListControllerTest   (atlanticerp-backend)
OK (17 tests, 71 assertions)
```

Ambos resultados iguales a los ya reportados en la revisión original — esperable, el fix es
puramente frontend (un componente de página) y no toca ningún endpoint/servicio del backend.

**Veredicto final:** 🟢 **Blocker #1 resuelto. Aprobado para Pre-QA.**

Los hallazgos 🟡 #2-#4 (carga completa de `PipelineCard` en `distinctOwners()`, eager-load de
`subClient` sin uso, test faltante de bypass de `scope=team`) siguen registrados como deuda no
bloqueante — no forman parte del alcance de este re-check ni impiden el paso a Pre-QA.
