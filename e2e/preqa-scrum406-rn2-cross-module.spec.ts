import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test.use({ baseURL: 'http://localhost:8090' })

// KNOWN RED TEST — SCRUM-406 RN2/Escenario 2 ("la tarjeta debe salir de 'sin stock'
// automáticamente cuando Compras marca la orden como recibida") NO está implementado (Pre-QA
// 2026-07-24, ver docs/pre-qa/a3-cierre-2026-07-24.md). No hay ningún listener/evento que conecte
// `PurchaseOrderController::advance()` (Compras) con `App\Modules\Bodega\Models\Order` — se
// confirmó por código (grep de ORDER_TYPE_FALTANTE/STATUS_RECIBIDO en todo app/Modules) y en vivo
// (este mismo test, avanzando la PO real #18 hasta Recibido vía el botón real de Compras). Este
// test se promueve a e2e/ como test PERMANENTE aunque hoy falle a propósito — CI de este repo no
// corre Playwright (ver .github/workflows/), así que no bloquea ningún pipeline; queda como
// regresión ejecutable para que la próxima sesión de Pre-QA confirme el fix real apenas alguien
// (Backend Dev, con diseño del Arquitecto) implemente el puente cross-módulo. Se resetea el
// fixture al inicio (requiere las órdenes VR-9001/PO#18 sembradas por Visual Reviewer/Pre-QA
// 2026-07-24 — id 149 y 18 respectivamente en este entorno local) para que sea re-corrible
// cualquier cantidad de veces sin depender de un directorio de scratch de ninguna sesión puntual.
test.beforeAll(() => {
  const resetScript = `
    \\App\\Modules\\Compras\\Models\\PurchaseOrder::where('id', 18)->update([
        'status' => 'en_transito',
        'estimated_arrival_date' => '2026-07-30',
    ]);
    \\App\\Modules\\Bodega\\Models\\Order::where('id', 149)->update([ // VR-9001
        'order_type' => 'faltante',
        'stage' => 'asignado',
    ]);
    echo 'RESET OK' . PHP_EOL;
  `
  const scriptPath = join(tmpdir(), `preqa-scrum406-reset-${Date.now()}.php`)
  writeFileSync(scriptPath, resetScript)
  execSync(
    `docker compose exec -T laravel php artisan tenants:artisan tinker < ${scriptPath}`,
    { cwd: '/Users/lgarcia/Documents/GitHub/Softclass/Illumination/atlanticerp/atlanticerp-backend/infra', stdio: 'inherit' },
  )
})

async function login(page, email: string) {
  // Logout defensivo -- re-loguear con otro actor en la misma page/sesión (visitar /login estando
  // ya autenticado solo redirige al dashboard, el form nunca aparece).
  await page.context().clearCookies()
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

// SCRUM-406 RN2 / Escenario 2 — "la tarjeta debe salir de 'sin stock' automáticamente cuando
// Compras marca la orden como recibida". El Visual Reviewer (comentario Jira 2026-07-24) revisó
// el código y NO forzó el flujo real cross-módulo por tiempo. Este test SÍ lo fuerza: avanza la
// PurchaseOrder real ligada a VR-9001 (id 18, producto 106, hoy "en_transito") hasta "Recibido"
// a través del botón real de Compras (misma acción que un usuario real), y confirma si la
// tarjeta VR-9001 en el tablero de Pedidos deja de mostrar "Sin stock"/ETA.
test('SCRUM-406 RN2 — avanzar PO real a Recibido y verificar la tarjeta VR-9001 en Bodega', async ({ page }) => {
  // Paso 1 — estado ANTES, con un actor de Bodega real (lider_compras no tiene bodega.view).
  await login(page, 'almacen@atlantic.com.pa') // lider_bodega
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  const card = page.locator('[data-testid^="order-card-"]', { hasText: 'VR-9001' })
  await expect(card).toContainText('Sin stock')
  await expect(card.getByTestId('supplier-eta')).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/scrum406-before-recibido.png' })

  // Paso 2 — avanzar la PO real hasta Recibido con el actor de Compras real, vía el botón real
  // (en_transito -> en_aduana -> en_transito_local -> recibido).
  await login(page, 'gerencia2@atlantic.com.pa') // lider_compras
  await page.goto('/compras/ordenes/18')
  await page.waitForTimeout(1000)
  for (let i = 0; i < 4; i++) {
    const advanceBtn = page.getByRole('button', { name: /avanzar/i })
    const count = await advanceBtn.count()
    if (count === 0) break
    const isRecibidoAlready = await page.locator('body').innerText()
    if (/recibid[oa]/i.test(isRecibidoAlready) && !(await advanceBtn.isEnabled().catch(() => false))) break
    await advanceBtn.first().click()
    await page.waitForTimeout(1200)
  }
  await page.screenshot({ path: 'e2e/.tmp/scrum406-po-status-after.png' })
  await expect(page.locator('body')).toContainText(/recibid[oa]/i)

  // Paso 3 — volver al tablero de Bodega (actor real de Bodega) SIN esperar 30s completos, para
  // verificar si la tarjeta se actualiza "automáticamente" (RN2) o si sigue mostrando "Sin
  // stock"/ETA sin que nadie en Bodega haya tocado nada.
  await login(page, 'almacen@atlantic.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1200)
  const cardAfter = page.locator('[data-testid^="order-card-"]', { hasText: 'VR-9001' })
  await page.screenshot({ path: 'e2e/.tmp/scrum406-board-after-recibido.png' })

  const stillSinStock = await cardAfter.getByText('Sin stock').count()
  const stillHasEta = await cardAfter.getByTestId('supplier-eta').count()
  console.log('SCRUM-406 RN2 — tras marcar la PO como Recibido: ¿la tarjeta sigue en "Sin stock"?', stillSinStock > 0, '| ¿sigue mostrando ETA?', stillHasEta > 0)

  // Comportamiento CORRECTO esperado por RN2 (hoy no implementado -- este assert falla a
  // propósito hasta que exista el puente cross-módulo Compras -> Bodega): la tarjeta ya NO
  // debería mostrar "Sin stock" una vez que Compras marcó la PO como recibida.
  await expect(cardAfter, 'SCRUM-406 RN2 no implementado: la tarjeta sigue en "Sin stock" tras marcar la PO como Recibido').not.toContainText('Sin stock')
})
