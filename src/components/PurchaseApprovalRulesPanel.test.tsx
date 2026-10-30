import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PurchaseApprovalRulesPanel from './PurchaseApprovalRulesPanel'
import { purchaseApprovalRulesApi, type PurchaseApprovalRule } from '@/api/purchaseApprovalRulesApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => o?.name ? `${key}:${String(o.name)}` : key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/purchaseApprovalRulesApi', () => ({
  purchaseApprovalRulesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), preview: vi.fn() },
}))

const api = vi.mocked(purchaseApprovalRulesApi, true)

const regla = (over: Partial<PurchaseApprovalRule> = {}): PurchaseApprovalRule => ({
  id: 1, name: 'Aéreo pagado por la empresa', sort_order: 1, is_active: true, shipping_type: 'aereo', who_pays_shipping: 'atlantic',
  min_amount: null, max_amount: null, requires_approval: true, ...over,
})

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><PurchaseApprovalRulesPanel /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.list.mockResolvedValue([regla()])
})

describe('PurchaseApprovalRulesPanel (Fase 14a)', () => {
  it('lista las reglas con su orden y nombre', async () => {
    renderPanel()
    expect(await screen.findByText(/1\. Aéreo pagado por la empresa/)).toBeInTheDocument()
  })

  it('crear una regla envía las condiciones vacías como null y el monto como número', async () => {
    api.create.mockResolvedValue(regla({ id: 2 }))
    renderPanel()
    await screen.findByText(/Aéreo pagado/)

    fireEvent.click(screen.getByText('settings.rules.add'))
    fireEvent.change(screen.getByLabelText('settings.rules.name'), { target: { value: 'Compras grandes' } })
    fireEvent.change(screen.getByLabelText('settings.rules.minAmount'), { target: { value: '5000' } })
    fireEvent.click(screen.getByText('settings.rules.save'))

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1))
    expect(api.create.mock.calls[0][0]).toMatchObject({
      name: 'Compras grandes', shipping_type: null, who_pays_shipping: null, min_amount: 5000, max_amount: null, requires_approval: true,
    })
  })

  it('la vista previa muestra el resultado y la regla que decide', async () => {
    api.preview.mockResolvedValue({ requires_approval: true, rule: { id: 1, name: 'Aéreo pagado por la empresa' } })
    renderPanel()
    await screen.findByText(/Aéreo pagado/)

    fireEvent.click(screen.getByText('settings.rules.previewRun'))

    expect(await screen.findByRole('status')).toHaveTextContent('settings.rules.previewYes')
    expect(api.preview).toHaveBeenCalledWith({ shipping_type: 'aereo', who_pays_shipping: 'atlantic', amount: 3000 })
  })

  it('eliminar pide confirmación', async () => {
    api.remove.mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPanel()
    await screen.findByText(/Aéreo pagado/)

    fireEvent.click(screen.getByText('settings.rules.delete'))

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(1))
  })
})
