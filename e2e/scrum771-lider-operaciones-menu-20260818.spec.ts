import { test, expect } from '@playwright/test'

// Validación visual SCRUM-771 (2026-08-18) — confirma que el sidebar de Compras para
// Líder de Operaciones (lideroperaciones@test.com) muestra SOLO Ver Órdenes/
// Logística/Inventario/Ver registros de ingreso/Comparación de Referencias, y que los
// 7 ítems restantes (Inicio, Proveedores, Nueva Orden, Agencias de Liquidación, Pagos a
// Proveedores, Garantías & Reclamos, Reportes) están ocultos — config aplicada vía
// UserVisibilityModal (SCRUM-724). El Sidebar renderiza cada ítem como <button> con
// onClick+navigate, no como <a href> — el chequeo es por texto, escopeado al <nav> del
// sidebar (evita falsos positivos, ej. "Inicio" existe también fuera de Compras).
//
// Credenciales por env var, nunca hardcodeadas — default = seeder de esta cuenta real
// (BusinessRoleUserSeeder: password default = email, create-only-if-not-exists).
const EMAIL    = process.env.OPERACIONES_EMAIL    ?? 'lideroperaciones@test.com'
const PASSWORD = process.env.OPERACIONES_PASSWORD ?? EMAIL

// SCRUM-747 reagrupó los 12 ítems en 7 accesos, 3 de ellos NavDropdown (Órdenes/Catálogo y
// Stock/Pagos) — un dropdown cuyos hijos quedan TODOS ocultos por menuVisibility desaparece
// entero (Sidebar.tsx: `if (children.length > 0) acc.push(...)`), así que "Pagos" (Pagos a
// Proveedores + Agencias de Liquidación, ambos ocultos para este perfil) no debería ni
// renderizar el toggle.
const STANDALONE_HIDDEN_LABELS = ['Inicio', 'Proveedores', 'Garantías & Reclamos', 'Reportes']

test('SCRUM-771 — sidebar de Compras para Líder de Operaciones muestra solo las 5 pantallas permitidas', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1200)

  await expect(page).not.toHaveURL(/login/)

  const expandBtn = page.getByRole('button', { name: /expandir menú/i })
  if (await expandBtn.count() > 0) await expandBtn.click()

  const nav = page.locator('nav')

  // Un NavDropdown llega abierto cuando la ruta activa es suya: un clic de más lo cerraría.
  const openDropdown = async (label: string, firstChild: string) => {
    if (!(await nav.getByRole('button', { name: firstChild, exact: true }).isVisible())) {
      await nav.getByRole('button', { name: label, exact: true }).click()
    }
  }

  // La sección "Compras · Inventario" (SCRUM-747) es colapsable y ya llega expandida si la ruta de aterrizaje es de Compras:
  // solo se abre si "Órdenes" no está a la vista (un clic de más la colapsaría).
  const sectionBtn = page.getByRole('button', { name: /compras.*inventario/i })
  if (await nav.getByRole('button', { name: 'Órdenes', exact: true }).count() === 0 && await sectionBtn.count() > 0) await sectionBtn.click()

  // Dropdown "Órdenes" — Ver Órdenes/Logística visibles, Nueva Orden oculta.
  await openDropdown('Órdenes', 'Ver Órdenes')
  await expect(nav.getByRole('button', { name: 'Ver Órdenes', exact: true })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Logística & Envío', exact: true })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Nueva Orden', exact: true })).toHaveCount(0)

  // Dropdown "Catálogo y Stock" — Inventario/Ver registros de ingreso/Comparación de
  // Referencias, los 3 visibles.
  await openDropdown('Catálogo y Stock', 'Inventario')
  await expect(nav.getByRole('button', { name: 'Inventario', exact: true })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Ver registros de ingreso', exact: true })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Comparación de Referencias', exact: true })).toBeVisible()

  // Dropdown "Pagos" — sus 2 únicos hijos (Pagos a Proveedores, Agencias de Liquidación)
  // están ocultos, así que el dropdown entero no debería existir en el sidebar.
  await expect(nav.getByRole('button', { name: 'Pagos', exact: true })).toHaveCount(0)
  await expect(nav.getByRole('button', { name: 'Pagos a Proveedores', exact: true })).toHaveCount(0)
  await expect(nav.getByRole('button', { name: 'Agencias de Liquidación', exact: true })).toHaveCount(0)

  // Ítems sueltos ocultos.
  for (const label of STANDALONE_HIDDEN_LABELS) {
    await expect(nav.getByRole('button', { name: label, exact: true })).toHaveCount(0)
  }
})
