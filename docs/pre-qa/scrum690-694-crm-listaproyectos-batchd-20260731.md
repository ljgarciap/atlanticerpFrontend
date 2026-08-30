# Pre-QA — SCRUM-690→694 (REQ-610→614, Batch D "Lista de Proyectos", Epic CRM SCRUM-332)

**Fecha:** 2026-07-31
**Alcance:** backend (`atlanticerp-backend`, rama `dev`, commit local `3e8d63d` sin pushear) + frontend
(`atlanticerp-frontend`, rama `dev`, commit local `6a36b2c` sin pushear).
**Entrada:** Senior Review 🟢 aprobado tras re-check del blocker #1 (buscador reactivo).
Visual Review 🟢 aprobado, sin CRÍTICOs contra `2B__CRM_Lista_Proyectos.html`.
**Excel cruzado** (`7__Requerimientos_CRM.xlsx`, hoja "Historias de Usuario", filas HU-610→614):
sin reglas adicionales al texto de Jira — Jira ya es fiel al Excel para este batch.

## Paso 0 — permisos/valores paramétricos/datos sembrados

- Ningún criterio del lote menciona una persona puntual con capacidad especial — no aplica
  `SpecialPermissionSeeder`.
- Ningún umbral/margen/porcentaje de negocio — no aplica tabla paramétrica.
- Dependencia de otro ticket: REQ-612/614 reusan el modal/mecanismo de Pipeline
  (`?card=`/`?openNewProject=1`), ya desplegado y cableado desde Batch C — confirmado en código
  (`PipelinePage.tsx`) antes de probar.
- **Dato sembrado**: `pipeline_cards` estaba en 0 filas al empezar esta sesión (el Visual Reviewer
  la había sembrado y reasignado horas antes, pero `infra/test.sh` comparte la misma base que dev
  local y la resetea — gotcha ya documentado en `CLAUDE.md`). Se corrió
  `VentasDisenoDemoSeeder` + reasignación manual vía tinker para cubrir: 2 tarjetas de un Vendedor
  real (Neil Quiel, una con `amount`/`worked_area_m2` null y otra con ambos con valor), 1 tarjeta
  de otro Vendedor real (Vanessa, para poder probar fuga de scope entre pares), 2 tarjetas de
  Gerencia (Daniela). Se repitió la siembra al final de la sesión porque `infra/test.sh` volvió a
  resetear la base tras correr la suite con el fix — estado final de datos consistente con lo de
  arriba.
- **Rol "Líder" vs "Gerencia"**: no son sinónimos automáticos en este módulo — se confirmó en
  código (`RoleModuleVisibility`) que solo el rol `management` tiene `can_view_team=true` para el
  módulo `ventas_diseno`; el rol `lider_admin_contab` (Felix, `conta@atlantic.com.pa`) no
  tiene ninguna fila de visibilidad para `ventas_diseno` en absoluto (`view=false`), por lo que ni
  siquiera puede entrar a `/crm/projects` (403 backend, redirect frontend). Esto es consistente con
  el resto del módulo (mismo gate que Pipeline/Clientes), no es un gap de este batch.

## Paso 1-3 — Criterios + intentos de ruptura

### REQ-610 (SCRUM-690) — Tabla, alcance, columnas

| Escenario / intento de ruptura | Resultado |
|---|---|
| Vendedor (Neil) ve solo sus proyectos por defecto | OK — 2/2 tarjetas propias, ninguna ajena |
| Vendedor forzando `?scope=team` directo en la URL de la API (sin pasar por la UI) | Bloqueado — backend ignora el parámetro, sigue devolviendo solo sus propios registros (`can_view_team: false`) |
| Vendedor forzando `?owner_id=<otro vendedor>` sin `scope=team` | Bloqueado — mismo resultado, se ignora |
| Vendedor forzando `?scope=team&owner_id=<otro>` combinados | Bloqueado — combinación también ignorada, confirmado por curl directo contra el backend real |
| Vendedor forzando el bypass también contra `/export` (CSV) | Bloqueado — el CSV tampoco filtra por el owner ajeno |
| Gerencia (Daniela) con `scope=team` ve todo el equipo | OK — 6/6 tarjetas, de 3 responsables distintos |
| Columnas exactas (10, mismo orden) | OK — confirmado en pantalla y en el `<thead>` |
| Etapa con color de Pipeline | OK — mismo `PIPELINE_STAGES` |
| Etiqueta = valor real | OK — Diseño/Cotización/Diseño+Cotización/vacío→"—" |
| Valor/Superficie "—" cuando falta | OK — confirmado con tarjetas reales con `amount`/`worked_area_m2` null |

### REQ-611 (SCRUM-691) — Filtros y buscador

| Escenario / intento de ruptura | Resultado |
|---|---|
| Búsqueda de texto en tiempo real, sin botón "Buscar" | OK — confirmado que no existe el botón y que el filtro corre por `onChange` puro |
| Búsqueda case-insensitive, proyecto o cliente master | OK (ya cubierto por Senior Review, `ilike`) |
| Filtro Responsable sin efecto para Vendedor, ni oculto ni forzable | OK — no visible en UI para Neil/Vanessa; forzado por API, ya cubierto arriba (se ignora) |
| Filtro Etapa/Etiqueta combinados (AND) | OK — confirmado con combinaciones múltiples |
| Sin resultados → mensaje exacto | OK — "Sin resultados para los filtros actuales", texto literal, no una tabla vacía silenciosa (verificado con un término de búsqueda inexistente) |
| Cambiar de página y luego aplicar un filtro nuevo | OK — no queda una página fuera de rango con 0 resultados confusos; o vuelve a página 1 con datos o muestra el mensaje real de sin resultados |
| Conteo "X proyectos" / "Y en total" son números distintos | OK (ya cubierto por Senior Review y test automatizado) |

### REQ-612 (SCRUM-692) — Navegación a Pipeline con highlight

| Escenario / intento de ruptura | Resultado |
|---|---|
| Clic en cualquier parte de la fila navega a Pipeline con `?card={id}` | OK |
| Se abre el modal de detalle de esa tarjeta en Pipeline | OK, confirmado en Visual Review y re-confirmado acá |

### REQ-613 (SCRUM-693) — Exportar CSV

| Escenario / intento de ruptura | Resultado |
|---|---|
| Exportar con filtro de etapa aplicado → solo esas filas | OK (ya cubierto por Senior Review y test automatizado) |
| Exportar con scope "Mías" → solo las propias, nunca las de otro responsable | OK — confirmado con Neil, el CSV nunca contiene "Amenidades Delta" (proyecto de Daniela/Vanessa) |
| Exactamente 10 columnas, sin RUC/teléfono | OK — cabecera exacta confirmada en el archivo real descargado vía navegador |
| Doble clic en "Exportar CSV" | El botón se deshabilita mientras `exportMutation.isPending` (prop `loading` del componente `Button`, mismo patrón ya usado en el resto de la app) — no es una operación con efecto de escritura en BD (a diferencia del bug de idempotencia de Batch C), así que un doble disparo en el peor caso son 2 descargas idénticas, no datos duplicados. Confirmado además que 2 requests concurrentes directos al endpoint devuelven contenido idéntico (operación de lectura, sin estado) |

### REQ-614 (SCRUM-694) — "+ Nuevo Proyecto"

| Escenario / intento de ruptura | Resultado |
|---|---|
| Clic navega a Pipeline y abre el modal de creación sin clic adicional | OK, confirmado con Neil (Vendedor) |
| Usuario sin `ventas_diseno.read` (Felix) intentando llegar a la pantalla | Bloqueado antes de poder ver el botón — la ruta completa `/crm/projects` está gateada por `RequirePermission permission="ventas_diseno.read"` en el frontend y por el mismo permiso en el backend (403 confirmado por curl); mismo patrón que Pipeline, no es un gap nuevo de este batch |

## Hallazgos

Ninguno bloqueante. Se identificó un hueco de cobertura de test (no un bug) ya señalado por Senior
Review como sugerencia 🟡 #4: la suite de PHPUnit no probaba el bypass adversarial de
`scope=team`/`owner_id` forzado a mano. El comportamiento en runtime ya era correcto (confirmado
manualmente con curl contra el backend real antes de tocar el test), pero se agregó
`test_vendedor_no_puede_forzar_scope_team_ni_owner_id_de_otro_mandandolo_directo` a
`ProjectsListControllerTest.php` para dejarlo cubierto de forma permanente — commit aparte, chico,
en `dev`.

## Lo que sí funciona

- Alcance Mías/Equipo sin ninguna fuga de datos entre vendedores, ni desde la UI ni forzando
  parámetros directo contra la API (el hallazgo más caro posible en este batch — no se encontró).
- Las 10 columnas de tabla y CSV coinciden exactamente, sin datos no visibles en pantalla.
- Mensaje de "sin resultados" real, no una tabla vacía sin explicación.
- Filtro Responsable realmente sin efecto (y sin poder forzarse) para Vendedor.
- Paginación no queda en un estado confuso al combinar cambio de página + filtro nuevo.
- Navegación REQ-612/614 funcional y consistente con el mecanismo ya usado en Batch C.
- Gate de permiso de toda la pantalla (`ventas_diseno.read`) consistente entre frontend y backend.

## Verificaciones ejecutadas

```
$ infra/test.sh --filter=ProjectsListControllerTest
OK (18 tests, 79 assertions)          ← incluye el test nuevo de bypass

$ vendor/bin/phpstan analyse --memory-limit=512M
[OK] No errors

$ npx tsc --noEmit
(sin salida — limpio)

$ npx playwright test e2e/preqa-scrum690-694-crm-listaproyectos-20260731.spec.ts
8 passed
```

## Artefactos generados

- `atlanticerp-backend/tests/Feature/VentasDiseno/ProjectsListControllerTest.php` — test nuevo de
  bypass de scope (commit aparte, `dev`, sin pushear — pendiente de OK de Luis para push).
- `atlanticerp-frontend/e2e/preqa-scrum690-694-crm-listaproyectos-20260731.spec.ts` — suite Playwright
  permanente (8 tests): alcance sin fuga, sin resultados, búsqueda reactiva, navegación REQ-612,
  CSV con scope y columnas exactas, REQ-614, paginación+filtro.

## Veredicto

**Pasada limpia.** Los 5 tickets (SCRUM-690, 691, 692, 693, 694) pasan a `QA`.
