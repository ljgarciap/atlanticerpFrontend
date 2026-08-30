# Visual Review — Batch F, Epic CRM (SCRUM-703→710, REQ-623→630) "Pedidos"

Comparado contra el mockup real del ticket (`1F__Ventas_Disen_o_Pedidos.html`, adjunto en
SCRUM-703) vía Playwright CLI contra `dev` local (`localhost:5173`), logueado como
`designer@illuminations.test`.

## Resultado: sin CRÍTICOs — misma funcionalidad y elementos que el mockup

- Título + subtítulo, botones "Catálogo"/"Ver cotizaciones", 4 tarjetas KPI, barra de
  filtros (buscador + select de Estado + Borrar filtros), tabla con las 9 columnas de REQ-623
  RN2, badges de Estado con los mismos 4 colores del mockup (gris/teal/rojo/teal) — todo presente.
- Modal de detalle: header con folio/cliente/proyecto/fecha/responsable, alerta roja/verde según
  estado, 3 tarjetas de resumen, tabla de ítems con fila TOTAL — todo presente.
- Iconografía: el mockup usa emoji (`⚠️`/`✓`) en las alertas del modal — reemplazados por
  `IcoAlertTriangle`/`IcoCheck` (componentes propios, sin `stroke=currentColor` de Feather), regla
  de cliente SCRUM-56 (sin iconografía de emoji en la UI).

## Hallazgo encontrado y corregido en esta sesión (no CRÍTICO de fidelidad, sino de usabilidad)

El modal de detalle (inicialmente `max-w-4xl`) cortaba la columna "Diferencia" de la tabla de
ítems sin ningún indicio visual de que había más contenido a la derecha (sin scrollbar visible en
el viewport probado, 1440px de ancho) — confirmado con capturas antes/después. **Fix:** modal
ampliado a `max-w-6xl`, con lo que la tabla completa entra sin recorte en un viewport de escritorio
típico; sigue siendo responsive vía `overflow-x-auto` en pantallas más angostas.

## Nota — permiso de configuración del umbral (REQ-625)

El botón "Configurar umbral" + `OrdersSettingsPanel` (gateados por
`ventas_diseno.pricing.configure`) no tienen equivalente en el mockup (que no contempla la
parametrización, decisión de Luis 2026-07-31 de no hardcodear el 5pp). No se verificó visualmente
en navegador por no haber ninguna cuenta demo local con ese permiso concedido — se validó por
código siguiendo el mismo patrón exacto que `PricingSettingsPanel` (componente ya probado en
producción) y por test de compilación (`tsc`/build limpios). Si se quiere cerrar ese último punto
visualmente, alcanza con conceder `ventas_diseno.pricing.configure` a una cuenta demo local y
repetir la captura.
