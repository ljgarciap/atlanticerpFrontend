import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ReplenishmentPage from './ReplenishmentPage'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { comprasApi } from '@/api/comprasApi'
import type { ReplenishmentProduct, ReplenishmentResponse } from '@/types/compras'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      const vals = Object.values(opts).filter(v => typeof v === 'string' || typeof v === 'number')
      return vals.length ? `${key}:${vals.join(',')}` : key
    },
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/comprasApi', () => ({ comprasApi: { replenishment: { get: vi.fn(), assignProvider: vi.fn() }, providers: { list: vi.fn() } } }))

const mockedApi = vi.mocked(comprasApi, true)

const ALFA = { id: 1, name: 'Alfa' }
const BETA = { id: 2, name: 'Beta' }

function product(id: number, overrides: Partial<ReplenishmentProduct> = {}): ReplenishmentProduct {
  return {
    catalog_product_id: id, reference: `REF-${id}`, name: `Producto ${id}`, faltante: 5, stock: 1, en_camino: 0, unit_cost: 10,
    since: '2026-10-01T10:00:00Z', providers: [ALFA],
    orders: [{ order_id: id * 100, order_number: `PED-${id}`, project: 'Proyecto Sol', quote_folio: `COT-${id}`, since: '2026-10-01T10:00:00Z', qty: 5 }],
    ...overrides,
  }
}

function renderPage(data: ReplenishmentResponse) {
  mockedApi.replenishment.get.mockResolvedValue(data)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ReplenishmentPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('ReplenishmentPage (SCRUM-1184)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.replenishment.assignProvider.mockResolvedValue({ catalog_product_id: 0, provider_id: null })
    useAuthStore.setState({ user: null })
  })

  it('muestra un estado vacío cuando no hay pedidos sin stock', async () => {
    renderPage({ groups: [], custom_items_count: 0, total_products: 0 })
    expect(await screen.findByTestId('replenishment-empty')).toBeInTheDocument()
  })

  it('agrupa por proveedor, deja «Sin proveedor» sin botón de orden y avisa de los ítems personalizados', async () => {
    renderPage({
      groups: [
        { provider: ALFA, products: [product(1)] },
        { provider: null, products: [product(9, { providers: [] })] },
      ],
      custom_items_count: 2, total_products: 2,
    })

    const alfa = await screen.findByTestId('group-1')
    expect(within(alfa).getByText('REF-1')).toBeInTheDocument()
    const none = screen.getByTestId('group-none')
    expect(within(none).getByText('compras:replenishment.noProvider')).toBeInTheDocument()
    expect(within(none).queryByRole('button', { name: /compras:replenishment.generate/ })).not.toBeInTheDocument()
    expect(within(none).queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByTestId('custom-items-notice')).toBeInTheDocument()
  })

  it('con varios productos marcados de un proveedor abre UNA orden con todas las líneas y la cantidad editada', async () => {
    renderPage({
      groups: [{ provider: ALFA, products: [product(1, { faltante: 5 }), product(2, { faltante: 8 }), product(3)] }],
      custom_items_count: 0, total_products: 3,
    })
    const group = await screen.findByTestId('group-1')
    const button = within(group).getByRole('button', { name: /compras:replenishment.generate/ })
    expect(button).toBeDisabled()

    fireEvent.click(within(group).getByLabelText('compras:replenishment.selectProduct:REF-1'))
    fireEvent.click(within(group).getByLabelText('compras:replenishment.selectProduct:REF-2'))
    fireEvent.change(within(group).getByLabelText('compras:replenishment.quantityOf:REF-2'), { target: { value: '12' } })
    expect(button).toBeEnabled()
    fireEvent.click(button)

    expect(navigateMock).toHaveBeenCalledWith('/compras/ordenes/nueva', {
      state: {
        providerId: 1,
        products: [
          { id: 1, reference: 'REF-1', description: 'Producto 1', unitCost: 10, quantity: 5 },
          { id: 2, reference: 'REF-2', description: 'Producto 2', unitCost: 10, quantity: 12 },
        ],
      },
    })
  })

  it('«seleccionar todo» marca solo los productos de su grupo, nunca los de otro proveedor', async () => {
    renderPage({
      groups: [
        { provider: ALFA, products: [product(1), product(2)] },
        { provider: BETA, products: [product(3, { providers: [BETA] })] },
      ],
      custom_items_count: 0, total_products: 3,
    })
    const alfa = await screen.findByTestId('group-1')
    fireEvent.click(within(alfa).getByLabelText('compras:replenishment.selectGroup:Alfa'))

    expect(within(alfa).getByLabelText('compras:replenishment.selectProduct:REF-1')).toBeChecked()
    expect(within(alfa).getByLabelText('compras:replenishment.selectProduct:REF-2')).toBeChecked()
    expect(within(screen.getByTestId('group-2')).getByLabelText('compras:replenishment.selectProduct:REF-3')).not.toBeChecked()

    fireEvent.click(within(alfa).getByRole('button', { name: /compras:replenishment.generate/ }))
    const state = navigateMock.mock.calls[0][1].state
    expect(state.providerId).toBe(1)
    expect(state.products.map((p: { id: number }) => p.id)).toEqual([1, 2])
  })

  it('cambiar el proveedor de un producto lo mueve a ese grupo y la orden sale con el proveedor nuevo', async () => {
    renderPage({
      groups: [{ provider: ALFA, products: [product(1, { providers: [ALFA, BETA] })] }],
      custom_items_count: 0, total_products: 1,
    })
    const select = await screen.findByLabelText('compras:replenishment.changeProvider:REF-1')
    fireEvent.change(select, { target: { value: '2' } })

    const beta = await screen.findByTestId('group-2')
    expect(screen.queryByTestId('group-1')).not.toBeInTheDocument()
    fireEvent.click(within(beta).getByLabelText('compras:replenishment.selectProduct:REF-1'))
    fireEvent.click(within(beta).getByRole('button', { name: /compras:replenishment.generate/ }))
    expect(navigateMock.mock.calls[0][1].state.providerId).toBe(2)
  })

  it('un producto sin proveedor principal pero con proveedores en la relación N:M se puede asignar y ordenar desde aquí', async () => {
    renderPage({ groups: [{ provider: null, products: [product(5, { providers: [BETA] })] }], custom_items_count: 0, total_products: 1 })
    const none = await screen.findByTestId('group-none')
    fireEvent.change(within(none).getByLabelText('compras:replenishment.changeProvider:REF-5'), { target: { value: '2' } })

    const beta = await screen.findByTestId('group-2')
    expect(screen.queryByTestId('group-none')).not.toBeInTheDocument()
    fireEvent.click(within(beta).getByLabelText('compras:replenishment.selectProduct:REF-5'))
    fireEvent.click(within(beta).getByRole('button', { name: /compras:replenishment.generate/ }))
    expect(navigateMock.mock.calls[0][1].state.providerId).toBe(2)
  })

  it('un producto sin ningún proveedor ofrece todos los proveedores activos y se puede ordenar tras elegir uno (SCRUM-1184, rebote)', async () => {
    mockedApi.providers.list.mockResolvedValue({ data: [ALFA, BETA] } as never)
    renderPage({ groups: [{ provider: null, products: [product(7, { providers: [] })] }], custom_items_count: 0, total_products: 1 })
    const none = await screen.findByTestId('group-none')
    const select = within(none).getByLabelText('compras:replenishment.changeProvider:REF-7') as HTMLSelectElement
    await waitFor(() => expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['compras:replenishment.chooseProvider', 'Alfa', 'Beta']))
    fireEvent.change(select, { target: { value: '2' } })

    const beta = await screen.findByTestId('group-2')
    expect(screen.queryByTestId('group-none')).not.toBeInTheDocument()
    fireEvent.click(within(beta).getByLabelText('compras:replenishment.selectProduct:REF-7'))
    fireEvent.click(within(beta).getByRole('button', { name: /compras:replenishment.generate/ }))
    expect(navigateMock.mock.calls[0][1].state.providerId).toBe(2)
    expect(navigateMock.mock.calls[0][1].state.products[0].id).toBe(7)
  })

  it('un producto que llegó sin proveedor conserva el selector tras elegir uno, para corregir la elección', async () => {
    mockedApi.providers.list.mockResolvedValue({ data: [ALFA, BETA] } as never)
    renderPage({ groups: [{ provider: null, products: [product(8, { providers: [] })] }], custom_items_count: 0, total_products: 1 })
    const first = await screen.findByLabelText('compras:replenishment.changeProvider:REF-8')
    await waitFor(() => expect(within(first).getAllByRole('option')).toHaveLength(3))
    fireEvent.change(first, { target: { value: '2' } })
    const beta = await screen.findByTestId('group-2')
    fireEvent.change(within(beta).getByLabelText('compras:replenishment.changeProvider:REF-8'), { target: { value: '1' } })
    expect(await screen.findByTestId('group-1')).toBeInTheDocument()
    expect(screen.queryByTestId('group-2')).not.toBeInTheDocument()
  })

  it('si falla la carga de proveedores avisa con un mensaje y permite reintentar (Pre-QA M1)', async () => {
    mockedApi.providers.list.mockRejectedValueOnce(new Error('403')).mockResolvedValue({ data: [ALFA] } as never)
    renderPage({ groups: [{ provider: null, products: [product(6, { providers: [] })] }], custom_items_count: 0, total_products: 1 })
    expect(await screen.findByTestId('providers-error')).toBeInTheDocument()
    fireEvent.click(within(screen.getByTestId('providers-error')).getByRole('button'))
    await waitFor(() => expect(screen.queryByTestId('providers-error')).not.toBeInTheDocument())
  })

  describe('guardar el proveedor elegido', () => {
    async function choose(select: HTMLElement, id: number) {
      fireEvent.change(select, { target: { value: String(id) } })
    }

    it('al elegir proveedor en un producto sin proveedor lo guarda (esperado null) y muestra «guardado»', async () => {
      mockedApi.providers.list.mockResolvedValue({ data: [ALFA, BETA] } as never)
      renderPage({ groups: [{ provider: null, products: [product(21, { providers: [] })] }], custom_items_count: 0, total_products: 1 })
      const sel = await screen.findByLabelText('compras:replenishment.changeProvider:REF-21')
      await waitFor(() => expect(within(sel).getAllByRole('option')).toHaveLength(3))
      // el backend solo acepta per_page 10/20/50/100/all (otro valor cae en 20): pedir «all» para no perder proveedores del selector
      expect(mockedApi.providers.list).toHaveBeenCalledWith(expect.objectContaining({ per_page: 'all' }))
      await choose(sel, 2)
      await waitFor(() => expect(mockedApi.replenishment.assignProvider).toHaveBeenCalledWith(21, 2, null))
      expect(await screen.findByTestId('saved-21')).toBeInTheDocument()
    })

    it('corregir la elección guarda de nuevo con el proveedor anterior como esperado', async () => {
      mockedApi.providers.list.mockResolvedValue({ data: [ALFA, BETA] } as never)
      renderPage({ groups: [{ provider: null, products: [product(22, { providers: [] })] }], custom_items_count: 0, total_products: 1 })
      const sel = await screen.findByLabelText('compras:replenishment.changeProvider:REF-22')
      await waitFor(() => expect(within(sel).getAllByRole('option')).toHaveLength(3))
      await choose(sel, 2)
      await screen.findByTestId('saved-22')
      await choose(await screen.findByLabelText('compras:replenishment.changeProvider:REF-22'), 1)
      await waitFor(() => expect(mockedApi.replenishment.assignProvider).toHaveBeenLastCalledWith(22, 1, 2))
    })

    it('si no se puede guardar, la fila vuelve a «Sin proveedor» y se avisa', async () => {
      mockedApi.providers.list.mockResolvedValue({ data: [ALFA, BETA] } as never)
      mockedApi.replenishment.assignProvider.mockRejectedValue({ response: { status: 500 } })
      const show = vi.spyOn(useToastStore.getState(), 'show')
      renderPage({ groups: [{ provider: null, products: [product(23, { providers: [] })] }], custom_items_count: 0, total_products: 1 })
      const sel = await screen.findByLabelText('compras:replenishment.changeProvider:REF-23')
      await waitFor(() => expect(within(sel).getAllByRole('option')).toHaveLength(3))
      await choose(sel, 2)
      await waitFor(() => expect(show).toHaveBeenCalledWith('compras:replenishment.saveError', 'error'))
      expect(screen.getByTestId('group-none')).toBeInTheDocument()
      expect(screen.queryByTestId('group-2')).not.toBeInTheDocument()
    })

    it('si otra persona cambió el proveedor (409) avisa y recarga la lista', async () => {
      mockedApi.providers.list.mockResolvedValue({ data: [ALFA, BETA] } as never)
      mockedApi.replenishment.assignProvider.mockRejectedValue({ response: { status: 409 } })
      const show = vi.spyOn(useToastStore.getState(), 'show')
      renderPage({ groups: [{ provider: null, products: [product(24, { providers: [] })] }], custom_items_count: 0, total_products: 1 })
      const sel = await screen.findByLabelText('compras:replenishment.changeProvider:REF-24')
      await waitFor(() => expect(within(sel).getAllByRole('option')).toHaveLength(3))
      const calls = mockedApi.replenishment.get.mock.calls.length
      await choose(sel, 2)
      await waitFor(() => expect(show).toHaveBeenCalledWith('compras:replenishment.saveConflict', 'error'))
      await waitFor(() => expect(mockedApi.replenishment.get.mock.calls.length).toBeGreaterThan(calls))
    })

    it('si la lista se recarga y el producto ya llega con proveedor, conserva el selector y «Guardado» para poder seguir corrigiendo (Pre-QA R3-M2)', async () => {
      mockedApi.providers.list.mockResolvedValue({ data: [ALFA, BETA] } as never)
      renderPage({ groups: [{ provider: null, products: [product(27, { providers: [] })] }], custom_items_count: 0, total_products: 1 })
      const sel = await screen.findByLabelText('compras:replenishment.changeProvider:REF-27')
      await waitFor(() => expect(within(sel).getAllByRole('option')).toHaveLength(3))
      await choose(sel, 2)
      await screen.findByTestId('saved-27')

      // la lista vuelve del servidor con el producto ya asignado a Beta (lo que verá tras la recarga por foco de ventana)
      mockedApi.replenishment.get.mockResolvedValue({ groups: [{ provider: BETA, products: [product(27, { providers: [BETA] })] }], custom_items_count: 0, total_products: 1 })
      window.dispatchEvent(new Event('visibilitychange'))
      await waitFor(() => expect(mockedApi.replenishment.get.mock.calls.length).toBeGreaterThan(1))

      const again = await screen.findByLabelText('compras:replenishment.changeProvider:REF-27')
      expect(within(await screen.findByTestId('group-2')).getByTestId('saved-27')).toBeInTheDocument()
      await choose(again, 1)
      await waitFor(() => expect(mockedApi.replenishment.assignProvider).toHaveBeenLastCalledWith(27, 1, 2))
    })

    it('tras un 409 al corregir, la fila suelta su estado local y muestra lo que devuelve el servidor (Pre-QA R4-B2)', async () => {
      mockedApi.providers.list.mockResolvedValue({ data: [ALFA, BETA] } as never)
      renderPage({ groups: [{ provider: null, products: [product(28, { providers: [] })] }], custom_items_count: 0, total_products: 1 })
      const sel = await screen.findByLabelText('compras:replenishment.changeProvider:REF-28')
      await waitFor(() => expect(within(sel).getAllByRole('option')).toHaveLength(3))
      await choose(sel, 1)
      await screen.findByTestId('saved-28')

      mockedApi.replenishment.assignProvider.mockRejectedValue({ response: { status: 409 } })
      mockedApi.replenishment.get.mockResolvedValue({ groups: [{ provider: BETA, products: [product(28, { providers: [BETA] })] }], custom_items_count: 0, total_products: 1 })
      await choose(await screen.findByLabelText('compras:replenishment.changeProvider:REF-28'), 2)
      await waitFor(() => {
        expect(screen.getByTestId('group-2')).toBeInTheDocument()
        expect(screen.queryByTestId('saved-28')).not.toBeInTheDocument()
        expect(screen.queryByTestId('group-1')).not.toBeInTheDocument()
      })
    })

    it('si el producto ya no espera reposición (403 replenishment_scope) avisa y recarga la lista', async () => {
      mockedApi.providers.list.mockResolvedValue({ data: [ALFA, BETA] } as never)
      mockedApi.replenishment.assignProvider.mockRejectedValue({ response: { status: 403, data: { code: 'replenishment_scope' } } })
      const show = vi.spyOn(useToastStore.getState(), 'show')
      renderPage({ groups: [{ provider: null, products: [product(26, { providers: [] })] }], custom_items_count: 0, total_products: 1 })
      const sel = await screen.findByLabelText('compras:replenishment.changeProvider:REF-26')
      await waitFor(() => expect(within(sel).getAllByRole('option')).toHaveLength(3))
      const calls = mockedApi.replenishment.get.mock.calls.length
      await choose(sel, 2)
      await waitFor(() => expect(show).toHaveBeenCalledWith('compras:replenishment.saveScope', 'error'))
      await waitFor(() => expect(mockedApi.replenishment.get.mock.calls.length).toBeGreaterThan(calls))
    })

    it('cambiar entre los proveedores de un producto que ya tiene principal no escribe en el catálogo', async () => {
      renderPage({ groups: [{ provider: ALFA, products: [product(25, { providers: [ALFA, BETA] })] }], custom_items_count: 0, total_products: 1 })
      fireEvent.change(await screen.findByLabelText('compras:replenishment.changeProvider:REF-25'), { target: { value: '2' } })
      expect(await screen.findByTestId('group-2')).toBeInTheDocument()
      expect(mockedApi.replenishment.assignProvider).not.toHaveBeenCalled()
    })
  })

  it('resalta lo que ya está en camino y despliega los pedidos afectados', async () => {
    renderPage({ groups: [{ provider: ALFA, products: [product(1, { en_camino: 4 })] }], custom_items_count: 0, total_products: 1 })
    expect(await screen.findByTestId('in-transit-1')).toHaveTextContent('4')

    expect(screen.queryByText(/PED-1/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('compras:replenishment.ordersCount:1'))
    await waitFor(() => expect(screen.getByText(/PED-1 \(COT-1\) · Proyecto Sol · 5/)).toBeInTheDocument())
  })

  it('los pedidos afectados son enlace a Pedidos de venta para quien puede abrirlos y texto para el resto', async () => {
    useAuthStore.setState({ user: { id: 2, role: 'lider_compras', permissions: [] } as never })
    const { unmount } = renderPage({ groups: [{ provider: ALFA, products: [product(1)] }], custom_items_count: 0, total_products: 1 })
    fireEvent.click(await screen.findByText('compras:replenishment.ordersCount:1'))
    const link = await screen.findByRole('link', { name: 'PED-1' })
    expect(link).toHaveAttribute('href', '/ventas-diseno/pedidos?search=COT-1')
    unmount()

    useAuthStore.setState({ user: { id: 3, role: 'designer', permissions: [] } as never })
    renderPage({ groups: [{ provider: ALFA, products: [product(1)] }], custom_items_count: 0, total_products: 1 })
    fireEvent.click(await screen.findByText('compras:replenishment.ordersCount:1'))
    expect(await screen.findByText(/PED-1 \(COT-1\) · Proyecto Sol · 5/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'PED-1' })).not.toBeInTheDocument()
  })

  it('un pedido sin cotización con folio no tiene enlace aunque el rol pueda abrir Pedidos de venta', async () => {
    useAuthStore.setState({ user: { id: 2, role: 'lider_compras', permissions: [] } as never })
    const p = product(1)
    renderPage({ groups: [{ provider: ALFA, products: [{ ...p, orders: [{ ...p.orders[0], quote_folio: null }] }] }], custom_items_count: 0, total_products: 1 })
    fireEvent.click(await screen.findByText('compras:replenishment.ordersCount:1'))
    expect(await screen.findByText(/PED-1 · Proyecto Sol · 5/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('al cambiar el proveedor de un producto marcado, llega al grupo nuevo sin marcar', async () => {
    renderPage({ groups: [{ provider: ALFA, products: [product(1, { providers: [ALFA, BETA] })] }], custom_items_count: 0, total_products: 1 })
    const alfa = await screen.findByTestId('group-1')
    fireEvent.click(within(alfa).getByLabelText('compras:replenishment.selectProduct:REF-1'))
    fireEvent.change(within(alfa).getByLabelText('compras:replenishment.changeProvider:REF-1'), { target: { value: '2' } })

    const beta = await screen.findByTestId('group-2')
    expect(within(beta).getByLabelText('compras:replenishment.selectProduct:REF-1')).not.toBeChecked()
    expect(within(beta).getByRole('button', { name: /compras:replenishment.generate/ })).toBeDisabled()
  })

  it('el campo de cantidad se puede vaciar y reescribir sin arrastrar un 0; una cantidad vacía o 0 no genera línea', async () => {
    renderPage({ groups: [{ provider: ALFA, products: [product(1, { faltante: 5 })] }], custom_items_count: 0, total_products: 1 })
    const group = await screen.findByTestId('group-1')
    const input = within(group).getByLabelText('compras:replenishment.quantityOf:REF-1') as HTMLInputElement
    fireEvent.click(within(group).getByLabelText('compras:replenishment.selectProduct:REF-1'))

    fireEvent.change(input, { target: { value: '' } })
    expect(input.value).toBe('')
    expect(within(group).getByRole('button', { name: /compras:replenishment.generate/ })).toBeDisabled()

    fireEvent.change(input, { target: { value: '7' } })
    expect(input.value).toBe('7')
    fireEvent.click(within(group).getByRole('button', { name: /compras:replenishment.generate/ }))
    expect(navigateMock.mock.calls[0][1].state.products[0].quantity).toBe(7)
  })

  it('muestra el error cuando la carga falla', async () => {
    mockedApi.replenishment.get.mockRejectedValue(new Error('boom'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<MemoryRouter><QueryClientProvider client={queryClient}><ReplenishmentPage /></QueryClientProvider></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('compras:replenishment.error')
  })
})
