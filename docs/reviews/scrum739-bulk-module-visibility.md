# Senior Review — SCRUM-739 (UAT-2: ocultar/restaurar módulos y accesos en bloque)

**Veredicto: 🟢 APROBADO**
**Fecha:** 2026-08-07
**Revisor:** Senior Reviewer (subagente)
**Visual Review:** N/A — ticket sin adjunto/mockup en Jira (`jira_get_attachments` → `attachments: []`).

> ⚠️ **Este documento reemplaza por completo la revisión anterior del mismo ticket** (que
> aprobaba un diseño distinto, ya descartado). La primera implementación reusaba el mecanismo de
> override individual de SCRUM-724 (`UserModuleVisibility`/`UserModuleMenuVisibility`) para el
> bulk, escribiendo una fila por usuario. Pre-QA encontró un hallazgo real (MEDIO, ver
> `docs/pre-qa/scrum739-bulk-module-visibility-20260807.md`): un `restore` masivo no podía
> distinguir "override creado por el bulk" de "override individual preexistente sin relación con
> UAT", y podía borrarlo en silencio. El código de esa primera implementación (`UserService::
> bulkSetModuleVisibility()`, `tests/Feature/Auth/UserModuleVisibilityBulkControllerTest.php`) ya
> no existe en el working tree — fue reemplazado, no parcheado. Esta revisión es sobre el diseño
> nuevo exclusivamente.

## Alcance revisado (diseño nuevo)

Backend (`atlanticerp-backend`, working tree sobre `dev`, sin commitear):
- `app/Modules/Auth/Services/UatVisibilityService.php` (nuevo) — lee/escribe `SystemSetting`
  (claves `uat_hidden_modules`/`uat_hidden_menu_items`), nunca toca
  `UserModuleVisibility`/`UserModuleMenuVisibility`.
- `app/Models/User.php` — máscara aplicada en `modulesPayload()` (línea 402) y
  `menuVisibilityPayload()` (línea 473), después del override individual de SCRUM-724, sin
  tocarlo ni borrarlo; nuevo `isSuperadminForVisibility()` privado.
- `app/Modules/Auth/Http/Controllers/UserController.php` — `bulkModuleVisibilityState()` (GET) +
  `bulkModuleVisibility()` (POST), inyecta `UatVisibilityService`.
- `app/Modules/Auth/Services/UserService.php` — se borró el `bulkSetModuleVisibility()` viejo y su
  helper; queda solo `isSuperadmin()` extraído para `roleDerivedVisibility()` (sin relación
  directa con el bulk nuevo, que vive en su propio servicio).
- `routes/admin.php` — `GET`/`POST /admin/module-visibility/bulk`, dentro del grupo
  `permission:superadmin.all` (línea 54-55), mismo nivel que el resto de SCRUM-724.
- `tests/Feature/Auth/UatVisibilityControllerTest.php` (nuevo, 8 tests) — reemplaza el archivo de
  tests de la primera implementación (ya borrado).

Frontend (`atlanticerp-frontend`, working tree sobre `dev`, sin commitear):
- `src/api/usersApi.ts` — `moduleVisibility.bulk.{get,set}`, contrato
  `{hidden_modules, hidden_menu_items}` (reemplaza el `{affected_users}` de la primera versión).
- `src/components/security/BulkModuleVisibilityModal.tsx` (reescrito) — precarga con GET, checkbox
  para "Configuración" vía ítem sintético `{module:'configuracion', key:'root'}`.
- `src/config/menuItemCatalog.ts`, `src/pages/security/UsersPage.tsx`,
  `src/pages/ventas-diseno/CatalogPage.tsx`, `src/i18n/locales/{es,en}/security.json`.
- `src/components/Sidebar.tsx` — fix real encontrado en vivo (ver abajo).
- `src/components/security/BulkModuleVisibilityModal.test.tsx` (reescrito, 5 tests),
  `src/components/Sidebar.test.tsx` (+1 test nuevo).

## Checklist de diseño

**1. La máscara nunca escribe en `UserModuleVisibility`/`UserModuleMenuVisibility`** — ✅
`grep -n "UserModuleVisibility\|UserModuleMenuVisibility" UatVisibilityService.php` da cero
resultados de código, solo aparecen nombrados en el docblock explicando por qué el mecanismo los
evita. `UatVisibilityService::apply()` solo llama `SystemSetting::updateOrCreate()` dos veces
(`uat_hidden_modules`, `uat_hidden_menu_items`). Confirmado también por
`test_hide_nunca_escribe_en_user_module_visibility` (asserta `UserModuleVisibility::count() === 0`
tras un hide).

**2. Superadmin 100% exento en los 3 puntos** — ✅
- `modulesPayload()` (línea 366-371): `return $payload` con las 4 capacidades en `true` para los 7
  módulos ANTES de llegar a la máscara UAT (línea 402) — el superadmin ni pasa por ese código,
  estructuralmente exento, no por un chequeo condicional que podría faltar.
- `menuVisibilityPayload()` (línea 473): `if (! $this->isSuperadminForVisibility())` envuelve el
  loop de la máscara explícitamente.
- `isSuperadminForVisibility()` reusa `roleIds()`, que ya incluye roles adicionales (multi-rol) —
  mismo criterio que `canViewTeamV2()`/`modulesPayload()`, así que un superadmin por rol adicional
  también queda exento, no solo el rol base.
- Ligera duplicación del patrón `Role::whereIn('id', $roleIds)->where('is_superadmin', true)
  ->exists()` en 3 sitios de la clase (`canViewTeamV2`, `modulesPayload`, `isSuperadminForVisibility`)
  — preexistente al diff, no una regresión introducida por este ticket; no lo considero bloqueante.

**3. Escenario exacto de Pre-QA (override individual preexistente sobrevive a hide→restore)** — ✅
`test_restore_no_borra_un_override_individual_preexistente_del_mismo_modulo` monta el caso real:
un admin restringe `servicios` a NONE para designer (override SCRUM-724 normal, sin relación con
UAT), corre un ciclo `bulk hide → bulk restore` de `servicios`, y verifica que la fila de
`UserModuleVisibility` sigue existiendo intacta y que el módulo sigue oculto para el usuario
(`view === false`, porque la máscara UAT nunca se restauró para él — el ciclo completo de UAT
hide→restore no cambia lo que el override individual ya decidía). Corrí este test en particular:
pasa. Esto es precisamente lo que hace el bug estructuralmente imposible: la máscara y el override
individual son dos capas independientes que nunca se leen ni se escriben entre sí.

**4. Ítem sintético `configuracion`/`root`, validación laxa de `menuItems.*.module`** — evaluado,
no bloqueante. `UserController::bulkModuleVisibility()` valida `modules.*` con
`Rule::in(ModuleCatalog::keys())` pero `menuItems.*.module` solo con `['required','string','max:60']`
— sin restringir a un allowlist. Es intencional: `configuracion` no es parte de
`ModuleCatalog::keys()` (Configuración se gatea por permiso, no por el catálogo de 7 módulos), así
que un `Rule::in(ModuleCatalog::keys())` ahí rompería el caso de uso real. Mi juicio: aceptable tal
cual —
  - el endpoint entero ya exige `permission:superadmin.all`, el actor ya puede hacer operaciones
    más invasivas que escribir un string arbitrario en una tabla de configuración de UI;
  - un `module`/`key` inventado no tiene ningún efecto real: `modulesPayload()` solo actúa si
    `array_key_exists($hiddenModule, $payload)` (los 7 keys reales), y `menuVisibilityPayload()`
    simplemente agrega una entrada a un array que ningún componente del frontend lee si el
    `module`/`key` no coincide con nada consultado — dato inerte, no una superficie de escalación;
  - un allowlist explícito (`Rule::in([...ModuleCatalog::keys(), 'configuracion'])`) sería una
    mejora de higiene (evita basura acumulándose en `system_settings` ante un bug de frontend),
    pero no es un blocker de seguridad ni de correctness — sugerido como fix chico opcional, a
    discreción de Backend Dev/PM.

**5. `updated_by` vía `$request->attributes->get('jwt')['sub']`** — ✅ confirmado consistente con
el resto del controller: `UserController::actorContext()` (línea 306) usa exactamente el mismo
patrón (`$request->attributes->get('jwt')`, chequeo `is_array`+`isset($payload['sub'])`), igual
que `SettingsController::resolveUser()` y `MfaController::resolveUser()`. Este proyecto no usa el
guard estándar de Laravel (`auth()->id()` no aparece en ningún controller de Auth) — el patrón
`bulkModuleVisibility()` es el correcto para este codebase, no una desviación.

**6. PHPStan Level 8** — `vendor/bin/phpstan analyse --memory-limit=1G app/Modules/Auth
app/Models/User.php` → **0 errores** (51 archivos analizados).

**7. Tests corridos por este revisor**:
- Backend filtrado: `infra/test.sh --filter="UatVisibility|UserModuleVisibility"` →
  **15/15 tests, 66 assertions, OK**.
- Backend completo: `infra/test.sh` → **1668/1668 tests, 6790 assertions, OK** — sin regresión.
- Frontend: `npm run test -- --run` → **962/962 tests, 92 archivos, OK** (incluye los 5 tests
  nuevos de `BulkModuleVisibilityModal.test.tsx` reescrito y el test nuevo de `Sidebar.test.tsx`).
- `npx tsc --noEmit` → sin errores.

## Los 2 fixes encontrados en vivo durante la validación en navegador

**Fix 1 — `BulkModuleVisibilityModal.tsx`, pérdida de selección en curso.** El `useEffect` de
precarga corría en cualquier refetch de fondo (foco de ventana, reconexión), pisando checkboxes ya
marcados a mano. Fix: `useRef<boolean>` (`hydrated`) que hidrata desde `data` una sola vez, más
`refetchOnWindowFocus: false, refetchOnReconnect: false` en la query.
Evaluación: correcto. Verifiqué la pregunta que me plantearon explícitamente — ¿qué pasa si el
superadmin cierra y reabre el modal? En `UsersPage.tsx:444-446` el modal se renderiza
condicionalmente (`{bulkVisibilityOpen && <BulkModuleVisibilityModal .../>}`), así que cerrar
desmonta el componente por completo; al reabrir se crea una instancia nueva con `hydrated.current`
reseteado a `false`, y el efecto vuelve a hidratar desde el `data` vigente en caché de TanStack
Query (que además ya quedó actualizado por `qc.setQueryData(...)` en el `onSuccess` de la mutación
anterior). No hay ninguna ruta donde el ref sobreviva con un valor stale entre aperturas — el
fix es sólido y no introduce el problema que le pregunté.

**Fix 2 — `Sidebar.tsx`, "Configuración" nunca se conectó a la máscara nueva.** `canSeeSecurity`
gateaba solo por permiso (`security.users`/`security.levels`), ignorando
`menuVisibility.configuracion.root`. Encontrado probando con una cuenta de Gerencia (tiene el
permiso) en vez de Vendedor/Diseñador (nunca lo tiene, hubiera dado falso positivo). Fix:
`&& user?.menuVisibility?.configuracion?.root !== false`.
Evaluación: correcto y bien testeado — el criterio "ausencia = visible, solo `false` explícito
oculta" es el mismo que usa el resto del Sidebar (`isMenuEntryVisible`) y `CatalogPage.tsx`, así
que no introduce un criterio nuevo a mantener. El test agregado en `Sidebar.test.tsx`
(`'con permiso security.users pero configuracion.root oculto por UAT, no muestra Configuración'`)
usa exactamente el escenario que hubiera dado falso positivo (permiso presente, máscara activa) —
cubre de verdad el caso que el testing manual encontró, no un caso trivial.

## Conclusión

El rediseño cumple el objetivo explícito: el bug de Pre-QA (restore masivo pisando un override
individual preexistente) queda estructuralmente imposible, no mitigado — la máscara UAT vive en un
storage completamente distinto (`system_settings`) del mecanismo individual
(`user_module_visibility`/`user_module_menu_visibility`) y nunca lee ni escribe ese storage.
Superadmin exento en los 3 puntos de aplicación, con un caso estructural (early return) y dos
casos por chequeo explícito. El único punto de validación laxo (`menuItems.*.module` sin
`Rule::in`) es intencional y sin impacto real dado el gate de `superadmin.all` en el endpoint
completo. Los 2 fixes de frontend encontrados en vivo son sólidos, con test dedicado para el de
Sidebar. Sin regresiones: PHPStan Level 8 limpio, 1668/1668 tests backend, 962/962 frontend, tsc
limpio.

**Aprobado. Visual Review N/A (sin mockup adjunto en Jira). Pasa a Pre-QA** (para confirmar el
escenario de ruptura contra el diseño nuevo — el hallazgo documentado en
`docs/pre-qa/scrum739-bulk-module-visibility-20260807.md` es sobre el diseño viejo ya descartado,
Pre-QA debe re-correr el checklist completo sobre este diseño).
