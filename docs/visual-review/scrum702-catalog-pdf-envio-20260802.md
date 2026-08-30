# Visual Review — SCRUM-702, PDF dinámico de Catálogo ("Enviar a cliente")

Fecha: 2026-08-02
Ticket: SCRUM-702 (REQ-622), parte del Batch E (SCRUM-695→702) ya revisado visualmente el
2026-07-31 (`scrum695-702-crm-catalogo-batche-20260731.md`) — este documento cubre solo lo nuevo:
el mecanismo real de envío (antes simulado con un toast).
Mockup/referencia visual: `Catalogo_Ejemplo.pdf` (adjunto del ticket, PDF estático ya validado con
el cliente en REQ-621 — RN3/RN6 exigen explícitamente reutilizar ese formato).
Entorno: local (Docker), rama `dev`, código ya commiteado y desplegado en dev.atlanticerp.ai
(commits `8195e0d` backend / `269cc81` frontend).
Cuenta usada: `designer@illuminations.test` (permiso `ventas_diseno.read`).
Herramienta: generación directa del PDF vía `POST /api/ventas-diseno/catalog/send-pdf`
(no aplica Playwright para esta comparación — el artefacto a revisar es el PDF en sí, no una
pantalla de navegador; los botones que lo disparan ya existían visualmente desde el batch anterior
y no cambiaron de layout).

Nota de datos: la BD local no tenía `catalog_products` (0 filas) ni ninguno con `technical_spec`
poblado. Se corrió `CatalogProductSeeder` (46 productos) para poder generar un PDF representativo.
Ninguno de los 46 tiene ficha técnica cargada — ese escenario específico (specs reflejadas en el
PDF) ya lo verificó Pre-QA contra datos reales en dev.atlanticerp.ai (ver su comentario en Jira,
escenario "QA-FICHA-01"), no se repite acá.

Comparación: `mockup_page-1.png` (primera página de `Catalogo_Ejemplo.pdf`) vs. `real_page-1.png`
(primera página del PDF generado por `CatalogPdfService`, modo `completo`).

---

## CRÍTICO

Ninguno. Toda la funcionalidad que muestra el mockup está presente: marca, título, y por cada
producto — foto (o estado vacío correcto), referencia, marca, descripción, precio, specs (cuando
existen), sin ningún dato de stock/disponibilidad.

---

## ACEPTABLE (nota, no bloquea)

- **Header**: el mockup usa el isotipo de círculos + wordmark "ILLUMINATIONS" centrado, con
  subtítulo explícito "Documento de ejemplo — versión para compartir con clientes (sin información
  de inventario/stock)". El PDF real usa el wordmark en teal alineado a la izquierda + una línea
  divisoria gruesa, sin el isotipo de círculos ni la leyenda "sin información de inventario/stock".
  No es pérdida de funcionalidad (el PDF real igual no incluye stock, solo no lo anuncia con texto)
  — es una variante de layout de header, dentro de la paleta de marca aprobada
  (`#5BA5A0`/`#3D7E7A`/`#9fc54d`/`#2a2520`). Si Luis quiere la leyenda de "sin stock" explícita en
  el PDF real por transparencia con el cliente, es un ajuste cosmético menor, no un bloqueante de
  este ticket.
- **Card de producto**: el mockup muestra "REF · MARCA" en una línea y la descripción debajo; el
  PDF real muestra "REF" (bold, teal) seguido de "marca — descripción" en la misma línea. Mismo
  contenido (referencia/marca/descripción), agrupación distinta — variante aceptable de layout.
- **Tabla de specs**: el mockup no tiene fila de encabezado (solo pares label/valor); el PDF real
  agrega un encabezado "Especificación | Valor" con fondo teal claro. No quita información, es una
  variante de estilo.
- **Foto ausente**: en el PDF real, los 46 productos sembrados no tienen `photo_url` (gap del
  seeder, no del código) — se ve el placeholder "Sin imagen" correctamente en todos. El mockup usa
  el mismo isotipo de círculos como imagen de ejemplo en sus 2 productos (no son fotos reales
  tampoco) — comportamiento equivalente frente a la ausencia de foto real.
- Densidad de productos por página: el PDF real cabe ~6 cards por página a diferencia de las 2 del
  mockup (que es solo un ejemplo de 2 productos) — no es comparable 1:1 en cantidad, no hay
  criterio de aceptación sobre productos-por-página.

## Lo que sí cumple

- RN1 (sin stock): confirmado visualmente, ningún campo de disponibilidad en ningún producto.
- RN2/RN6 (foto, specs de ficha técnica sin adjuntar el archivo, precio, descripción): estructura
  presente y funcional (specs verificadas contra datos reales por Pre-QA, ver su comentario Jira).
- RN4 (completo trae TODOS los activos): 46/46 productos activos aparecen, sin importar
  selección/filtro (ya verificado también por Pre-QA en dev.atlanticerp.ai).
- Identidad de marca: colores dentro de la paleta aprobada, sin iconografía de emoji (regla
  SCRUM-56).
- Botones "Enviar seleccionados"/"Enviar catálogo completo" (layout ya aprobado en el batch
  anterior, sin cambios visuales en este ticket — solo cambió qué hacen al hacer click).

## Resultado

Sin hallazgos CRÍTICOS. Aprobado — el ticket ya tiene pasada limpia de Pre-QA también, queda listo
para transicionar a QA.
