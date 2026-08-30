# Senior Review — SCRUM-736 (Detalle de Orden de Compra vs. mockup aprobado)

**Fecha:** 2026-08-07
**Commit revisado:** `95500cc`
**Archivos:** `src/pages/compras/OrderDetailPage.tsx` (leído completo, 513 líneas),
`src/components/compras/PurchaseOrderPaymentsModal.tsx` (nuevo), `src/components/icons/index.tsx`,
`src/i18n/locales/{es,en}/compras.json`, `src/pages/compras/OrderDetailPage.test.tsx`

## Metodología
Leí el archivo principal completo (no solo el diff), confirmé que `variant="icon"` existe en
`ButtonVariant` (`src/components/ui/Button.tsx`), corrí `npx tsc --noEmit` (limpio) y
`npx vitest run src/pages/compras/OrderDetailPage.test.tsx` (21/21 verde) de forma independiente.

## Hallazgos

🔴 **Ninguno.**

🟡 **Sugerencia (no bloqueante):** los mensajes de éxito/error de "Enviar por correo"
(`sendEmail.isSuccess`/`isError`) ahora viven dentro del dropdown "Más acciones" — antes eran
siempre visibles inline en la tarjeta principal. Si el usuario cierra el menú (click afuera) antes
de leer la confirmación, se pierde. No es un bug (el dropdown no se autocierra al completar la
mutación, así que sigue visible mientras el usuario no lo cierre él mismo) pero vale la pena que
Frontend Dev lo tenga en el radar si Visual Reviewer o QA lo señalan como fricción real.

## Verificación contra el diseño del Arquitecto y las decisiones de Luis
- Grilla de 9 campos ("resumen de información"), todos con datos ya expuestos por `usePurchaseOrder` ✅
- Botón único "Avanzar a: [Estado]" interpolado; mensaje de "último estado" eliminado ✅
- "Incluir costo"/"Enviar por correo" movidos a menú "Más acciones" (reutiliza patrón de `TopBar.tsx`) ✅
- "Pagos a Proveedores" reubicado a modal (reutiliza el overlay de `ProjectBreakdownModal.tsx`),
  mismos hooks de `useCompras.ts` sin tocar lógica ✅
- "Cambiar agencia"→"Cambiar empresa", "Agencia de liquidación"→"Liquidando con: [Agencia]" — solo
  copy, mismo endpoint `useLiquidateOrder()` ✅
- Split Ref. fábrica/Referencia pública aplicado a la tabla de solo lectura (gap real: SCRUM-194
  solo lo había corregido en `OrderLinesEditor.tsx`) — con 2 tests de regresión nuevos ✅
- Confirmación del proveedor: verificado sin cambios de código, ya cumplía el mockup ✅

## Veredicto

🟢 **APROBADO.** Listo para Visual Reviewer (hay mockup adjunto en el ticket) y luego Pre-QA.
