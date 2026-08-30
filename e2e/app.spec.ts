import { test, expect } from '@playwright/test'

// Placeholder: el login real todavía no funciona contra el backend,
// así que este test solo valida que la SPA carga y renderiza contenido.
test('la página carga y muestra contenido', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'ATLANTIC' })).toBeVisible()
  await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible()
})
