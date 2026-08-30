# Visual Review — Re-check timeline SCRUM-216/217 (REQ-153 RN3/RN4/RN5 + REQ-154)

**Fecha:** 2026-08-05 (noche)
**Alcance:** los 2 hallazgos CRÍTICOS que la auditoría completa de Logística
(`logistica-auditoria-completa-20260805.md`) dejó pendientes sobre esta pantalla — timeline visual
de REQ-154 (ausente por completo) y RN1/RN3/RN5 de REQ-153 (Llegada real editable a mano, ícono de
atraso). NO repite el checklist completo de REQ-151/REQ-155 — esos ya estaban limpios en la
auditoría anterior y no fueron tocados por estos commits.
**Commits revisados:** backend `28461c8` (`feat(compras): per-stage shipment dates + fix
actual_arrival_date auto-fill`), frontend `51e505b` (`feat(compras): shipment timeline component +
read-only actual arrival`), ambos en `origin/dev`.
**Mockup de referencia:** `2B__Compras_Logistica.html`, adjunto SCRUM-216 id **11704** (re-upload
2026-08-05 17:07, mismo contenido byte-a-byte que id 10394 según auditoría previa) — descargado de
nuevo esta sesión y leído directamente (HTML/CSS/JS), no solo el resumen del documento anterior.
**Método:** lectura del mockup real (`advanceStage()`, clases `.tl-dot`/`.tl-step`/`.ship-date-value`),
lectura de código (`ShipmentTimeline.tsx`, `LogisticsPage.tsx`, `PurchaseOrder.php`,
`PurchaseOrderController.php`), y verificación en vivo con Playwright CLI contra Docker local
(`http://localhost:8090`). Se confirmó primero que el `dist/` servido por nginx correspondía al
commit `51e505b` (grep de `shipment-timeline` en el bundle) y que el contenedor `laravel` corría
exactamente `28461c8` (`git log -1` dentro del contenedor) antes de tomar cualquier captura como
válida — el bundle local tenía timestamp de build anterior al commit pero el contenido ya incluía
el componente nuevo (build hecho antes del commit final, no stale).

Se sembraron 3 fixtures mínimos vía `tinker` (2 proveedores nuevos + 3 órdenes) para cubrir los 3
estados que el mockup no deja ver con la data por defecto (vacía en Docker local): orden en medio
de la secuencia normal (2/5), orden recién creada de proveedor local (1/3), y orden en la
penúltima etapa para ejercitar el avance real a "Recibido". Los 3 fixtures y el flip temporal de
un permiso (ver más abajo) se eliminaron/revirtieron al cerrar esta sesión.

---

## Checklist funcional — REQ-154 (línea de tiempo)

| Elemento del mockup | AtlanticERP (verificado en vivo) | Veredicto |
|---|---|---|
| 5 pasos para proveedor normal/internacional, con "Salió de origen" como primer paso | Orden #232 (VR Timeline Normal SA, `en_transito`): 5 `data-testid="timeline-step-*"` (`ordenado`→`recibido`), paso 0 con texto `Salió de origen2026-08-01` | Cumple |
| 3 pasos para proveedor local (Ordenado→En tránsito local→Recibido) — no está en el mockup mismo (su JS de demo no ejercita este caso, confirmado por `grep` — 0 menciones de "local" como origen), pero es comportamiento pedido explícitamente por RN1 de Daniela | Orden #233 (VR Timeline Local SA, `ordenado`): exactamente 3 pasos, paso 0 con texto `OrdenadoEn curso` (NO dice "Salió de origen") | Cumple |
| Punto (`tl-dot`) done/current/pending por paso, con línea conectora | `data-state="done"` en pasos completados, `data-state="current"` en el paso activo, `data-state="pending"` en los futuros — confirmado por atributo real leído del DOM en la orden #232: paso 0 `done`, paso 1 (`en_transito`, estado real de la orden) `current`, paso 2+ `pending` | Cumple |
| Paso completado muestra la fecha en que se completó | Paso 0 de la orden #232: `Salió de origen2026-08-01` — la columna `ordenado_at` (sembrada 5 días antes) se lee y se muestra | Cumple |
| Paso actual visualmente distinto ("En curso") | Paso 1 de la orden #232 y paso 0 de la orden #233 muestran el texto `En curso` (vs. fecha o `—`) — coincide con `current-tag`/`En curso` del mockup | Cumple |
| Pasos futuros atenuados, sin fecha | Pasos 2-4 de la orden #232 muestran `—`, no una fecha — igual que `.tl-date` vacío del mockup | Cumple |
| Botón dice a qué etapa avanza | Mockup: genérico `✓ Completar etapa actual`, sin nombrar destino. AtlanticERP: **`Completar etapa actual → En aduana`** (orden #232) / **`Completar etapa actual → Recibido`** (orden #234, penúltima etapa) — supera al mockup, nombra la etapa real en vez de solo "actual" | Cumple (mejora sobre el mockup) |
| Botón desaparece al llegar a "Recibido" — no queda deshabilitado, no queda ningún resto en el DOM | Orden #234 (`en_transito_local`, penúltima etapa): botón visible con texto `Completar etapa actual → Recibido` antes de click. Tras `click()` + re-render: `getByRole('button', {name: /completar etapa|avanzar/i}).count()` → **0**. Mismo patrón exacto del mockup (`actionWrap.style.display = 'none'`, no `disabled=true`) | Cumple |
| Al completar la última etapa: fecha de hoy se escribe sola en "Llegada real" | Tras el mismo click de arriba, el bloque "Llegada real" pasó de "Pendiente" a **`2026-08-06`** (fecha real del sistema) sin ninguna acción manual — confirma el auto-fill de `actual_arrival_date` en `advance()` (commit backend `28461c8`) | Cumple |
| Ícono de atraso desaparece al llegar a Recibido | Consistente con `PurchaseOrder::isCritical()` (ya confirmado por código en la auditoría anterior, no re-verificado visualmente esta sesión porque el fixture #234 no se sembró como "retrasado" — sin regresión esperada, mecanismo sin cambios en este batch) | Cumple (por código, sin cambio en este batch) |
| Solo Compras (`compras.edit`) ve/usa el botón; otros roles ven el timeline sin botón (RN7) | Ver sección dedicada abajo — verificado con un flip temporal de permiso, no con un usuario real (el roster actual no tiene ningún usuario con visibilidad de Compras pero sin `compras.edit`, ver nota) | Cumple |

**CRÍTICO:** ninguno.

### Nota sobre RN7 — cómo se verificó sin un usuario real "solo lectura de Compras"

El roster real de 32 usuarios (`project_roster_usuarios_reales_atlanticerp`) no tiene, hoy, ningún
usuario con visibilidad del módulo Compras (`role_module_visibility`, `can_view`) que NO tenga
también `compras.edit` a nivel de `security_level_module_permissions` — los únicos roles con
`can_view` sobre `compras` son `management` (niveles 8/9, ambos `can_edit=true`) y `lider_compras`
(nivel 4, `can_edit=true`). Esto ya estaba señalado como fuera de alcance en la auditoría anterior
("no se verificó... bandera para Arquitecto").

Para verificar el gate de todas formas sin esperar a que exista ese usuario, se flippeó
temporalmente `security_level_module_permissions.can_edit` a `false` para el nivel 8
(`id=34`, el nivel de Whileyner Contreras — Gerencia Restringida), se logueó como
`whil@illuminations.com.pa`, se confirmó: página `/compras/logistica` carga con normalidad
(`READONLY_PAGE_HAS_LOGISTICA=true`), timeline visible (`READONLY_TIMELINE_VISIBLE=true`), botón
de avance con conteo **0** en el DOM (`READONLY_ADVANCE_BUTTON_COUNT=0`). Se restauró el valor
original (`can_edit=true`) inmediatamente después y se confirmó la restauración por consulta
directa antes de cerrar esta sesión — no queda ningún cambio de permisos persistente.

**Nota para Arquitecto (no bloqueante para este re-check, hereda la bandera de la auditoría
anterior):** sigue sin existir un usuario real que ejercite este camino en dev/test — si RN7 pide
"cualquier otro rol" (ej. Vendedor/Diseñador) vea el timeline, hoy ningún Vendedor/Diseñador tiene
siquiera `role_module_visibility` para `compras`, así que nunca llega a la pantalla. El código del
botón (`usePermission('compras.edit')`) ya está correctamente gateado — lo que falta, si se
decide, es la visibilidad del módulo en sí para más roles, que es un cambio de alcance distinto
(mismo bucket que RN6/RN7 de la auditoría anterior).

---

## Checklist funcional — REQ-153 RN3/RN4/RN5

| Regla | Mockup | AtlanticERP (verificado) | Veredicto |
|---|---|---|---|
| RN3 — Llegada real se llena SOLO al completar la última etapa | `.ship-date-value.empty` con texto `Pendiente`, nunca un `<input>` — confirmado leyendo el HTML del mockup línea por línea (`<div class="ship-date-value empty">Pendiente</div>`) | `LLEGADA_REAL_INPUT_COUNT=0` en la orden #232 (en curso) — bloque "Llegada real" es un `<p>` de solo lectura. Tras avanzar la orden #234 a Recibido: sigue sin `<input>` (`LASTSTEP_ACTUAL_ARRIVAL_INPUT_COUNT_AFTER=0`), y el texto pasó de "Pendiente" a la fecha real (`2026-08-06`) sin que nadie la escribiera a mano | Cumple |
| RN4 — Llegada real inmutable una vez llena | Implícito (el mockup nunca ofrece un input) | `updateShippingInfo()` ya no acepta `actual_arrival_date` en absoluto (confirmado por código, backend commit `28461c8`) — ni siquiera hay endpoint que lo permita, no solo "la UI no lo muestra" | Cumple |
| RN5 — Ícono de atraso desaparece automáticamente al completar la última etapa | `warnIcon.remove()` en `advanceStage()` | `PurchaseOrder::isCritical()` retorna `false` en cuanto `status === RECIBIDO` (sin cambios en este batch, ya confirmado por código en la auditoría anterior) | Cumple |

**CRÍTICO:** ninguno.

---

## Lo que sí cumple (síntesis)

- Timeline de 5 pasos (proveedor normal) y 3 pasos (proveedor local) — ambas variantes verificadas
  en vivo con fixtures reales, no solo por lectura de código.
- Estados done/current/pending correctos, con fecha real en pasos completados y "En curso" en el
  paso activo.
- Botón de avance nombra la etapa destino real (mejora sobre el mockup) y desaparece del DOM (no
  `disabled`) al llegar a Recibido — confirmado con click real, no simulado.
- Auto-fill de "Llegada real" al llegar a Recibido, confirmado con la fecha real del sistema
  apareciendo sin intervención manual.
- "Llegada real" es de solo lectura en todo momento — 0 `<input>` en el bloque, antes y después de
  llegar a Recibido.
- Gate de `compras.edit` sobre el botón de avance confirmado a nivel de UI (no solo por el 403 de
  API que ya cubría Pre-QA) — el timeline queda visible para cualquier rol con acceso al módulo,
  el botón no.

## CRÍTICO

Ninguno en esta pasada.

## ACEPTABLE (notas, no bloquean)

- El mockup nunca dibuja una secuencia de 3 pasos para proveedor local — esa variante es
  comportamiento pedido por el comentario de Daniela (RN1), no por el propio mockup. Se clasifica
  como cumplimiento pleno de RN1 (no como "variante que se aparta del mockup") porque el mockup
  simplemente no cubre ese caso, no lo contradice.
- Visibilidad de RN7 para roles fuera de Compras/Gerencia sigue sin resolverse (bandera heredada
  de la auditoría anterior, no de este batch) — no bloquea porque el propio REQ-153 original
  limitaba el acceso a "Compras y Gerencia" y este batch no amplió ni redujo ese alcance.

## Veredicto

**SCRUM-216 y SCRUM-217: pasada limpia, sin CRÍTICOs.** Ambos tickets quedan habilitados para
Pre-QA en lo que respecta a fidelidad visual/funcional contra el mockup. No se transicionó el
estado de ningún ticket en Jira — eso queda para Pre-QA, según el protocolo.
