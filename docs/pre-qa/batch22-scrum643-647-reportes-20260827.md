# Pre-QA — Batch 22 Admin&Cont (SCRUM-643→647, REQ-566→570) — home de Reportes

Corrido en LOCAL (`localhost:5173` + `localhost:8090`), stack Docker + Vite dev server, no
dev.atlanticerp.ai (código sin desplegar todavía). Backend/Frontend implementados, Senior Review ya hecho
(1 bug de label de comisión y 1 glyph de emoji en i18n corregidos antes de esta pasada).

## CRÍTICO encontrado y corregido en el momento (loop cerrado, no queda pendiente)

**Gate de rol de `/admin-contab/reportes` en el frontend era más permisivo que el backend —
`vendedor_disenador` llegaba a la pantalla completa por URL directa.**

El comentario original en `App.tsx` (Batch 22) asumía que el rol `vendedor_disenador` no tiene
`admin_contab.view` y por eso no hacía falta un `RequireRole` adicional — falso: ese rol SÍ tiene
`admin_contab.view=true` en su JWT real (lo necesita para ver su propio historial de Comisiones
Internas, Batch 14/15), así que la ruta `RequirePermission permission="admin_contab.view"` sola lo
dejaba pasar. Confirmado con la cuenta real `neil.quiel@illuminations.com.pa` (rol
`vendedor_disenador`):

- El sidebar mostraba "Reportes" bajo Admin. & Contab. (item plano, sin gate por-ítem, mismo
  criterio que el resto del menú — ver comentario de Sidebar.tsx).
- La ruta montaba `ReportesPage` completa: título, subtítulo, selector de período y los 5 títulos
  de tarjeta visibles.
- Las 4 queries (`felix-commission`, `cartera`, `ventas`, `flujo-caja`) SÍ estaban bloqueadas
  correctamente por el backend (`role:superadmin,lider_admin_contab,asistente_administrativa,
  management` en `routes/admin-contab.php`) — 403 en las 4, confirmado con `curl` directo y con
  Playwright (0 datos reales expuestos). Pero como el frontend usa
  `isLoading || !data ? <skeleton> : ...`, una query en error dejaba el skeleton de carga
  girando para siempre — pantalla rota, alcanzable por un rol que el propio ticket excluye.

**No es fuga de datos** (todas las cifras monetarias reales quedaron bloqueadas por el backend en
las 4 rutas), pero sí un gate de navegación real incumplido — mismo patrón ya encontrado y
corregido una vez en `/crm/dashboard` (SCRUM-674, 2026-07-31, ver comentario en `App.tsx`).

**Fix aplicado en el momento** (`atlanticerp-frontend/src/App.tsx`, ruta `/admin-contab/reportes`):
anidar `RequireRole roles={['superadmin', 'lider_admin_contab', 'asistente_administrativa',
'management']}` dentro del `RequirePermission permission="admin_contab.view"` ya existente —
mismo mecanismo, mismo roster que el backend. Sin cambios de backend (el 403 ya era correcto).

**Re-verificación tras el fix** (checklist completo, no solo el punto que falló):
- `neil.quiel@illuminations.com.pa` → redirigido a su home real (`/ventas-diseno/home`) antes de
  montar `ReportesPage`; **0** requests a `/api/admin-contab/reports/*` disparados (antes había 4,
  todas 403); texto "Comisión por gestión de cartera +90 días" ya no aparece en el DOM.
- Felix/Yaneth/Mark siguen entrando sin regresión — confirmado con Playwright tras el fix.
- `npx vitest run src/pages/admin-contab/` → 147/147 tests OK (12 archivos, incluye
  `ReportesPage.test.tsx`) — sin regresión en el resto del módulo por el cambio en `App.tsx`.
- Test promovido a permanente: `e2e/preqa-scrum643-647-reportes-role-gate.spec.ts` (mismo criterio
  que `preqa-scrum684-689-dashboard-crm-batchc.spec.ts` — gate que ya se rompió una vez).

## Lo que se intentó romper y NO se rompió

- **RN4/RN3 (selector de período nunca recalcula Comisión Felix/Cartera)** — confirmado a 3
  niveles: query keys fijas en `useAdminContab.ts` (`REPORTS_FELIX_COMMISSION_KEY`/
  `REPORTS_CARTERA_KEY` sin `periodo`), test de vitest (`ReportesPage.test.tsx`, mockea las 4 APIs
  y cuenta invocaciones antes/después de cambiar el selector), y Playwright real contra
  `localhost:5173` capturando XHR reales — 0 requests a `felix-commission`/`cartera` tras cambiar
  a "6 meses". Probado también con doble/triple cambio rápido de selector (3m→6m→año) sin
  disparar pedidos descontrolados ni quedar en un estado inconsistente — la última selección
  siempre gana.
- **RN2 REQ-566 ("Año" = año a la fecha, no 12 meses fijos)** — hoy es 2026-08-27; `periodo=anio`
  devuelve exactamente 8 meses (Ene→Ago 2026), confirmado por API directa.
- **RN4 REQ-567 / corte de mes calendario de la comisión de Felix** — `over90DaysCollectedForCurrentMonth()`
  filtra por `whereBetween('created_at', [monthStart, monthEnd])` sobre el pago, no sobre "últimos
  30 días" — confirmado leyendo el código y con el test PHPUnit
  `test_cobrado_90_dias_solo_cuenta_pagos_de_facturas_vencidas_hace_mas_de_90_dias` (factura vieja
  sin pagar cuenta como "pendiente", no "cobrado"; factura vencida hace solo 20 días al momento del
  pago NO cuenta aunque hoy ya tenga más de 90 días).
- **Los 3 tramos de comisión con el actual resaltado** — probado con datos reales sembrados
  (`$8,400` → tramo 1, luego `$17,000` → tramo 2 "$15K–$19K" con `es_actual=true` solo en ese
  tramo) — confirmado por API y visualmente (captura, ver Visual Review).
- **RN2 REQ-568 (solo cartera cobrable, nunca incobrable aprobada)** — `agingBuckets()` ya
  filtraba `es_incobrable=false` antes de este batch, reusado tal cual (mismo método que expone
  Facturación) — sin duplicación de lógica que pudiera divergir.
- **RN3 REQ-569 (variación % solo si hay mes anterior visible)** — dos casos reales probados: mes
  anterior con total $0 → variación oculta (guardia `previo.total === 0`, ningún `Infinity%` ni
  `NaN%` en pantalla); mes anterior con total >0 → `+100% vs. mes anterior` en teal, color-coded.
  El caso literal de RN3 (`meses.length < 2`) solo es alcanzable en producción con "Año" en enero —
  no reproducible hoy sin manipular el reloj del servidor; confirmado por lectura de código
  (`variacion` en `ReportesPage.tsx` retorna `null` si `data.meses.length < 2`) y es la misma
  guardia que ya cubre el caso de mes-anterior-en-cero.
- **RN2 REQ-570 (saldo hoy/proyectado 30d nunca dependen del período)** — mismos 2 valores
  visibles sin cambiar en "Hoy"/"6 meses"/"Año" (confirmado visualmente); backend los arma una sola
  vez (`header()`+`projected(30)`) fuera del branch de período.
- **RN1 REQ-570 (gráfico de flujo neto, no entradas/salidas por separado)** — confirmado: el bar
  chart de meses solo grafica `neto` (color condicional verde/rojo según signo); el desglose
  entradas/salidas solo aparece como texto en el KPI "Hoy", no como serie separada en el gráfico.
- **Gate `mark_only` de los tramos de comisión** — Felix/Yaneth/Designer → 403 en POST/PUT/DELETE;
  Mark → 201/200/204. Confirmado con `curl` directo (no solo UI oculta) contra los 3 verbos.
- **Reload a mitad de flujo** — cambiar el selector a "Año" y recargar la página vuelve a "Hoy"
  (RN1, sin persistencia de estado a medio camino, tal como se espera de un `useState` local sin
  querystring ni localStorage).
- **Dark mode** — sanity check visual, sin roturas de contraste ni layout.
- **Input/rol inválido en query param `periodo`** — `?periodo=semana` → 422 en ambos endpoints
  (`ventas`/`flujo-caja`), confirmado por PHPUnit y por `curl` directo.

## Paso 0 (permisos angostos / valores paramétricos) — sin hallazgos nuevos

- Los 3 tramos de comisión ($15K/1%, $15K–19K/1.5%, ≥20K/2%) viven en tabla paramétrica real
  (`cartera_commission_tiers`) con CRUD `mark_only` — no hardcodeados. Confirmado con Mark
  pudiendo crear/editar/borrar un tramo de prueba (limpiado después).
- El roster amplio (Felix/Yaneth/Mark) de las rutas GET ya estaba correctamente concedido vía rol
  base (`lider_admin_contab`/`asistente_administrativa`/`management`), sin necesidad de
  `extra_permissions` puntuales — no aplica el gap de `SpecialPermissionSeeder.php`.

## Backend

- `infra/test.sh --filter=AdminContReportsControllerTest` → **15/15 tests OK**, 62 assertions.
- PHPStan (Level 8) sobre los 7 archivos nuevos/tocados del batch → **0 errores**.

## Frontend

- `npx vitest run src/pages/admin-contab/` (12 archivos, incluye `ReportesPage.test.tsx`) →
  **147/147 tests OK**.

## Veredicto

**Pasada limpia y concluyente** tras el fix del gate de rol (loop cerrado en la misma sesión, sin
quedar como pendiente). Listo para pasar a QA formal una vez commiteado/pusheado.
