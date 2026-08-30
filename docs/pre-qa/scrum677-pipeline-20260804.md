# Pre-QA — SCRUM-677 (REQ-597), fix "banner de dato faltante queda pegado permanentemente"

**Fecha:** 2026-08-04
**Ticket:** [SCRUM-677](https://grupolafayette.atlassian.net/browse/SCRUM-677)
**Componente:** `atlanticerp-frontend/src/components/PipelineCardModal.tsx`
**Commit revisado:** `0abbf69` (dev local — pendiente de push, ver "Estado" abajo)
**Entorno:** stack local Docker (Postgres/Redis/Laravel :8090) + Vite dev server :5173
**Smoke test permanente:** `atlanticerp-frontend/e2e/preqa-scrum677-alert-cleanup-20260804.spec.ts`
(3/3 pasando — promovido a `e2e/` por tratarse de un gate de flujo de estado que ya se rompió una
vez, ver `feedback_e2e_no_desechar` en memoria del proyecto)

## Contexto

Daniela Amaya reportó dos veces (2026-08-03 y 2026-08-04, con video adjunto 11663) que al mover
una tarjeta de etapa sin un dato requerido, el aviso de "dato faltante" quedaba visible para
siempre incluso después de completar el dato y mover la tarjeta con éxito. Causa raíz real
(confirmada por Senior Review): `stageError`/`quoteGateError` solo se limpiaban en el `onSuccess`
de SU PROPIA mutación de origen (`changeStageMutation` / `handleCreateQuoteClick`), nunca cuando
el dato se completaba por otra vía. Fix: `saveMutation`, `uploadFileMutation` y
`addContactMutation` ahora también limpian ambos estados en su `onSuccess`.

## Nota de entorno — desvío del login sugerido en el ticket

La instrucción original pedía loguear con `idmar@atlantic.com.pa` ("vendedor con data real
sembrada"). En el Postgres LOCAL de esta sesión ese usuario no tenía ninguna tarjeta de pipeline
propia — `VentasDisenoDemoSeeder` resuelve el rol `designer` seedeado a
**neil.quiel@atlantic.com.pa**, no a idmar (válido para `dev.atlanticerp.ai`, no para local). Se
usó **neil.quiel@atlantic.com.pa** (Vendedor/Diseñador) y **daniela@atlantic.com.pa**
(Gerencia, dueña de tarjetas en Cotización/Propuesta) — ambas cuentas reales, password = mismo
email, mismo patrón que el resto de `e2e/`. Adicionalmente, `infra/test.sh` corrido en esta misma
sesión (para validar el backend) comparte el Postgres local y lo dejó sin datos — se corrió
`tenants:artisan db:seed --force` después, restaurando el estado para la siguiente sesión.

## Escenario reproducido — EXACTO al de Daniela (video 11663)

**Tarjeta "PreQA Lead 677" (Diseño, neil.quiel), sin superficie trabajada:**
1. Clic en "Crear cotización" → aparece "Falta la superficie trabajada. Completala antes de crear
   la cotización."
2. **Se resolvió por Editar → Guardar (NO reintentando "Crear cotización")** — superficie = 55 m².
3. El aviso desapareció. **Antes del fix, este es exactamente el punto donde quedaba pegado.**
4. Doble clic en "Guardar" (mismo frame, sin esperar) — el botón queda `disabled`/`loading` tras
   el primer clic, el segundo no dispara una segunda mutación; el guardado y la limpieza del
   banner ocurren una sola vez, sin inconsistencia.
5. Recarga de página a mitad de flujo (justo después de resolver el gate 1) — el modal es estado
   local de React, no una ruta propia: recargar vuelve al tablero (comportamiento esperado de
   esta SPA, no algo que este fix toque ni rompa). El dato persistido (superficie = 55) se
   mantiene; al reabrir la tarjeta, ningún estado roto ni banner fantasma.
6. Clic en "Crear cotización" de nuevo → ahora falta el archivo de diseño, mensaje **distinto**:
   "Falta al menos un archivo de diseño. Cargá uno para continuar." El mensaje viejo (superficie)
   no reaparece mezclado.
7. Se resolvió subiendo el archivo (NO reintentando "Crear cotización") → el aviso desapareció sin
   necesidad de un clic adicional.

**Resultado: PASS.** El escenario exacto reportado por Daniela — "Diseño a Cotización, se edita,
se agrega el campo que se pide, se guarda, la alerta sigue apareciendo" — ya NO reproduce. El
banner se limpia correctamente.

## Segundo camino — `changeStageMutation` (stageError) con 2 gates en secuencia

**Tarjeta "[DEMO] Amenidades Delta" (Cotización, daniela), sin superficie ni cotización firmada:**
1. "Mover a Propuesta" → "Falta la superficie trabajada (m²) antes de mover a Propuesta."
2. Editar → Guardar (superficie = 80) → el aviso desaparece.
3. "Mover a Propuesta" de nuevo → gate DISTINTO: "Falta el archivo de la cotización firmada antes
   de mover a Propuesta." — el mensaje anterior no reaparece mezclado ni residual.
4. Se sube el archivo de cotización firmada → `uploadFileMutation` dispara el auto-avance
   (REQ-016/017: subir el archivo gate de la etapa avanza la tarjeta automáticamente) → la
   tarjeta pasa a Propuesta de verdad Y el banner desaparece.

**Resultado: PASS.**

## Tercer camino — `addContactMutation` (quoteGateError, Lead sin contacto)

**Tarjeta "PreQA SubClient 677" (Lead, neil.quiel), sin contactos:**
1. "Crear cotización" → "Este Lead no tiene contactos registrados. Agregá al menos uno antes de
   continuar."
2. Se agregó un contacto vía el mini-formulario (NO reintentando "Crear cotización") → el aviso
   desapareció.

**Resultado: PASS.**

## Intentos de ruptura adicionales (Paso 3 del protocolo)

| Intento | Resultado |
|---|---|
| Doble clic en "Guardar" (mismo frame) | El botón se deshabilita tras el 1er clic (`saveMutation.isPending`) — sin doble submit, sin banner inconsistente. |
| Recargar a mitad de flujo, después de resolver un gate pero antes de reabrir | Estado persistido correcto, sin banner fantasma al reabrir. Pérdida del modal en sí (vuelve al tablero) es comportamiento esperado de esta SPA — no introducido por este fix, no bloqueante. |
| Segundo dato faltante distinto apareciendo después de resolver el primero | Mensaje nuevo se muestra correcto, sin mezclarse con el viejo (verificado en 2 flujos: quoteGateError en Diseño, stageError en Cotización). |
| Auto-avance de etapa disparado por upload de archivo (`signed_quote`) con `quoteGateError` pendiente de un intento previo | Se limpia también (parte explícita del fix, comentario del código lo documenta). |

No se encontró ningún hallazgo bloqueante ni menor en esta pasada.

## Regresión — suites completas

- Backend: `infra/test.sh --filter=PipelineController` → 34/34 OK (suite completa no se corrió de
  nuevo en esta sesión puntual porque el fix es 100% frontend; Senior Review ya reportó
  1405/1405+regresión backend íntegra el 2026-08-04).
- Frontend: `npx vitest run` → **866/866 OK** (incluye el test de regresión nuevo agregado en el
  mismo commit del fix, que reproduce el flujo exacto de Daniela).
- Playwright (`e2e/preqa-scrum677-alert-cleanup-20260804.spec.ts`) → **3/3 OK**, corrida limpia
  final tras reset de fixtures.

## Estado — pendiente de push

El commit `0abbf69` está en `dev` local (rama `dev`, 17 commits por delante de `origin/dev` al
momento de esta revisión, junto con otros commits de la misma sesión — SCRUM-685/686). **Este fix
no está todavía en `dev.atlanticerp.ai`** — antes de que marly (QA formal) pueda probarlo ahí, alguien
tiene que pushear. Dejar esto explícito para quien transicione el ticket: el paso de Pre-QA local
dio PASS, pero el criterio "el objetivo es que marly pueda probarlo en dev.atlanticerp.ai" (regla dura
del proyecto) todavía no se cumple hasta el push.

## Resultado final

**PASADA LIMPIA.** Sin hallazgos bloqueantes. El escenario exacto de Daniela (video 11663) fue
reproducido y confirmado resuelto, junto con los otros 2 caminos que toca el fix
(`uploadFileMutation`, `addContactMutation`) y el camino de `changeStageMutation` con 2 gates en
secuencia. Recomendado transicionar a `QA` **una vez confirmado el push a `dev` remoto**.
