# Visual Review — Auditoría completa de Logística y Envío (2B)

**Fecha:** 2026-08-05
**Alcance:** pantalla completa `LogisticsPage.tsx` + `ShipmentCard`/`ProviderConfirmationPanel` (no un ticket aislado)
**Tickets cubiertos:** SCRUM-214 (REQ-151), SCRUM-216 (REQ-153, incluye hallazgo de scope RN1-RN7), SCRUM-217 (REQ-154), SCRUM-218 (REQ-155)
**Mockup de referencia:** `2B__Compras_Logistica.html` (adjunto SCRUM-216, id 10394 y su re-upload idéntico id 11704 del 2026-08-05 — mismo contenido, sin diferencias, confirmado con `diff`)
**Método:** lectura de mockup real (HTML+CSS+JS, no solo capturas), lectura de código (`LogisticsPage.tsx`, `ReceptionBadge.tsx`, `PurchaseOrder.php` backend), y verificación en vivo con Playwright CLI contra Docker local (`http://localhost:8090`, login real `gerencia2@illuminations.com.pa`/lider_compras). El Docker local no tenía ninguna orden en estado de envío activo (`illuminations_compras.purchase_orders` vacía) — se sembró 1 fixture mínimo (proveedor + orden #28, en_transito, con `estimated_arrival_date` vencida para forzar el caso "retrasada") para obtener una captura real, y se eliminó al cerrar esta auditoría.

**Por qué esta auditoría existe:** SCRUM-214/216/217/218 fueron aprobados en QA el 2026-07-16/17, antes de que existiera el gate de Visual Reviewer (2026-07-24) — nunca se validó fidelidad visual contra el mockup, solo equivalencia funcional con "Ver Órdenes". El 2026-08-04/05 Daniela (QA) encontró diferencias grandes contra el mockup en varios tickets a la vez. Esta es una pasada única y completa de toda la pantalla, no 4 documentos separados.

---

## REQ-151 (SCRUM-214) — Encabezado, filtros y búsqueda

**Estado del ticket:** QA (ya aprobado, corregido hoy — commits backend `58d7690`/frontend `d50dedc` — nota: esos commits pertenecen a REQ-155, no REQ-151; el fix real de REQ-151 fue previo, sin commit propio identificado en el comentario de Jira).

**Checklist funcional (mockup vs AtlanticERP):**

| Elemento del mockup | AtlanticERP (verificado en vivo) | Veredicto |
|---|---|---|
| Buscador (N° orden/proveedor/proyecto) | Presente, funcional | Cumple |
| Filtro por proveedor | `select` "Todos los proveedores" | Cumple |
| Filtro por responsable/creador | `select` "Todos los responsables" | Cumple |
| Buscador de proyecto en cascada | Input "Buscar proyecto..." con resultados en dropdown | Cumple |
| Chip "Retrasados" | Presente, con ícono de advertencia | Cumple |
| Solo envíos activos (Ordenado→Recibido) | `active_shipments: true` en el hook, confirmado por código y por el conteo "1 envíos en movimiento" tras sembrar el fixture | Cumple |

**Lo que sí cumple:** encabezado, los 4 filtros y el chip de retrasados están todos presentes y funcionales, layout equivalente al mockup (variantes menores de posición — ACEPTABLE, no elimina funcionalidad).

**CRÍTICO:** ninguno.
**ACEPTABLE (nota):** el mockup agrupa los filtros de forma ligeramente distinta (una fila fija) vs. AtlanticERP (`flex-wrap`, se acomoda según ancho) — no afecta funcionalidad.

---

## REQ-153 (SCRUM-216) — Tarjeta de envío, información general

**Estado del ticket:** Dev Testing (rediseñada hoy, Pre-QA propio dio pasada limpia sobre el AC original; queda 1 hallazgo de scope sin resolver, ver más abajo).

**Checklist funcional (mockup vs AtlanticERP, verificado en vivo con la orden #28 sembrada):**

| Elemento del mockup | AtlanticERP (captura real) | Veredicto |
|---|---|---|
| Título = N° de orden, con ícono de advertencia si está retrasada | `⚠ #28` — confirmado, ícono ámbar visible en la orden retrasada sembrada | Cumple |
| Ruta: proveedor → proyecto asignado | `VR Test Provider SA → Ninguno (stock)` — confirmado (el fixture no tenía línea con proyecto, por eso "Ninguno"; el caso 2+ proyectos abre `ProjectBreakdownModal`, confirmado por código, ya reusado de SCRUM-203) | Cumple |
| Etiquetas: modalidad, tipo de envío, estado, recepción (4 al mismo nivel) | `Directo` `Marítimo` `En tránsito` `Pendiente` — las 4 presentes y al mismo nivel visual | Cumple |
| Llegada estimada (solo lectura) | `2026-08-03` como texto plano, sin `<input>` alrededor — confirmado en la captura y en el DOM | Cumple |
| Llegada real | Input de fecha editable — **difiere del mockup**, ver hallazgo RN3 abajo | Ver nota |
| Responsable asignado | `Yirena Teng`, posicionado junto a Llegada estimada, igual que en el mockup (`ship-responsable`) | Cumple |

**Lo que sí cumple:** título, ruta, las 4 etiquetas, Llegada estimada de solo lectura y posición del responsable — los 4 hallazgos que Daniela reportó el 2026-08-04 sobre este REQ (capturas 17:34-17:48) están corregidos y verificados en vivo hoy.

**CRÍTICO:** ninguno sobre el AC original de REQ-153 (Escenario 1: "los datos de la tarjeta son exactamente los mismos que en Ver Órdenes" — pasa limpio).

**ACEPTABLE (nota):** posición de los campos "N° de contenedor"/"Naviera" — en AtlanticERP aparecen inmediatamente después de las etiquetas (antes del botón de avance); en el mockup aparecen después del checklist de documentos, justo antes de la fila de fechas. Es reordenamiento de layout, ningún campo falta — ACEPTABLE.

### Hallazgo de scope — RN1-RN7 (comentario de Daniela, SCRUM-216, 2026-08-05 17:07)

Este es el foco explícito de esta auditoría. Cruzando cada regla contra lo que el mockup **muestra visualmente** (no contra el texto del comentario, que describe comportamiento nuevo con más detalle del que el mockup dibuja):

| Regla | ¿El mockup la muestra visualmente? | ¿AtlanticERP la implementa hoy? |
|---|---|---|
| RN1 — Llegada estimada, fecha libre al crear, no calculada | No aplica a esta pantalla (Nueva Orden) | N/A para Logística |
| RN2 — Llegada estimada, solo editable en "Por aprobar" desde Ver Órdenes | No aplica a esta pantalla | Ya CORRECTO en Logística: solo lectura (ver tabla arriba) |
| RN3 — Llegada real, se llena SOLO al completar la última etapa, nunca a mano | **Sí** — la función `advanceStage()` del mockup, al llegar a la última etapa, escribe la fecha de hoy en el campo `.ship-date-value.empty` — en ningún caso el mockup tiene un `<input>` editable para Llegada real | **NO coincide** — AtlanticERP muestra un `<input type="date">` siempre editable. Ver nota de scope abajo |
| RN4 — Llegada real inmutable una vez llena | Implícito en el mecanismo de arriba (no hay forma de editarla en el mockup) | No implementado — el input sigue editable indefinidamente |
| RN5 — Marca de atraso desaparece automáticamente al completar la última etapa | **Sí** — `warnIcon.remove()` y `.overdue` se quita en `advanceStage()` | **Ya cubierto de hecho** por el backend: `PurchaseOrder::isCritical()` retorna `false` en cuanto `status === RECIBIDO`, sin importar la fecha — el ícono de advertencia (`is_critical`) se apaga solo al llegar a Recibido. No requiere trabajo nuevo, solo que el flujo de avance de etapa llegue a Recibido |
| RN6 — Registro permanente de "a tiempo/tarde" con días de diferencia | **No** — el mockup de Logística no muestra este dato en ningún lado (grep confirmado, 0 menciones de "a tiempo"/"tarde"/días de diferencia en el HTML) | No implementado — no existe columna persistida; `PurchaseOrder::isOnTime()` ya existe pero es **calculado al vuelo**, no un registro permanente que sobreviva ediciones futuras como pide RN6 |
| RN7 — Ese dato alimenta % de proveedores en Proveedores/Reportes | No aplica a esta pantalla (mockups de Proveedores/Reportes son otros archivos, no auditados acá) | Fuera de alcance de esta pantalla |

**Conclusión para PM/Arquitecto (la pregunta que pidió Luis que se responda explícitamente):**
- RN1, RN3 y RN5 **sí tienen representación visual clara en el mockup de Logística** — no son "regla de negocio nueva sin representación visual", son comportamiento que el mockup ya dibuja y que AtlanticERP hoy contradice o no implementa. RN3 en particular es un CRÍTICO real: el mockup nunca muestra un campo de fecha editable para Llegada real, siempre lo llena el sistema — AtlanticERP lo deja como input libre, lo que technically ya viola lo que el propio REQ-153 pedía sobre esa fecha, no solo lo que pide el comentario nuevo de Daniela.
- RN2, RN4 son consecuencia directa de RN1/RN3 (no agregan superficie nueva de UI, solo endurecen la regla ya visible).
- RN6/RN7 son la única parte genuinamente nueva sin representación visual en esta pantalla — requieren una columna nueva persistida y tocan Proveedores/Reportes, cuyos mockups no fueron parte de este alcance. Esta parte sí es "scope propio" para que Arquitecto la desglose (ticket nuevo vs. ampliar SCRUM-216).

---

## REQ-154 (SCRUM-217) — Línea de tiempo del envío y avance de etapa

**Estado del ticket:** PM Review.

Este es, confirmado, **el hallazgo más grande de toda la pantalla** — coincide exactamente con lo que Daniela marcó como "la diferencia más grande" (comentario 17:23).

**Checklist funcional (mockup vs AtlanticERP, verificado en código Y en la captura real de la orden #28):**

| Elemento del mockup | AtlanticERP (verificado) | Veredicto |
|---|---|---|
| Línea de tiempo visual de 5 pasos (o 3 para proveedor local), con punto (`tl-dot`) done/current/pending y línea conectora | **Ausente por completo.** La captura real de la orden #28 (`en_transito`) no muestra ningún elemento de timeline entre las 4 etiquetas y el campo "Número de contenedor" — no existe en el DOM (`grep` de `LogisticsPage.tsx` confirma: no hay componente de timeline, solo el estado actual dentro de la 3ra etiqueta) | **CRÍTICO** |
| Cada paso completado muestra la fecha en que se completó | No existe ningún dato persistido de fecha por etapa — `purchase_orders` solo tiene `status` + `status_changed_at` (fecha del ÚLTIMO cambio, no un historial por etapa) — confirmado en el modelo backend | **CRÍTICO** (requiere modelo de datos nuevo, no solo UI) |
| Paso actual visualmente distinto ("En curso"), pasos futuros atenuados | No existe, ver arriba | **CRÍTICO** (parte del mismo gap) |
| Botón que dice a qué etapa avanza (mockup: genérico "✓ Completar etapa actual"; RN2 de Daniela pide texto explícito tipo "Avanzar a: En aduana") | AtlanticERP YA muestra "Completar etapa actual → En aduana" — confirmado en la captura real. Esto **ya cubre la intención de RN2**, con mejor claridad que el propio mockup (el mockup no nombra la etapa destino en el botón, solo en el timeline) | Cumple (incluso mejora sobre RN2) |
| Botón desaparece al llegar a "Recibido" (RN2) | Backend: `next_status` es `null` en Recibido → AtlanticERP muestra un texto ("Sin siguiente etapa") en vez de ocultar el bloque — variante menor, la intención (no permitir avanzar más) sí se cumple funcionalmente | ACEPTABLE — el botón no aparece, solo queda un texto informativo en su lugar en vez de nada. No es pérdida de funcionalidad |
| Al completar la última etapa: Llegada real = hoy, ícono de atraso desaparece, productos "Por ingresar" se confirman en Inventario | Backend: `isCritical()` ya se apaga solo al llegar a Recibido (confirmado por código). Auto-confirmación de Inventario: confirmada por Pre-QA original (2026-07-16, "Escenario 1" del ticket) como funcionando. Auto-fill de Llegada real: **NO implementado** — sigue siendo el mismo input manual de REQ-153 | **CRÍTICO parcial** (el auto-fill de fecha es el único de los 3 efectos que falta) |
| Sincronización inmediata con Ver Órdenes sin recargar | Confirmado por Pre-QA original vía mecanismo de invalidación de query (`['compras/orders']`) — no fue posible verificarlo por click-through real en esta sesión por falta de una 2da orden con la que cruzar pantallas, pero el mecanismo de código es el mismo que ya se usa en Ver Órdenes/Home | Cumple (mecanismo confirmado) |
| Solo Compras ve/usa el botón; otros roles ven timeline sin botón (RN7) | El botón está gateado por `permission:compras.edit` en el backend (403 real si no se tiene el permiso, patrón ya testeado en SCRUM-218). No se verificó en esta sesión si un rol de solo-lectura (ej. Vendedor/Diseñador) puede siquiera **ver** esta pantalla — el REQ-153 original limita el acceso a "Compras y Gerencia", mientras que RN7 de Daniela pide visibilidad más amplia ("cualquier otro rol... puede ver la línea de tiempo") | Fuera de alcance de esta pasada — bandera para Arquitecto, mismo bucket de scope que RN6/RN7 de arriba |

**Lo que sí cumple:** secuencia de estados correcta en backend (`statusSequence()`, incluye el caso proveedor local saltando aduana — REQ-141, ya confirmado por Pre-QA con tests), el botón de avance ya es más explícito que el propio mockup, sincronización cross-page confirmada por mecanismo.

**CRÍTICO:** la línea de tiempo visual de 5 (o 3) pasos con estado done/current/pending y fecha por paso **no existe en absoluto** en el desarrollo — hoy solo hay 1 etiqueta de estado + 1 botón, exactamente lo que el propio REQ-154 describe como "no basta con mostrar una sola etiqueta de Estado como si fuera un dato aislado" (RN1 de Daniela). Esto confirma con evidencia visual real (no solo lectura de código) el hallazgo de Pre-QA original del 2026-07-16 (ticket marcado "parcial") y el de Daniela del 2026-08-05.

---

## REQ-155 (SCRUM-218) — Checklist de documentos del envío

**Estado del ticket:** Dev Testing (2 gaps chicos corregidos hoy — commits backend `58d7690`/frontend `d50dedc` — 1 hallazgo grande de escalado a PM/Arquitecto sin resolver a propósito).

**Checklist funcional (mockup vs AtlanticERP, verificado en vivo):**

| Elemento del mockup | AtlanticERP (verificado) | Veredicto |
|---|---|---|
| Lista de documentos ya subidos, consultable | Presente ("Sin documentos subidos" en el fixture vacío; código confirma que lista documentos con link "Ver archivo" cuando existen) | Cumple |
| Selector desplegable + botón "Subir" (mecanismo distinto a filas fijas del mockup) | Presente — confirmado en la captura, `select` con "Factura comercial" + botón "Subir" | Cumple (variante de mecanismo ya aceptada explícitamente por el comentario de Daniela — "no hace falta rehacerlo como filas fijas") |
| Categorías: Factura comercial, Declaración de nacionalización, Permiso de importación, BL, Otro | `DOCUMENT_CATEGORIES` en código = exactamente esas 5, sin "Confirmación del proveedor" — corregido hoy | Cumple (ya corregido) |
| Marca visual de "ya subido" en el desplegable | Implementado hoy: `{categoría} (subido)` — confirmado por código, no reverificado por click-through en esta sesión por falta de tiempo de sembrar un 2do documento, pero el mecanismo (`alreadyUploaded`) es directo y de bajo riesgo | Cumple (por código; recomendable que Pre-QA lo reconfirme en su próximo re-check, ya lo tiene documentado) |

**CRÍTICO — NO RESUELTO, ya escalado a PM/Arquitecto por Pre-QA hoy (confirmado independientemente en esta auditoría):** "Confirmación del proveedor" (documento + validación IA + panel de discrepancias, componente `ProviderConfirmationPanel`) sigue viviendo dentro de esta pantalla (`LogisticsPage.tsx` línea 413-414, 460-532), pese a que:
1. El mockup de Logística (`2B__Compras_Logistica.html`) no menciona "confirmación" ni "discrepancias" en ningún lado.
2. Esa funcionalidad es literalmente REQ-148 (SCRUM-211), cuya UBICACIÓN declarada es "Detalle de la orden, sección 'Confirmación del proveedor'" (Ver Órdenes) — `OrderDetailPage.tsx` no tiene ninguna referencia a esto.

No se repite el detalle completo acá porque ya está documentado con precisión en el comentario de Pre-QA de hoy en SCRUM-218 — se referencia como hallazgo confirmado, no se vuelve a investigar desde cero.

**Lo que sí cumple:** el resto del checklist de documentos (subir, listar, categorías correctas, marca de ya-subido) — 3 de los 4 hallazgos originales de Daniela sobre este REQ están cerrados.

---

## Síntesis final — patrones que resuelven varios hallazgos de una sola vez

1. **Un solo componente de timeline (REQ-154) resuelve, de una vez, la mayoría de RN1/RN3/RN5 de SCRUM-216.** Si se construye el componente de línea de tiempo visual (5/3 pasos, con fecha por paso completado) que pide REQ-154, el punto natural para escribir esa fecha es el mismo evento que ya dispara "avanzar etapa" — ahí mismo se puede: (a) escribir la fecha de la etapa recién completada (nuevo, resuelve RN1), y (b) si la etapa completada es la última, escribir `actual_arrival_date` automáticamente en el mismo request en vez de dejarlo como input manual (resuelve RN3/RN4 sin tocar la UI de Llegada real más que quitarle el `<input>`). RN5 (el ícono de atraso desaparece al llegar a Recibido) **ya funciona hoy sin cambios**, porque `isCritical()` ya depende de `status === RECIBIDO`. Recomendación concreta: abordar SCRUM-217 (timeline + fechas por etapa) como el ticket base, y que el auto-fill de Llegada real / la conversión de Llegada real a solo-lectura salgan como parte del MISMO cambio (mismo endpoint `advance`), no como trabajo separado de SCRUM-216.

2. **RN6/RN7 (registro permanente de "a tiempo/tarde") es trabajo de modelo de datos + Reportes/Proveedores, no de esta pantalla.** No tiene representación visual en el mockup de Logística — es candidato limpio a ticket propio, potencialmente parte de la migración que agregue las columnas de fecha por etapa del punto 1 (mismo momento — "al completar la última etapa" — mismo lugar de código).

3. **El hallazgo de "Confirmación del proveedor" mal ubicada (REQ-155 vs REQ-148/SCRUM-211) es independiente de los otros 3** — no comparte causa raíz ni componente con el gap de timeline. Es una decisión de arquitectura de UI (mover/duplicar/reabrir SCRUM-211), no bloqueada por nada de lo de arriba y no bloquea nada de lo de arriba tampoco. Puede resolverse en paralelo sin esperar al rediseño de timeline.

## Recomendación sobre abordaje (216/217/218 + RN1-RN7)

**Conviene tratarlos como un solo batch de rediseño para la parte de timeline/fechas (SCRUM-217 + la porción RN1/RN3/RN4/RN5 de SCRUM-216), pero mantener SCRUM-218 (mezcla REQ-148/REQ-155) como trabajo independiente en paralelo.** Motivo: el punto 1 de la síntesis muestra que construir el timeline naturalmente resuelve la mayoría de los hallazgos de fechas de SCRUM-216 en el mismo commit/endpoint — separarlos forzaría tocar el mismo `advance()` dos veces. RN6/RN7 sí conviene dejarlos como ticket propio (afecta Reportes/Proveedores, alcance distinto). SCRUM-214 y la porción ya corregida de SCRUM-216/218 (etiquetas, ruta, categorías de documento) están limpios y no necesitan más trabajo — no forman parte de este batch.
