# Visual Review — Servicios Batch 15 "Inicio" (SCRUM-270/271/273/274, REQ-207/208/210/211)

Fecha: 2026-08-12
Corrido contra: stack Docker aislado `batch15review` (backend `:8095`, migrado + seedeado desde
cero, tenant `illuminations`) + `vite dev` de `batch15-frontend` (`:5173`), NO `dev.atlanticerp.ai` —
este trabajo todavía no se pusheó. Fusionado con Pre-QA en el mismo despacho (ver
`docs/pre-qa/scrum270-271-273-274-servicios-batch15-home-20260812.md`), por preferencia del
proyecto de reducir overhead de aprobación en batches (`feedback_gate_overhead_proportional_to_batch_size`).

Mockup: `5__Servicios_Home.html` (adjunto a SCRUM-270). Excel: `5__Requerimientos_Servicios.xlsx`,
hoja "Requerimientos Servicios", filas REQ-206→211 — cruzado, sin diferencias con el texto de Jira.

**Alcance deliberadamente parcial** — este batch implementa SOLO 4 de los 9 tickets del REQ-206→214
("Inicio"). Explícitamente NO evaluados (sin código, no son hallazgo): SCRUM-269 (REQ-206, saludo
dinámico), SCRUM-272 (REQ-209, Mi calendario), SCRUM-275 (REQ-212, Servicios sin responder),
SCRUM-276 (REQ-213, Insumos y herramientas pendientes), SCRUM-277 (REQ-214, modal Ver ticket),
SCRUM-278 (REQ-215, panel Estado de tickets).

## Checklist funcional (mockup, solo los 4 paneles en alcance)

### Encabezado — acciones rápidas (REQ-207, SCRUM-270)
- [x] Botón "Agenda" — navega a Técnicos Internos → Agenda equipo, sin filtro de técnico
- [x] Botón "+ Nuevo ticket" — abre el mismo modal `TicketCreateModal` que el módulo Tickets
      (mismo buscador Cliente Master/Subcliente/Proyecto, mismos campos), no un formulario propio
- [ ] Saludo "Bienvenido, [nombre]" + fecha + resumen de visitas/pendientes — **fuera de alcance
      a propósito (REQ-206/SCRUM-269), no se evalúa**

### Panel Rutas del día (REQ-208, SCRUM-271)
- [x] Título "Rutas del día"
- [x] Filas: hora, punto de color del técnico, cliente, tipo de servicio, contacto, botón
      Waze/Maps con `href` a Google Maps con la dirección real de la visita
- [x] Máximo 5 visitas mostradas, orden por hora
- [x] Enlace "Ver agenda completa" visible cuando hay más de 5, navega a Técnicos Internos →
      Agenda equipo
- [x] Color del técnico coincide con Técnicos Internos (mismo campo `tecnico.color` en ambos, sin
      derivación por hash independiente — confirmado por lectura de código, no solo visual)
- [ ] Números de orden (1-5) sobre cada fila, como en el mockup — **ACEPTABLE, variante de layout**:
      el orden cronológico ya transmite la secuencia, ninguna funcionalidad se pierde

### Panel Pendientes (REQ-210, SCRUM-273)
- [x] Badge de conteo junto al título
- [x] Tarjeta "Ticket sin agendar" tras 3+ días sin agendar (umbral configurable, confirmado NO
      hardcodeado — `ServiciosSettingsService::sinAgendarUmbralDias()`)
- [x] Botón "Ver ticket" navega al ticket correcto (deep-link `?ticket=<id>`, verificado con el
      ID real, no solo con la URL)
- [x] Tarjeta obsoleta "Cliente sin confirmar cita" del mockup viejo — correctamente AUSENTE
      (Escenario 4 de REQ-210 pide explícitamente que ya no exista; el propio Excel anota que el
      mockup entregado "todavía muestra visualmente" esa tarjeta por ser un dato heredado de una
      versión anterior del diseño — no es una discrepancia real)
- [ ] Tarjeta "Repuesto sin llegar" (RN3) — **ver CRÍTICO en el reporte de Pre-QA**, nunca se
      genera (el backend la stubea vacía a propósito, dependencia de Batch 13-14)

### Panel Indicadores del mes (REQ-211, SCRUM-274)
- [x] Barra de progreso "Instalaciones completadas este mes" con formato `completadas / meta`
- [x] Nota de origen de la meta (`manual_default`/`calculated`/`manual_override`) — nunca un
      número sin contexto
- [x] Tarjeta "Resuelto 1ra visita" (%)
- [x] Tarjeta "Tiempo prom. resolución" (días)
- [x] Tarjeta "Ingresos por instalaciones" — presente visualmente, pero el valor real nunca se
      calcula (`available: false` permanente) — **ver CRÍTICO relacionado en Pre-QA (ajuste manual
      de meta) y nota de alcance diferido para RN5**

## Clasificación de diferencias

**CRÍTICO — ver detalle completo y reproducción en el reporte de Pre-QA** (misma sesión, mismo
despacho): la funcionalidad de "Gerencia ajusta manualmente la meta" (REQ-211 RN2a-c, Escenario 5)
no tiene NINGÚN punto de entrada en la UI, pese a que el endpoint backend ya existe y funciona.
Esto es fidelidad visual/funcional tanto como comportamiento — no hay dónde hacer clic para
ejercitar esa función, así que se documenta acá también.

**ACEPTABLE (nota, no bloquea):**
- Ausencia de números de orden (1-5) en las filas de Rutas del día — el mockup los tiene como
  ayuda visual, el desarrollo transmite el mismo orden cronológicamente sin ellos.
- El mockup muestra "8:30am" en Rutas del día; el desarrollo usa formato 24h ("08:30") —
  variante de formato, no de funcionalidad.

**Lo que sí cumple:** encabezado con ambos botones y comportamiento correcto (incl. el gate de rol
que Senior Review corrigió el 2026-08-11, re-verificado acá), Rutas del día completo con límite/
enlace/colores/Waze funcional, Pendientes con badge/umbral configurable/deep-link correcto y sin
la tarjeta obsoleta, Indicadores del mes con los 4 elementos visuales del mockup presentes y
alimentados con datos reales.

## Veredicto (pasada original, 2026-08-12 temprano)

**NO aprobado sin condición.** Un hallazgo CRÍTICO real (ver Pre-QA) bloquea el paso directo a
QA — no es un problema de fidelidad visual per se (todos los elementos del mockup están
presentes), sino de una funcionalidad del propio REQ-211 sin ningún punto de entrada en la UI.
Notificar a PM para reasignar antes de continuar. El resto del batch (REQ-207/208/210 completos,
REQ-211 salvo el ajuste manual de meta) pasa limpio.

---

## Re-check 2026-08-12 (tarde) — control de meta manual agregado, fidelidad confirmada

Commits: `atlanticerp-backend` `ff41fb1`, `atlanticerp-frontend` `46942bf` (detalle completo en el re-check del
reporte de Pre-QA — mismo despacho fusionado). Corrido contra el stack Docker local compartido
(`:8090`) + `vite dev` de este worktree (`:5173`), no `dev.atlanticerp.ai` (sigue sin pushear) ni el
stack aislado `batch15review` de la pasada original (ya no existe).

### Elemento nuevo verificado contra el mockup

El mockup (`5__Servicios_Home.html`) no muestra explícitamente un control de edición junto a la
barra de "Instalaciones completadas este mes" (es una vista de solo lectura en el mockup estático),
pero el criterio de aceptación de REQ-211 Escenario 5 sí exige que Gerencia pueda ajustar la meta —
la implementación agrega un ícono de lápiz (`IcoPencil`, mismo set de iconos del proyecto, sin
emoji) junto al número `completadas / meta`, visible SOLO para `superadmin`/`management`. Esto es
una adición funcional necesaria, no una desviación del mockup — mismo criterio ya aplicado en otros
paneles de Gerencia del módulo (Ajustes de Servicios, SLA).

- [x] Ícono de edición junto a "Instalaciones completadas este mes" — visible solo Gerencia/superadmin
- [x] Modal "Ajustar meta de instalaciones" — copy claro ("El ajuste aplica solo al mes en curso.
      Los meses siguientes vuelven a calcularse automáticamente."), campo numérico, botones
      Cancelar/Guardar
- [x] Al guardar, el panel refleja el nuevo valor de inmediato (sin recargar la página) y la
      leyenda de origen de la meta cambia a "Meta ajustada manualmente por Gerencia para este mes."
- [x] Tarjeta "Ingresos por instalaciones" — ya NO queda fija en "—": con `available: true` formatea
      el monto real (`USD 0.00` sin cotizaciones aprobadas este mes, confirmado con un caso real
      sembrado que sí calcula un monto > 0). Cierra la nota "ver CRÍTICO relacionado" que quedaba
      pendiente en la pasada original.
- [x] Iconografía — `IcoPencil` es parte de `src/components/icons/`, sin emoji, consistente con la
      regla de cliente (SCRUM-56)

Capturas de este re-check en `e2e/.tmp/preqa-recheck-batch15/`: `m1-aaron-home.png` (sin ícono,
"USD 0.00" en la tarjeta de ingresos), `m2b-modal-open.png` (modal), `m2d-after-save.png` (valor y
leyenda actualizados), `m3b-negative.png` (validación de negativo).

### Clasificación

**Ningún hallazgo nuevo.** El único CRÍTICO de la pasada original (ausencia total de punto de
entrada en la UI) está resuelto — el resto de la fidelidad visual/funcional del batch (encabezado,
Rutas del día, Pendientes) no tuvo cambios de código en este fix y no se re-evaluó punto por punto
(ver nota de entorno en el re-check de Pre-QA).

## Veredicto final (re-check 2026-08-12 tarde)

**APROBADO.** El control de meta manual (REQ-211 Escenario 5) está implementado, es visualmente
consistente con el resto del módulo (mismo set de iconos, mismo patrón de modal), y respeta el
gate de rol. La tarjeta "Ingresos por instalaciones" ya refleja datos reales. Sin objeciones para
pasar a Pre-QA/QA.
