import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VentasDisenoCotizaYaFormPage from './CotizaYaFormPage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import type { CotizaYaContext, QuoteDetail } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    cotizaya: {
      context: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn(), generate: vi.fn(),
      contacts: { create: vi.fn() },
      parts: { create: vi.fn() },
    },
  },
}))
vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))
// Las partidas reales (QuotePartCard) tienen su propia suite: acá solo importa que se rendericen con el contexto de CotizaYA.
vi.mock('@/components/QuotePartCard', () => ({ default: ({ part }: { part: { name: string } }) => <div data-testid="part-card">{part.name}</div> }))

const api = vi.mocked(ventasDisenoApi, true)
const store = vi.mocked(useAuthStore)

function ctx(over: Partial<CotizaYaContext> = {}): CotizaYaContext {
  return {
    configured: true, master_client: { id: 1, name: 'CotizaYA' }, sub_client: { id: 2, business_name: 'CotizaYA' },
    contacts: [], default_conditions_text: 'Condiciones por defecto', ...over,
  }
}

function quote(over: Partial<QuoteDetail> = {}): QuoteDetail {
  return {
    id: 50, origin: 'cotizaya', cotizaya: { customer_name: null, customer_phone: null }, status: 'draft', folio: null,
    generated_at: null, confirmed_at: null, pipeline_card_id: null, document_status: 'draft',
    master_client: { id: 1, name: 'CotizaYA' }, sub_client: null, sales_project: null, ruc: null, description: null,
    owner: { id: 9, name: 'Ana Pérez', phone: null }, architect: null, delivery_type: null, delivery_dates: [], contacts: [],
    price_type: 'public', discount_mode: 'line', global_discount_percent: 0, global_below_min_margin: false,
    can_override_min_margin: false, min_margin_percent: 30, parts: [], subtotal: 0, observations: null,
    includes_installation: false, discount_totals_type: 'percent', discount_totals_value: 0, discount_totals_amount: 0,
    net_total: 0, itbms: 0, grand_total: 0, conditions_text: 'Condiciones congeladas', observations_preview: '',
    can_edit: true, created_at: '2026-10-08T00:00:00Z', ...over,
  } as unknown as QuoteDetail
}

function setUser(permissions: string[] = ['ventas_diseno.read', 'ventas_diseno.write', 'ventas_diseno.edit']) {
  const user = { id: 9, first_name: 'Ana', last_name: 'Pérez', permissions, modules: { ventas_diseno: { view: true, view_team: false } } }
  store.mockImplementation(((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user }
    return selector ? selector(state) : state
  }) as never)
}

let lastClient: QueryClient

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  lastClient = qc
  return render(
    <MemoryRouter initialEntries={['/ventas-diseno/cotizaya/nueva']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/ventas-diseno/cotizaya/nueva" element={<VentasDisenoCotizaYaFormPage />} />
          <Route path="/ventas-diseno/cotizaya/:id" element={<div>DETAIL_PAGE</div>} />
          <Route path="/ventas-diseno/cotizaya" element={<div>LIST_PAGE</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  setUser()
  api.cotizaya.context.mockResolvedValue(ctx())
  api.cotizaya.create.mockResolvedValue(quote())
  api.cotizaya.get.mockResolvedValue(quote())
  api.cotizaya.update.mockResolvedValue(quote())
  api.cotizaya.generate.mockResolvedValue(quote({ folio: 'CotizaYA-2026-0001' }))
  api.cotizaya.contacts.create.mockResolvedValue({} as never)
  api.cotizaya.parts.create.mockResolvedValue({ id: 1, name: 'Partida 1', position: 1 } as never)
})

describe('CotizaYA — formulario (SCRUM-1120)', () => {
  it('tiene solo los campos definidos y NO tiene selector de Cliente Master', async () => {
    renderPage()
    expect(await screen.findByTestId('cotizaya-customer-name')).toBeInTheDocument()
    expect(screen.getByTestId('cotizaya-customer-phone')).toBeInTheDocument()
    expect(screen.getByTestId('cotizaya-description')).toBeInTheDocument()
    expect(screen.getByTestId('cotizaya-designer')).toHaveTextContent('Ana Pérez')
    expect(screen.getByTestId('cotizaya-observations')).toBeInTheDocument()
    expect(screen.getByTestId('cotizaya-conditions')).toBeInTheDocument()
    expect(screen.getByTestId('cotizaya-generate')).toBeInTheDocument()
    expect(screen.queryByText(/masterClient|Cliente Master/i)).not.toBeInTheDocument()
  })

  it('sin contactos registrados lo dice; con contactos los ofrece', async () => {
    renderPage()
    expect(await screen.findByTestId('cotizaya-no-contacts')).toHaveTextContent('ventasDiseno:cotizaya.form.noContacts')
  })

  it('con contactos registrados permite seleccionarlos', async () => {
    api.cotizaya.context.mockResolvedValue(ctx({ contacts: [{ id: 3, name: 'Luis Gómez', role: 'client', phone: '6111', email: null }] }))
    renderPage()
    expect(await screen.findByText(/Luis Gómez/)).toBeInTheDocument()
    expect(screen.queryByTestId('cotizaya-no-contacts')).not.toBeInTheDocument()
  })

  it('las Condiciones vigentes se muestran de solo lectura sin el permiso angosto', async () => {
    renderPage()
    const box = (await screen.findByTestId('cotizaya-conditions')) as HTMLTextAreaElement
    await waitFor(() => expect(box.value).toBe('Condiciones por defecto'))
    expect(box.readOnly).toBe(true)
  })

  it('con ventas_diseno.edit.conditions las Condiciones son editables', async () => {
    setUser(['ventas_diseno.write', 'ventas_diseno.edit', 'ventas_diseno.edit.conditions'])
    renderPage()
    const box = (await screen.findByTestId('cotizaya-conditions')) as HTMLTextAreaElement
    expect(box.readOnly).toBe(false)
  })

  it('abrir el formulario NO crea nada en el servidor', async () => {
    renderPage()
    await screen.findByTestId('cotizaya-generate')
    expect(api.cotizaya.create).not.toHaveBeenCalled()
  })

  it('agregar la primera partida crea antes el borrador con los datos tecleados', async () => {
    renderPage()
    fireEvent.change(await screen.findByTestId('cotizaya-customer-name'), { target: { value: 'Zulema' } })
    fireEvent.change(screen.getByTestId('cotizaya-customer-phone'), { target: { value: '6000' } })
    fireEvent.click(screen.getByTestId('cotizaya-add-part'))

    await waitFor(() => expect(api.cotizaya.parts.create).toHaveBeenCalledWith(50, expect.any(String)))
    expect(api.cotizaya.create).toHaveBeenCalledWith(expect.objectContaining({
      cotizaya_customer_name: 'Zulema', cotizaya_customer_phone: '6000',
    }))
    // el borrador se crea una sola vez aunque se agreguen más partidas
    fireEvent.click(screen.getByTestId('cotizaya-add-part'))
    await waitFor(() => expect(api.cotizaya.parts.create).toHaveBeenCalledTimes(2))
    expect(api.cotizaya.create).toHaveBeenCalledTimes(1)
  })

  it('Generar guarda los campos, vincula los contactos, genera y abre el detalle', async () => {
    api.cotizaya.context.mockResolvedValue(ctx({ contacts: [{ id: 3, name: 'Luis Gómez', role: 'client', phone: null, email: null }] }))
    renderPage()
    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.change(screen.getByTestId('cotizaya-description'), { target: { value: 'Venta rápida' } })
    fireEvent.click(screen.getByTestId('cotizaya-generate'))

    expect(await screen.findByText('DETAIL_PAGE')).toBeInTheDocument()
    expect(api.cotizaya.create).toHaveBeenCalledTimes(1)
    expect(api.cotizaya.update).toHaveBeenCalledWith(50, expect.objectContaining({ description: 'Venta rápida' }))
    expect(api.cotizaya.contacts.create).toHaveBeenCalledWith(50, 3)
    expect(api.cotizaya.generate).toHaveBeenCalledWith(50)
  })

  it('al generar, la caché que lee el detalle queda con la cotización GENERADA (folio), no con el borrador', async () => {
    // El servidor, una vez generada, devuelve la cotización con folio también en las lecturas siguientes.
    api.cotizaya.generate.mockImplementation(async () => {
      const generated = quote({ folio: 'CotizaYA-2026-0001' })
      api.cotizaya.get.mockResolvedValue(generated)
      return generated
    })
    renderPage()
    fireEvent.click(await screen.findByTestId('cotizaya-generate'))
    expect(await screen.findByText('DETAIL_PAGE')).toBeInTheDocument()

    const cached = lastClient.getQueryData<QuoteDetail>(['ventas-diseno-quote', 50])
    expect(cached?.folio).toBe('CotizaYA-2026-0001')
  })

  it('el error de «Falta para generar» se limpia al agregar un ítem', async () => {
    api.cotizaya.generate.mockRejectedValueOnce(Object.assign(new Error('422'), {
      isAxiosError: true, response: { status: 422, data: { valid: false, missing: ['Ítems'] } },
    }))
    renderPage()
    fireEvent.click(await screen.findByTestId('cotizaya-generate'))
    expect(await screen.findByTestId('cotizaya-error')).toBeInTheDocument()

    // QuotePartCard agrega el ítem y refresca la cotización: ahora trae 1 ítem
    api.cotizaya.get.mockResolvedValue(quote({ parts: [{ id: 1, name: 'P', position: 1, subtotal: 100, items: [{ id: 9 }] }] as never }))
    await act(async () => { await lastClient.invalidateQueries({ queryKey: ['ventas-diseno-quote', 50] }) })

    await waitFor(() => expect(screen.queryByTestId('cotizaya-error')).not.toBeInTheDocument())
  })

  it('un 422 con campos faltantes los muestra y no navega', async () => {
    api.cotizaya.generate.mockRejectedValue(Object.assign(new Error('422'), {
      isAxiosError: true, response: { status: 422, data: { valid: false, missing: ['Ítems'] } },
    }))
    renderPage()
    fireEvent.click(await screen.findByTestId('cotizaya-generate'))

    expect(await screen.findByTestId('cotizaya-error')).toHaveTextContent('Ítems')
    expect(screen.queryByText('DETAIL_PAGE')).not.toBeInTheDocument()
  })

  it('si Generar falla a mitad, reintentar NO crea un segundo borrador', async () => {
    api.cotizaya.generate.mockRejectedValueOnce(Object.assign(new Error('500'), { isAxiosError: true, response: { status: 500, data: { message: 'Error del servidor' } } }))
    renderPage()
    fireEvent.click(await screen.findByTestId('cotizaya-generate'))
    expect(await screen.findByTestId('cotizaya-error')).toHaveTextContent('Error del servidor')

    fireEvent.click(screen.getByTestId('cotizaya-generate'))
    expect(await screen.findByText('DETAIL_PAGE')).toBeInTheDocument()
    expect(api.cotizaya.create).toHaveBeenCalledTimes(1)
    expect(api.cotizaya.generate).toHaveBeenCalledTimes(2)
  })

  it('si el entorno no está configurado avisa y bloquea Generar', async () => {
    api.cotizaya.context.mockResolvedValue(ctx({ configured: false, master_client: null, sub_client: null }))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('ventasDiseno:cotizaya.form.notConfigured')
    expect(screen.getByTestId('cotizaya-generate')).toBeDisabled()
    expect(screen.getByTestId('cotizaya-add-part')).toBeDisabled()
  })
})
