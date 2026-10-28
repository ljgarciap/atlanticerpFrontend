import { test, expect, type Page } from '@playwright/test'

// Promovido a permanente por Pre-QA (2026-07-16, sprint2 Compras/Proveedores) — ver
// docs/pre-qa/compras-proveedores-sprint2-20260716.md. Regla del proyecto: un smoke test que
// verifica un gate de permiso/flujo de estado que ya se rompió una vez no se descarta.
//
// - "designer sin acceso a Compras": el módulo Compras es nuevo (sprint2) y su visibilidad
//   depende de RoleModuleVisibility/effectivePermissionsV2() — exactamente el tipo de regresión
//   de permisos que ya rompió otras veces en este proyecto (SCRUM-83, SCRUM-126/138).
// - "selector de Origen en Proveedores": Senior Review 2026-07-16 (B2) encontró que el campo
//   `origin` existía de punta a punta en el backend (incl. lógica real de salto de
//   tránsito/aduana, REQ-141) pero no había ningún selector en el formulario — un proveedor
//   creado desde la UI quedaba "internacional" para siempre. Corregido en el mismo día
//   (commit a9b9da3 / a618e1b en frontend). Este test evita que el selector desaparezca nunca
//   más sin que se note.
//   Actualizado 2026-09-09 (hallazgo de gate, no relacionado al batch que lo encontró) — el
//   selector de `origin` dejado de existir como campo propio desde SCRUM-189 (2026-07-30,
//   `ProviderFormDrawer.tsx`): `origin` ahora se DERIVA de `category` (`locales` → local,
//   cualquier otra → internacional). El test seguía apuntando al campo viejo (nunca actualizado
//   tras SCRUM-189) — timeouteaba porque `.filter({ hasText })` sobre `select` matcheaba por
//   accidente el `<select name="category">` (la opción "locales" contiene el substring "local"),
//   y ese select no tiene ninguna opción con value literal "local"/"internacional". Reescrito
//   para ejercitar el mecanismo real vigente.

async function login(page: Page, email: string, password: string) {
  await page.goto('/')
  await page.getByPlaceholder('usuario@atlantic.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: /iniciar sesión/i }).click()
  await page.waitForURL(/\/(dashboard|compras|ventas|seguridad)/, { timeout: 10000 })
}

test('un rol sin acceso a Compras (vendedor) no ve el módulo en el sidebar ni puede leer datos reales en /compras/proveedores', async ({ page }) => {
  await login(page, 'vendedor@atlantic.test', 'Password123!')
  await expect(page.getByRole('link', { name: /compras/i })).toHaveCount(0)

  await page.goto('/compras/proveedores')
  await expect(page.getByRole('table')).toHaveCount(0, { timeout: 5000 })
})

test('el formulario de Proveedores tiene un selector de Categoría que determina el origen (local/internacional) — B2, Senior Review 2026-07-16 / SCRUM-189', async ({ page }) => {
  await login(page, 'lidercompras@test.com', 'lidercompras@test.com')
  await page.goto('/compras/proveedores')
  await page.getByRole('button', { name: /agregar proveedor/i }).click()

  const categorySelect = page.locator('select[name="category"]')
  await expect(categorySelect).toBeVisible({ timeout: 5000 })
  await categorySelect.selectOption('locales')
  await expect(categorySelect).toHaveValue('locales')
  await categorySelect.selectOption('china')
  await expect(categorySelect).toHaveValue('china')
})
