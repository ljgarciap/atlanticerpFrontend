# Pre-QA — Cotización-A header, batch 2 (2026-07-29)

Tickets: SCRUM-116 (REQ-024, Cliente Master), SCRUM-117 (REQ-025, Subcliente),
SCRUM-124 (REQ-032, Entrega). Commit bajo prueba: `58fdd4d` sobre `a45f41e`.
Entorno: `https://dev.atlanticerp.ai`, usuario `designer@illuminations.test`
(vendedor_disenador). Senior Review y Visual Review ya corrieron limpios sobre
este mismo despliegue antes de este pase.

Fuente de verdad cruzada: Jira (texto de cada ticket) + fila REQ-024/025/032
del Excel `Requerimientos Ventas Diseño.xlsx` adjunto a los 3 tickets (rows 30,
31, 38 de la hoja "Requerimientos Ventas&Diseño").

Smoke tests permanentes: `e2e/preqa-scrum116-117-124-20260729.spec.ts` (12
tests, corridos contra dev.atlanticerp.ai con `PREQA_BASE_URL=https://dev.atlanticerp.ai
npx playwright test e2e/preqa-scrum116-117-124-20260729.spec.ts`).

## SCRUM-116 (REQ-024) — Cliente Master buscar y crear — PASADA LIMPIA

| Escenario de ruptura intentado | Resultado |
|---|---|
| Foco en campo vacío, sin texto tipeado | "+ Crear cliente" visible de inmediato (confirmado en runtime, no solo al fallar el match) |
| Texto que matchea por palabra compartida con un cliente existente (ej. "Grupo") | Aparecen los resultados reales Y "+ Crear cliente" juntos (3 resultados + la opción de crear) |
| Nombre EXACTO de un cliente ya existente | "+ Crear cliente" desaparece — no incentiva duplicados |

Lo que sí funciona: el fix de SCRUM-79/89/122 replicado en `SimpleSearchPicker`
(`QuotePage.tsx`) se comporta igual que `ClientPicker` — comparación exacta
case-insensitive contra las opciones ya listadas, sin depender de si hay 0 o N
resultados.

## SCRUM-117 (REQ-025) — Subcliente acotado al Cliente Master — PASADA LIMPIA (con 1 hallazgo MEDIO informativo)

| Escenario de ruptura intentado | Resultado |
|---|---|
| Sin Cliente Master elegido | Campo/lupa de Subcliente deshabilitado |
| Elegir Master + Subcliente, luego borrar el Master a mano (backspace, NO seleccionar otra opción) | Subcliente se limpia a vacío Y queda deshabilitado |
| Re-elegir un Master DISTINTO tras la limpieza | Subcliente se re-habilita con búsqueda propia — la lista de subclientes mostrada corresponde al nuevo master (`[DEMO-711] Cliente de Annie` → subclientes "Cliente de X"), no arrastra los del master anterior |
| Con Master ya elegido, buscar un término que SÍ trae resultados | "+ Nuevo subcliente" aparece junto a los resultados reales, no solo con 0 resultados |
| Reload de página tras limpiar el Master (antes de guardar borrador) | **MEDIO / informativo**: el campo vuelve a mostrar el Master/Subcliente ANTERIOR (persistido en servidor) — el `onClear` de SCRUM-117 solo toca estado local de React, nunca llama a un mutation que persista el "vaciado". No es pérdida de datos (el server-side dato real nunca se tocó) y es coherente con "cambios no guardados se pierden al recargar", pero genera una asimetría notable: elegir un Subcliente existente SÍ dispara persistencia inmediata (`linkNewClientMutation`, ver comentario SCRUM-716 en el código), mientras que limpiar el Master NO. Un usuario que limpia el Master pensando en cambiar de cliente, se distrae, y recarga, ve reaparecer el cliente viejo sin aviso. No bloqueante para este batch — no viola ningún criterio literal de REQ-025 — pero vale una decisión de Arquitecto sobre si "limpiar" debería persistir igual que "elegir". |

Lo que sí funciona: los 3 criterios literales de REQ-025 (lupa deshabilitada
sin master, búsqueda acotada al master, autocompletado de RUC al elegir/crear
subcliente) pasan limpio, incluido el camino de ruptura explícito del ticket
(backspace manual, no solo "elegir otro cliente").

## SCRUM-124 (REQ-032) — Entrega completa o parcial — CRÍTICO encontrado y corregido en esta sesión

| Escenario de ruptura intentado | Resultado |
|---|---|
| Parcial con 2 fechas cargadas + agregar una 3ra + volver a Única | Resetea a exactamente 1 campo, **vacío** (no arrastra el valor viejo) |
| Única → Parcial de nuevo | Vuelve a exactamente 2 campos, **vacíos** (no resucita las 3 fechas anteriores) |
| Dejar Tipo de entrega sin seleccionar e intentar "Verificar cotización" | El sistema marca "Falta información" incluyendo la entrega — criterio bloqueante confirmado |
| **Buscar el botón de quitar una fecha individual en modo Parcial** | **CRÍTICO (antes del fix de esta sesión): no existía ningún control para quitar una fecha agregada — solo el "+".** El Excel REQ-032 (fila 38, columna "Comportamiento esperado") es explícito: "...con botón '+' para agregar más y **opción de quitar cada fecha agregada** (excepto que siempre deben quedar mínimo 2 en modo parcial)." Jira no lo menciona, pero por protocolo de Pre-QA (`pre-qa.md`, Paso 1) el Excel es criterio real igual. Reproducido en runtime contra dev.atlanticerp.ai (deploy `58fdd4d`) antes de tocar código: al entrar a Parcial y agregar una 3ra fecha, el único botón visible junto a las fechas es "+" — cero afordancia de quitar, para ninguna de las 3 fechas. |

### Fix aplicado en esta sesión de Pre-QA

Por ser un gap chico y ya completamente especificado por el propio Excel del
REQ (no requiere inventar una regla de negocio nueva), se corrigió en el
momento en vez de solo documentar y dejar bloqueado, siguiendo la regla dura
de `pre-qa.md` ("el loop no se cierra en documentado, sigo con el próximo"):

- `src/pages/ventas-diseno/QuotePage.tsx` — cada fecha en modo `partial` ahora
  tiene un botón de quitar (`IcoClose`, mismo patrón que `CreateClientModal`),
  visible solo cuando `deliveryDates.length > 2` (nunca deja bajar de 2 en
  modo parcial, tal como exige el Excel).
- `src/pages/ventas-diseno/QuotePage.test.tsx` — test nuevo
  ("Entrega Parcial permite quitar una fecha agregada pero nunca bajar de 2")
  cubre: con 2 fechas no hay botón de quitar; con 3 aparecen 2 botones de
  quitar + el "+"; al quitar una vuelve a 2 y el botón de quitar desaparece
  de nuevo.
- Verificado: 35/35 tests de `QuotePage.test.tsx`, 694/694 tests de la suite
  completa del frontend (`npx vitest run`), `npx tsc --noEmit` limpio.
- **Pendiente**: este fix está commiteado localmente pero **NO desplegado** a
  dev.atlanticerp.ai en esta sesión (por instrucción explícita — el push/deploy y
  la re-verificación en runtime del fix quedan para la sesión orquestadora).
  Por eso el marcador de gate de SCRUM-124 **no se creó** — falta correr el
  checklist completo una vez más contra el entorno real ya con el fix
  desplegado, según el protocolo estándar del loop de Pre-QA.

## SCRUM-124 (REQ-032) — RE-CHECK tras deploy del fix (commit `5508faa`) — PASADA LIMPIA

Fix pusheado y desplegado a `dev.atlanticerp.ai` (CI `Build + Tests` y CD `Deploy
dev.atlanticerp.ai` verdes). Se corrió el checklist COMPLETO del ticket contra el
entorno real (no solo el punto que había fallado), por la regla dura de
`pre-qa.md`: "un fix puede romper algo que antes pasaba". Nuevo spec:
`e2e/preqa-scrum124-recheck-20260729.spec.ts` (8 tests, `PREQA_BASE_URL=https://dev.atlanticerp.ai
npx playwright test e2e/preqa-scrum124-recheck-20260729.spec.ts`) — 8/8 en
verde. Además se re-corrió el spec original del batch
(`e2e/preqa-scrum116-117-124-20260729.spec.ts`, 12 tests que cubren también
SCRUM-116/117 sobre el mismo `QuotePage.tsx`) como chequeo de regresión
cruzada — 12/12 en verde, sin señales de que el fix haya roto Cliente
Master/Subcliente ni el resto de Entrega.

| # | Escenario | Resultado |
|---|---|---|
| 1 | Parcial → exactamente 2 campos de fecha vacíos + botón "+" | OK |
| 2 | Click en "+" agrega una 3ra (y 4ta) fecha | OK |
| 3 | Con 3+ fechas, quitar una específica (índice 1 de 4) elimina exactamente esa fecha, conserva orden y valores del resto | OK — confirmado por valor, no solo por conteo |
| 4 | Con exactamente 2 fechas no hay botón de quitar; bajar de 3→2 hace desaparecer el botón por completo (no se puede seguir bajando); doble-click rápido sobre el botón de quitar (condición de carrera índice-based) partiendo de 3 fechas nunca deja menos de 2 | OK — conteo final tras doble-click: 2 |
| 5 | Parcial (3+) → Única resetea a exactamente 1 campo vacío | OK (regresión del fix original, sigue sano) |
| 6 | Única → Parcial de nuevo → exactamente 2 campos vacíos (no resucita fechas viejas) | OK (regresión del fix original, sigue sano) |
| 7 | Tipo de entrega sin seleccionar + "Verificar cotización" | Marca "Falta información" — bloqueante confirmado |
| 8 | Parcial con fecha(s) vacías (ambas vacías, y luego 1 de 2 llena) + "Verificar cotización" | Ambas variantes marcan "Falta información" |

**Nota de diseño (no es hallazgo):** el botón de quitar se muestra en TODAS las
fechas (no solo en la 3ra+) una vez que `deliveryDates.length > 2` — la
condición en `QuotePage.tsx` es sobre el largo total del array, evaluada por
cada fila, no sobre el índice. El checklist de este re-check asumía
inicialmente que solo las fechas "agregadas" (más allá de las 2 originales)
tendrían el botón; el comportamiento real es más permisivo (cualquier fecha
es removible mientras haya 3+) pero sigue cumpliendo el criterio real del
Excel REQ-032 al pie de la letra: nunca se puede bajar de 2. Confirmado
también en el test unitario `QuotePage.test.tsx` (línea ~324: con 3 fechas,
4 botones totales = 3 de quitar + 1 "+").

Lo que sí funciona (además de lo ya listado arriba para SCRUM-116/117): los 8
puntos del checklist completo de SCRUM-124, incluyendo el fix nuevo (quitar
fecha individual, mínimo 2 siempre) y ambos regresiones del fix original
(reset a Única, re-entrada a Parcial). Sin hallazgos CRÍTICO ni MEDIO en esta
pasada.

## Resumen de gate

| Ticket | Resultado | Marcador creado |
|---|---|---|
| SCRUM-116 | Pasada limpia | Sí (`~/.claude-preqa-markers/SCRUM-116`) |
| SCRUM-117 | Pasada limpia (1 hallazgo MEDIO informativo, no bloqueante, para decisión de Arquitecto) | Sí (`~/.claude-preqa-markers/SCRUM-117`) |
| SCRUM-124 | Re-check tras fix (commit `5508faa`) — checklist completo (8/8) + regresión cruzada con SCRUM-116/117 (12/12) en verde | Sí (`~/.claude-preqa-markers/SCRUM-124`) |
