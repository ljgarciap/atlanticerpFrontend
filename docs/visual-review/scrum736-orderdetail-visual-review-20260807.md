# Visual Review — SCRUM-736: Detalle de Orden de Compra vs. mockup aprobado

**Fecha:** 2026-08-07
**Commit revisado:** `95500cc` (`feat(compras): rework Purchase Order detail view to match approved mockup (SCRUM-736)`), branch `dev`
**Componente:** `atlanticerp-frontend/src/pages/compras/OrderDetailPage.tsx`
**Mockup de referencia:** adjunto de Jira SCRUM-736, captura aprobada (`captura2.png`) + `mockup.html` interactivo. La primera captura adjunta al ticket (`captura1.png`) es un estado ANTERIOR de dev, no se usó como referencia.
**Resultado: APROBADO — sin hallazgos CRÍTICOS. Listo para Pre-QA.**

## Incidente durante la revisión (no es un hallazgo del ticket)

Al arrancar la verificación, el checkout compartido de `atlanticerp-frontend` (no un worktree) apareció
en la rama `fix-quotepage-flake` con un commit nuevo (`1387a29`) encima — otro proceso concurrente
cambió de rama en el mismo directorio de trabajo mientras esta revisión estaba en curso. El
servidor Vite (puerto 5173) seguía corriendo desde antes y sirvió esa versión vieja del componente
(sin el rework de SCRUM-736: `PurchaseOrderPaymentsPanel` en vez de `...Modal`, sin
`IcoMoreVertical`, botón "Avanzar estado" en vez de "Avanzar a: [Estado]", etc.), lo que produjo una
primera corrida completamente inconsistente con el código revisado por Senior Review. Se confirmó
con `git reflog` que el commit `95500cc` seguía intacto como tip real de `dev`
(`git merge-base --is-ancestor 95500cc dev` → sí), se hizo `git checkout dev` para restaurar el
árbol de trabajo, se mató el proceso de Vite viejo y se relanzó limpio
(`rm -rf node_modules/.vite && npm run dev`) antes de repetir toda la verificación. La rama
`fix-quotepage-flake` no se tocó ni se perdió nada — sigue en su commit `1387a29`, intacta.
Se documenta acá porque llevó a una falsa sospecha inicial de que 4 claves de i18n
(`orders.actions.advanceTo`, `orders.actions.viewOrderPdf`, `orders.detail.moreActions`,
`orders.detail.liquidatingWith`) estaban ausentes de `compras.json` — al re-verificar sobre el
árbol correcto (`dev`), las 4 claves existen y renderizan bien. **No es un hallazgo real, era el
checkout equivocado.**

## Fixture de prueba

La BD local no tenía ninguna Orden de Compra. Se sembró 1 orden real por `tinker` (sin factories
de Compras en el repo) para poder ejercitar la pantalla:

- Orden #3, proveedor "Zona Libre de Colón" (id=1, ya existente), modalidad `zona_libre`,
  status `en_transito_local` (next_status → `recibido`), total $8,400.
- 2 líneas: una con `factory_reference` presente (`NRD-40-BLK-VRT`) y otra con `factory_reference`
  NULL (para ver el fallback `—`), cada una en un `SalesProject` distinto (para ejercitar
  `has_multiple_projects` → "2 proyectos" → modal de desglose).
- 1 `LiquidationAgency` ("Agencia Aduanal Istmo (visual-review-test)") asignada, para la sección
  "Liquidando con".
- 1 `PurchaseOrderPayment` parcial ($4,000 de $8,400), para poblar "Fecha de pago" y el modal de
  Pagos a Proveedores.
- 1 `PurchaseOrderDocument` categoría `confirmacion_proveedor`, para la sección "Confirmación del
  proveedor".

Todo el fixture (orden, líneas, pago, documento, agencia, master/sub-cliente, 2 proyectos, 2
productos de catálogo) se **borró al cerrar esta revisión** — verificado con conteos en 0 después
del cleanup (ver comando en la sesión). Login real usado: `gerencia2@atlantic.com.pa`
(Yirena Teng, `lider_compras`) — sin cuentas demo, regla del proyecto.

## Checklist funcional (contra `captura2.png`)

| # | Elemento del mockup | Resultado |
|---|---|---|
| 1 | Cabecera "Orden #<id>" + subtítulo Proveedor/Modalidad-ubicación/Estado | **CUMPLE con nota** — ver ACEPTABLE #1 |
| 2 | Bloque resumen: Proveedor, Estado, Fecha de orden, Llegada estimada, Responsable, Proyecto asignado, Modalidad de ingreso, Tipo de envío, Fecha de pago (9 campos) | **CUMPLE** — los 9 campos presentes, mismo orden, datos correctos |
| 3 | Botón único "Avanzar a: [Estado]" | **CUMPLE** — texto interpolado correcto ("Avanzar a: Recibido"), clic verificado sin error, desaparece correctamente al llegar al estado terminal (sin next_status) |
| 4 | Tabla de líneas: N° pedido / Ref. fábrica / Referencia pública / Descripción / Cantidad / Costo / Proyecto / Recepción + fila Monto total | **CUMPLE con nota** — ver ACEPTABLE #2 |
| 5 | Botón full-width "Ver Orden (PDF)" | **CUMPLE** — clic verificado, abre popup, sin errores de consola |
| 6 | "Liquidando con: [Agencia]" + botón "Cambiar empresa" (solo Zona Libre) | **CUMPLE** — texto exacto al mockup, buscador de agencias + alta de agencia nueva funcionan |
| 7 | "Confirmación del proveedor": archivo + estado + "Reemplazar archivo" | **CUMPLE** — sección presente y funcional (fuera del alcance de este ticket: no fue tocada por el commit 95500cc, viene de SCRUM-211/218) |

### Decisiones ya aprobadas por Luis (verificadas, no son hallazgos)

- **Pagos a Proveedores detrás de botón/modal:** verificado — botón "Pagos a Proveedores" abre
  modal con Estado de pago, Pagado, Saldo pendiente, Enviar a pago/Registrar pago, historial de
  pagos. Funciona igual que antes, solo cambia dónde vive.
- **"Incluir costo"/"Enviar por correo" en menú "Más acciones":** verificado — el botón kebab (⋮)
  abre un menú con el checkbox y el botón, ambos funcionales.
- **Layout de página completa vs. panel/modal del mockup:** aceptado por diseño — la pantalla usa
  `max-w-3xl` centrado con botón "Ver Órdenes" en vez de un `✕` de modal, mismo criterio que otras
  pantallas de Compras.

### ACEPTABLE (nota, no bloquea)

1. **Subtítulo de cabecera solo muestra Proveedor, no "Proveedor · Estado".** El mockup combina
   ambos en una sola línea (`Zona Libre de Colón · En tránsito local`); el desarrollo solo muestra
   el proveedor. El estado sigue completamente visible como su propio campo "ESTADO" en el bloque
   de resumen, a dos líneas de distancia — no hay pérdida de información ni de funcionalidad, solo
   se dejó de duplicar el dato en dos lugares.
2. **Tabla de líneas no repite la columna "N° de pedido" por fila.** El mockup pone el número de
   orden (idéntico en todas las filas, ej. "#1132") como primera columna de cada línea — dato
   redundante con el título "Orden #3" de la cabecera. El desarrollo lo omite sin afectar ninguna
   funcionalidad (identificar a qué orden pertenece cada línea sigue siendo obvio por contexto de
   página). Encabezados con wording levemente distinto ("Costo unitario" vs. "Costo") — variante
   de texto, mismo dato.

No se encontró ningún CRÍTICO.

## Evidencia

Capturas tomadas con Playwright CLI contra `http://localhost:5173/compras/ordenes/3` (stack local,
orden #3 = fixture de esta revisión, ya borrada): vista normal, menú "Más acciones" abierto, modal
de Pagos a Proveedores, modal de desglose por proyecto, selector de agencia de liquidación, tabla
de líneas + botón PDF, estado tras avanzar a "Recibido". Capturas guardadas fuera del repo
(carpeta de scratchpad de esta sesión) — no se commitean, son artefacto descartable de la
comparación visual, no un test permanente.

## Resultado

Sin hallazgos CRÍTICOS. **Aprobado — el ticket puede avanzar a Pre-QA** (sujeto también a la
aprobación de Senior Reviewer, gate independiente en paralelo — ya 🟢 según
`docs/reviews/scrum736-orderdetail-review-20260807.md`).
