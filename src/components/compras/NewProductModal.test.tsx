import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import NewProductModal from './NewProductModal'
import { comprasApi } from '@/api/comprasApi'
import type { ComprasCatalogProduct } from '@/types/compras'

// SCRUM-194 (REQ-131) — el modal "+ Producto nuevo" aceptaba una referencia ya existente sin
// aviso al agregarla como línea; el 422 real recién aparecía al pulsar "Crear orden", con un
// mensaje genérico que no identificaba el producto/línea conflictiva. Precheck async contra
// GET /compras/products antes de aceptar la línea, mismo criterio de unicidad que el backend
// (StorePurchaseOrderRequest): referencia pública bloquea sin importar el proveedor; referencia
// de fábrica solo bloquea si el match es del MISMO proveedor.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    products: { search: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeMatch(overrides: Partial<ComprasCatalogProduct> = {}): ComprasCatalogProduct {
  return {
    id: 1, reference: 'REF-1', factory_reference: null, name: 'Bombillo E27', description: 'Bombillo E27', brand: null,
    photo_url: null, price_full: 20, cost: 12, stock_quantity: 5, reorder_point: null,
    ...overrides,
  }
}

function fillRequiredFields(overrides: { reference?: string; factoryReference?: string } = {}) {
  const reference = document.querySelector('input[name="reference"]') as HTMLInputElement
  const factoryReference = document.querySelector('input[name="factory_reference"]') as HTMLInputElement
  const name = document.querySelector('input[name="name"]') as HTMLInputElement
  const description = document.querySelector('input[name="description"]') as HTMLInputElement
  const priceFull = document.querySelector('input[name="price_full"]') as HTMLInputElement
  const cost = document.querySelector('input[name="cost"]') as HTMLInputElement

  fireEvent.change(reference, { target: { value: overrides.reference ?? 'REF-NEW' } })
  if (overrides.factoryReference !== undefined) {
    fireEvent.change(factoryReference, { target: { value: overrides.factoryReference } })
  }
  // SCRUM-768 — `name` es un campo propio, independiente de `description`, y obligatorio en
  // backend (StorePurchaseOrderRequest) desde SCRUM-237/240.
  fireEvent.change(name, { target: { value: 'Producto de prueba' } })
  fireEvent.change(description, { target: { value: 'Descripción de prueba' } })
  fireEvent.change(priceFull, { target: { value: '20' } })
  fireEvent.change(cost, { target: { value: '10' } })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NewProductModal — precheck de referencia duplicada (SCRUM-194, REQ-131)', () => {
  it('bloquea agregar la línea si la referencia pública ya existe, sin importar el proveedor', async () => {
    mockedComprasApi.products.search.mockImplementation((_providerId, search) =>
      Promise.resolve({ fuzzy: false, data: search === 'REF-DUP' ? [makeMatch({ reference: 'REF-DUP' })] : [] }),
    )
    const onAdd = vi.fn()
    render(<NewProductModal providerId={1} onClose={vi.fn()} onAdd={onAdd} />)

    fillRequiredFields({ reference: 'REF-DUP' })
    fireEvent.click(screen.getByText('compras:newOrder.products.add'))

    await screen.findByText('compras:newOrder.newProduct.validation.duplicateReference')
    expect(onAdd).not.toHaveBeenCalled()
    // La referencia pública se busca global (sin acotar a proveedor).
    expect(mockedComprasApi.products.search).toHaveBeenCalledWith(undefined, 'REF-DUP')
  })

  it('bloquea agregar la línea si la referencia de fábrica ya existe para EL MISMO proveedor', async () => {
    mockedComprasApi.products.search.mockImplementation((providerId, search) => {
      if (providerId === 1 && search === 'FAB-DUP') {
        return Promise.resolve({ fuzzy: false, data: [makeMatch({ factory_reference: 'FAB-DUP' })] })
      }
      return Promise.resolve({ fuzzy: false, data: [] })
    })
    const onAdd = vi.fn()
    render(<NewProductModal providerId={1} onClose={vi.fn()} onAdd={onAdd} />)

    fillRequiredFields({ reference: 'REF-NEW', factoryReference: 'FAB-DUP' })
    fireEvent.click(screen.getByText('compras:newOrder.products.add'))

    await screen.findByText('compras:newOrder.newProduct.validation.duplicateFactoryReference')
    expect(onAdd).not.toHaveBeenCalled()
    expect(mockedComprasApi.products.search).toHaveBeenCalledWith(1, 'FAB-DUP')
  })

  it('permite agregar si la referencia de fábrica coincide pero en OTRO proveedor', async () => {
    // El match existe, pero solo para providerId=1 — este modal está scopeado a providerId=2.
    mockedComprasApi.products.search.mockImplementation((providerId, search) => {
      if (providerId === 1 && search === 'FAB-DUP') {
        return Promise.resolve({ fuzzy: false, data: [makeMatch({ factory_reference: 'FAB-DUP' })] })
      }
      return Promise.resolve({ fuzzy: false, data: [] })
    })
    const onAdd = vi.fn()
    render(<NewProductModal providerId={2} onClose={vi.fn()} onAdd={onAdd} />)

    fillRequiredFields({ reference: 'REF-NEW', factoryReference: 'FAB-DUP' })
    fireEvent.click(screen.getByText('compras:newOrder.products.add'))

    await waitFor(() => expect(onAdd).toHaveBeenCalled())
    expect(screen.queryByText('compras:newOrder.newProduct.validation.duplicateFactoryReference')).not.toBeInTheDocument()
  })

  it('agrega la línea normalmente cuando no hay duplicados', async () => {
    mockedComprasApi.products.search.mockResolvedValue({ fuzzy: false, data: [] })
    const onAdd = vi.fn()
    render(<NewProductModal providerId={1} onClose={vi.fn()} onAdd={onAdd} />)

    fillRequiredFields({ reference: 'REF-NEW' })
    fireEvent.click(screen.getByText('compras:newOrder.products.add'))

    await waitFor(() => expect(onAdd).toHaveBeenCalled())
    const [product] = onAdd.mock.calls[0]
    expect(product).toEqual(expect.objectContaining({
      reference: 'REF-NEW', name: 'Producto de prueba', description: 'Descripción de prueba', price_full: 20, cost: 10,
    }))
  })

  // SCRUM-768 (hallazgo de Gerencia Test 2026-08-16) — el backend rebotaba 422
  // "lines.0.new_product.name es obligatorio" porque este modal nunca mandaba `name`, un campo
  // propio desde SCRUM-237/240 (antes se escribía todo a `description`). Regresión cubierta acá
  // para que no vuelva a colarse.
  it('manda `name` como campo independiente de `description` en el payload (SCRUM-768)', async () => {
    mockedComprasApi.products.search.mockResolvedValue({ fuzzy: false, data: [] })
    const onAdd = vi.fn()
    render(<NewProductModal providerId={1} onClose={vi.fn()} onAdd={onAdd} />)

    fillRequiredFields({ reference: 'REF-NEW' })
    fireEvent.click(screen.getByText('compras:newOrder.products.add'))

    await waitFor(() => expect(onAdd).toHaveBeenCalled())
    const [product] = onAdd.mock.calls[0]
    expect(product.name).toBe('Producto de prueba')
    expect(product.description).toBe('Descripción de prueba')
    expect(product.name).not.toBe(product.description)
  })

  it('limpia el error de duplicado apenas la persona edita la referencia', async () => {
    mockedComprasApi.products.search.mockImplementation((_providerId, search) =>
      Promise.resolve({ fuzzy: false, data: search === 'REF-DUP' ? [makeMatch({ reference: 'REF-DUP' })] : [] }),
    )
    const onAdd = vi.fn()
    render(<NewProductModal providerId={1} onClose={vi.fn()} onAdd={onAdd} />)

    fillRequiredFields({ reference: 'REF-DUP' })
    fireEvent.click(screen.getByText('compras:newOrder.products.add'))
    await screen.findByText('compras:newOrder.newProduct.validation.duplicateReference')

    const reference = document.querySelector('input[name="reference"]') as HTMLInputElement
    fireEvent.change(reference, { target: { value: 'REF-OTRA' } })

    await waitFor(() => expect(
      screen.queryByText('compras:newOrder.newProduct.validation.duplicateReference'),
    ).not.toBeInTheDocument())
  })
})
