# Senior Review — SCRUM-738: Ajustar distribución de campos en tarjetas de detalle de proyectos

**Fecha:** 2026-08-07
**Archivo:** `src/components/PipelineCardModal.tsx`
**Veredicto:** 🟢 APROBADO — sin blockers

---

## Ticket

SCRUM-738 (épica Ventas&Diseño, parent SCRUM-327, prioridad Highest). Pide reorganizar los
campos del modal de detalle de proyecto (`PipelineCardModal.tsx`) en dos columnas alineadas y
consistentes, siguiendo el mockup adjunto — sin tocar información, campos, funcionalidades,
botones ni lógica existente. Reportado por Daniela Amaya con captura de "estado actual" donde
"Días en etapa" y "Valor" aparecen desplazados respecto al resto de los campos.

## Causa raíz

El bloque de campos estaba armado en **4 `<div className="grid ...">` independientes y
apilados**:
1. Nombre / Etiqueta — `sm:grid-cols-2`
2. Cliente Master / Subcliente — `sm:grid-cols-2`
3. Responsable / Días en etapa / Valor — **`sm:grid-cols-3`**
4. Superficie trabajada / Tipo de entrega — `sm:grid-cols-2`

Cada `<div>` es un grid CSS independiente con su propio cálculo de ancho de columna. El bloque 3
(3 columnas) calculaba anchos de celda distintos a los bloques de 2 columnas — de ahí que "Días
en etapa" y "Valor" quedaran visualmente desalineados con el resto, exactamente lo que muestra la
captura de "estado actual" adjunta al ticket.

## Fix revisado

Se unificaron los 4 bloques en un único
`<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">` (líneas 352–499) que envuelve las
9 celdas de campo, en el mismo orden que ya tenían en el DOM:

Nombre → Etiqueta → Cliente Master → Subcliente → Responsable → Días en etapa → Valor →
Superficie trabajada → Tipo de entrega.

Con 9 celdas en una grilla de 2 columnas, la última fila (Tipo de entrega) queda sola en la
columna izquierda — comportamiento esperado de una grilla con cantidad impar de campos, no un
defecto.

### Verificación de causa raíz

Confirmado: unificar los grids en un solo contenedor dis a que CSS calcule un único set de
anchos de columna para las 9 celdas, eliminando el desajuste entre bloques. Es la solución
correcta para el síntoma reportado, no un parche cosmético.

### Preservación de contenido/comportamiento

- **9 campos, mismo orden DOM, sin ninguno agregado/quitado/renombrado.**
- Modo vista vs. modo edición (`isEditing`) intacto: mismos `<input>`/`<select>`/`<p>`
  condicionales, sin cambios de lógica.
- `ClientPicker` (Cliente Master/Subcliente) preservado tal cual, con su `disabled`/`onSelect`
  originales.
- Ningún botón, mutation (`saveMutation`, `changeStageMutation`, etc.) ni handler tocado — el
  diff es exclusivamente de estructura de `<div>` de layout (fusión de aperturas/cierres de
  grid) más un comentario explicativo. No hay cambios fuera de ese bloque.
- Bloques condicionales fuera de la grilla unificada, verificados intactos y sin arrastrarse
  al nuevo grid:
  - "Fechas de entrega" (línea 505) — sigue siendo un `<div className="mb-3">` full-width
    aparte, condicionado a `deliveryType && (stage === 'proposal' || 'approved')`.
  - "Observaciones" (línea 533) — full-width, sin cambios.
  - "Archivos" (línea 550) — full-width, sin cambios.
  - "Contactos" (línea 613) — full-width, sin cambios.
- Verificación indirecta vía tests: varios tests existentes indexan
  `document.querySelectorAll('input[type="text"]')`/`querySelectorAll('select')` por posición
  (ej. `textInputs[2]` para el input de Subcliente en
  "crea un subcliente nuevo pidiendo el RUC..."). Como el orden real de nodos en el DOM no
  cambió (solo se fusionaron los `<div>` contenedores), estos tests siguen pasando sin
  modificación — confirma que el reordenamiento del layout no afectó el orden real de
  renderizado de los campos.

### Convenciones del proyecto

- Sin iconografía nueva, sin emoji.
- Tailwind `grid grid-cols-1 sm:grid-cols-2 gap-3` es el mismo patrón ya usado en el resto del
  archivo — no introduce un patrón de layout nuevo.
- Comentario del cambio con referencia al ticket (SCRUM-738) y explicación de la causa raíz,
  siguiendo el estilo de comentarios ya presente en el archivo (ver comentarios SCRUM-78,
  SCRUM-677, etc. en el mismo archivo).
- Cambio puramente de presentación — no aplica la regla de "valores paramétricos" (no hay
  umbrales/márgenes de negocio involucrados).

## Tests corridos

```
npm run test -- PipelineCardModal --run   → 29/29 passed
npm run test -- --run                     → 956/956 passed (91 archivos)
npx tsc --noEmit                          → sin errores
```

Ningún test tuvo que modificarse para que el fix pasara — la suite existente ya validaba
implícitamente el orden/contenido de campos y siguió pasando en verde.

## Hallazgos

Ninguno. 🟢 Aprobado sin condiciones.

## Nota de alcance

Este review cubre corrección de código, preservación de comportamiento y tests. La
comparación pixel/visual contra el mockup adjunto en Jira (imagen "estado actual" vs.
"mockup de referencia") es responsabilidad de **Visual Reviewer**, que corre en paralelo — no
se duplica acá.
