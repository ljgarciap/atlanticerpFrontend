# Visual Review — Bloque B6 "Devoluciones" (SCRUM-473→489, REQ-403→419)

**Fecha:** 2026-07-26
**Reviewer:** Visual Reviewer
**Mockups de referencia:** `3J__Bodega_Devoluciones.html` (adjunto SCRUM-473, bandeja) y
`3K__Bodega_NuevaDevolucion.html` (adjunto SCRUM-484, creación).
**Entorno:** local, Docker Compose (backend `infra-nginx-1` en `localhost:8090`), frontend con
`npm run dev` (Vite, puerto 5173) vía `webServer` de `playwright.config.ts`.
**Herramienta:** Playwright CLI (`npx playwright test`) — specs temporales dentro de
`atlanticerp-frontend/e2e/_vr_b6_*.spec.ts`, borrados al cierre de la revisión, nunca commiteados.
**Usuario de prueba:** `almacen@illuminations.com.pa` (Esteban Cardenas, Jefe de Bodega,
password = email).

**Estado del código revisado:** implementación local en `dev` (ambos repos), sin push a origin
todavía — commit backend `4ab8513` según comentario en `BodegaDevolucionesPage.tsx`.

## Nota sobre el entorno — fixtures sembradas a mano

La base local estaba efectivamente vacía en todos los módulos relacionados (`orders`,
`pipeline_cards`, `sales_projects`, `catalog_products` — 0 filas en los 4). No existía ningún
pedido en etapa `por_despachar`/`despachado`/`entregado` con productos entregados para poder
ejercitar "Nueva devolución" contra un caso real. Se sembró vía tinker (`docker compose exec -T
laravel php artisan tenants:artisan tinker`):
- `SalesProject` "Residencia Punta Pacifica VR" + `PipelineCard` (stage `approved`, owner id 12)
- 2 `CatalogProduct` (`NORDIC-40-VR` / `PERFIL-2M-VR`, con `factory_reference` seteado)
- `Order` `VR-9001` (stage `despachado`) + 2 `OrderItem` con `qty_delivered` > 0

Esta fixture **no se limpió al cierre** (a diferencia del precedente de Bloque B5) porque
representa datos de dominio reutilizables (Order/PipelineCard/CatalogProduct) que probablemente
Pre-QA también necesite sembrar para probar el mismo flujo — queda disponible como
`CustomerReturn::first()` (id 12, `DEV-2026-0001`, hoy en estado `rechazada` tras el escenario de
la sección 3 de este documento). Si Pre-QA prefiere partir de cero, son 3 modelos a limpiar:
`CustomerReturn`/`Order`/`PipelineCard`/`SalesProject`/`CatalogProduct` donde `reference like
'%-VR'` o `order_number = 'VR-9001'`.

---

## Resultado general

**NO PASA — vuelve a Backend/Frontend Dev.** 3 hallazgos CRÍTICOS, todos por **pérdida de
información ya capturada por el sistema pero nunca expuesta de vuelta al usuario** — no son
"falta implementar el endpoint", son casos donde el dato ya viaja en la respuesta del backend (o
ya existe en el modelo) y el frontend lo descarta en algún punto de la cadena. El resto del
checklist (10 endpoints, 5 chips de filtro, fila expandible multi-producto, 5 modales, flujo
completo de creación) se probó en vivo y cumple.

---

## Checklist funcional (derivado de los 2 mockups)

### 3J — Bandeja de Devoluciones
- Header "Devoluciones" + subtítulo + botón "+ Nueva devolución"
- 5 chips de filtro: Todas / Pendientes / Esperando nota de crédito / Finalizadas / Rechazadas
- Tabla: Pedido, Cliente, **Proyecto**, Producto(s), Fecha, Estado, Doc. firmado, Acciones
- Fila multi-producto expandible (chevron + "N productos" → sub-tabla Producto/Cantidad/Motivo)
- Badge de estado con 4 variantes de color
- Celda "Doc. firmado": link al documento o "— pendiente"
- Acciones contextuales por estado: Ver detalle / Ver formulario / Ver guía original / Cargar
  documento firmado / Confirmar recepción física / Simular nota de crédito
- Modal "Ver detalle": título + **cliente · proyecto**, tabla de productos, historial cronológico
  (creación, doc. firmado, recepción **con bodega destino**, notificación a Administración,
  nota de crédito, **rechazo con motivo**)
- Modal "Ver formulario" (documento imprimible) y "Ver guía original" (documento imprimible)
- Modal "Cargar documento firmado": dropzone + input file + Guardar/Cancelar
- Modal "Confirmar recepción física": tabla con cantidad real por producto, select de bodega
  destino (7 opciones), textarea de motivo de rechazo (oculto hasta el primer clic en "Rechazar
  devolución"), botones Guardar/Rechazar/Cancelar

### 3K — Nueva Devolución
- Paso 1: buscador de guía (por pedido/cliente/producto) con resultados mostrando
  cliente/**proyecto**/**fecha de entrega**/cantidad de productos
- Paso 2 (tras seleccionar): subtítulo **"Pedido X · Entregado {fecha} · Vendedor: {vendedor}"**,
  campos de solo lectura Cliente/Proyecto, inputs Nombre/Teléfono de quien devuelve
- Tabla de productos: checkbox, Producto, **Ref. fábrica**, Ref. pública, Cant. entregada,
  Cant. a devolver (tope = entregada), Motivo (select de 6 opciones + detalle si "Otro")
- Validaciones: guía seleccionada, ≥1 producto, nombre+teléfono, cantidad válida y ≤ entregada,
  detalle obligatorio si motivo = "Otro"
- Guardar → estado "Pendiente" → redirige a la bandeja

---

## CRÍTICO

### 1. Columna "Proyecto" — ausente en la bandeja Y en "Ver detalle" (el punto específico de esta revisión)

Confirmado en código y en vivo (capturas `08-bandeja-poblada.png` y `10-modal-ver-detalle.png`):
la columna "Proyecto" del mockup 3J **no existe en ningún lugar posterior a la creación** de la
devolución.

- `CustomerReturnController::formatRow()` (fuente de `index()` Y de `show()`, porque
  `formatDetail()` hace `...$this->formatRow($customerReturn)`) nunca incluye `project`.
- `CustomerReturnDetailModal.tsx` solo pinta `data.customer_name` como subtítulo — nunca
  `project`, y el tipo `CustomerReturnRow`/`CustomerReturnDetail` no lo declara.
- El dato **sí existe y es barato de exponer**: `Order->pipelineCard?->salesProject?->name` ya se
  usa exactamente así en `CustomerReturnService::orderDetail()` (el buscador de 3K), y `order` ya
  viene eager-loaded en `index()` (`->with(['order', ...])`) y en `show()`
  (`->with(['order', ...])`) — agregar `'project' => $customerReturn->order->pipelineCard
  ?->salesProject?->name` a `formatRow()` no requiere una query adicional.

Respondiendo al punto específico del brief: **no hay ningún lugar de la UI real donde el usuario
pueda ver a qué proyecto pertenece una devolución ya creada** — ni la tabla, ni "Ver detalle". Es
CRÍTICO por definición del rol (funcionalidad del mockup ausente, no una variante de layout): un
supervisor de Bodega mirando la bandeja de devoluciones no tiene forma de saber a qué proyecto
corresponde cada fila sin ir a buscar el pedido en otro módulo.

**Cómo verificarlo:** `GET /api/bodega/returns` y `GET /api/bodega/returns/{id}` — ninguno de los
dos trae `project` en el payload, pese a que `search-orders` (mismo controller) sí lo trae.

### 2. Columna "Ref. fábrica" — ausente en la tabla de productos de "Nueva devolución"

Confirmado en código y en vivo (`04-nueva-devolucion-form.png`): la tabla de 3K en el mockup
tiene 6 columnas de datos (Producto, **Ref. fábrica**, Ref. pública, Cant. entregada, Cant. a
devolver, Motivo); la real tiene 5 (sin Ref. fábrica).

- `CustomerReturnService::orderDetail()` solo devuelve `reference` (que resuelve a
  `catalogProduct->reference ?? reference_snapshot`, es decir la ref. **pública**) — nunca
  `factory_reference`.
- El dato existe en el modelo: `CatalogProduct::factory_reference` se usa activamente en otros
  controllers del mismo módulo (`WarehouseController`, `CatalogProductSearchController`,
  `InventoryController`).
- Evidencia de que era intencional en el frontend: `bodega.json` (es/en) ya tiene la clave
  `returns.newReturnPage.table.factoryRef` = "Ref. fábrica" **completamente sin usar** — ningún
  componente la referencia. El tipo `ReturnSearchOrderItem` tampoco declara `factory_reference`.

Menos severo que el hallazgo 1 (el usuario todavía puede identificar el producto por descripción
+ ref. pública + cantidad), pero es un campo del mockup explícitamente ausente y no una variante
de estilo — clasificado CRÍTICO por la regla "ante la duda, CRÍTICO".

### 3. Historial: motivo de rechazo y bodega destino nunca se muestran

Confirmado **en vivo** (captura `25-detalle-tras-rechazo-historial.png`): tras rechazar la
devolución con motivo "El producto llego en perfecto estado, no corresponde devolucion (prueba
VR).", el historial en "Ver detalle" muestra únicamente:

```
Rechazada — 7/26/2026, 8:52:33 AM (Esteban Cardenas)
```

Sin rastro del motivo — el mockup muestra explícitamente `'✕ Rechazada — ' + fecha + ': ' +
motivo`. Mismo patrón para la recepción física: `CustomerReturnService::historyPayload()` sí
arma el paso `received` con la clave `destination_warehouse` (nombre de la bodega), pero
`CustomerReturnDetailModal.tsx` solo renderiza `entry.label`/`entry.at`/`entry.by` — nunca
`entry.destination_warehouse` ni `entry.reason` — y el tipo `CustomerReturnHistoryEntry` en
`types/bodega.ts` ni siquiera declara esos dos campos, aunque el backend los envía.

Esto es más grave que "layout distinto": **hoy no existe ningún lugar de la aplicación donde se
pueda ver por qué se rechazó una devolución**, ni a qué bodega entró el stock devuelto — la
única forma de recuperar esa información es consultando la base de datos directo
(`rejection_reason`/`destination_warehouse_id` sí se guardan correctamente). Para una devolución
rechazada, esto rompe la trazabilidad que el propio ticket (REQ-411) pide.

**Cómo verificarlo:** repetir el flujo (Confirmar recepción física → Rechazar devolución →
escribir motivo → Confirmar rechazo → Ver detalle) — el historial nunca menciona el motivo
tecleado. `CustomerReturn::find(12)->rejection_reason` en tinker confirma que el dato sí se
guardó.

---

## ACEPTABLE (nota, no bloquea)

- **Subtítulo del paso 2 sin fecha de entrega ni vendedor.** El mockup muestra "Pedido X ·
  Entregado {fecha} · Vendedor: {vendedor}"; el real solo muestra "Pedido X · {cliente}". El
  backend ya trae `committed_delivery_date` y `vendedor` en `ReturnSearchOrderResult` (confirmado
  en el tipo y en `orderDetail()`), pero `BodegaNuevaDevolucionPage.tsx` nunca los consume (grep
  sin resultados). Es información de contexto/verificación, no bloquea seleccionar productos ni
  enviar la devolución — pero como el dato ya está disponible sin costo adicional, vale la pena
  que Frontend Dev lo agregue en el mismo pase que corrija los CRÍTICOs de arriba.
- **Celda "Doc. firmado" no es un link clickeable en sí misma** (en el mockup sí abre el
  formulario al hacer clic); en el real es solo un badge. No hay pérdida de funcionalidad — el
  botón "Ver formulario" en la misma fila hace exactamente lo mismo.
- **Botón "Simular: Admin completó nota de crédito"** del mockup se llama "Simular finalización"
  en el real — mismo botón, mismo efecto (mueve a `finalizado`), solo cambia el texto.
- **Orden/agrupación de acciones por fila** — variante de layout (lista vertical de links +
  1 botón primario) vs el mockup (lista similar) — sin diferencia funcional.

---

## Lo que sí cumple (confirmado en vivo con Playwright)

- Navegación: entrada "Devoluciones" dentro del submenú "Inventario" del Sidebar de Bodega, ruta
  `/bodega/devoluciones` — igual jerarquía que el mockup (comentario en `Sidebar.tsx` está
  desactualizado, dice "sigue en placeholder" pero el código ya está bien wireado).
  `/bodega/devoluciones/nueva` accesible desde el botón "+ Nueva devolución".
- 5 chips de filtro (Todas/Pendientes/Esperando nota de crédito/Finalizadas/Rechazadas) — clases
  de color coinciden con el mockup (pendiente/esperando = ámbar, finalizado = verde, rechazada =
  rojo).
- Fila expandible multi-producto: 2 productos en una misma devolución se colapsan en
  "2 productos" con chevron, expande una sub-tabla Producto/Cantidad/Motivo — igual que 3J.
- Flujo completo de creación probado de punta a punta contra un pedido real sembrado (`VR-9001`,
  2 productos): buscar → seleccionar → ver Cliente/Proyecto autocompletados correctamente →
  marcar productos → cantidad con tope de la entregada → contacto → Guardar → estado "Pendiente"
  → aparece en la bandeja.
- Selector de bodega destino en "Confirmar recepción física" con las 7 opciones exactas del
  mockup (Bodega Central, Bodega Zona Libre, Showroom Obarrio, Showroom SM, Showroom Cliente,
  Merma, Reclamos y Devoluciones) — confirmado contra `Warehouse::pluck('name','id')` real.
- Patrón de doble clic para "Rechazar devolución" (primer clic revela el campo de motivo sin
  enviar nada, segundo clic con motivo ya escrito confirma) — igual al mockup, probado en vivo.
- "Cargar documento firmado": dropzone + validación de extensión/tamaño client-side, sube el
  archivo real (multipart), la fila pasa de "Cargar documento firmado" a "Confirmar recepción
  física" automáticamente tras el upload.
- Sin iconografía de emoji en ningún elemento de UI (regla SCRUM-56) — el mockup usa
  emoji/glyphs (📄🖨️📎🔒) en varios botones/labels, el desarrollo real los reemplaza
  correctamente por texto plano o los componentes SVG de `components/icons/`.
- Modales cierran con backdrop click y botón X/Cancelar (patrón `closeOnBackdrop` del mockup).

---

## Veredicto

**Vuelve a Backend/Frontend Dev — 3 hallazgos CRÍTICOS.** Los tres comparten la misma causa raíz
(dato ya capturado/disponible que se pierde en el camino hacia la UI), lo que sugiere un mismo
pase de corrección:

1. Backend: agregar `project` a `formatRow()` (`CustomerReturnController`), reutilizando
   `$customerReturn->order->pipelineCard?->salesProject?->name` (ya eager-loaded).
2. Backend: agregar `factory_reference` a los items de `orderDetail()`
   (`CustomerReturnService`), y frontend: agregar la columna en la tabla de `BodegaNuevaDevolucionPage.tsx` (la traducción `table.factoryRef` ya existe).
3. Frontend: extender `CustomerReturnHistoryEntry` (`types/bodega.ts`) con
   `destination_warehouse`/`reason` opcionales, y renderizarlos en
   `CustomerReturnDetailModal.tsx` cuando estén presentes (el backend ya los envía, no requiere
   cambio de contrato).

Cuando el fix esté listo, re-correr el checklist completo de ambas pantallas (no solo los 3
ítems) antes de dar luz verde — según el protocolo de este rol.

**Notificado a PM vía Telegram.**

---

## Re-check (2026-07-26, mismo día) — PASA

Fix aplicado en backend commit `e4ab2dc` y frontend commit `806f6ac` (ambos locales en `dev`,
sin push todavía al momento de este re-check). Confirmado en código antes del re-check en vivo:

1. `CustomerReturnController::formatRow()` ahora incluye `'project' => ...pipelineCard?->salesProject?->name`.
2. `CustomerReturnService::orderDetail()` ahora incluye `'factory_reference' => $item->catalogProduct?->factory_reference`.
3. `CustomerReturnService::historyPayload()` ya enviaba `destination_warehouse`/`reason` (no cambió);
   el fix real fue en el frontend: `CustomerReturnDetailModal.tsx` ahora renderiza ambos campos
   cuando están presentes en cada paso del historial.

**Re-corrido en vivo con Playwright** (fixture VR-9001 resembrada de cero tras un `infra/test.sh`
que había borrado la del review original — mismos IDs de dominio, folios de devolución nuevos:
`DEV-2026-0003`/`DEV-2026-0004`). 2 specs temporales (`e2e/_vr_b6_recheck.spec.ts`, borrado al
cierre, nunca commiteado):

- Flujo completo 3K (buscar guía → columna Proyecto en resultado → autocompletar Cliente/Proyecto
  → columna Ref. fábrica con valor real → crear) → 3J (columna Proyecto en la bandeja → cargar
  documento firmado → confirmar recepción física con bodega destino real → Ver detalle → historial
  muestra "Bodega destino: Bodega Zona Libre").
- Flujo de rechazo 3J (crear → cargar documento → confirmar recepción física → doble clic
  "Rechazar devolución" con motivo → Ver detalle → historial muestra el motivo tecleado textual).

Ambos specs pasan, cero `pageerror` de consola. Capturas confirman visualmente los 3 puntos
(`vr-b6-06-detalle-con-bodega.png`: "Bodega destino: Bodega Zona Libre"; `vr-b6-08-...`: "Motivo:
El producto llego en perfecto estado..."). El resto del checklist original (10 endpoints, 5 chips,
fila expandible, 5 modales) no cambió de código y no se re-probó ítem por ítem — el fix fue
quirúrgico y acotado a los 3 campos señalados, confirmado por el diff de ambos commits.

**Veredicto final: PASA — avanza a Pre-QA.**
