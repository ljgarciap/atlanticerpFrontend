# Pre-QA — Vista ICG: complemento SCRUM-840/841/842 (2026-09-04)

Sin ticket Jira, sin QA formal — mismo criterio que la Vista ICG original (SCRUM-749,
2026-09-03). Alcance: la Tarea 6 de SCRUM-840/841/842 (Albaranes de Compra, Facturación
Electrónica, campos libres) cerró en los 3 entornos el mismo día — este batch complementa la
pantalla "Vista ICG" para que esos datos sean visibles, no solo estén cargados en base.

## Cambios

**Backend** (`LegacyDocumentPresenter`, `LegacyVistaIcgController`):
- Nueva entidad `albaranes_compra` — mismo shape cabecera+líneas que las otras 4, vinculada por
  Proveedor (`proveedorHeader()`) en vez de Cliente.
- `factura()` agrega los 8 campos `fe_*` (Facturación Electrónica).
- `cotizacion()` agrega `proyecto`/`promocion`. `pedido()` agrega `comision`. `albaran()` agrega
  `observaciones`.

**Frontend**:
- `VistaIcgPage.tsx` — 9na pestaña "Albaranes de Compra".
- `LegacyDocumentoTabPanel.tsx` — prop `ownerLabel` (default "Cliente") para reusar el mismo
  listado con Proveedor sin duplicar componente.
- `LegacyDocumentoFicha.tsx` — render condicional Cliente vs Proveedor (`header.cliente`/
  `header.proveedor`, ambos ahora opcionales en el tipo), bloque nuevo "Facturación Electrónica",
  campos proyecto/promoción/comisión/observaciones.

## Gate

- Backend: PHPStan Level 8 full-project limpio. Suite `--filter=Legacy` 419/419 verde (incluye 17
  tests nuevos/extendidos de `LegacyVistaIcgControllerTest`).
- Frontend: `tsc --noEmit` limpio. `npx vitest run` completo 1742/1742 verde (160 archivos,
  incluye `LegacyDocumentoFicha.test.tsx` nuevo + extensiones a `VistaIcgPage.test.tsx`/
  `LegacyDocumentoTabPanel.test.tsx`).

## Pre-QA real (Playwright, contra stack local)

Datos sembrados a mano (usuario `preqa-scrum840@atlantic.test`, proveedor/cliente/
factura/cotización/albarán de compra de prueba, prefijo `PQ`/`88801` — todo descartado al
cerrar, no queda residuo en la BD).

`e2e/preqa-scrum840-841-842-vista-icg-complemento-20260904.spec.ts` — 3/3 en verde, primera
pasada:
1. Pestaña "Albaranes de Compra" — columna "Proveedor" visible, ficha muestra el proveedor y la
   línea del ítem.
2. Ficha de Factura — bloque "Facturación Electrónica" visible con estado/número de
   autorización/QR.
3. Ficha de Cotización — Proyecto/Promoción visibles.

Sin hallazgos.
