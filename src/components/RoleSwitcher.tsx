/**
 * ADR-006, Fase C — daily 2026-07-10. `UserInfo.roles` (plural) se eliminó: login() ya no
 * dispara la pantalla de selección multi-rol (v2 une role_id + user_additional_roles
 * automáticamente, sin necesidad de elegir uno). Este componente se queda sin datos con los que
 * operar — se mantiene en el árbol de TopBar sin borrar (switch-role sigue existiendo en el
 * backend, sin llamador real, ver JwtClaimsBuilder) pero no renderiza nada.
 */
export default function RoleSwitcher() {
  return null
}
