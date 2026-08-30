# Visual Review — Batch E (SCRUM-695→702), pantalla "Catálogo"

Fecha: 2026-07-31
Ticket ancla: SCRUM-695 (REQ-615→622)
Ruta: `/ventas-diseno/catalog` (`src/pages/ventas-diseno/CatalogPage.tsx`)
Mockup de referencia: `Catalogo.html` (adjunto del ticket)
Entorno: local (Docker + Vite dev server), rama `dev`, código SIN COMMITEAR
Cuenta usada: neil.quiel@atlantic.com.pa (Vendedor/Diseñador) + daniela@atlantic.com.pa
(management, solo para el caso de navegación a Bodega con permiso)
Herramienta: Playwright CLI (`npx playwright test`, specs descartables, no promovidas a `e2e/`)

Nota de datos: la BD local no tenía productos de catálogo activos (`catalog_products` = 0 filas).
Se corrieron `CatalogProductSeeder` + `CatalogProductFamilySeeder` vía `tenants:artisan db:seed`
para poder probar la pantalla con datos reales (46 productos, 10 familias). Ninguno de los 46
productos sembrados tenía `category` poblada — se actualizaron 10 filas a mano (UPDATE local, no
destructivo) para poder ejercitar el filtro de Categoría. Esto reveló el hallazgo CRÍTICO de abajo.

---

## CRÍTICO

**Categoría se muestra como key de i18n sin traducir, en 3 lugares — vista Cuadrícula excluida
(ahí no se muestra Categoría), pero sí en:**
1. Opciones del `<select>` de filtro de Categoría (ej. `newProduct.categories.apliques_pared` en
   vez de "Apliques de Pared")
2. Columna "Categoría" de la vista Lista (mismo texto crudo)
3. Campo "Categoría" del modal de detalle de producto (mismo texto crudo)

**Causa raíz:** `CatalogPage.tsx` usa `t(\`compras:newProduct.categories.${value}\`)` en las 3
ubicaciones (líneas 186, 270, 417). La key real en `compras.json` vive bajo
`newOrder.newProduct.categories.*` (confirmado también en
`src/components/compras/NewProductModal.tsx:140`, que sí usa el path correcto
`compras:newOrder.newProduct.categories.${c}`). Al `CatalogPage.tsx` le falta el segmento
`newOrder.` — i18next no encuentra la key y renderiza el key path crudo como fallback.

**Cómo reproducir:** cualquier producto con `category` no nula. Abrir Catálogo → ver el filtro de
Categoría (options ilegibles) → seleccionar una categoría → ver columna Categoría en vista Lista →
abrir el detalle de cualquier producto con categoría → campo Categoría muestra el mismo texto
crudo.

**Impacto:** el usuario ve un string técnico en vez de un nombre de categoría legible — bloquea
REQ-615 (campo Categoría legible en el detalle) y REQ-617 (filtro de Categoría usable/legible). El
resto de cada uno de esos REQs funciona correctamente (ver "Lo que sí cumple").

**Fix sugerido (para quien lo tome, no aplicado por mí — Visual Reviewer no edita código):**
cambiar las 3 ocurrencias de `compras:newProduct.categories.` a
`compras:newOrder.newProduct.categories.` en `CatalogPage.tsx`.

---

## ACEPTABLE (nota, no bloquea)

- El subtítulo de resultados (`"{count} productos"`) no replica el patrón del mockup
  `"{filtrados} de {total} productos"` — solo muestra el conteo filtrado, nunca el total. Es
  informativo, no una funcionalidad perdida (el usuario igual ve cuántos resultados matchean); no
  hay REQ que exija explícitamente el formato "X de Y".
- `CatalogProductSeeder` (seeder compartido, no es parte de este batch) no puebla `category` en
  ninguno de los 46 productos que siembra — gap de datos preexistente, no de esta pantalla. Se
  corrigió a mano en local solo para poder probar el filtro; no está en el alcance de SCRUM-695→702
  corregir el seeder.

---

## Lo que sí cumple

**REQ-615** — grid/lista/modal muestran referencia, marca, precio, categoría (cuando existe),
familia (cuando existe), descripción, foto (fallback a ícono cuando no hay `photo_url`, correcto),
stock simplificado ("Disponible: X" / "Sin stock disponible"), badge "✓ Ficha"/"⚠ Sin ficha".
**Confirmado en vivo, en grid, lista y modal de detalle de varios productos: NUNCA aparece costo,
costo de importación, flete, manejo, costo total ni margen** — ni en el HTML/texto de la página ni
en la respuesta JSON del backend (`CatalogService::format()` solo expone los campos permitidos,
revisado en código). Campo Categoría "—" cuando es null, manejado correctamente.

**REQ-616** — toggle Cuadrícula/Lista funciona; se probó con un filtro de categoría activo
(3 productos) y el conteo se mantuvo idéntico (3→3) al cambiar de vista. El mismo modal de detalle
se abre desde ambas vistas (confirmado con capturas).

**REQ-617** — buscador universal en tiempo real (sin botón "Buscar"): se probó escribiendo el
nombre completo de una familia ("Riel Direccionable") SIN seleccionar el filtro de Familia — trajo
sus 8 productos correctamente (matchea contra ref+marca+desc+categoría+familia, confirmado en
`CatalogService::list()`). Filtro de Categoría y de Familia poblados dinámicamente solo con valores
presentes en productos activos (4 categorías de las 8 posibles, exactamente las que tenían
productos) — no la lista fija completa. Filtro de stock (con/sin) funcional.

**REQ-618** — en un producto sin ficha: botón "+ Cargar ficha técnica" visible, subí una imagen de
prueba (`fixtures/design1.png`), el badge cambió de "⚠ Sin ficha" a "✓ Ficha" en el modal Y en la
tarjeta de la grilla de fondo, SIN recargar la página (URL no cambió, confirmado por invalidación
de query de TanStack, no `location.reload`). Toast de confirmación mostrado. En un producto con
ficha, "Ver documento" abrió una pestaña nueva con una URL presignada real de S3
(`https://atlanticerp-dev.s3.amazonaws.com/private/catalog/...`), HTTP 200 confirmado.

**REQ-619** — checkbox individual + "Seleccionar todo" — probado con el filtro de Categoría activo
(3 productos visibles de 46 totales): "Seleccionar todo" marcó exactamente esos 3, no los 46.
Contador en tiempo real. "Enviar seleccionados" deshabilitado con 0 seleccionados, habilitado con
≥1. "Enviar catálogo completo" siempre habilitado; ambos botones muestran el toast informativo
correcto ("Función de envío pendiente de definir" — mecanismo real fuera de alcance de este sprint,
REQ-622) sin ningún error.

**REQ-620** — "Inventario de Compras" navega a `/inventario` (real). "Inventario de Bodega" navega
a `/bodega/inventario` (real) — confirmado con un usuario que tiene `bodega.read`
(daniela@atlantic.com.pa). Con un usuario Vendedor/Diseñador sin `bodega.read`
(neil.quiel@atlantic.com.pa) el click SÍ dispara la navegación, pero la pantalla destino lo
redirige por su propio gate de permiso — comportamiento correcto y a propósito según el docblock
del componente ("RN3: no amplía ni restringe permisos acá"), no es un defecto de Catálogo.

**REQ-621** — "Descargar PDF de ejemplo" descargó un archivo real de 5290 bytes; confirmado que es
un PDF válido de 2 páginas (`file` + comparación byte-a-byte contra
`storage/app/private/catalog-ejemplo/Catalogo_Ejemplo.pdf` en el backend) — no vacío, no 404/500.

---

## Regresión vs. pantalla vieja de Catálogo (SCRUM-70/92/100)

La pantalla vieja tenía dos capacidades: (1) buscar un producto por referencia/nombre, y (2)
navegar por familias (tab "Familias" → lista de familias → detalle con sus productos). Ambas
siguen siendo posibles en la pantalla nueva, aunque cambia la forma de llegar:
- Buscar sigue existiendo — el buscador nuevo es un superset (busca también por categoría y
  familia, no solo ref/nombre).
- Navegar por familia sigue siendo posible — en vez de un tab "Familias" con lista navegable, es un
  `<select>` de Familia que, al elegir una, filtra la grilla/lista a exactamente los productos de
  esa familia (mismo resultado funcional: ver todos los productos de una familia dada).

Es una variante de layout (tab+lista-navegable → dropdown+filtro), no una funcionalidad eliminada
— el usuario puede hacer hoy lo mismo que podía hacer antes. **Respuesta a la pregunta de
regresión: NO, no se detectó pérdida de funcionalidad real respecto a la pantalla vieja.**

---

## Veredicto

**NO aprobado — 1 hallazgo CRÍTICO.** Vuelve a PM para reasignar a Frontend Dev (fix de 3 líneas,
agregar el segmento `newOrder.` al key path de i18n en `CatalogPage.tsx`). Tras el fix, re-correr
el checklist completo de Categoría (filtro, columna de lista, campo de detalle) antes de dar luz
verde para Pre-QA.

---

## Re-check — 2026-07-31

**Alcance:** re-check acotado del único hallazgo CRÍTICO (no se repite el checklist completo de
REQ-615→621 — sin cambios desde la pasada anterior, ya habían dado limpio).

**Fix verificado en código:** las 3 ocurrencias en `CatalogPage.tsx` (líneas 186, 270, 417) ahora
usan `t(\`compras:newOrder.newProduct.categories.${value}\`)` — mismo path que
`NewProductModal.tsx:140`. Leído el archivo completo tal cual está en disco (código SIN
COMMITEAR), confirmado que no quedó ninguna ocurrencia del path viejo
(`compras:newProduct.categories.`) en el archivo.

**Verificación en vivo (Playwright CLI, `localhost:5173`, backend Docker `infra-*` local, cuenta
`neil.quiel@atlantic.com.pa`):** los 10 productos con `category` poblada (UPDATE manual de la
pasada anterior) seguían presentes en la BD local — no hizo falta re-sembrar. Confirmado con
capturas de pantalla real (no solo lectura de código) en los 3 lugares:

1. **Filtro dropdown de Categoría** — opciones legibles: "Apliques de Pared", "Candelabros y
   Colgantes", "Iluminación Empotrada", "Iluminación Exterior". Ninguna opción con key cruda.
2. **Columna "Categoría" de la vista Lista** — celda muestra "Apliques de Pared" para los 3
   productos filtrados (antes mostraba `newProduct.categories.apliques_pared` crudo).
3. **Campo "Categoría" del modal de detalle** — fila `Categoría: Apliques de Pared`, legible,
   junto al resto de la ficha (Precio, Familia, Disponible) sin regresión.

Ningún rastro de `newProduct.categories.` ni `newOrder.newProduct.categories.` crudo en el DOM en
ninguno de los 3 lugares. Sin efectos secundarios — el resto del modal/lista/filtros se ve igual
que en la pasada anterior.

**Veredicto final: CRÍTICO RESUELTO. APROBADO para Pre-QA.** Batch E (SCRUM-695→702, REQ-615→622)
queda con Visual Review limpio.
