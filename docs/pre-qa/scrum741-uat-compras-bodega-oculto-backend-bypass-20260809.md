# Pre-QA — SCRUM-741 (Compras/Bodega completamente ocultos por UAT — fix Sidebar + InventoryController/OrderStatusController)

**Fecha:** 2026-08-09
**Alcance:** el resto de SCRUM-741 que `scrum741-catalogo-boton-20260808.md` dejó explícitamente
fuera de su alcance — "toggles de visibilidad Compras/Bodega, ocultar Compras a David/Mark".
Diff sin commitear al arrancar esta sesión, en `dev` de ambos repos:
- `atlanticerp-frontend/src/components/Sidebar.tsx` (+ test) — corrige el OR `canSeeInventario =
  canSeeCompras || canSeeVentasDiseno` para que también respete `menuVisibility.compras.__module__`.
- `atlanticerp-backend/app/Modules/Auth/Services/UatVisibilityService.php` — agrega `isModuleHidden()`.
- `atlanticerp-backend/app/Modules/Compras/Http/Controllers/InventoryController.php` y
  `app/Modules/Bodega/Http/Controllers/OrderStatusController.php` — la rama restringida
  (`ventas_diseno.read` sin `compras.read`/`bodega.read`) deja de dar acceso cuando el módulo
  está oculto por UAT.

Senior Review 🟢 y Cybersecurity 🟢 ya habían aprobado (revisión estática + tests). Esta sesión es
la primera que corre la app real en navegador contra este fix.

**Entorno:** stack local (Docker: postgres/redis/laravel/horizon/nginx en :8090, `npm run dev` en
:5173 levantado para esta sesión y detenido al cerrar). Cuentas reales usadas (password = email,
ver `project_roster_usuarios_reales_atlanticerp.md`):
- `david@grupolafayette.com` y `mbekhar@atlantic.com.pa` (`management`/Gerencia) — los 2
  usuarios que el ticket nombra explícitamente como el reporte original del bug.
- `milena.e@grupolafayette.com` (`vendedor_disenador` real) — check negativo del camino ya
  arreglado.
- `gerencia2@atlantic.com.pa` (`lider_compras` real, Yirena Teng) — usuario real del módulo.
- `carlos@atlantic.com.pa` (`tecnico_servicios`, sin ningún permiso relevante) — sanity check.

Ocultamiento/restauración de Compras y Bodega ejecutado vía el mecanismo real
(`POST /api/admin/module-visibility/bulk` como superadmin, mismo endpoint que usa el modal de
UI), no por escritura directa en BD.

## Checklist ejecutado

| # | Escenario | Resultado |
|---|---|---|
| 1 | Superadmin oculta Compras vía `POST /api/admin/module-visibility/bulk` (equivalente al modal) | PASA |
| 2 | David (Gerencia) — sidebar ya NO muestra "Compras"/"Inventario" (confirmado en navegador real, `body.innerText()` sin esas cadenas) | PASA |
| 2b| Mark (Gerencia) — mismo check que David | PASA |
| 3 | David navega directo a `/inventario` con Compras oculto | **FALLA — CRÍTICO, ver abajo** |
| 4 | Restaurar Compras desde el modal → David vuelve a ver el link Y el JWT vuelve a traer `modules.compras.view:true` (reversibilidad confirmada) | PASA |
| 5 | Milena (`vendedor_disenador` real) con Compras oculto de nuevo — sidebar sin Compras/Inventario, `GET /api/compras/inventory` → **403** | PASA |
| 6 | Yirena (`lider_compras` real) con Compras oculto — ver hallazgo secundario abajo | Ver MEDIO abajo |
| 7 | Bodega oculto + `GET /api/bodega/orders/status` — Milena (solo `ventas_diseno.read`) → 403; David (Gerencia) → **200, mismo bypass que Compras** | **Mismo CRÍTICO, ver abajo** |
| — | Carlos (`tecnico_servicios`, sin ningún permiso relevante) → 403, sin relación con el estado de UAT | PASA (sanity check) |

Estado de UAT restaurado a `{"hidden_modules":[],"hidden_menu_items":[]}` (línea base con la que
arrancó la sesión) al cerrar.

## CRÍTICO — el fix no cierra el camino real por el que David/Mark reportaron el bug

**Qué se rompe:** con Compras oculto por UAT, `david@grupolafayette.com` y
`mbekhar@atlantic.com.pa` (Gerencia, los 2 usuarios que el ticket nombra explícitamente)
siguen teniendo acceso funcional COMPLETO y sin restricción a `/inventario` — costo, margen,
botón "+ Crear nuevo producto", toggle "Compras/Ventas & Diseño", exactamente como si Compras
NO estuviera oculto. Mismo patrón en Bodega (`/bodega/pedidos/status`, ve TODOS los pedidos sin
filtro).

**Cómo reproducirlo:**
1. Superadmin oculta Compras (`POST /api/admin/module-visibility/bulk {"modules":["compras"],
   "action":"hide"}`).
2. Login como David → el Sidebar correctamente ya NO muestra "Compras"/"Inventario" (el fix de
   `Sidebar.tsx` sí funciona).
3. Navegar directo a `http://localhost:5173/inventario` (URL, no un link visible) → la pantalla
   carga completa, modo NO restringido (screenshot adjunto: badge "GERENCIA", columna COSTO
   visible, botón "+ Crear nuevo producto" habilitado).
4. `curl` directo confirma lo mismo a nivel API: `GET /api/compras/inventory` con el JWT de David
   devuelve `HTTP 200`, `"restricted":false` — idéntico a como responde con Compras SIN ocultar.

**Causa raíz real (distinta de la que asume el ticket):** el ticket describe la causa como
"2 controllers backend daban acceso funcional real vía el permiso `ventas_diseno.read` sin
consultar el estado UAT" — asumiendo que ese es el ÚNICO camino de acceso que David/Mark tienen.
Verificado en vivo que es falso: el rol `management` tiene `compras.read`/`bodega.read` **reales**
vía `role_module_visibility` (`can_view=2` para los 7 módulos del catálogo — "Gerencia ve todo"
es el diseño intencional de ese rol, confirmado por consulta directa a
`atlantic_auth.role_module_visibility`). Eso significa que David/Mark entran por la rama
`hasFullAccess` de `InventoryController::resolveAccess()` / el chequeo equivalente de
`OrderStatusController::resolveAccess()` — la rama que el fix de esta sesión **nunca tocó**,
porque el ticket nunca consideró que Gerencia tuviera el permiso real de acceso completo, no solo
el fallback restringido de `ventas_diseno.read`.

**Por qué no lo arreglé yo mismo (toca diseño aprobado, no es un one-liner seguro):** intenté un
fix directo (subir el chequeo de `UatVisibilityService::isModuleHidden()` al tope de
`resolveAccess()`, exento solo para `superadmin.all` real — mismo criterio que ya usan
`User::modulesPayload()`/`menuVisibilityPayload()` para el resto de la app) y lo verifiqué en
vivo: cierra el bypass para David/Mark. Pero al revisar los tests que Senior Review ya había
agregado a este mismo diff (`InventoryControllerTest::
test_modo_compras_conserva_acceso_aunque_compras_este_oculto_por_uat`,
`OrderStatusControllerTest::test_bodega_read_conserva_acceso_aunque_bodega_este_oculto_por_uat`),
encontré que Senior Review **ya evaluó y aprobó explícitamente el comportamiento contrario**: un
holder real de `compras.read`/`bodega.read` debe conservar acceso íntegro aunque el módulo esté
oculto por UAT — "la máscara UAT nunca debe afectar a quien SÍ tiene el permiso real" (comentario
textual del test). Mi fix directo revierte esa decisión ya aprobada — lo deshice
(`git checkout --` + reconstrucción manual del diff original, verificado byte a byte contra el
diff con el que arrancó la sesión) en vez de pushearlo por mi cuenta.

Esto dijo blanco (Senior Review) y el ticket dice negro (David/Mark deben perder acceso) sobre el
**mismo permiso real** (`compras.read`/`bodega.read` de Gerencia) — no es algo que Pre-QA deba
resolver unilateralmente, es una decisión de producto/diseño:
- **Opción A** — el diseño de Senior Review es el correcto, y el problema real es que `management`
  no debería tener `compras.read`/`bodega.read` **real** por defecto (revisar si "Gerencia ve
  todo" debe seguir siendo блanket, o si necesita un nivel más angosto para este caso — mismo
  patrón que el hallazgo de `feedback_security_level_legacy_catalog_leak.md` y la nota pendiente
  de `vendedor_disenador` Nivel 4→6 en el modelo de datos de Servicios).
- **Opción B** — el diseño de Senior Review está mal targeteado: la máscara UAT SÍ debe cortar
  acceso real a TODO no-superadmin (incluido personal real de Compras/Bodega) mientras el módulo
  esté en rollout — es lo que ya hace `modulesPayload()`/`menuVisibilityPayload()` para el
  Sidebar de TODOS (confirmado: `gerencia2@atlantic.com.pa`, lider_compras real, YA pierde
  el link del Sidebar hoy — ver hallazgo MEDIO abajo — así que el precedente de "solo superadmin
  bypassa" ya existe en el código, solo no está aplicado acá).

Cualquiera de las 2 opciones es un cambio de diseño (afecta acceso real de personas — Opción A
toca el modelo de permisos de Gerencia en producción; Opción B afecta a Compras/Bodega ya
desplegado). Ninguna es un fix de una línea que yo deba tomar por mi cuenta.

**No se pushea nada de esto a `dev`** hasta que el Arquitecto (o Luis) resuelva cuál opción es la
intencional — el ticket queda BLOQUEADO en este estado (loop no cerrado, seguimiento en la
próxima sesión de Pre-QA apenas haya decisión, por la regla dura del protocolo).

## MEDIO — inconsistencia ya existente para personal real de Compras (no introducida por este fix)

`gerencia2@atlantic.com.pa` (Yirena, `lider_compras` real): con Compras oculto, su Sidebar
YA pierde el link "Compras/Inventario" hoy (`modulesPayload()` enmascara `modules.compras.view`
para cualquier no-superadmin, sin excepción por rol — esto es de SCRUM-739, previo a este ticket,
no algo que este diff introduzca). Pero si navega directo a `/inventario`, el backend le sigue
sirviendo la pantalla completa con costos — mismo patrón sidebar-oculta/backend-permite que el
ticket original reportó para David/Mark, solo que para ella es "aceptado por diseño" según los
tests de Senior Review. Documentado para que quien decida entre Opción A/B arriba lo tenga en
cuenta: si se elige Opción A, este caso queda igual (Yirena sigue sin link pero con acceso
funcional por URL — no ideal, pero consistente con "solo Gerencia debía perder acceso real"); si
se elige Opción B, este caso se resuelve solo (Yirena también perdería el acceso funcional
mientras esté oculto, coherente con perder ya el link).

## Lo que sí funciona (no tocar al mitigar lo de arriba)

- `Sidebar.tsx` — el fix del OR (`canSeeVentasDiseno && menuVisibility.compras.__module__ !==
  false`) funciona correctamente: confirmado en navegador real para David, Mark y Milena — ningún
  no-superadmin ve el link mientras el módulo está oculto, sin importar por qué rama del OR
  llegaría normalmente.
- La rama restringida (`ventas_diseno.read` sin `compras.read`/`bodega.read`, ej. Milena) queda
  correctamente bloqueada (403) tanto en Compras como en Bodega — esta es la parte del ticket que
  el fix original SÍ resuelve.
- El toggle de UAT es reversible: restaurar el módulo devuelve el link del Sidebar y no rompe el
  acceso normal de nadie (confirmado con David post-restauración).
- Un usuario sin ningún permiso relevante (Carlos, `tecnico_servicios`) sigue bloqueado sin
  relación con el estado de UAT — sin regresión ahí.

## Veredicto (pasada original — BLOQUEANTE)

**BLOQUEANTE — el ticket NO pasa de `Dev Testing` a `QA`.** El fix cierra la mitad del problema
reportado (Sidebar + rama restringida de `ventas_diseno.read`) pero no la mitad que el ticket
nombra explícitamente como el reporte original (David/Mark accediendo con datos reales) — porque
la causa raíz asumida en el ticket no coincide con la causa raíz real verificada en vivo. Requiere
decisión de Arquitecto/Luis entre Opción A/B arriba antes de reintentar un fix. Esta sesión no
pushea nada — el diff en `dev` de ambos repos queda exactamente igual a como estaba al empezar
(verificado: `git diff` idéntico al capturado al inicio de la sesión en ambos repos).

---

## Re-verificación 2026-08-09 — Luis decidió Opción B, fix ampliado aplicado

**Decisión de Luis:** mientras Compras/Bodega estén ocultos por la etapa de UAT actual, NADIE
no-superadmin accede de verdad, ni siquiera con `compras.read`/`bodega.read` reales (Opción B de
arriba). Backend Dev extendió `InventoryController::resolveAccess()` y
`OrderStatusController::resolveAccess()`: ahora cortan el acceso de entrada para cualquier
usuario no-superadmin si el módulo está oculto por UAT, **antes** de evaluar
`compras.read`/`bodega.read`/`ventas_diseno.read` — usando el `UatVisibilityService::isModuleHidden()`
nuevo. Senior Review aprobó en paralelo (incluye tests reescritos que ahora esperan 403 para
`compras.read`/`bodega.read` real). PHPStan 0 errores, PHPUnit 1686/1686 en verde antes de esta
re-verificación.

**Alcance de esta pasada:** re-verificación acotada del hallazgo CRÍTICO específico, no el
checklist completo original — el resto (Sidebar, rama restringida de Milena, reversibilidad,
Carlos) ya estaba confirmado como "sí funciona" en la pasada anterior y solo se hizo un chequeo
rápido de no-regresión.

**Entorno:** mismo stack local (Docker :8090 + `npm run dev` :5173, levantado para esta sesión y
detenido al cerrar). Mismas cuentas reales que la pasada original: `david@grupolafayette.com`,
`mbekhar@atlantic.com.pa` (Gerencia), más `milena.e@grupolafayette.com` (`vendedor_disenador`,
rama restringida) y `carlos@atlantic.com.pa` (sin permiso relevante) para el chequeo de
no-regresión. Superadmin: `andres.loi@atlantic.com.pa` (roster de `CoreUserSeeder`).
Ocultamiento/restauración vía el endpoint real `POST /api/admin/module-visibility/bulk`
(equivalente al modal de superadmin), no por escritura directa en BD.

### Checklist re-verificado

| # | Escenario | Resultado |
|---|---|---|
| 1 | Compras oculto → David `GET /api/compras/inventory` (curl directo, JWT real) | **403** — PASA (antes: 200, bypass) |
| 2 | Compras oculto → Mark `GET /api/compras/inventory` | **403** — PASA |
| 3 | Compras oculto → Superadmin `GET /api/compras/inventory` | 200, `restricted:false` — PASA, sin afectar |
| 4 | Bodega oculto → David `GET /api/bodega/orders/status` | **403** — PASA (antes: 200, bypass) |
| 5 | Bodega oculto → Mark `GET /api/bodega/orders/status` | **403** — PASA |
| 6 | Bodega oculto → Superadmin `GET /api/bodega/orders/status` | 200 — PASA |
| 7 | David, navegador real, `/inventario` con Compras oculto | Pantalla carga sin datos (`0 productos`, "No hay productos registrados"), sin columna COSTO, sin botón "+ Crear nuevo producto" — el 403 del backend se traduce en estado vacío, ningún dato real llega al cliente. Screenshot en el registro de esta sesión (`david_inventario_hidden.png`, scratchpad) |
| 8 | Restaurar Compras+Bodega (`action:restore`) → David `GET /api/compras/inventory` | 200, `restricted:false` — acceso completo recuperado |
| 9 | Restaurar → Mark `GET /api/bodega/orders/status` | 200 — acceso completo recuperado |
| 10 | No-regresión: Milena (`ventas_diseno.read`, rama restringida) con Compras oculto → `GET /api/compras/inventory` | 403 — sigue igual que antes |
| 11 | No-regresión: Milena con Compras VISIBLE → mismo endpoint | 200, `restricted:true` — sigue en modo restringido, sin regresión |
| 12 | No-regresión: Carlos (`tecnico_servicios`, sin permiso relevante) con Compras oculto | 403 — sin relación con el estado de UAT, sin regresión |

Estado de UAT restaurado a `{"hidden_modules":[],"hidden_menu_items":[]}` (línea base) al cerrar
— confirmado con una consulta final a `GET /api/admin/module-visibility/bulk`.

### Test permanente promovido

Regla del proyecto: un smoke test que verifica un gate de permiso que ya se rompió una vez (acá
dos veces — el bug original y el primer intento de fix) no se descarta. Se agregó
`atlanticerp-frontend/e2e/preqa-scrum741-uat-backend-bypass-recheck-20260809.spec.ts` — 2 tests, vía
`APIRequestContext` (login real + toggle real de UAT + assert de status code), self-seedeado
(`beforeAll`/`afterAll` restauran el estado) y forzado a `mode: 'serial'` porque ambos tests mutan
el mismo estado global de UAT y en paralelo se pisan entre sí (visto en vivo en la primera corrida:
1 falso negativo por race condition, resuelto con `test.describe.configure({ mode: 'serial' })`).
Corrida final: 2/2 PASA.

### Veredicto de la re-verificación

**PASA LIMPIO.** El bypass real para Gerencia (David/Mark) vía `compras.read`/`bodega.read` está
cerrado tanto en Compras como en Bodega, verificado a nivel API (curl directo, no solo UI) y en
navegador real. Superadmin no se ve afectado en ningún escenario. El mecanismo sigue siendo
reversible. Ninguna regresión en la rama restringida (Milena) ni en el camino sin permiso
(Carlos). El ticket puede transicionar de `Dev Testing` a `QA`.
