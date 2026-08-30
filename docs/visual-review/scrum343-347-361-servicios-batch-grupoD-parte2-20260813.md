# Visual Review — Fase 4 Servicios, Grupo D parte 2 "Reserva Servicios de Insumos + Kardex de herramientas"

**Fecha:** 2026-08-13
**Tickets:** SCRUM-343/344/345/346/347/361 (REQ-273→277/291)
**Mockup de referencia:** `5C__Servicios_Inventario.html` (adjunto en SCRUM-343/346) +
`5__Requerimientos_Servicios.xlsx`. Fusionado con Pre-QA en el mismo dispatch — ver
`docs/pre-qa/scrum343-347-361-servicios-batch-grupoD-parte2-20260813.md` para el detalle
funcional/adversarial completo; este documento se enfoca en la comparación visual/estructural
contra el mockup.

## Veredicto: APROBADO — sin CRÍTICOS de fidelidad visual/funcional

## Comparación contra el mockup

### Pestaña "Insumos" (`viewMateriales` del mockup)

| Elemento del mockup | Implementación | Estado |
|---|---|---|
| Columnas: Ref. fábrica, Insumo, Disponible, Mínimo, Estado, Solicitud de compra | `InsumoTable.tsx`: Referencia de fábrica, Nombre, Disponible, Mínimo, Estado, Acciones (con botón "Solicitar" + badge "Solicitud pendiente" combinados en la última columna en vez de una columna "Solicitud de compra" separada) | Equivalente funcional — mismos datos presentes, layout combinado en 1 columna en vez de 2. No es pérdida de funcionalidad. |
| Botón "+ Agregar insumo" | `insumos.addButton`, visible solo para Aaron/Líder de Servicios | Presente, mismo texto |
| Botón "Solicitar" por fila | `insumos.table.requestButton` | Presente |
| Footnote "Reserva independiente de Bodega..." | No se replicó el texto exacto del footnote informativo | MENOR, no bloqueante — el footnote es texto explicativo, no un elemento funcional/dato requerido por ninguna de las 3 historias (REQ-273/274/275) |
| 5 estados de solicitud (sin-solicitar/solicitado/ordenado/transito/recibido) | 2 estados reales (`pendiente`/`null`) — reconciliado contra el backend real (ver nota en Pre-QA) | Decisión de Arquitecto ya documentada en el código, no gap |

### Botón "Movimiento de herramientas" y pantalla de Kardex

El mockup referencia un archivo separado `5D__Servicios_Movimiento_Herramientas.html` que **nunca
se adjuntó a ningún ticket de Jira** (confirmado: ni SCRUM-343 ni SCRUM-346 lo tienen entre sus
adjuntos) — no hay mockup real de esta pantalla para comparar pixel a pixel. La implementación se
diseñó contra el RN de texto de SCRUM-346 y el contrato real del backend (`ToolMovement`), con la
reconciliación de alcance ya documentada y confirmada con Luis (ver comentario en SCRUM-346,
2026-08-13): sin columnas de saldo, con fecha/herramienta+código/tipo/detalle/responsable y los 3
filtros combinables (RN4). Botón "Movimiento de herramientas" con ícono de reloj, mismo texto
literal que el mockup (`t('toolsAndSupplies.kardexButton')` = "Movimiento de herramientas"),
visible solo para Aaron/Gerencia/superadmin, abre en pestaña nueva — igual patrón que el mockup
(`window.open(...)`).

### Elementos explícitamente fuera de alcance (ya documentados en el batch anterior, Grupo D parte 1)

Tarjetas de estadísticas del mockup (`5C__Servicios_Inventario.html` trae contadores arriba de la
tabla) — no forman parte de ninguna de las 6 historias de este batch, confirmado que siguen fuera
de alcance a propósito, no un olvido.

## Identidad de marca / iconografía

- Sin iconografía de emoji en ningún componente nuevo (`InsumoTable`, `InsumoCreateModal`,
  `InsumoRequestModal`, `InsumosPanel`, `ToolKardexPage`) — cumple SCRUM-56.
- Badges de estado usan la misma paleta ya establecida en el resto del módulo (emerald/red para
  OK/Bajo mínimo, amber para Solicitud pendiente, teal para el badge nuevo "Origen: Servicios" en
  Compras — mismo tono que `--color-primary` de la marca).
- Colores de `TipoChip` en el Kardex (verde=Ingreso, rojo=Dañada, ámbar=Desgaste, gris=Perdida)
  consistentes con el criterio de severidad ya usado en `ToolEstadoSelect`.

## Responsive / dark mode

Verificado en las capturas del spec Playwright (viewport desktop estándar) — clases `dark:` ya
presentes en todos los componentes nuevos, mismo patrón que el resto del módulo Servicios. No se
probó viewport mobile en este pase (el mockup tampoco define un layout mobile distinto para esta
pantalla).

## Hallazgo real de este pase (compartido con Pre-QA, corregido en el mismo dispatch)

El badge "Origen: Servicios" que el propio ticket (REQ-274 RN3/Acceptance Criteria) exige que sea
"visible en Compras" no existía en ningún lado de la UI de Compras (`OrdersPage.tsx`/
`OrderDetailPage.tsx`) pese a que el dato ya existía en backend — el fix agrega el componente
`OriginBadge.tsx`, verificado visualmente en las capturas del spec E2E (`08-compras-ver-ordenes.png`,
`09-orden-detalle-pendiente.png` en adelante). Ver detalle completo en el documento de Pre-QA.

## Evidencia

Capturas completas en `atlanticerp-frontend/e2e/.tmp/preqa-servicios-grupoD-parte2/` (16 screenshots,
generadas por el spec Playwright permanente de este batch) — no commiteadas (directorio `.tmp`,
mismo patrón que el resto de specs Pre-QA del proyecto).
