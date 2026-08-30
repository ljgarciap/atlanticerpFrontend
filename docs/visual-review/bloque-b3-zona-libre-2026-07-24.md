# Visual Review — Bloque B3 "Zona Libre de Colón" (2026-07-24)

**Tickets:** SCRUM-433→441 (REQ-363→371, Nueva Orden Zona Libre — 3C) y SCRUM-442→445
(REQ-372→375, Bandeja Órdenes Zona Libre — 3D).
**Commit revisado:** `1bf08b4` (rama `dev`, `atlanticerp-frontend`, working tree clean).
**Mockups de referencia:** `3C__Bodega_NuevaOrdenZL.html`, `3D__Bodega_OrdenesZL.html`.
**Método:** Playwright CLI contra `http://localhost:5173` + backend Docker local, usuario
`almacen@atlantic.com.pa` (lider_bodega). Fixtures sembradas a mano vía tinker (provider
"Zona Libre de Colón" ya existía por `ZonaLibreProviderSeeder`; se agregaron 2 `CatalogProduct`
con `provider_id` de ese proveedor + stock en 2 bodegas, y 3 `BodegaZonaLibreRequest` en los 3
estados posibles) — la DB local no traía data de Zona Libre antes de esta sesión.

## Checklist funcional — 3C: Nueva Orden Zona Libre

| Elemento del mockup | Implementado | Funciona |
|---|---|---|
| Título + subtítulo | Sí | — |
| Aviso de restricción de proveedor único (banner ámbar) | Sí (sin emoji 🔒, por SCRUM-56) | — |
| Panel "Proveedor" fijo, sin selector, con nombre real | Sí | — |
| Buscador (ref. fábrica / ref. pública / nombre) | Sí | Sí, verificado con "NORDIC" → 1 resultado, "zzz-no-existe" → vacío |
| Tabla productos: Ref. fábrica / Ref. pública / Producto / Disponible / Bodegas / Costo unitario / Cantidad a pedir / acción | Sí, mismo orden de columnas | Sí |
| "Ver bodegas" → modal desglose por bodega | Sí (`ZonaLibreWarehousesModal`) | Sí, confirmado con 2 bodegas (Bodega Central 3, Bodega Zona Libre 6) |
| Cantidad 0 o inválida no agrega línea, feedback inline | Sí | Sí, mensaje "Escribe una cantidad mayor a 0..." |
| Producto agregado desaparece de "disponibles" (REQ-365) | Sí | Sí, confirmado (Farol desapareció tras agregarlo) |
| Panel "Productos en esta orden" oculto con carrito vacío | Sí | Sí |
| Carrito: Producto/Ref. fábrica/Ref. pública/Cantidad/Costo/Subtotal/Editar/Quitar | Sí | Sí |
| Editar cantidad de línea (rechaza 0/inválido) | Sí — input inline + Confirmar/Cancelar (mockup usa `prompt()`) | Sí |
| Quitar línea (vuelve a aparecer en disponibles) | Sí | Sí, verificado explícitamente: se agregó "Farol exterior solar" al carrito, se quitó, y reapareció en la tabla de disponibles junto con el otro producto |
| Monto total | Sí | Sí, recalcula correctamente ($560 → $1235 con 2 líneas) |
| Modalidad de ingreso (select disabled, fijo "Zona Libre") | Sí | Sí |
| Tipo de envío (Terrestre/Aéreo/Marítimo, default Terrestre) | Sí | Sí |
| Llegada estimada (date input) | Sí | Sí |
| Botón "Guardar orden de compra" solo con carrito no vacío | Sí (el panel completo, botón incluido, está condicionado a `cart.length > 0`) | Sí |
| Panel "Orden guardada": número, estado "Pendiente por aprobar de Yirena (Compras)", nota, botón "Ir a Ver Órdenes", link "Crear una nueva" | Sí | Sí — "Crear una nueva" resetea el formulario en el mismo lugar (mockup usa `location.reload()`, mismo resultado funcional) |

## Checklist funcional — 3D: Bandeja Órdenes Zona Libre

| Elemento del mockup | Implementado | Funciona |
|---|---|---|
| Título + subtítulo | Sí | — |
| Botón "+ Nueva orden de compra" → navega a 3C | Sí | Sí |
| Chips Todas/Por aprobar/Aprobadas/Rechazadas, mutuamente excluyentes | Sí | Sí, filtrado server-side confirmado por status |
| Tabla: N° orden/Proveedor/Fecha creada/Productos/Monto/Llegada estimada/Estado/Acción | Sí, mismo orden de columnas | Sí |
| Estado "Por aprobar" (ámbar) | Sí | Sí |
| Estado "Aprobada" (verde/teal) | Sí | Sí |
| Estado "Rechazada" (rojo) | Sí | Sí |
| Acción pendiente → "Recordar" (icono, no emoji — mockup usa 🔔, dev usa `IcoBell`, SCRUM-56) | Sí | Sí, feedback inline "Recordatorio enviado a Compras." tras click |
| Acción rechazada → "Ver motivo" → modal con motivo real | Sí | Sí, modal muestra motivo completo |
| Acción aprobada → texto "Sigue el flujo normal de Compras", sin botón | Sí | Sí |
| Estado vacío "No hay órdenes con este estado." | Sí | Sí, confirmado antes de sembrar fixtures (tablero sin data) |

## CRÍTICO

Ninguno. Los 13 tickets del bloque tienen su funcionalidad completa y operativa contra la app real.

## ACEPTABLE (notas, no bloquean)

- **Mensaje de "sin resultados" único en el buscador de productos (3C).** El mockup distingue dos
  textos ("Ya agregaste todos los productos disponibles de este proveedor." vs "No se encontraron
  productos con ese criterio."); el desarrollo usa un solo mensaje genérico
  ("No se encontraron productos disponibles de este proveedor.") para ambos casos. No hay pérdida
  de funcionalidad — el usuario sigue viendo que la lista está vacía y por qué (no hay productos
  que buscar o ya los agregó todos) — es una diferencia de copy, no de comportamiento.
- **Edición de cantidad de línea vía input inline + Confirmar/Cancelar, en vez de `window.prompt()`**
  (mockup). Mismo resultado funcional; además evita el problema conocido de `window.confirm`/`prompt`
  bloqueando QA automatizado (ver memoria `feedback_...devtesting_10_tickets`), así que es una
  mejora, no una regresión.
- **"Crear una nueva" resetea el formulario in-place (`startOver()`) en vez de `location.reload()`**
  (mockup). Mismo resultado observable para el usuario.
- **Contacto del proveedor (nombre/teléfono/dirección) no se muestra en el panel "Proveedor"** —
  ambigüedad ya documentada y aceptada (`GET /provider` real solo expone `{id, name}`), no se
  reporta de nuevo acá por instrucción explícita del encargo.
- Layout general (sidebar vs menú superior del mockup) — variante ya aceptada workspace-wide, sin
  pérdida de navegación.

## Lo que sí cumple

Los 13 tickets (SCRUM-433→445) están implementados con fidelidad funcional completa contra ambos
mockups (3C y 3D): proveedor fijo sin selector, buscador funcional, tabla de productos con las 8
columnas del mockup, modal "Ver bodegas" con desglose real, regla de "producto agregado desaparece
de disponibles", carrito completo (agregar/editar/quitar/totales), sección de envío con los 3
campos (modalidad fija/tipo de envío/llegada estimada), guardado con numeración y estado inicial
correctos, panel de orden guardada con navegación y "crear otra", bandeja con las 4 chips de
filtro, las 8 columnas de tabla, y las 3 variantes de acción por estado (Recordar/Ver motivo/texto
informativo). Iconografía sin emoji en todos los casos que el mockup usaba emoji (🔒, 🔔, ✓, 🔖),
cumpliendo la regla SCRUM-56.

## Veredicto

**Aprobado para Pre-QA.** Sin hallazgos CRÍTICOS. Sujeto también a la aprobación en paralelo de
Senior Reviewer (gate independiente).
