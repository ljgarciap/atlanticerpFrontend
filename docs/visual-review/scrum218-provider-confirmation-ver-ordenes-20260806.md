# Visual Review — SCRUM-218 (REQ-148/REQ-155): Confirmación del proveedor duplicada a Ver Órdenes

**Fecha:** 2026-08-06
**Alcance:** cierre del hallazgo CRÍTICO dejado abierto por la auditoría completa de Logística
del 2026-08-05 (`docs/visual-review/logistica-auditoria-completa-20260805.md`) — "Confirmación
del proveedor" (documento + validación IA + discrepancias) solo vivía en Logística pese a que
REQ-148 declara su ubicación en Ver Órdenes. Decisión de Luis (2026-08-06): duplicar, sin UI de
subida en Ver Órdenes.
**Mockups de referencia:** `2B__Compras_Logistica.html` (adjunto SCRUM-218) y `2H__Compras_NuevaOrden.html`
(adjunto SCRUM-211, ubicación declarada de REQ-148) — ninguno de los dos dibuja la pantalla de
detalle de orden (Ver Órdenes/`OrderDetailPage.tsx`), confirmado revisando ambos adjuntos vía
Jira. **No existe mockup de Ver Órdenes para esta funcionalidad** — la comparación de fidelidad
visual contra mockup no aplica para la parte nueva; sí aplica confirmar que Logística no cambió.
**Método:** verificación en vivo con Playwright contra Docker local (`http://localhost:8090`,
login real `gerencia2@atlantic.com.pa`/`lider_compras`) + lectura de código.

## Logística — confirmar que la extracción del componente no cambió nada visible

`ProviderConfirmationPanel` se movió de estar definido inline en `LogisticsPage.tsx` a un archivo
compartido (`src/components/compras/ProviderConfirmationPanel.tsx`), reusado tal cual — el diff
del commit confirma que es una extracción pura (mismo JSX, mismas clases, mismos hooks). Captura
en vivo (`/compras/logistica`, sin envíos activos en este momento en el Docker local): encabezado,
subtítulo, buscador, filtros de proveedor/responsable/proyecto, y chip "Retrasados" — todo idéntico
a la estructura confirmada como "Cumple" en la auditoría del 2026-08-05. Sin envíos activos para
capturar la tarjeta con el checklist de documentos en este momento (dato de prueba limpiado por el
Pre-QA de esta misma sesión), pero el mecanismo no cambió: `LogisticsPage.test.tsx` (19/19,
incluye los casos de subida y de renderizado del panel de confirmación) pasa sin modificar ninguna
aserción existente.

**Veredicto Logística: Cumple, sin cambios visuales.**

## Ver Órdenes — card nuevo, de solo lectura

Verificado en vivo en el detalle de una orden real (`/compras/ordenes/:id`):
- El nuevo card "Confirmación del proveedor" sigue el mismo patrón visual que
  `PurchaseOrderPaymentsPanel` (ya presente en esta pantalla): `Card variant="panel"`, título en
  mayúsculas `text-xs font-bold uppercase tracking-wide text-slate-400`.
- Confirmado por inspección real del DOM (no solo lectura de código): `input[type=file]` count = 0
  en esta pantalla — no hay ningún control de subida, tal como pidió Luis.
- El Pre-QA de esta misma sesión (subagente real, minutos antes de esta revisión) ya verificó en
  vivo con datos reales el camino feliz completo (documento subido en Logística → mismo documento
  y mismo estado de validación visibles en Ver Órdenes, botón Validar/Revalidar funcional desde
  ambas pantallas, sincronización sin reload manual) — no se repite esa captura acá para no
  duplicar trabajo, se referencia como evidencia ya obtenida en la misma sesión
  (`docs/pre-qa/scrum218-provider-confirmation-ver-ordenes-20260806.md`).
- Estado vacío (orden sin documento de confirmación subido) confirmado en vivo: texto claro
  indicando que la subida se hace desde Logística, sin error de consola.

**Veredicto Ver Órdenes: Cumple con el sistema de diseño existente. Sin mockup propio — N/A para
comparación de fidelidad visual.**

## Conclusión

El hallazgo CRÍTICO que dejó abierto la auditoría del 2026-08-05 (Confirmación del proveedor
ausente en Ver Órdenes) está cerrado. Ningún elemento del mockup de Logística se perdió en la
extracción a componente compartido. No se introduce ninguna superficie de subida nueva en Ver
Órdenes, conforme a la decisión explícita de Luis.

Sin hallazgos CRÍTICOS ni MEDIOS. Aprobado — pasa a QA.
