import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProviderConfirmationCard from './ProviderConfirmationCard'
import { comprasApi } from '@/api/comprasApi'
import type { PurchaseOrderDocument } from '@/types/compras'

// SCRUM-211/REQ-148 (2026-08-06, hallazgo Daniela Amaya + mockup 2A__Compras_Ordenes.html): el
// card de solo-lectura de SCRUM-218 resolvía visibilidad, no la carga real que pide el mockup
// dentro del modal de detalle de orden. RN1 bloquea mientras la orden está "Por aprobar"; RN4
// permite reemplazar el documento en cualquier momento posterior.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    documents: { list: vi.fn(), upload: vi.fn(), validate: vi.fn(), getValidation: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeDoc(overrides: Partial<PurchaseOrderDocument> = {}): PurchaseOrderDocument {
  return {
    id: 1, category: 'confirmacion_proveedor', original_filename: 'confirmacion.pdf',
    url: 'https://s3/doc.pdf', created_at: '2026-08-06T10:00:00Z',
    ...overrides,
  }
}

function renderCard(orderStatus = 'ordenado') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProviderConfirmationCard orderId={4} orderStatus={orderStatus} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedComprasApi.documents.getValidation.mockResolvedValue({
    status: null, result: null, error: null,
  } as never)
})

describe('ProviderConfirmationCard', () => {
  it('RN1: bloquea la carga mientras la orden está "Por aprobar"', async () => {
    mockedComprasApi.documents.list.mockResolvedValue({ data: [] })
    renderCard('por_aprobar')

    await waitFor(() => expect(screen.getByText('compras:orders.detail.providerConfirmation.title')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.detail.providerConfirmation.blockedByApproval')).toBeInTheDocument()
    expect(screen.queryByText('compras:orders.detail.providerConfirmation.upload')).toBeNull()
  })

  it('permite subir el documento una vez la orden salió de "Por aprobar"', async () => {
    mockedComprasApi.documents.list.mockResolvedValue({ data: [] })
    mockedComprasApi.documents.upload.mockResolvedValue(makeDoc())
    renderCard('ordenado')

    await waitFor(() => expect(screen.getByText('compras:orders.detail.providerConfirmation.upload')).toBeInTheDocument())

    const file = new File(['contenido'], 'confirmacion.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(mockedComprasApi.documents.upload).toHaveBeenCalledWith(4, 'confirmacion_proveedor', file))
  })

  it('RN4: si ya hay un documento, el botón dice "Reemplazar" y sigue permitiendo subir', async () => {
    mockedComprasApi.documents.list.mockResolvedValue({ data: [makeDoc()] })
    renderCard('ordenado')

    await waitFor(() => expect(screen.getByText('compras:orders.detail.providerConfirmation.replace')).toBeInTheDocument())
    expect(screen.queryByText('compras:orders.detail.providerConfirmation.upload')).toBeNull()
  })

  it('con 2 documentos de la misma categoría, muestra el de id más alto (el más reciente)', async () => {
    mockedComprasApi.documents.list.mockResolvedValue({
      data: [
        makeDoc({ id: 5, original_filename: 'viejo.pdf', url: 'https://s3/viejo.pdf' }),
        makeDoc({ id: 9, original_filename: 'nuevo.pdf', url: 'https://s3/nuevo.pdf' }),
      ],
    })
    renderCard('ordenado')

    await waitFor(() => expect(screen.getByText('compras:orders.detail.providerConfirmation.viewDocument')).toBeInTheDocument())
    const link = screen.getByText('compras:orders.detail.providerConfirmation.viewDocument').closest('a')
    expect(link).toHaveAttribute('href', 'https://s3/nuevo.pdf')
  })

  it('sin documento, muestra el estado vacío', async () => {
    mockedComprasApi.documents.list.mockResolvedValue({ data: [] })
    renderCard('ordenado')

    await waitFor(() => expect(screen.getByText('compras:orders.detail.providerConfirmation.empty')).toBeInTheDocument())
  })
})
