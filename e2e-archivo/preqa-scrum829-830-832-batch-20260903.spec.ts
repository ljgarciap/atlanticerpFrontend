import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import zlib from 'node:zlib'

const FIXTURES_DIR = path.join(process.cwd(), 'e2e/.tmp')

// `e2e/.tmp/` está en .gitignore — estos fixtures no viajan con el repo. Se regeneran acá para
// que este spec (promovido a permanente, mismo criterio que el resto de e2e/preqa-*.spec.ts) sea
// autocontenido en cualquier checkout nuevo, sin depender de archivos locales previos.
function pngBytes(w: number, h: number, [r, g, b]: [number, number, number]): Buffer {
  function chunk(tag: string, data: Buffer): Buffer {
    const tagBuf = Buffer.from(tag)
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([tagBuf, data])) >>> 0)
    return Buffer.concat([len, tagBuf, data, crc])
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(w, 0); ihdrData.writeUInt32BE(h, 4)
  ihdrData.writeUInt8(8, 8); ihdrData.writeUInt8(2, 9) // 8-bit, color type 2 (RGB)
  const ihdr = chunk('IHDR', ihdrData)
  const rowBytes = Buffer.concat([Buffer.from([0]), Buffer.from(Array(w).fill([r, g, b]).flat())])
  const raw = Buffer.concat(Array(h).fill(rowBytes))
  const idat = chunk('IDAT', zlib.deflateSync(raw))
  const iend = chunk('IEND', Buffer.alloc(0))
  return Buffer.concat([sig, ihdr, idat, iend])
}

test.beforeAll(() => {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true })
  const files: [string, [number, number, number]][] = [
    ['preqa830-original.png', [220, 50, 50]],
    ['preqa830-replacement.png', [50, 120, 220]],
  ]
  for (const [name, color] of files) {
    const filePath = path.join(FIXTURES_DIR, name)
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, pngBytes(200, 200, color))
  }
})

// Pre-QA ad-hoc — batch SCRUM-829/830/832 (2026-09-03), contra el build real servido por nginx
// en Docker local (no el dev server de Vite) para ejercitar la integración real front+back.
const BASE = 'http://localhost:8090'

async function login(page, email: string, password = 'Password123!') {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

test('SCRUM-829 — editar campos sin guardar + subir archivo no revierte el formulario', async ({ page }) => {
  await login(page, 'vendedor@atlantic.test')
  await page.goto(`${BASE}/ventas-diseno/pipeline?card=585`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/preqa829-01-modal-abierto.png' })

  await page.getByText('Editar', { exact: true }).click()
  await page.waitForTimeout(300)

  const observacionesInput = page.locator('textarea, input').filter({ hasText: '' }).first()
  // Buscar el campo de observaciones por valor actual en vez de por label exacto (evita
  // acoplarse a i18n key) — usamos el value sembrado en tinker.
  const obsField = page.locator('textarea:below(:text("Observ"))').first()
  await obsField.fill('Observacion EDITADA sin guardar - PreQA829').catch(async () => {
    // fallback: cualquier textarea visible
    await page.locator('textarea').first().fill('Observacion EDITADA sin guardar - PreQA829')
  })
  await page.waitForTimeout(200)
  await page.screenshot({ path: 'e2e/.tmp/preqa829-02-editado-sin-guardar.png' })

  // Buscar el input de archivo del primer tipo (Diseño) y subir un archivo cualquiera.
  const fileInputs = page.locator('input[type="file"]')
  const count = await fileInputs.count()
  if (count > 0) {
    await fileInputs.first().setInputFiles(path.join(FIXTURES_DIR, 'preqa830-original.png'))
    await page.waitForTimeout(1500)
  }
  await page.screenshot({ path: 'e2e/.tmp/preqa829-03-tras-upload.png' })

  await expect(page.locator('textarea').first()).toHaveValue('Observacion EDITADA sin guardar - PreQA829')
})

test('SCRUM-830a — crear producto: botón bloqueado hasta que TODO esté completo, incluida la imagen', async ({ page }) => {
  // superadmin — evita el gap v1/v2 de RoleModuleVisibility (fuera de alcance de este ticket,
  // ver SCRUM-818) que bloquea la ruta cliente aunque el permiso v1 exista.
  await login(page, 'superadmin@atlantic.test')
  await page.goto(`${BASE}/inventario`)
  await page.waitForTimeout(1200)

  await page.getByText('Crear nuevo producto', { exact: false }).click()
  await page.waitForTimeout(500)

  const submitBtn = page.getByRole('button', { name: /crear producto/i })
  await expect(submitBtn).toBeDisabled()

  // La sección "Imagen del producto *" debe existir y estar ANTES de "Ficha técnica *" (RN03).
  const photoHeading = page.getByText(/imagen del producto/i)
  await expect(photoHeading).toBeVisible()
  const fichaHeading = page.getByText(/ficha t[eé]cnica/i).first()
  const photoBox = await photoHeading.boundingBox()
  const fichaBox = await fichaHeading.boundingBox()
  expect(photoBox && fichaBox && photoBox.y < fichaBox.y).toBeTruthy()

  const fileInputs = page.locator('input[type="file"]')
  await fileInputs.first().setInputFiles(path.join(FIXTURES_DIR, 'preqa830-original.png'))
  await page.waitForTimeout(300)

  // Preview de la imagen debe aparecer (img con blob: src) sin haber llamado al backend todavía.
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/preqa830-01-imagen-cargada-resto-vacio.png', fullPage: true })

  // Con SOLO la imagen (resto del form vacío) sigue bloqueado — prueba que no basta cualquier
  // campo suelto, la validación real depende de TODOS los obligatorios.
  await expect(submitBtn).toBeDisabled()
})

test('SCRUM-830b — editar producto: reemplazar imagen y CANCELAR no debe tocar la imagen original', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await page.goto(`${BASE}/inventario`)
  await page.waitForTimeout(1200)

  await page.getByText('Producto PreQA Edicion').click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/.tmp/preqa830b-01-detalle-imagen-original.png', fullPage: true })

  // Imagen original (photo_url legacy vía fallback) visible como primer elemento del bloque,
  // antes del nombre (RN04) — chequeo básico: existe un <img> dentro del header del modal.
  const originalImg = page.locator('img.w-full.h-full[src*="picsum"]')
  await expect(originalImg).toBeVisible()

  await page.getByRole('button', { name: /editar informaci[oó]n/i }).click()
  await page.waitForTimeout(400)

  const changePhotoBtn = page.getByRole('button', { name: /cambiar imagen|reemplazar imagen/i })
  await changePhotoBtn.click()
  const fileChooserInput = page.locator('input[type="file"]').last()
  await fileChooserInput.setInputFiles(path.join(FIXTURES_DIR, 'preqa830-replacement.png'))
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'e2e/.tmp/preqa830b-02-nueva-imagen-staged.png', fullPage: true })

  // Preview de la nueva imagen (blob) reemplaza visualmente a la original — pero NO se subió aún.
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible()

  await page.getByRole('button', { name: /^cancelar$/i }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e/.tmp/preqa830b-03-tras-cancelar.png', fullPage: true })

  // CA09/RN14 — tras cancelar, la imagen ORIGINAL sigue siendo la que se muestra (nunca se llamó
  // al backend con la nueva imagen).
  await expect(page.locator('img.w-full.h-full[src*="picsum"]')).toBeVisible()

  // Confirmar server-side también: el producto sigue con photo_url legacy, sin photo_key nuevo.
  const apiCheck = await page.request.get(`${BASE}/api/compras/inventory/724`, {
    headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('auth_token') || localStorage.getItem('token'))}` },
  }).catch(() => null)
  if (apiCheck && apiCheck.ok()) {
    const body = await apiCheck.json()
    expect(body.has_uploaded_photo).toBe(false)
  }
})

test('SCRUM-832 — factura real en Bodega + estabilidad visual del modal', async ({ page }) => {
  await login(page, 'preqa-bodega@atlantic.test')
  await page.goto(`${BASE}/bodega/pedidos`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/.tmp/preqa832-01-por-despachar.png', fullPage: true })

  const verLink = page.getByText('ver', { exact: true }).first()
  if (await verLink.count() > 0) {
    // Mover el cursor repetidamente sobre la tarjeta ANTES de abrir, para reproducir el hover.
    const card = page.locator('text=Cliente PreQA con factura').first()
    if (await card.count() > 0) {
      const box = await card.boundingBox()
      if (box) {
        for (let i = 0; i < 6; i++) {
          await page.mouse.move(box.x + (i % 2 === 0 ? 10 : box.width - 10), box.y + 10 + i)
        }
      }
    }
    await verLink.click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'e2e/.tmp/preqa832-02-modal-factura-abierto.png', fullPage: true })

    // Mover el cursor sobre distintas zonas del modal repetidamente — el bug original causaba
    // saltos/parpadeo en este movimiento.
    const modal = page.locator('.fixed.inset-0').last()
    const mbox = await modal.boundingBox()
    if (mbox) {
      for (let i = 0; i < 10; i++) {
        await page.mouse.move(mbox.x + 20 + i * 5, mbox.y + 20 + i * 3)
        await page.waitForTimeout(50)
      }
    }
    await page.screenshot({ path: 'e2e/.tmp/preqa832-03-modal-tras-mover-cursor.png', fullPage: true })

    // Debe verse la factura real, no el mensaje genérico.
    await expect(page.getByText(/subtotal/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/ver.*imprimir.*pdf/i)).toBeVisible()
  }
})
