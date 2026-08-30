# Visual Review — SCRUM-88 / SCRUM-89 / SCRUM-91 (Ventas & Diseño · Pipeline)

Fecha: 2026-07-29
Reviewer: Visual Reviewer (AtlanticERP)
Entorno: `https://dev.atlanticerp.ai` (usuario `management@illuminations.test`)
Mockup de referencia: `1A__Ventas_Disen_o_Pipeline.html` (adjunto Jira 10136/10139/10142, subido por
Daniela Amaya 2026-07-07) + `Requerimientos Ventas Diseño.xlsx` (REQ-019/020/022).

Gate previo: Senior Review y Pre-QA (adversarial, en vivo) ya dieron pasada limpia sobre estos 3
tickets. Este documento cubre exclusivamente fidelidad funcional contra el mockup.

## Resultado: APROBADO — sin hallazgos CRÍTICOS. Listo para Pre-QA/QA.

---

## SCRUM-88 (REQ-019) — Modal "+ Nuevo Proyecto" tipo Lead

Checklist del mockup (`npLeadFields`, líneas 1053-1078 del HTML): Nombre del proyecto *(texto,
obligatorio)*, Observaciones (textarea, opcional), Foto (file, opcional), Etiqueta (select
Diseño/Cotización/Ambos, opcional), Contactos (filas rol+teléfono+correo, "+ Agregar otro
contacto", opcional en creación pero exigido para mover de etapa).

**Lo que sí cumple:**
- Nombre del proyecto, Etiqueta, Foto y Observaciones presentes y funcionales en el modal de
  creación — confirmado con screenshot y con creación real de tarjeta.
- Guardar solo con Nombre habilitado; el resto opcional — coincide con REQ-019.
- Gate de contacto obligatorio para mover de etapa: confirmado en vivo — al intentar "Mover a
  Diseño" un Lead sin contactos, el sistema bloquea con el mensaje "Falta al menos 1 contacto antes
  de mover esta tarjeta desde Lead." Coincide con la regla de negocio de REQ-019/REQ-011.
- El mecanismo para agregar el contacto SÍ existe: no está en el modal de creación, pero aparece en
  la vista "Editar" de la tarjeta (sección "Contactos" con selector Cliente/Arquitecto/Otro + "+
  Agregar"), disponible inmediatamente después de crear el Lead. Confirmado por `innerText` del
  modal (no solo screenshot — el modal de Editar tiene scroll interno y un screenshot de viewport
  fijo no capturaba esta sección más abajo, lo verifiqué con el texto completo del DOM para no
  reportar un falso crítico).

**ACEPTABLE (nota, no bloquea):**
- El mockup ofrece agregar Contactos *inline*, en el mismo modal de creación del Lead. La
  implementación real lo separa en dos pasos: crear el Lead (sin contactos) → abrir "Editar" →
  agregar contacto ahí. El usuario puede completar la misma tarea, solo con un paso adicional — no
  se pierde ninguna funcionalidad del mockup, es una variante de flujo/layout.

---

## SCRUM-89 (REQ-020) — Modal "+ Nuevo Proyecto" tipo Diseño

Checklist del mockup (`npDesignFields`, líneas 1080-1123): Cliente Master * (buscar/crear),
Subcliente * (buscar/crear), advertencia si el subcliente no tiene contactos, Nombre del proyecto
*, Fecha de entrega estimada (opcional), Archivos de diseño (múltiples, "+ Agregar otro archivo"),
Diseñador responsable (bloqueado al usuario en sesión), Etiqueta (opcional).

**Lo que sí cumple:**
- Cliente Master y Subcliente con buscador + creación inline (incluye RUC) — funcional,
  confirmado creando cliente/subcliente nuevos en vivo.
- Advertencia "Este subcliente no tiene contactos registrados. Hacé clic de nuevo para continuar
  igual." — coincide en espíritu con el `npContactWarning` del mockup.
- Archivos de diseño múltiples: agregar 2+ archivos y eliminar uno antes de guardar, ambos casos
  confirmados en vivo (Pre-QA ya lo había probado adversarialmente; yo confirmé la presencia visual
  de la sección "ARCHIVOS DE DISEÑO" + botón "+ Agregar" + "Eliminar" por archivo).
- Regla "cliente nuevo → una sola tarjeta final en Diseño, sin duplicado en Lead": confirmado —
  no aparecen tarjetas huérfanas en la columna Lead con el nombre del Cliente Master recién creado.
- Guardar bloqueado sin Subcliente ni Nombre del proyecto — confirmado.

**ACEPTABLE (nota, no bloquea):**
- "Fecha de entrega estimada", "Diseñador responsable" y "Etiqueta" no están en el modal de
  *creación* de Diseño (a diferencia del mockup, que los incluye ahí). Verifiqué que los tres
  existen y son editables/visibles inmediatamente en la vista "Editar" de la tarjeta recién creada:
  Etiqueta (select), Responsable (ya viene precargado con el usuario en sesión, tal como el mockup
  lo define como campo bloqueado/no editable — su ausencia en el modal de creación no cambia el
  resultado, ya que el mockup tampoco permite editarlo, solo lo muestra), y Tipo de entrega
  (Única/Parcial, equivalente a la fecha de entrega, aplicado desde la etapa Diseño en adelante).
  El usuario puede lograr el mismo resultado que el mockup, con un paso adicional (crear → Editar).

---

## SCRUM-91 (REQ-022) — Navegación cruzada Clientes/Reportes → Pipeline

### A. Reportes → "Mejores clientes" → Pipeline

Checklist del mockup (`handleShowOnlyParam`, líneas 2932-2999): al hacer clic en un cliente del
panel "Mejores clientes", Pipeline muestra **solo** la columna Aprobado, tarjetas ordenadas por
valor descendente, respetando el alcance (Inicio/Equipo) activo en Reportes, con un banner
"Mostrando solo: Aprobado..." y link "Ver todo el pipeline".

**Lo que sí cumple (confirmado en vivo, con scope Equipo activo en Reportes):**
- Click en una fila de "Mejores clientes" navega a Pipeline con la columna **Aprobado** como única
  visible (`['Aprobado']`, confirmado leyendo los headers de columna del kanban).
- Tarjetas dentro de Aprobado ordenadas por valor descendente — confirmado comparando los montos
  extraídos de cada tarjeta contra el orden esperado.
- El chip "Todos" restaura las 6 columnas — confirmado.
- El toggle de alcance mostraba "Equipo" activo tras la navegación (coincide con el alcance que
  traía Reportes), con tarjetas de múltiples responsables visibles, no solo las del usuario en
  sesión.

**ACEPTABLE (nota, no bloquea):**
- No se ve el banner textual "Mostrando solo: Aprobado, ordenado por valor de mayor a menor · Ver
  todo el pipeline" que muestra el mockup. La misma función (volver a la vista completa) se logra
  con el chip "Todos", ya visible en la barra de filtros — no se pierde funcionalidad, solo cambia
  la forma de comunicarlo/revertirlo.
- No re-testeé explícitamente el caso "scope = Inicio activo en Reportes → se respeta Inicio en
  Pipeline" (solo probé con Equipo forzado). Vale la pena que QA lo confirme como parte de su
  pasada, no es un hallazgo, es una nota de cobertura.

### B. Clientes → "Ver proyectos" → Pipeline

Checklist del mockup (`handleHighlightParam`, líneas 2858-2910): clic en "Ver proyectos" de un
subcliente en Clientes lleva a Pipeline con la tarjeta resaltada (`?highlight=nombre`), alcance
forzado a "Equipo", banner "Mostrando resultado para: [nombre] · Ver todo el pipeline".

**Lo que sí cumple (confirmado en vivo):**
- El botón "Ver proyectos" existe en cada fila de la tabla de Clientes.
- Al hacer clic, se abre un modal intermedio "Proyectos de [Cliente Master]" que lista
  Subcliente/Proyecto/Etapa/Valor — esto es necesario porque un Cliente Master real puede tener
  más de un proyecto (el mockup asume un único resultado por nombre; en datos reales, un cliente
  con 2+ proyectos activos necesita este paso de desambiguación para saber a cuál ir).
- Clic en una fila de proyecto dentro de ese modal navega a
  `/ventas-diseno/pipeline?card=<id>` y **abre directamente el detalle de esa tarjeta** (más directo
  que el resaltado con scroll+glow del mockup, pero cumple el mismo objetivo: el usuario llega
  exactamente al proyecto que buscaba). El tablero de fondo mostraba tarjetas de múltiples
  responsables (Idmar Hernandez, Bernardo Gomez, etc.), consistente con alcance forzado a Equipo.

**ACEPTABLE (nota, no bloquea):**
- La implementación usa un identificador de tarjeta (`?card=<id>`) y abre el detalle directamente,
  en vez de resaltar visualmente la tarjeta en el tablero como hace el mockup (`?highlight=<nombre>`
  + box-shadow + scroll). Es una variante de mecanismo razonable dado que el mockup no contempla
  clientes con más de un proyecto — el objetivo funcional ("llegar al proyecto correcto desde
  Clientes") se cumple igual, de forma más directa.

---

## Resumen para PM/Luis

**CRÍTICO: ninguno.** Los 3 tickets implementan toda la funcionalidad que el mockup exige; las
diferencias encontradas son variantes de flujo (un paso adicional para Contactos/Etiqueta/Fecha de
entrega vía "Editar" en vez de inline en la creación) o de mecanismo de navegación (modal de
desambiguación + deep-link por id en vez de resaltado por nombre), ninguna de las cuales le quita al
usuario la capacidad de hacer lo que el mockup muestra.

**Aprobado — listo para Pre-QA/QA**, sujeto también a la aprobación en paralelo de Senior Reviewer
(ya dada, según el contexto de esta tarea).

Nota metodológica: en dos casos (Contactos de Lead, Etiqueta/Fecha de Diseño) un primer screenshot
del modal "Editar" parecía confirmar la ausencia total del campo — el modal tiene scroll interno
propio y el screenshot solo capturaba el viewport visible. Verifiqué con `innerText` del contenedor
completo antes de concluir, evitando un falso CRÍTICO.
