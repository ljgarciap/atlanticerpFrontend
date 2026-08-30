# Visual Review — Epic CRM (SCRUM-332) Batch C: SCRUM-684→689 — Dashboard CRM (2026-07-31)

**Tickets:** SCRUM-684→689 (REQ-604→609, epic SCRUM-332, proyecto SCRUM), status Jira `In
Progress`.
**Commits revisados:** `atlanticerp-backend` — `7666e20` (implementación original) + `d91b78c` (fix de
idempotencia de recordatorios, ver Pre-QA). `atlanticerp-frontend` — `7666e20` (implementación original,
`DashboardPage.tsx`) + `c88f3a7`/`a7bc7a8`/`668d1eb`/`6a5cc7c` (fix + tests, ver Pre-QA).
**Mockup de referencia:** `2__CRM_Dashboard.html` (attachment 11533 de SCRUM-684), único mockup
adjunto — cubre las 6 historias del batch a la vez (Dashboard es una sola pantalla). Cruzado
también contra `7__Requerimientos_CRM.xlsx` (attachment 11534, hojas "CRM"/"Historias de
Usuario"/"Modelo de Datos"/"Matriz de Permisos por Rol") — sin conflictos entre Excel y Jira para
este batch.
**Método:** Playwright CLI contra `https://dev.atlanticerp.ai` (ya desplegado por CI/CD antes de esta
sesión). Cuentas reales: Whileyner Contreras (`whil@atlantic.com.pa`, Gerencia) y Milena
Estrada (`milena.e@grupolafayette.com`, Vendedor/Diseñador). Capturas en
`e2e/.tmp/preqa-dashboard-batchc/` (1 a 6, descartables, no promovidas — el artefacto de esta
revisión es la comparación, no el script de captura, per convención de este agente).

## Checklist funcional del mockup

Extraído literalmente de `2__CRM_Dashboard.html` (estructura + script `renderDashboard()`):

| Elemento del mockup | Implementado en dev.atlanticerp.ai | Nota |
|---|---|---|
| Título "Dashboard CRM" + subtítulo fijo "Resumen de todos los proyectos del equipo" | Sí | Idéntico texto |
| Botón "+ Nuevo Proyecto" (arriba a la derecha) | Sí | Mismo texto, misma posición relativa |
| Aviso "N proyecto(s) con propuesta vencida" + lista de nombres + botón "Enviar recordatorios" | Sí | Presente/ausente según haya datos — confirmado ambos estados con datos reales de dev |
| Aviso "N cliente(s) sin contacto reciente" + lista de Clientes Master | Sí | Igual — agrupado por Cliente Master, sin duplicados |
| 6 tarjetas de conteo por etapa (Lead/Diseño/Cotización/Propuesta/Aprobado/Perdido) | Sí | Mismo orden fijo que el mockup |
| 2 tarjetas de dinero ("Pipeline activo", "Cerrado (ganado)") dentro del mismo grid de 8 | Sí | Formato `$` con comas |
| Gráfico de barras "Proyectos por etapa", 6 barras en orden fijo, conteo sobre cada barra | Sí | Mismo orden, mismo criterio de altura proporcional (Chart.js `barData`, altura relativa a la etapa con más proyectos) |
| Gráfico de dona "Por tipo de solicitud" (Diseño/Cotización/Diseño+Cotización) + leyenda con conteo | Sí | Mismos 3 colores categóricos distintos (paleta ajustada al sistema de diseño de Atlantic en vez de los colores placeholder del mockup — ver "Aceptable" abajo), leyenda con conteo por categoría |
| Nota "(N sin etiqueta, no incluida)" junto a la leyenda de la dona | Sí | Verificado con fixtures sembrados en esta misma sesión (dato real de dev no tenía tarjetas sin etiqueta hasta sembrarlas — ver Pre-QA) |
| 2 "tarjetas totales" grandes con ícono, debajo de los gráficos (Pipeline activo / Cerrado, DUPLICADAS respecto al grid de 8 de arriba) | Sí | El mockup en sí mismo muestra el dato de Pipeline activo/Cerrado DOS veces (una vez en el grid de 8 chico, otra vez en 2 tarjetas grandes con ícono debajo de los gráficos) — el desarrollo replica exactamente esa misma duplicación intencional del mockup, con íconos SVG propios (`IcoDollarSign`/`IcoCheck`) en vez de los caracteres `$`/`✓` planos del mockup (ver "Aceptable") |
| Nav lateral: item "Dashboard CRM" visible solo para el perfil correcto | Sí — más estricto que el mockup, que no modela el gate de permiso (el mockup es estático, un solo usuario "Diseñador" en el `user-role` de la topbar, sin lógica de roles real) | El desarrollo agrega el gate que el mockup, al ser HTML estático, no podía representar — no es una desviación, es la parte que corresponde al backend/frontend real |

## Aceptable (variante de layout/estilo, no bloquea)

- **Colores de la dona:** el mockup usa `#5B8DEF`/`#A78BFA`/`#5BC4A0` (colores ad-hoc de este
  mockup puntual); el desarrollo usa `#2a78d6`/`#eb6834`/`#1baf7a` — paleta categórica del sistema
  de diseño de Atlantic ya validada por el skill `dataviz` en trabajo previo de este mismo
  repo (comentario explícito en `DashboardPage.tsx`: "únicas 3 que pasan la validación de pares
  completos en luz y oscuro"). Misma cantidad de categorías, mismo criterio de asignación
  (Diseño/Cotización/Ambos), solo cambia el valor exacto del color dentro de la paleta de marca ya
  aprobada — variante explícitamente aceptable según la regla de este agente.
- **Íconos de las 2 tarjetas grandes de totales:** el mockup usa un carácter `$` y `✓` planos
  dentro de un círculo de color; el desarrollo usa los componentes SVG propios
  `IcoDollarSign`/`IcoCheck` (`src/components/icons/`) — cumple la regla de cliente SCRUM-56 de no
  usar iconografía de emoji/carácter suelto, y es exactamente el patrón que el resto de la app ya
  sigue. Misma función visual (marcar cada tarjeta con un ícono de color), solo cambia el sistema
  de iconografía.
- **Layout general (sidebar vs. topbar del mockup):** el mockup es un archivo HTML standalone con
  su propio sidebar de maqueta; el desarrollo vive dentro del shell real de la app (`AppShell`,
  `Sidebar.tsx`, `TopBar.tsx`) — mismo patrón ya aceptado en Batches A/B de este mismo epic, no es
  una desviación nueva de este batch.

## CRÍTICO

Ninguno. Las 6 historias del batch (SCRUM-684→689) tienen su contraparte funcional completa en
`dev.atlanticerp.ai` — campos, botones, vistas y estados del mockup presentes y operativos. El único
hallazgo real de esta ronda (duplicado de notificaciones en "Enviar recordatorios") es de
comportamiento en runtime (no de fidelidad al mockup — el mockup no modela el efecto secundario de
notificaciones reales) y se documenta en el Pre-QA de esta misma sesión
(`docs/pre-qa/scrum684-689-crm-dashboard-batchc-20260731.md`), ya corregido y re-verificado.

## Lo que sí cumple

Los 6 requerimientos (REQ-604 a REQ-609) tienen equivalente 1:1 con el mockup en campos, botones,
vistas y comportamiento — confirmado en vivo contra `dev.atlanticerp.ai`, no solo por lectura de código:

- REQ-604 (alertas): ambos avisos presentes con datos reales, botón de recordatorio funcional.
- REQ-605 (tarjetas de conteo): 8 tarjetas, mismos labels y orden.
- REQ-606 (barras): 6 barras, orden fijo, conteo visible.
- REQ-607 (dona): 3 categorías, leyenda con conteo, nota de "sin etiqueta".
- REQ-608 (nuevo proyecto): navega y abre el modal sin clic extra, confirmado también por query
  param directo.
- REQ-609 (acceso Gerencia): gate de rol real (frontend + backend), sin selector de alcance.

## Resultado

**Aprobado — pasa a Pre-QA/QA.** Sin hallazgos CRÍTICOS de fidelidad visual/funcional contra el
mockup. Corre en paralelo al Pre-QA de esta misma sesión (mismo archivo de hoy), que sí encontró y
cerró 1 hallazgo CRÍTICO de comportamiento (no de mockup) — ver ese documento para el detalle.
