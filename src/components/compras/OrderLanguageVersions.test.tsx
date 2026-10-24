import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OrderLanguageVersions } from './OrderLanguageVersions'
import { comprasApi } from '@/api/comprasApi'
import type { OrderTranslationStatus } from '@/types/compras'

// SCRUM-1127 — el inglés es una versión adicional a pedido, no una regla de la orden: el español siempre está, el inglés se genera,
// queda guardado y se puede ver/descargar después.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: { orders: { pdf: vi.fn(), translate: vi.fn() } },
}))

const mocked = vi.mocked(comprasApi, true)

function renderIt(english: OrderTranslationStatus | undefined, canGenerate = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <OrderLanguageVersions orderId={7} includeCost english={english} canGenerate={canGenerate} />
    </QueryClientProvider>,
  )
}

describe('OrderLanguageVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
    vi.spyOn(window, 'open').mockReturnValue({ location: { href: '' }, close: vi.fn() } as unknown as Window)
  })

  it('sin versión en inglés ofrece generarla y el español siempre está disponible', () => {
    renderIt({ exists: false, stale: false, generated_at: null })

    expect(screen.getByText('compras:orders.languages.generate')).toBeInTheDocument()
    expect(screen.getByText('compras:orders.languages.notGenerated')).toBeInTheDocument()
    // Ver + Descargar del español; el inglés todavía no tiene ninguno.
    expect(screen.getAllByText('compras:orders.languages.view')).toHaveLength(1)
    expect(screen.getAllByText('compras:orders.languages.download')).toHaveLength(1)
  })

  it('con versión vigente permite ver y descargar las dos versiones, y regenerar', () => {
    renderIt({ exists: true, stale: false, generated_at: '2026-10-09T10:00:00-05:00' })

    expect(screen.getAllByText('compras:orders.languages.view')).toHaveLength(2)
    expect(screen.getAllByText('compras:orders.languages.download')).toHaveLength(2)
    expect(screen.getByText('compras:orders.languages.regenerate')).toBeInTheDocument()
  })

  it('una versión desactualizada no se ofrece para ver ni descargar, solo para regenerar', () => {
    renderIt({ exists: true, stale: true, generated_at: '2026-10-09T10:00:00-05:00' })

    expect(screen.getByText('compras:orders.languages.stale')).toBeInTheDocument()
    expect(screen.getAllByText('compras:orders.languages.view')).toHaveLength(1)
    expect(screen.getByText('compras:orders.languages.regenerate')).toBeInTheDocument()
  })

  it('quien no puede escribir en Compras no ve el botón que llama a la IA', () => {
    renderIt({ exists: false, stale: false, generated_at: null }, false)

    expect(screen.queryByText('compras:orders.languages.generate')).not.toBeInTheDocument()
  })

  it('generar llama al endpoint de traducción de esa orden', async () => {
    mocked.orders.translate.mockResolvedValue({ translations: { en: { exists: true, stale: false, generated_at: '2026-10-09T10:00:00-05:00' } } })
    renderIt({ exists: false, stale: false, generated_at: null })

    fireEvent.click(screen.getByText('compras:orders.languages.generate'))

    await waitFor(() => expect(mocked.orders.translate).toHaveBeenCalledWith(7))
  })

  it('si la IA falla muestra el mensaje del servidor y ofrece usar el español', async () => {
    mocked.orders.translate.mockRejectedValue(
      Object.assign(new Error('boom'), { isAxiosError: true, response: { status: 503, data: { message: 'No se pudo traducir la orden.' } } }),
    )
    renderIt({ exists: false, stale: false, generated_at: null })

    fireEvent.click(screen.getByText('compras:orders.languages.generate'))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo traducir la orden.')
    expect(screen.getByRole('alert')).toHaveTextContent('compras:orders.languages.useSpanishInstead')
  })

  it('descargar en inglés pide el PDF con lang=en y las opciones de costo vigentes', async () => {
    mocked.orders.pdf.mockResolvedValue(new Blob(['%PDF']))
    renderIt({ exists: true, stale: false, generated_at: '2026-10-09T10:00:00-05:00' })

    fireEvent.click(screen.getAllByText('compras:orders.languages.download')[1])

    await waitFor(() => expect(mocked.orders.pdf).toHaveBeenCalledWith(7, true, 'en'))
  })

  it('ver en español sigue pidiendo el PDF de siempre (lang=es)', async () => {
    mocked.orders.pdf.mockResolvedValue(new Blob(['%PDF']))
    renderIt({ exists: false, stale: false, generated_at: null })

    fireEvent.click(screen.getByText('compras:orders.languages.view'))

    await waitFor(() => expect(mocked.orders.pdf).toHaveBeenCalledWith(7, true, 'es'))
  })
})
