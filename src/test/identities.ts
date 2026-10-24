import fixture from './fixtures/identity-permissions.json'

/**
 * Permisos EFECTIVOS reales (`User::effectivePermissionsV2()`) de las identidades del seed, volcados del backend
 * (ver `_generado` en el JSON). Los tests que antes mockeaban solo `role` los usan para que el mock se parezca al JWT real.
 */
export interface SeedIdentity { email: string; role: string; permissions: string[] }

export const IDENTITIES: SeedIdentity[] = fixture.identities

/** Permisos del primer usuario sembrado con ese rol. */
export function permissionsFor(role: string): string[] {
  const found = IDENTITIES.find(i => i.role === role)
  if (!found) throw new Error(`Sin identidad sembrada con rol ${role}`)
  return found.permissions
}

/** Igual que `permissionsFor`, pero [] si ningún usuario del seed tiene ese rol (p. ej. `designer`, roles legados de tests). */
export function permissionsForOrEmpty(role: string): string[] {
  return IDENTITIES.find(i => i.role === role)?.permissions ?? []
}
