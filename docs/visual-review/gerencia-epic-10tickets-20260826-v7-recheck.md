# Visual Reviewer — Épica Gerencia (SCRUM-325), recheck v7 (fusionado con Pre-QA)

**Fecha:** 2026-08-26 · **Entorno:** dev.atlanticerp.ai (backend `ead5669` / frontend `910e328`)
**Mockup de referencia:** `06_gerencia_home.html` (adjunto en todos los tickets, sin cambios desde
su publicación 2026-07-10 — la fidelidad de layout general de `/gerencia` ya fue validada en
sesiones anteriores de Visual Review, ver `docs/visual-review/` histórico; esta pasada se enfoca en
los elementos NUEVOS o modificados por los commits de esta ronda).

Este recheck corre fusionado con Pre-QA (regla vigente desde 2026-08-15). La gran mayoría de los
hallazgos de esta ronda son de comportamiento/datos (dominio Pre-QA — ver
`atlanticerp/docs/pre-qa/gerencia-epic-10tickets-20260826-v7-recheck.md` para el detalle completo) y por
regla dura del proyecto **no llevan captura** (esa exigencia aplica solo a CRÍTICOs de Visual
Reviewer). Este documento cubre específicamente la fidelidad funcional/visual de los elementos
nuevos contra lo que el ticket (o el comentario de redefinición de Daniela, cuando aplica) exige.

## Checklist funcional — elementos nuevos de esta ronda

### SCRUM-162 — Modal de detalle de aprobación (nuevo, no existía en el mockup original)
El mockup original no incluye este modal (fue agregado 2026-08-25 como fix, sin mockup propio
adjunto — el ticket define el comportamiento vía Gherkin, no vía mockup visual). Checklist contra
el propio Gherkin del ticket:
- Encabezado con badge de módulo + referencia — **presente**
- Descripción, monto (si aplica), fecha de creación — **presentes**
- Botón "Aprobar" — **presente**, condicionado a `can_approve`
- Botón "Rechazar" — **presente**, correctamente AUSENTE para `purchase_order` (regla de negocio
  documentada en el código — el rechazo de PO se gestiona en Compras, no es una omisión)
- Botón "Ver en [módulo] →" — **presente**, navega con el ID puntual (confirmado:
  `/bodega/inventario-general?count=5`, `/compras/ordenes?order=8`)
- Modal de confirmación secundario ("¿Aprobar/Rechazar X? / Sí, aprobar / Cancelar") — **presente**
- **ACEPTABLE** (no bloquea): el modal es una implementación completamente nueva de Marly/Claude sin
  spec visual propia — el diseño (tarjeta centrada, badge de módulo, botones a la derecha) es
  consistente con el resto del sistema de diseño de Atlantic (paleta teal/lima, sin
  iconografía de emoji — cumple regla SCRUM-56).

### SCRUM-167/169/170 — Tarjetas "Salud por módulo" redefinidas por Daniela (2026-08-25)
Sin mockup propio (Daniela redefinió vía comentario de texto + diagrama ASCII, no un archivo de
imagen/HTML) — el checklist es literal contra su propio comentario:

**Admin & Contab (SCRUM-167):** "CxC Total" + "Cuentas al día", sin tercer indicador "CxP total"
— **estructura correcta, 2 tarjetas, sin espacio reservado para un tercero.**

**Bodega (SCRUM-169):** "Despachos urgentes" / "Despachos atrasados" / "Despachado a tiempo" /
"Completados hoy" — **4 indicadores presentes con las etiquetas exactas pedidas**, incluida la
variante visual: urgentes en ámbar (`warn`) cuando > 0, atrasados en rojo (`danger`) cuando > 0 —
consistente con el resto de tarjetas de "Salud por módulo" (mismo patrón visual que Servicios).

**Servicios (SCRUM-170):** "Sin responder" / "Completados este mes", con "Resuelto en 1ra visita"
correctamente ausente — **estructura correcta, 2 tarjetas.**

Ninguno de los 3 presenta un hallazgo CRÍTICO de tipo Visual Reviewer (elemento/campo/vista
faltante) — los 3 hallazgos reales de esta ronda para estos tickets (destino no aplica el filtro)
son de comportamiento, no de fidelidad visual, y se documentan en el reporte de Pre-QA.

## Iconografía (regla SCRUM-56)
Revisión rápida de todos los elementos nuevos/tocados esta ronda (modal SCRUM-162, tarjetas
167/169/170): **0 emojis** — el modal usa el set propio de SVG outline (`stroke=currentColor`),
consistente con el resto de la app. Sin hallazgos.

## Layout general de `/gerencia`
Sin cambios estructurales de layout esta ronda (ningún commit tocó el grid/orden de secciones) —
no se repite la validación completa de layout contra el mockup, ya cubierta en sesiones previas
(ver histórico de `docs/visual-review/`).

## Veredicto
Sin CRÍTICOs de Visual Reviewer en esta ronda — gate de fidelidad visual/funcional contra mockup
**aprobado** para los elementos nuevos evaluados. El bloqueo de los 8 tickets marcados NO PASA es
enteramente por hallazgos de Pre-QA (comportamiento/datos), no por ausencia de elementos del
mockup — ver `atlanticerp/docs/pre-qa/gerencia-epic-10tickets-20260826-v7-recheck.md`.
