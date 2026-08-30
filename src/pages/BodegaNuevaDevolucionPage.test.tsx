import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import BodegaNuevaDevolucionPage from './BodegaNuevaDevolucionPage'
import { bodegaApi } from '@/api/bodegaApi'
import type { CreateCustomerReturnResponse, ReturnSearchOrderResult } from '@/types/bodega'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: {
    returns: { searchOrders: vi.fn(), create: vi.fn() },
  },
}))

const mockedApi = vi.mocked(bodegaApi, true)

const ORDER: ReturnSearchOrderResult = {
  order_id: 10, order_number: '2201', customer_name: 'Constructora Pacífico SA',
  project: 'Residencia Punta Pacífica', committed_delivery_date: '2026-06-20', vendedor: 'Annie',
  items: [
    { order_item_id: 900, reference: 'NORDIC-40', factory_reference: 'FAB-NORDIC-40', description: 'Lámpara colgante Nordic 40cm', qty_delivered: 4 },
    { order_item_id: 901, reference: 'PERFIL-2M', factory_reference: null, description: 'Perfil LED empotrable 2m', qty_delivered: 10 },
  ],
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BodegaNuevaDevolucionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function searchAndSelectOrder() {
  fireEvent.change(screen.getByPlaceholderText('bodega:returns.newReturnPage.search.placeholder'), {
    target: { value: '2201' },
  })
  fireEvent.click(await screen.findByText(/2201 — Constructora Pacífico SA/))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.returns.searchOrders.mockResolvedValue({ data: [ORDER] })
})

describe('BodegaNuevaDevolucionPage', () => {
  it('busca guías de entrega y las lista como resultado', async () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('bodega:returns.newReturnPage.search.placeholder'), {
      target: { value: '2201' },
    })

    expect(await screen.findByText(/2201 — Constructora Pacífico SA/)).toBeInTheDocument()
    await waitFor(() => expect(mockedApi.returns.searchOrders).toHaveBeenCalledWith('2201'))
  })

  it('seleccionar una guía autocompleta Cliente/Proyecto de solo lectura (REQ-415)', async () => {
    renderPage()
    await searchAndSelectOrder()

    expect(screen.getByText('Constructora Pacífico SA')).toBeInTheDocument()
    expect(screen.getByText('Residencia Punta Pacífica')).toBeInTheDocument()
    // Campos de solo lectura — no hay input editable para Cliente/Proyecto.
    expect(screen.queryByDisplayValue('Constructora Pacífico SA')).not.toBeInTheDocument()
  })

  it('hallazgo de Visual Reviewer 2026-07-26 — muestra "Ref. fábrica" por producto', async () => {
    renderPage()
    await searchAndSelectOrder()

    expect(screen.getByText('FAB-NORDIC-40')).toBeInTheDocument()
  })

  it('REQ-487 — la cantidad y el motivo quedan bloqueados hasta marcar la casilla de inclusión', async () => {
    renderPage()
    await searchAndSelectOrder()

    const quantityInputs = screen.getAllByRole('spinbutton')
    expect(quantityInputs[0]).toBeDisabled()

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    expect(quantityInputs[0]).toBeEnabled()
    expect(quantityInputs[0]).toHaveValue(4) // precargada = qty_delivered
  })

  it('REQ-489 — guardar sin ningún producto seleccionado muestra error', async () => {
    renderPage()
    await searchAndSelectOrder()

    fireEvent.click(screen.getByText('bodega:returns.newReturnPage.save'))

    expect(await screen.findByText('bodega:returns.newReturnPage.errors.noProductsSelected')).toBeInTheDocument()
    expect(mockedApi.returns.create).not.toHaveBeenCalled()
  })

  it('guardar sin contacto completo muestra error', async () => {
    renderPage()
    await searchAndSelectOrder()
    fireEvent.click(screen.getAllByRole('checkbox')[0])

    fireEvent.click(screen.getByText('bodega:returns.newReturnPage.save'))

    expect(await screen.findByText('bodega:returns.newReturnPage.errors.missingContact')).toBeInTheDocument()
  })

  it('REQ-417 — la cantidad no puede superar lo entregado en la guía original', async () => {
    renderPage()
    await searchAndSelectOrder()
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '99' } })
    fireEvent.change(screen.getByPlaceholderText('bodega:returns.newReturnPage.details.contactNamePlaceholder'), { target: { value: 'Ricardo Aguilar' } })
    fireEvent.change(screen.getByPlaceholderText('bodega:returns.newReturnPage.details.contactPhonePlaceholder'), { target: { value: '+507 6220-1145' } })

    fireEvent.click(screen.getByText('bodega:returns.newReturnPage.save'))

    expect(await screen.findByText('bodega:returns.newReturnPage.errors.quantityExceeded')).toBeInTheDocument()
    expect(mockedApi.returns.create).not.toHaveBeenCalled()
  })

  it('REQ-418 — motivo "Otro (especificar)" requiere texto libre', async () => {
    renderPage()
    await searchAndSelectOrder()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.change(screen.getByPlaceholderText('bodega:returns.newReturnPage.details.contactNamePlaceholder'), { target: { value: 'Ricardo Aguilar' } })
    fireEvent.change(screen.getByPlaceholderText('bodega:returns.newReturnPage.details.contactPhonePlaceholder'), { target: { value: '+507 6220-1145' } })
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'otra' } })

    fireEvent.click(screen.getByText('bodega:returns.newReturnPage.save'))

    expect(await screen.findByText('bodega:returns.newReturnPage.errors.missingReasonDetail')).toBeInTheDocument()
    expect(mockedApi.returns.create).not.toHaveBeenCalled()
  })

  it('guardar con datos válidos crea la devolución y muestra la confirmación pendiente', async () => {
    mockedApi.returns.create.mockResolvedValue({ id: 1, return_number: 'DEV-1' } as CreateCustomerReturnResponse)
    renderPage()
    await searchAndSelectOrder()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '1' } })
    fireEvent.change(screen.getByPlaceholderText('bodega:returns.newReturnPage.details.contactNamePlaceholder'), { target: { value: 'Ricardo Aguilar' } })
    fireEvent.change(screen.getByPlaceholderText('bodega:returns.newReturnPage.details.contactPhonePlaceholder'), { target: { value: '+507 6220-1145' } })

    fireEvent.click(screen.getByText('bodega:returns.newReturnPage.save'))

    await waitFor(() => expect(mockedApi.returns.create).toHaveBeenCalledWith({
      order_id: 10,
      contact_name: 'Ricardo Aguilar',
      contact_phone: '+507 6220-1145',
      items: [{ order_item_id: 900, qty_requested: 1, reason: 'danado_defectuoso' }],
    }))
    expect(await screen.findByText('bodega:returns.newReturnPage.success.pendingLabel')).toBeInTheDocument()
  })

  it('"Ir a Devoluciones" navega a la bandeja', async () => {
    mockedApi.returns.create.mockResolvedValue({ id: 1, return_number: 'DEV-1' } as CreateCustomerReturnResponse)
    renderPage()
    await searchAndSelectOrder()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.change(screen.getByPlaceholderText('bodega:returns.newReturnPage.details.contactNamePlaceholder'), { target: { value: 'Ricardo Aguilar' } })
    fireEvent.change(screen.getByPlaceholderText('bodega:returns.newReturnPage.details.contactPhonePlaceholder'), { target: { value: '+507 6220-1145' } })
    fireEvent.click(screen.getByText('bodega:returns.newReturnPage.save'))
    await screen.findByText('bodega:returns.newReturnPage.success.pendingLabel')

    fireEvent.click(screen.getByText('bodega:returns.newReturnPage.success.goToTray'))

    expect(navigateMock).toHaveBeenCalledWith('/bodega/devoluciones')
  })
})
