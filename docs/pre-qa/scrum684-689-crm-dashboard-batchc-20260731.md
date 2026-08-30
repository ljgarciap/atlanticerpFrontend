# Pre-QA — Epic CRM (SCRUM-332) Batch C: SCRUM-684→689 — Dashboard CRM (2026-07-31)

Tickets: SCRUM-684→689 (REQ-604→609, epic SCRUM-332, proyecto SCRUM). "Dashboard CRM", pantalla
nueva exclusiva de Gerencia, sobre datos reales de `PipelineCard` (no una copia). Recién pusheado a
`dev` en ambos repos y desplegado a `dev.atlanticerp.ai` vía CI/CD antes de esta sesión.

Entorno: `dev.atlanticerp.ai` real (no Docker local), vía Playwright CLI + llamadas API directas
(`curl`/`request` de Playwright con tokens reales extraídos de `localStorage`). Cuentas usadas:
Whileyner Contreras (`whil@illuminations.com.pa`, Gerencia Restringida, rol `management`) — Daniela
Amaya (`daniela@illuminations.com.pa`, reportera del ticket) no autenticó con la convención
password=email, probablemente cambiada a mano; se usó otra cuenta Gerencia real en su lugar, mismo
nivel de acceso al Dashboard. Milena Estrada (`milena.e@grupolafayette.com`, Vendedor/Diseñador)
para el camino de ruptura de REQ-609.

Gate permanente creado: `atlanticerp-frontend/e2e/preqa-scrum684-689-dashboard-crm-batchc.spec.ts`
(13 tests, promovido — cubre gates de rol/permiso que ya rompieron una vez).

## Paso 0 — permisos angostos y valores paramétricos

No aplica: ningún criterio del batch menciona una persona puntual con capacidad especial, ni un
umbral/margen de negocio configurable. El único "umbral" (15 días de estancamiento) ya vive
hardcodeado como `ESTANCADO_DIAS`/`isStagnant()` — mismo valor que la vigencia de Condiciones de
cotización (REQ-046), documentado como intencional en la descripción del ticket, no un valor que
el ticket pida hacer configurable.

## Paso 1/2 — criterios de aceptación, camino feliz y camino de ruptura

### REQ-609 — acceso restringido a Gerencia

| Escenario | Resultado |
|---|---|
| Gerencia entra por el menú lateral (botón "Dashboard CRM") | Llega a `/crm/dashboard`, título+subtítulo fijo visibles |
| Vendedor/Diseñador (Milena) por URL directa `/crm/dashboard` | Redirigida, nunca queda en esa URL, título nunca visible — **sin flash de datos reales** confirmado escuchando la respuesta de red: si el frontend llegara a pedir `/dashboard/summary` como Milena, no puede haber sido un 200 (se afirma explícitamente en el test) |
| Vendedor/Diseñador — ítem "Dashboard CRM" en el sidebar | **No existe en el DOM en absoluto** para su rol (gate más fuerte que "mostrar y redirigir") — hallazgo de una sesión anterior de Pre-QA el mismo día (ver comentario en `Sidebar.tsx`, SCRUM-674), confirmado aún vigente |
| `GET /api/ventas-diseno/dashboard/summary` con token real de Milena | **403** — el gate existe a nivel de backend (`role:superadmin,management` en la ruta), no solo en el frontend |
| `POST /api/ventas-diseno/dashboard/remind` con token real de Milena | **403** |
| Gerencia — selector Mío/Equipo | Ausente, confirmado por selector de rol "Mío"/"Equipo" no encontrado en el DOM |

**Camino de ruptura ejercitado explícitamente:** intento de bypass del gate de frontend pegando
directo a los 2 endpoints del Dashboard con un token real y válido de un rol sin acceso — ambos
403 a nivel de Laravel (`role:superadmin,management` middleware), no dependen de que el frontend
oculte el botón.

### REQ-605/606/607 — tarjetas de conteo, gráfico de barras, gráfico de dona

Datos reales de dev al momento de la sesión: `lead=9→12` (+3 fixtures sembrados, ver abajo),
`design=8, quote=9, proposal=9, approved=17, lost=6`. `closed_won=$749,000` (formato con comas
confirmado, sin `NaN`). `active_pipeline=$0` — **no es un bug**: confirmado por SQL directa que
los 35 cards en etapas activas (lead/design/quote/proposal) tienen `amount IS NULL` en esta base
real; la fórmula de suma (`Collection::sum('amount')`) se confirma correcta porque
`closed_won=$749,000` (suma no-trivial de 17 filas con montos reales) calcula bien. Limitación de
datos, no de código — se deja anotado en vez de forzar una conclusión falsa positiva.

**REQ-607 — proporciones y nota de "sin etiqueta" — dato real insuficiente para el escenario
completo, corregido sembrando fixtures:** el 100% de los 58 `pipeline_cards` reales vinculados a un
`sales_project` vigente tenían `tag='both'` (confirmado por SQL con join) — 0% en `design`/`quote`,
0 sin etiqueta vía cards activos (los 5 `sales_projects` con tag `NULL`/1 con tag `design` en la
tabla cruda no tenían ningún `pipeline_card` vigente apuntándolos, así que no contaban en absoluto
para el Dashboard). Esto significaba que **Escenario 1 (3 categorías con proporciones distintas) y
Escenario 2 (nota de "sin etiqueta") de REQ-607 no eran ejercitables con el dato real tal cual
estaba** — se sembraron 3 fixtures reales vía API (`POST /ventas-diseno/pipeline`, prefijo
`[PRE-QA]`, mismo patrón ya usado en Pre-QA de sesiones anteriores de este proyecto): 1 Lead sin
`tag`, 1 con `tag:design`, 1 con `tag:quote`. Confirmado con la API real antes/después:

```
antes:  design=0, quote=0, both=58, untagged_count=0
después: design=1, quote=1, both=58, untagged_count=1
```

Confirmado en UI: la nota "1 sin etiqueta, no incluida" aparece. Fixtures dejados en dev (no
borrados) — mismo patrón que otros fixtures `[PRE-QA]` de sesiones previas en este repo (ej.
SCRUM-88/711), no un dato oculto o confuso para QA formal.

**REQ-606 — barra con altura mínima en etapa sin proyectos (Escenario 3):** no ejercitable con dato
real — las 6 etapas tienen ≥1 proyecto actualmente en dev (mínimo `lost=6`). Verificado por código:
`minBarLength: 4` está configurado en el dataset de Chart.js (`DashboardPage.tsx`), que es
justamente el mecanismo nativo de Chart.js para garantizar una barra visible en un valor 0 — RN4 se
cumple por construcción, pero no se vio con los propios ojos en dev con una etapa en 0. Se deja
como limitación de datos explícita, no una verificación silenciosamente omitida.

### REQ-608 — botón "+ Nuevo Proyecto"

| Escenario | Resultado |
|---|---|
| Clic en el botón desde el Dashboard | Navega a Pipeline, modal ya abierto, cero clics extra |
| `GET /ventas-diseno/pipeline?openNewProject=1` **por URL directa**, sin pasar por el botón | Modal también abierto — confirma que la apertura depende solo del query param, no de un flag de estado seteado únicamente por el botón del Dashboard |

### REQ-604 — alertas dinámicas y recordatorios

| Escenario | Resultado |
|---|---|
| Aviso "propuesta vencida" con datos reales | Visible, lista proyectos reales (`[DEMO-711] Proyecto Fefi 2`, `[DEMO-711] Proyecto Idmar 4`) |
| Aviso "clientes sin contacto reciente" con datos reales | Visible, 5 clientes agrupados |
| Ausencia total del aviso cuando no aplica | **No ejercitable de forma aislada con datos reales** — dev tiene ambas condiciones simultáneamente activas; no se fuerza un estado "0 vencidas" borrando datos reales de producción-adjacente. Cubierto en cambio por 2 tests unitarios permanentes ya existentes (`DashboardPage.test.tsx`) que sí controlan el fixture para cada aviso por separado — no es una laguna sin cubrir, es cobertura repartida entre unitario (estado aislado) y e2e (datos reales combinados) |
| Clic en "Enviar recordatorios" | Toast real visible (`Toaster.tsx`, primer uso real del componente en `App.tsx` — confirmado que sí renderiza) |
| **CRÍTICO encontrado — doble clic / segunda llamada el mismo día duplica el envío real** | Ver sección siguiente |

## Paso 3 — intentos de ruptura fuera del criterio literal

- Input vacío/null: N/A, el Dashboard no tiene formularios de entrada de usuario.
- Doble clic en "Enviar recordatorios": **CRÍTICO real, encontrado y corregido en esta misma
  sesión** (ver abajo) — antes del fix, cada llamada (no solo un doble-clic sincrónico; literalmente
  cualquier llamada repetida el mismo día) creaba un `NotificationSend` nuevo y lo entregaba de
  verdad.
- Rol sin permiso: cubierto arriba (REQ-609), a nivel de API además de UI.
- Recargar a mitad de flujo: el Dashboard no tiene un flujo multi-paso que perder — la única
  mutación (`remind`) es de un solo clic, sin estado intermedio que sobreviva un reload.
- Mismo botón en un estado distinto al probado: N/A, el botón "Enviar recordatorios" solo existe
  cuando el aviso está presente, no hay un segundo estado de la misma UI que probar.

### CRÍTICO — duplicado real de notificaciones en "Enviar recordatorios" (encontrado y corregido)

**Qué se rompió:** `source_ref` en `NotificationSend` ya tenía la forma de una clave de
idempotencia diaria (`crm_dashboard_proposal_reminder:{fecha}:{owner_id}`), pero
`DashboardService::remind()` nunca verificaba si ya existía un send con ese `source_ref` antes de
crear uno nuevo. Confirmado en vivo contra `dev.atlanticerp.ai` **antes del fix**, con dos llamadas
reales e independientes ~20 segundos aparte (una desde un test de Playwright con un solo clic, otra
desde `curl` manual — ninguna fue un doble-clic sincrónico, cualquier repetición el mismo día
alcanzaba):

```sql
select id, source, source_ref, audience, created_at from notification_sends
where source='crm_dashboard_proposal_due' order by id;

 id | source_ref                                       | audience | created_at
 5  | crm_dashboard_proposal_reminder:2026-07-31:36     | [36]     | 14:15:42
 6  | crm_dashboard_proposal_reminder:2026-07-31:43     | [43]     | 14:15:42
 7  | crm_dashboard_proposal_reminder:2026-07-31:36     | [36]     | 14:16:02   ← duplicado
 8  | crm_dashboard_proposal_reminder:2026-07-31:43     | [43]     | 14:16:02   ← duplicado
```

Y confirmado que ambos se **entregaron de verdad** (`notification_deliveries.status='sent'`,
channel `email`, más las filas correspondientes en `notifications` para el canal in-app) — no eran
filas huérfanas sin efecto, el vendedor/diseñador habría recibido 2 emails reales idénticos.

**Fix aplicado** (commit `d91b78c` en `atlanticerp-backend`): `DashboardService::remind()` ahora
verifica `NotificationSend::where('source_ref', $sourceRef)->exists()` antes de crear un nuevo
send; si ya existe, el owner se agrega a `already_sent_today` en vez de volver a notificarlo.
`DashboardController::remind()` distingue "nada que recordar" (422, sin cambios) de "ya se
recordó hoy a todos" (200 con mensaje distinto, antes hubiera sido el mismo 422 engañoso).
Frontend (`c88f3a7`+`a7bc7a8` en `atlanticerp-frontend`): `DashboardRemindResult.notified` pasa a
opcional, `DashboardPage.tsx` muestra el mensaje del backend en vez de un resumen vacío cuando
`notified` viene vacío.

**Re-verificación tras el fix (checklist completo, no solo el punto que falló):**
- Backend: 2 tests nuevos (`DashboardControllerTest::test_remind_no_duplica_el_envio...`), suite
  completa **1418/1418 tests, OK**. PHPStan Level 8 limpio.
- Frontend: 1 test unitario nuevo + actualización de tipos, suite completa **740/740 tests
  pasando**. `npx tsc --noEmit` limpio, `npm run build` exitoso.
- CI/CD real: ambos repos, push a `dev`, **verde** (backend: primer intento verde; frontend:
  primer intento falló por un error de compilación real en el mock de test — `already_sent_today`
  faltaba en el tipo `DashboardRemindResult` — corregido en un segundo commit, segundo intento
  verde; un tercer commit agregó tests de REQ-608 y el regression test de doble-clic, también
  verde). Confirmado con `git log origin/dev..dev` vacío en ambos repos tras cada push.
- Verificación en vivo contra `dev.atlanticerp.ai` **después** del deploy: `POST /remind` repetido ahora
  responde `{"message":"Ya se envió un recordatorio hoy...", "notified":[], "already_sent_today":
  [36,43]}` con HTTP 200, y `notification_sends` se mantiene en 4 filas (no crece) — confirmado por
  SQL directa post-fix.
- Suite completa de Playwright del batch (13 tests, incluyendo el nuevo regression test de
  doble-clic) corrida contra `dev.atlanticerp.ai` **después** del deploy: **13/13 verde**.

## Paso 4 — regresión general

No se tocó ningún otro módulo — el fix está aislado a `DashboardService`/`DashboardController`
(backend) y `DashboardPage.tsx`/tipos/i18n (frontend). Las suites completas de ambos repos (1418
backend, 740 frontend) ya cubren regresión cruzada y pasaron limpio antes y después del push.

## Resultado

**Pasada limpia y concluyente** tras 1 hallazgo CRÍTICO encontrado, corregido, re-verificado
completo y confirmado en vivo contra `dev.atlanticerp.ai` — ver "Regla dura" de este protocolo. Los 6
tickets (SCRUM-684→689) pasan a `QA`.

## Limitaciones de datos dejadas explícitas (no bugs, no omitidas en silencio)

- `active_pipeline=$0` en dev: dato real (amounts NULL en cards activos), fórmula verificada
  correcta con `closed_won`.
- REQ-606 Escenario 3 (barra 0 con altura mínima): no ejercitable con dato real actual (las 6
  etapas tienen ≥1 proyecto); verificado por code review (`minBarLength: 4`).
- REQ-604 "ausencia total de un aviso": no ejercitable de forma aislada con datos combinados
  reales; cubierto por tests unitarios existentes que sí aíslan cada caso.
