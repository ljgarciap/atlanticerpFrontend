# Pre-QA — SCRUM-739 (UAT-2: Ocultar/restaurar módulos y accesos en bloque)

> **Reemplaza la versión anterior de este mismo archivo**, que era sobre una primera
> implementación DESCARTADA (bulk vía `UserModuleVisibility`, override individual de SCRUM-724
> reusado para el bulk). Esa pasada encontró el hallazgo que motivó el rediseño — ver Ronda 1.

Fecha: 2026-08-07
Vueltas: 2 (1ra pasada sobre el diseño descartado, encontró el hallazgo real; diseño rediseñado
por completo; 2da pasada sobre el diseño nuevo, limpia).

## Contexto

`GET/POST /api/admin/module-visibility/bulk` — superadmin oculta/restaura de una sola vez, para
TODOS los usuarios no-superadmin, los 7 módulos de negocio + "Configuración" + 2 botones dentro de
Catálogo, según la etapa de UAT en curso. Puramente cosmético — `CheckPermission` sigue siendo la
autoridad real de rutas backend, ningún permiso cambia.

## Ronda 1 (diseño descartado) — hallazgo real

La primera implementación reusaba `UserModuleVisibility`/`updateModuleVisibility()` de SCRUM-724
(override individual por usuario) para el bulk, escribiendo una fila por usuario. **Hallazgo real**
(clasificado MEDIO en su momento): un `restore` masivo no podía distinguir "override creado por el
bulk-hide" de "override individual preexistente sin relación con UAT" — reproducido en runtime
(tinker, usuario real `milena.e@grupolafayette.com`): un override manual de `servicios=NONE`
(puesto por una razón ajena a UAT) sobrevivía a un `hide` pero se BORRABA en el `restore` posterior
del mismo módulo, devolviéndole al usuario un acceso que el admin explícitamente no quería para él.

A pedido de Luis, en vez de quedar como deuda documentada, se resolvió con un rediseño completo.

## Ronda 2 (diseño nuevo) — rediseño verificado

Reemplazo completo: `UatVisibilityService` (nuevo), vive en `SystemSetting` (`uat_hidden_modules`/
`uat_hidden_menu_items`), aplicado como máscara de solo lectura en `User::modulesPayload()`/
`menuVisibilityPayload()`, **nunca escribe en `UserModuleVisibility`/`UserModuleMenuVisibility`** —
el bug de la ronda 1 queda estructuralmente imposible, no solo mitigado.

Senior Review ya aprobó este diseño (🟢, sin blockers): 1668/1668 tests backend + 962/962 frontend,
PHPStan Level 8 limpio, confirmó por código y por test dedicado
(`test_restore_no_borra_un_override_individual_preexistente_del_mismo_modulo`) que el escenario de
la ronda 1 ya no puede reproducirse.

### Escenario central re-verificado en esta ronda

Confirmado de nuevo contra el código nuevo — el test backend dedicado (corrido en esta sesión,
pasa) prueba exactamente el mismo escenario que rompió la ronda 1 (override manual de `servicios`
sobreviviendo a un ciclo hide→restore), y por diseño: `UatVisibilityService::apply()` nunca toca
`user_module_visibility`, así que no hay forma de que un `restore` masivo pise un override
individual, sin importar cuándo se haya creado ese override ni qué valor tenga.

### Camino feliz — confirmado en navegador real (Playwright, cuentas reales del roster)
- Hide de Compras/Bodega/Servicios/Configuración + 2 botones de Catálogo → confirmado oculto para
  `milena.e@grupolafayette.com` (Vendedor/Diseñador, Catálogo) y `daniela@illuminations.com.pa`
  (Gerencia, Configuración/Seguridad — cuenta elegida a propósito porque SÍ tiene el permiso
  `security.users`, a diferencia de Milena, que nunca lo tiene y hubiera dado un falso negativo).
- Restore → todo vuelve, confirmado con las mismas 2 cuentas.
- Superadmin (`lujogarpin78@gmail.com`) nunca se ve afectado en ningún punto del ciclo.

### 2 bugs reales encontrados y corregidos durante esta validación (wiring de UI, no el backend)
1. **`BulkModuleVisibilityModal.tsx`** — el `useEffect` de precarga se re-ejecutaba en cualquier
   refetch de fondo (foco de ventana, reconexión), pisando checkboxes ya marcados antes de guardar.
   Fix: hidratación única (`useRef`) + `refetchOnWindowFocus:false, refetchOnReconnect:false`.
2. **`Sidebar.tsx`** — "Configuración" nunca se conectó a la máscara nueva: `canSeeSecurity` gateaba
   solo por permiso, ignorando `menuVisibility.configuracion.root`. El backend ya guardaba bien el
   ocultamiento, pero el frontend lo ignoraba — encontrado al usar una cuenta real CON el permiso en
   vez de una sin él (que hubiera dado un falso positivo). Fix: `&&
   user?.menuVisibility?.configuracion?.root !== false`, con test dedicado en `Sidebar.test.tsx`.

### Camino de ruptura — verificado en esta ronda

| Escenario | Método | Resultado |
|---|---|---|
| `403` sin `permission:superadmin.all` (GET y POST) | test backend dedicado | ✅ |
| `422` con módulo inválido | test backend dedicado | ✅ |
| Bulk-hide del mismo módulo 2 veces seguidas | tinker directo a `UatVisibilityService::apply()` | `hidden_modules` queda `["servicios"]`, sin duplicados (`->unique()`). ✅ |
| Usuario con rol base NO-superadmin + rol adicional superadmin (`user_additional_roles`) | tinker directo | Exento correctamente — `servicios.view` da `true` (nunca lo oculta) pese a que `servicios` estaba oculto por UAT en ese momento para el resto. ✅ |
| Doble clic en "Ocultar para todos" | Playwright (spec permanente) | Botón con `disabled={mutation.isPending}` + backend idempotente — sin error, sin duplicado. ✅ |
| No pisa overrides individuales preexistentes de OTROS módulos | test backend heredado de la ronda 1 (`test_hide_no_pisa_un_override_individual_preexistente_de_otro_modulo`) — sigue aplicando, el mecanismo de overrides individuales no cambió | ✅ |
| Restore masivo vs. override individual preexistente del MISMO módulo (el hallazgo de la ronda 1) | test backend dedicado + verificación conceptual (el servicio nunca toca esa tabla) | ✅ ya no reproduce — estructuralmente imposible |

## Smoke test permanente

`atlanticerp-frontend/e2e/preqa-scrum739-bulk-module-visibility-20260807.spec.ts` — camino feliz completo
(hide→verificar oculto→restore→verificar restaurado, con Servicios y una cuenta real de Vendedor/
Diseñador) + doble clic. Se promueve a permanente porque es exactamente el tipo de gate (flujo de
visibilidad ya roto una vez en la ronda 1) que no se borra al terminar Pre-QA. Ajustado en esta
ronda para reflejar el copy real del mensaje de confirmación ("Guardado — ...") y el hecho de que
el modal precarga el checklist con lo ya oculto (no hace falta re-marcar antes de "Restaurar").

## Lo que sí funciona (resumen)
- Hide/restore de los 7 módulos + Configuración + 2 botones de Catálogo, para todos los usuarios no-
  superadmin de una sola vez, sin tocar overrides individuales de SCRUM-724.
- Superadmin exento en todos los casos probados (directo y multi-rol).
- Idempotente, sin duplicados, sin errores en doble clic.
- 403/422 correctos para acceso sin permiso / input inválido.

## Veredicto

**Pasada limpia. Sin hallazgos bloqueantes ni MEDIO pendientes** — el único MEDIO real de esta saga
(ronda 1) quedó resuelto por rediseño, no diferido. Listo para `QA`.
