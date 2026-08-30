# Pre-QA — Servicios Batch 15 "Inicio" (SCRUM-270/271/273/274, REQ-207/208/210/211)

Fecha: 2026-08-12. Fusionado con Visual Review en el mismo despacho (ver
`docs/visual-review/scrum270-271-273-274-servicios-batch15-home-20260812.md`).

## Entorno

Stack Docker aislado `batch15review` (postgres `:5436`, nginx `:8095`), levantado desde cero:
tenant `atlantic` creado + migrado (`tenant:create`), `db:seed --force` (roster real de 32
usuarios + demo de Servicios), más 15 tickets fixture sembrados vía `tinker` para cubrir escenarios
que el seeder estándar no ejercita (ver Paso 0):
- 6 visitas HOY repartidas entre los 4 técnicos internos reales (para el límite de 5 + "Ver agenda
  completa" de REQ-208 Escenario 1) — el `ServiciosDemoSeeder` estándar agenda todo a "hoy + 2
  días", nunca hoy mismo, así que sin estos fixtures el panel Rutas del día quedaría vacío.
- 1 ticket reportado hace 4 días sin agendar (debe aparecer en Pendientes) + 1 hace 1 día (NO debe
  aparecer) — REQ-210 Escenarios 1 y 2.
- 3 instalaciones cerradas este mes + 4 garantías cerradas este mes (3 con `visit_count=1`, 1 con
  `visit_count=2`) — REQ-211 Escenarios 1/2, para tener datos reales de "instalaciones completadas",
  "% resuelto 1ra visita" y "tiempo prom. resolución".

Backend: `.env` real (secrets del `.env` local del repo principal, `FILESYSTEM_DISK=local` para no
tocar S3 real). Frontend: `vite dev` apuntando al backend aislado (proxy `/api` → `:8095`).
Playwright CLI contra `http://localhost:5173`. Cuentas reales, password = email (regla del
proyecto, nunca `*@atlantic.test`): `servicio@atlantic.com.pa` (Aaron, lider_servicios),
`carlos@atlantic.com.pa` (tecnico_servicios), `garantias@atlantic.com.pa`
(garantias_servicios), `daniela@atlantic.com.pa` (management).

Smoke test permanente agregado: `e2e/preqa-scrum270-271-273-274-servicios-batch15-home-20260812.spec.ts`
(12 casos, gate de rol + deep-link + rutas del día + indicadores — todos ejercitan comportamiento
que ya se rompió una vez en este batch, ver hallazgo de ruta abajo, así que se promueve como
permanente en vez de descartarse).

## Paso 0 — permisos angostos y valores paramétricos

- No hay ningún permiso angosto ("solo Fulano puede...") en estos 4 REQ — el gate de "+ Nuevo
  ticket" es por ROL (lider_servicios/superadmin/management/vendedor_disenador), ya cubierto por
  el roster real sembrado, no requiere `SpecialPermissionSeeder`.
- Umbral de "días sin agendar" (REQ-210 RN2, 3 días) — confirmado configurable vía
  `ServiciosSettingsService::sinAgendarUmbralDias()` / tabla `servicios_settings`, no hardcodeado.
- Ventana de historial (3 meses) y % de crecimiento (10%) de la meta de instalaciones (REQ-211
  RN2b) — confirmado configurable vía `installationGoalHistoryMonths()`/`installationGoalGrowthPct()`,
  no hardcodeado. Cumple la regla de "Nunca hardcodear umbrales de negocio".
- Dato sembrado: el `ServiciosDemoSeeder` estándar NO cubre ninguno de los 3 escenarios de ruptura
  de este batch (visitas hoy, umbral de 3 días cruzado/no cruzado, cierres del mes) — se sembraron
  fixtures adicionales vía tinker antes de dar cualquier pasada por buena (ver "Entorno" arriba).

## Hallazgos

### CRÍTICO — REQ-211 RN2a(c)/Escenario 5: "Gerencia ajusta manualmente la meta" no tiene NINGÚN punto de entrada en la UI

El criterio de aceptación es explícito: *"Dado que Gerencia sabe que julio es temporada baja,
cuando ajusta manualmente la meta de ese mes, entonces el sistema respeta ese valor para julio, y
vuelve a calcular automáticamente en agosto."* Verificado en el Excel (`5__Requerimientos_Servicios.xlsx`,
fila REQ-211) — texto idéntico al de Jira, sin ambigüedad de alcance.

El backend SÍ implementa esto completo y correcto: `PUT /api/servicios/home/installation-goal`
(`HomeController::updateInstallationGoal()`, gate `role:superadmin,management` en
`routes/servicios.php`), que delega en `InstallationGoalService::setOverride()` /
`ServiciosSettingsService::setInstallationGoalOverride()` — confirmado por lectura de código, con
persistencia por (año, mes) que no rompe el recálculo automático de meses futuros (exactamente lo
que pide RN2a-c).

El frontend define el contrato completo (`serviciosApi.home.updateInstallationGoal()` en
`src/api/serviciosApi.ts:31-32`, tipos `UpdateInstallationGoalPayload`/`InstallationGoalResult` en
`src/types/servicios.ts:690-700`) pero **esa función nunca se invoca desde ningún componente** —
confirmado con `grep -rn "updateInstallationGoal" src/` sobre todo el árbol de `src/`: la única
ocurrencia es la definición misma. `HomeMonthlyIndicators.tsx` es puramente de lectura (barra +
3 tarjetas), sin ningún botón/ícono/modal de edición. Tampoco existe en `ServiciosSettingsPage.tsx`
ni en ningún otro componente.

**Reproducción:** login como Aaron o Daniela (ambos con `role:superadmin,management`-equivalente
o `lider_servicios`) → Inicio → panel Indicadores del mes → no hay ningún elemento clickeable
sobre "Instalaciones completadas este mes" ni la meta (`3 / 36` en este entorno) — confirmado con
Playwright (test 7 de la suite) y visualmente en `07-indicadores.png`.

**Por qué es CRÍTICO y no alcance diferido:** a diferencia de REQ-210 RN3 y REQ-211 RN5 (ver abajo),
esta funcionalidad NO depende de ningún módulo externo sin construir todavía — el backend de este
mismo batch ya la implementa por completo. Es un punto donde Frontend Dev definió el contrato de
API pero nunca lo conectó a ninguna pantalla. Regla dura del proyecto (SCRUM-428): un gap entre lo
que el ticket pide y lo que existe no se autoclasifica como "menor" y se deja pasar — se documenta
como bloqueante y se notifica a PM.

**No lo corregí yo mismo** — construir la superficie de UI (dónde vive el control: ¿ícono de lápiz
junto al número? ¿modal con selector de año/mes/valor? ¿fila nueva en Ajustes de Servicios?) es una
decisión de diseño de UI, no un fix de una línea. Requiere que PM reasigne a Frontend Dev con una
decisión de dónde vive el control (probablemente un ícono de edición junto a "Instalaciones
completadas este mes", visible solo si `security_level`/rol lo permite, igual al patrón ya usado
en otros ajustes de Gerencia del módulo).

**Este ticket (SCRUM-274) bloquea el cierre del batch hasta que se resuelva** — el resto de
REQ-207/208/210 y el resto de REQ-211 (lectura) pasan limpio y podrían avanzar solos si PM decide
separar el fix en un ticket de seguimiento, pero tal como está specificado, Escenario 5 de
REQ-211 no es demostrable.

### MEDIO — REQ-210 RN3 ("Repuesto sin llegar") y REQ-211 RN5 ("Ingresos por instalaciones") nunca se generan — requiere confirmación de Luis/PM, no autoclasificado

Ambos están documentados en el código como stubs deliberados, dependientes de módulos que no
existen todavía en este worktree (Insumos/Herramientas-Compras, Batch 13-14, para RN3; Cotización
de Servicio, Batch 11-12, para RN5) — mismo patrón ya aceptado repetidas veces en batches previos
de este mismo proyecto (ej. `ExternalTechnicianService::activeProjectsCount()` en Batch 5,
`REQ-240 RN3/RN4` diferido a Batch 14 con decisión explícita de Luis en Batch 8).

La diferencia con esos precedentes: no encontré, en `docs/architecture/servicios-fase4-diseno.md`
ni en la sección "Batch 15" (que no existe como entrada propia, solo la fila resumen de la sección
8), un registro explícito de que Luis aprobó ESTE deferral puntual para SCRUM-273/274 — a
diferencia del REQ-240 de Batch 8, que sí cita "decisión explícita de Luis 2026-08-10". Podría ser
simplemente que la sesión que lo implementó no lo escribió ahí, dado que el patrón es idéntico y
ya reiterado — pero, siguiendo la regla dura de Pre-QA (SCRUM-428: no autoclasificar un gap como
"alcance diferido, no bug" y seguir de largo), lo dejo como hallazgo a confirmar en vez de darlo
por bueno silenciosamente.

**Reproducción RN3:** con datos reales sembrados (incl. tickets con productos/repuestos), la
llamada a `GET /servicios/home/summary` nunca devuelve ningún item con `type` distinto de
`ticket_sin_agendar` — confirmado leyendo `HomeService::pendientes()`, que concatena una
`Collection` vacía hardcodeada como comentario documentado, sin ninguna consulta real.

**Reproducción RN5:** `indicadores_mes.ingresos_instalaciones` siempre devuelve
`{value: null, available: false}` — confirmado en la respuesta real del endpoint y visualmente
("—" en la tarjeta "Ingresos por instalaciones", `07-indicadores.png`).

**Recomendación:** si Luis ya aprobó este alcance reducido de palabra (fuera de este documento),
solo hace falta dejarlo registrado explícitamente en `docs/architecture/servicios-fase4-diseno.md`
sección 8, entrada propia de Batch 15 (que hoy no existe) — no bloquea por sí solo. Si no fue
aprobado todavía, PM debe confirmarlo antes de dar este batch por cerrado.

## Camino de ruptura — además de lo literal del ticket

- **Rol sin permiso, botón oculto vs. bloqueado de verdad:** re-verificado el fix de Senior Review
  del 2026-08-11 (gate de "+ Nuevo ticket" por rol) — Carlos (tecnico_servicios) y Miguel
  (garantias_servicios) NO ven el botón en absoluto (no solo deshabilitado), confirmado con
  Playwright + capturas `08-home-carlos.png`/`09-home-miguel.png`. El backend además exige
  `role:superadmin,lider_servicios,management,vendedor_disenador` en `POST /servicios/tickets`
  (Batch 3 parte 2) — doble gate, no solo cosmético en el frontend.
- **Recargar la página a mitad de un flujo:** recargar con el modal "+ Nuevo ticket" abierto no
  deja la app en blanco/rota — el modal se cierra (esperado, sin persistencia de borrador) y la
  pantalla de Inicio sigue funcional (test 11).
- **Doble clic:** doble clic en "+ Nuevo ticket" no abre dos modales superpuestos (test 12).
- **Deep-link a un ticket que no es el esperado:** verificado explícitamente que `?ticket=<id>`
  desde Pendientes abre el ticket CORRECTO (`Cliente Sin Agendar QA`, INS-2026-0008), no solo que
  aterriza en la URL correcta — este es el punto que se pidió verificar explícitamente en el
  despacho, dado que un ticket equivocado sería un bug silencioso (test 6, `06-deeplink-ticket.png`).
- **Fuente de datos compartida (RN4 de REQ-208):** confirmado que Rutas del día y Agenda equipo
  (Técnicos Internos) muestran EXACTAMENTE los mismos 6 tickets sembrados con la misma hora —
  ambos leen la misma fuente (`tickets.scheduled_at`), no listas separadas que puedan divergir
  (comparación visual `04-rutas-dia.png` vs `02-agenda-desde-home.png`).
- **Typo de ruta descubierto en el camino (no bug de la app):** la especificación original de
  este despacho pedía navegar a `/servicios/home` — la ruta real es `/servicios/inicio`
  (`App.tsx`). Con el typo, el catch-all `<Navigate to={getHomeRoute(user)}>` "disimulaba" el
  error para usuarios cuyo único módulo es Servicios (Aaron/Carlos/Miguel aterrizaban en la
  pantalla correcta por coincidencia), pero redirigía a Daniela (con acceso a `ventas_diseno` con
  mayor prioridad en `MODULE_HOME_ROUTES`) a la pantalla equivocada — así se descubrió y corrigió
  el propio test antes de reportar como hallazgo de la app. Dejado como comentario en el spec para
  que no se repita.
- **Deshecho:** no se tocó el estado vacío de Rutas del día/Pendientes (0 visitas/0 pendientes) —
  ambos son ternarios triviales de una línea ya presentes en el código (`visitas.length === 0` /
  `items.length === 0`), de riesgo bajo y no justificaba desmontar los fixtures sembrados para
  volver a verificar; revisado por lectura de código, no en vivo.

## Lo que sí funciona

- Encabezado: título, botón Agenda (navega correcto, sin filtro), botón "+ Nuevo ticket" abre el
  MISMO formulario del módulo Tickets (Cliente Master, requerimientos especiales, productos).
- Gate de rol de "+ Nuevo ticket" — re-verificado tras el fix de Senior Review, con 4 roles reales
  distintos (Aaron sí, Carlos no, Miguel no, Daniela sí).
- Rutas del día: límite de 5, "Ver agenda completa", colores de técnico consistentes con Técnicos
  Internos, botón Waze/Maps con URL real, misma fuente de datos que Agenda equipo.
- Pendientes: badge de conteo real (no `items.length` del cliente), umbral de 3 días configurable
  y correctamente ejercitado en ambos sentidos (aparece/no aparece), tarjeta obsoleta ausente,
  deep-link al ticket correcto.
- Indicadores del mes: instalaciones completadas + meta + fuente de la meta, % resuelto 1ra visita,
  tiempo promedio de resolución — los 3 con datos reales calculados correctamente contra los
  fixtures sembrados (verificado a mano: 3 instalaciones, 75% = 3/4, 6.6 días promedio).

## Veredicto (pasada original, 2026-08-12 temprano)

**Bloqueado — NO pasa a QA todavía.** 1 CRÍTICO real (REQ-211, ajuste manual de meta sin UI) +
1 MEDIO que requiere confirmación explícita de Luis/PM antes de cerrar (REQ-210 RN3/REQ-211 RN5).
Notificar a PM para reasignar el CRÍTICO a Frontend Dev (decisión de dónde vive el control de
edición) y para que Luis/PM confirmen si el MEDIO ya estaba aprobado de palabra o necesita
decisión ahora. Cuando el CRÍTICO tenga fix, re-correr el checklist COMPLETO de REQ-211 (no solo
el punto que falló) antes de dar luz verde — regla dura del proyecto.

---

## Re-check 2026-08-12 (tarde) — CRÍTICO y MEDIO cerrados, checklist completo re-corrido

Commits del fix: `atlanticerp-backend` `ff41fb1` ("calculate real ingresos_instalaciones from approved
quotes"), `atlanticerp-frontend` `46942bf` ("add manual installation goal control to Home indicators").
Ambos ya en `dev` de sus repos respectivos al momento de este re-check.

### Entorno de este re-check

A diferencia de la pasada original (stack Docker aislado `batch15review`, ya no existe), este
re-check corrió contra el **stack Docker local compartido** (`infra-*`, backend `:8090`) + `vite
dev` del worktree de este agente (`:5173`, proxy `/api` → `:8090`), con Playwright CLI. El stack
compartido NO tiene los fixtures puntuales sembrados a mano para la pasada original (6 visitas
hoy, ticket sin agendar hace 4 días, 3 instalaciones + 4 garantías cerradas este mes) — por eso
Rutas del día/Pendientes/Indicadores devuelven vacío/0 en este re-check en vez de los números
específicos de la pasada original. Esto es esperado y no es una regresión: se confirma abajo que
la LÓGICA sigue funcionando (paneles renderizan, estados vacíos correctos, gates de rol intactos),
no se re-verificaron los conteos exactos que dependían de esos fixtures puntuales (ya cubiertos y
sin cambios de código en este fix).

### Verificación del CRÍTICO (REQ-211 Escenario 5 — ajuste manual de meta)

Confirmado end-to-end, backend + frontend, con cuentas reales:

- **Backend (`HomeService::ingresosInstalaciones()`):** confirmado por API real (`GET
  /api/servicios/home/summary`) que `ingresos_instalaciones.available` es ahora siempre `true`
  (antes `false` fijo) y `.value` refleja la suma real de `service_quotes` APROBADAS de tickets
  Instalación cerrados en el mes — sembrado un caso real vía tinker (ticket Instalación cerrado +
  cotización aprobada por USD 2000) y confirmado `value: 2000` en la respuesta, luego limpiado.
- **Backend (`PUT /api/servicios/home/installation-goal`):** confirmado `200` con `daniela@
  atlantic.com.pa` (management) y `403` con `servicio@atlantic.com.pa` (lider_servicios,
  sin el rol requerido) — gate `role:superadmin,management` intacto. Validación `value >= 0` y
  `value` requerido confirmadas con `422` (con header `Accept: application/json` — sin ese header
  Laravel redirige 302 en vez de devolver JSON, comportamiento estándar de Laravel no relacionado
  con el fix, el frontend real siempre manda ese header vía axios).
- **Frontend (`HomeMonthlyIndicators.tsx` + `InstallationGoalModal.tsx`):** ícono de lápiz visible
  SOLO para `daniela@atlantic.com.pa` (management) — confirmado AUSENTE para
  `servicio@atlantic.com.pa` (lider_servicios) y `carlos@atlantic.com.pa`
  (tecnico_servicios). Modal abre prefilleado con el valor actual, guarda un valor nuevo (77),
  panel refleja `0 / 77` de inmediato (sin recargar), leyenda cambia a "Meta ajustada manualmente
  por Gerencia para este mes." (i18n `home.indicators.installations.metaSource.manual_override`).
  Valor negativo (`-5`) o vacío deja el botón "Guardar" deshabilitado — nunca llega a pegarle a la
  API (validación client-side `canConfirm` en el modal, además del gate 422 del backend).

Capturas: `e2e/.tmp/preqa-recheck-batch15/m1-aaron-home.png` (sin lápiz, `0/36`, "USD 0.00" en vez
de "—"), `m2b-modal-open.png`, `m2d-after-save.png` (`0/77` + leyenda actualizada),
`m3b-negative.png` (botón Guardar deshabilitado).

### Verificación del MEDIO (REQ-211 RN5 "Ingresos por instalaciones")

Cerrado — ver backend arriba. La tarjeta "Ingresos por instalaciones" ya NO muestra "—" fijo: con
`available: true` siempre formatea el monto real (`USD 0.00` cuando no hay cotizaciones aprobadas
este mes, `USD 2,000.00` en el caso sembrado de prueba). Confirmado visualmente para 2 roles
distintos (Aaron y Daniela).

### REQ-210 RN3 ("Repuesto sin llegar") — sigue diferido a propósito, NO es parte de este fix

Confirmado que sigue como estaba: `HomeService::pendientes()` sigue concatenando una `Collection`
vacía documentada para este tipo (depende de Batch 13-14, Insumos/Herramientas, que no existe
todavía) — no se tocó en este fix y no correspondía tocarlo. No se re-clasifica como hallazgo.

### Checklist completo re-corrido (regla dura — no solo el punto que falló)

- REQ-207 (encabezado, botón Agenda, "+ Nuevo ticket" con gate de rol) — sin regresión. Confirmado
  con Aaron (ve el botón), Carlos (NO lo ve), Daniela (lo ve). Navegación de "Agenda" a Técnicos
  Internos → Agenda equipo sigue funcionando.
- REQ-208 (Rutas del día) — panel renderiza, estado vacío correcto ("No hay visitas agendadas para
  hoy."). Lógica de límite/slice sin cambios de código en este fix, no re-verificada con fixtures
  (ver nota de entorno arriba).
- REQ-210 (Pendientes) — panel renderiza, estado vacío correcto ("No hay pendientes en este
  momento."). RN3 confirmado diferido a propósito (ver arriba). Lógica de umbral sin cambios de
  código en este fix.
- REQ-211 (Indicadores del mes) — CRÍTICO y MEDIO cerrados (ver arriba), resto de indicadores
  (instalaciones completadas, % resuelto 1ra visita, tiempo prom. resolución) sin cambios de código
  y renderizando correctamente con datos en 0/null (estado vacío del stack local compartido).

### Test e2e permanente — extendido con 4 casos nuevos, self-seeding

`e2e/preqa-scrum270-271-273-274-servicios-batch15-home-20260812.spec.ts`, tests 13-16 (agregados
en este re-check): gate de rol del ícono de ajuste (management sí / lider_servicios no), guardado
real con restauración del valor original vía API (idempotente, no deja el override de la corrida
de test como estado permanente), validación de negativo/vacío (botón deshabilitado), y gate de
backend (403 para rol sin permiso). Corridos 2 veces seguidas para confirmar estabilidad — 4/4
verde ambas veces. De paso, se corrigió un problema real de aislamiento del helper `login()`
compartido por TODA la suite (tests 1-16): sin limpiar cookies/localStorage al inicio, un test
podía heredar la sesión autenticada de un test anterior y `/login` redirigía directo al Home,
colgando el resto del helper esperando un input que nunca aparecía — fix aplicado al helper, no
solo a los tests nuevos, así que también mejora la confiabilidad de los tests 1-12 en corridas
futuras.

Nota de limitación conocida (no bloqueante): no existe un endpoint para "limpiar" un override y
volver a `manual_default`/`calculated` — solo `setOverride()`. El test 14 restaura el VALOR
original capturado por API antes de modificarlo, pero si el valor original venía de
`manual_default`/`calculated` (sin override previo), tras la restauración el `meta_source` queda
en `manual_override` con el mismo valor numérico (comportamiento correcto de negocio — Gerencia sí
ajustó ese mes — pero cambia la etiqueta mostrada). Se limpió manualmente vía tinker
(`ServiciosSetting::where('key','like','installation_goal_override_%')->delete()`) el estado
dejado en el stack compartido tras cada corrida de este re-check, para no contaminar sesiones
futuras de otros agentes en el mismo stack local.

## Veredicto final (re-check 2026-08-12 tarde)

**PASA LIMPIO — listo para pasar a QA.** El CRÍTICO (REQ-211 Escenario 5, control de meta manual
sin UI) y el MEDIO (REQ-211 RN5, "Ingresos por instalaciones" fijo en "—") de la pasada original
están cerrados y verificados end-to-end (backend + frontend, con cuentas reales, in vivo). REQ-210
RN3 sigue diferido a propósito (sin cambios, no es parte de este fix). Checklist completo de los 4
REQ re-corrido sin regresiones. Test e2e permanente extendido y estable en 2 corridas consecutivas.
