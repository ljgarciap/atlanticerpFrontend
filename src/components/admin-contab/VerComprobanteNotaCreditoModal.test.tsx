import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VerComprobanteNotaCreditoModal from './VerComprobanteNotaCreditoModal'
import { adminContabApi } from '@/api/adminContabApi'
import type { NotaCreditoComprobanteDetail } from '@/types/adminContab'

// Batch 13 (SCRUM-572, REQ-495) — "Ver comprobante" de una Nota de Crédito.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      let out = key
      for (const [k, v] of Object.entries(opts)) out += `:${k}=${v}`
      return out
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    notasCredito: { comprobante: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeComprobante(overrides: Partial<NotaCreditoComprobanteDetail> = {}): NotaCreditoComprobanteDetail {
  return {
    tiene_comprobante: true,
    url: 'https://s3.example.com/comprobante.pdf?sig=abc',
    mime_type: 'application/pdf',
    subido_por: 'Felix Campos',
    fecha: '2026-08-20',
    ...overrides,
  }
}

function renderModal(notaId = 1) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <VerComprobanteNotaCreditoModal notaId={notaId} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('VerComprobanteNotaCreditoModal — REQ-495', () => {
  it('RN1 — con comprobante PDF, muestra la previsualización y quién/cuándo lo adjuntó', async () => {
    mockedApi.notasCredito.comprobante.mockResolvedValue(makeComprobante())
    renderModal()

    expect(await screen.findByTitle('notasCredito.comprobanteModal.title')).toBeInTheDocument()
    expect(screen.getByText(/adjuntadoPor.*Felix Campos/)).toBeInTheDocument()
  })

  it('con un comprobante de imagen, previsualiza con <img> en vez de <iframe>', async () => {
    mockedApi.notasCredito.comprobante.mockResolvedValue(makeComprobante({ mime_type: 'image/jpeg' }))
    renderModal()

    expect(await screen.findByAltText('notasCredito.comprobanteModal.title')).toBeInTheDocument()
    expect(screen.queryByTitle('notasCredito.comprobanteModal.title')).not.toBeInTheDocument()
  })

  it('RN2 — sin comprobante, muestra el mensaje explícito en vez de una pantalla vacía', async () => {
    mockedApi.notasCredito.comprobante.mockResolvedValue({ tiene_comprobante: false, url: null, mime_type: null, subido_por: null, fecha: null })
    renderModal()

    expect(await screen.findByText('notasCredito.comprobanteModal.sinComprobante')).toBeInTheDocument()
  })
})
