# Visual Review — SCRUM-194 (REQ-131): "+ Producto nuevo" en Nueva Orden (2026-08-04)

Mockup: `2H__Compras_NuevaOrden.html` (attachment 10341, SCRUM-194). Alcance: campos del modal
"+ Producto nuevo" y la tabla de líneas de la orden. Entorno: local (Docker `:8090` + Vite
`:5173`), Playwright CLI (`e2e/preqa-scrum194-nuevaorden-20260804.spec.ts`, paso 1 del test).

## Checklist funcional del mockup — modal "+ Producto nuevo"

| Campo/elemento (mockup) | ¿Presente en el desarrollo? |
|---|---|
| Referencia pública * | Sí |
| Referencia de fábrica | Sí |
| Descripción * | Sí |
| Marca | Sí |
| Categoría | Sí |
| Rotación esperada (Alta/Media/Baja/Compra única) | Sí |
| Precio de lista * | Sí |
| Costo * | Sí |
| Punto de reorden | Sí |
| Costo adicional estimado (toggle $ monto / % del costo) | Sí, ambas opciones presentes en el `<select>` |
| Botones Cancelar / Agregar | Sí |

Nota: el mockup es un formulario simple sin mensaje de error de duplicado — el precheck async de
validación de referencia (SCRUM-194, fix 2026-08-04) es una mejora agregada sobre lo que el mockup
exige explícitamente, no un requisito visual del mockup en sí. No se evalúa contra el mockup, se
evalúa contra el criterio de aceptación de Jira (ver `docs/pre-qa/scrum194-nuevaorden-20260804.md`).

## CRÍTICO — encontrado y CORREGIDO en esta misma sesión

**Campo "Costo adicional estimado" — input de monto renderizaba a ~26px de ancho, ilegible/no
usable para escribir o leer el valor.** Reportado por Daniela Amaya en comentario de Jira hoy
(2026-08-04, 17:01): "el campo quedó muy pequeño". No estaba corregido por el fix del precheck
(Senior Review 19:12 del mismo día no lo menciona).

Causa raíz confirmada con `getComputedStyle` vía Playwright: el `<select>` del toggle ($ monto /
% del costo) usaba `inputCls(false) + ' w-32'` — `inputCls()` ya incluye `w-full`, y Tailwind emite
la utilidad `.w-full` **después** de `.w-32` en el stylesheet compilado (el orden de cascada lo
define el orden en el stylesheet, no el orden de clases en el atributo `class`). `w-full` ganaba:
el `<select>` medía 428px (casi el 100% de la fila) y el input de monto, con `flex-1`/`flex-basis:0%`,
solo recibía el espacio sobrante (~26px).

Fix aplicado (`src/components/compras/NewProductModal.tsx`): className explícito para el `<select>`
sin reusar `inputCls()` (que trae `w-full`), con `w-32 shrink-0` en su lugar. Verificado tras el fix:
`<select>` = 128px (8rem, valor esperado de `w-32`), input de monto usable a simple vista.
Screenshot: `test-results/scrum194-01-modal-campos.png`. `tsc --noEmit` limpio, `NewProductModal.test.tsx`
5/5 verde, suite completa frontend 866/866 verde tras el fix.

## Checklist funcional del mockup — tabla "Líneas de la orden" (fuera del alcance original de este ticket, hallazgo colateral)

| Columna (mockup) | Columna (desarrollo actual) |
|---|---|
| Descripción | "Producto" — descripción + subtexto con ambas referencias combinadas |
| Ref. fábrica (columna propia) | No — solo aparece como subtexto sin etiqueta bajo la descripción |
| Referencia pública (columna propia) | No — mismo subtexto, sin etiqueta |
| Cantidad | Sí |
| Costo | Sí |
| Subtotal | Sí |
| Proyecto | Sí |

Confirmado contra `src/components/compras/OrderLinesEditor.tsx` (tabla de líneas): el mockup
(`2H__Compras_NuevaOrden.html`, `<thead>` con `Descripción | Ref. fábrica | Referencia pública |
Cantidad | Costo | Subtotal | Proyecto`) define 7 columnas con Ref. fábrica y Referencia pública
como columnas propias; el desarrollo tiene 5 columnas, con ambas referencias concatenadas como
texto gris sin etiqueta bajo la descripción (`{line.reference} · {line.factoryReference}`).
Daniela Amaya reportó esto mismo hoy (2026-08-04, 17:01): "AQUI NO ES CLARO QUE ES REFERENCIA
PUBLICA QUE ES REFERENCIA DE FABRICA". Sigue sin corregirse.

**Clasificación: CRÍTICO por la regla de "ante la duda", no ACEPTABLE.** La información está
presente (no hay pérdida de dato), pero sin las dos columnas separadas y etiquetadas el usuario no
puede distinguir cuál referencia es cuál a simple vista en una tabla con varias líneas — es
exactamente lo que Daniela reportó como problema de uso, no solo un cambio estético de layout.

**Esto queda FUERA del alcance de SCRUM-194 tal como fue instruido este Pre-QA/Visual Review**
(el ticket, el Senior Review de hoy y el fix revisado son específicamente sobre el precheck de
duplicados en el modal). No se corrige en esta sesión. Se notifica a PM/Luis como hallazgo
pendiente del mismo ticket (mismo comentario de Daniela de hoy trae ambos temas) — no bloquea el
veredicto de ESTE Visual Review sobre el modal, pero si el criterio real de "cierre de SCRUM-194"
incluye la tabla de líneas (el reporte de Daniela no distingue ticket), este gap sigue abierto y
debería tener su propio ticket o ampliar el alcance de este antes de dar el ticket por cerrado.

## Veredicto

**Modal "+ Producto nuevo": APROBADO tras el fix aplicado en esta sesión** (campo de monto
corregido, resto de los campos ya cumplía). Pasa a Pre-QA/QA en lo que respecta al modal.

**Tabla de líneas de la orden (columnas Ref. fábrica / Referencia pública separadas): hallazgo
CRÍTICO pendiente, fuera del alcance instruido de esta sesión — reportar a PM antes de dar
SCRUM-194 por completamente cerrado si el alcance del ticket incluye ese gap.**
