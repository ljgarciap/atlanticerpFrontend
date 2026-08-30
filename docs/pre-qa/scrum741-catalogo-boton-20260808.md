# Pre-QA — SCRUM-741 (botón "Catálogo" deshabilitado por error)

**Fecha:** 2026-08-08
**Alcance:** SOLO el fix del botón "Catálogo" en Inicio/Cotizaciones/Reportes de Ventas &
Diseño (remanente de SCRUM-711 nunca actualizado cuando SCRUM-700 ya lo habilitó en
Clientes/Pipeline). El resto de SCRUM-741 (toggles de visibilidad Compras/Bodega, ocultar
Compras a David/Mark) lo ejecuta Luis directamente vía UI de superadmin — fuera de este alcance.

**Entorno:** stack local (Docker: postgres/redis/laravel/horizon/nginx en :8090 + `npm run dev`
en :5173, proxy `/api` -> :8090). Cambios sin commitear en `dev`:
- `src/pages/ventas-diseno/HomePage.tsx`
- `src/pages/ventas-diseno/QuotesListPage.tsx`
- `src/pages/ventas-diseno/ReportsPage.tsx`

**Cuentas reales usadas** (password = email, ver `project_roster_usuarios_reales_atlanticerp.md`):
- `neil.quiel@atlantic.com.pa` (vendedor_disenador) — tiene `ventas_diseno.read`.
- `carlos@atlantic.com.pa` (tecnico_servicios) — NO tiene `ventas_diseno.read`, usado
  para el check negativo.

**Smoke test permanente:** `e2e/preqa-scrum741-catalogo-boton-20260808.spec.ts` (4 tests,
serial) — se deja en el repo como test permanente porque el criterio ya se rompió una vez
(un `disabled` residual de un ticket anterior que nadie limpió al habilitar el mismo botón en
otras pantallas).

## Checklist ejecutado

| # | Escenario | Resultado |
|---|---|---|
| 1 | Inicio -> click "Catálogo" -> navega a `/ventas-diseno/catalog`, carga con datos reales (49 productos), sin error JS ni pantalla de error. "Nueva cotización" sigue habilitado. | PASA |
| 2 | Cotizaciones -> mismo check. "Nueva cotización" sigue habilitado. | PASA |
| 3 | Reportes -> mismo check. Botón ya no aparece con estilo `disabled` (antes gris/`cursor-not-allowed`). Toggle de configuración no visible para este rol (esperado, requiere `ventas_diseno.reports.configure` que `vendedor_disenador` no tiene) — no bloquea, es comportamiento de otro criterio no tocado por este fix. | PASA |
| 4 | `/ventas-diseno/catalog` sigue exigiendo `ventas_diseno.read` — cuenta `carlos@atlantic.com.pa` (tecnico_servicios) redirigida a `/servicios/inicio` (su home real), nunca renderiza el Catálogo. Ruta no se amplió. | PASA |

## Camino de ruptura intentado (Paso 3)
- Doble navegación al mismo botón desde 2 pantallas distintas en la misma sesión — sin
  side-effects, cada click navega limpio.
- Cuenta sin permiso (`carlos`) contra la ruta directa por URL (no solo el botón oculto) —
  bloqueada por `RequirePermission`, no solo un botón escondido.
- Errores de consola/JS (`page.on('pageerror')`) monitoreados en las 3 navegaciones — ninguno.

## Lo que sí funciona
- Los 3 botones "Catálogo" navegan y la pantalla de Catálogo carga con datos reales.
- Botones vecinos ("Nueva cotización" en Inicio/Cotizaciones) no se rompieron por el cambio.
- Guardia de permiso de la ruta `/ventas-diseno/catalog` (`ventas_diseno.read`) intacta.
- Tests unitarios de los 3 archivos (58 tests) verificados en vivo, PASA.

## Veredicto
**PASA — pasada limpia, sin hallazgos.** Ticket queda listo para pasar de `Dev Testing` a `QA`.
Marcador de gate creado: `~/.claude-preqa-markers/SCRUM-741`.
