import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VerComprobanteModal from './VerComprobanteModal'
import { adminContabApi } from '@/api/adminContabApi'
import type { PaymentAttachmentDetail } from '@/types/adminContab'

// Batch 7 del cuerpo principal (SCRUM-549, REQ-472) — "Ver comprobante".

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
    payments: { attachment: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeAttachment(overrides: Partial<PaymentAttachmentDetail> = {}): PaymentAttachmentDetail {
  return {
    url: 'https://s3.example.com/comprobante.pdf?sig=abc',
    nombre_archivo: 'comprobante.pdf',
    mime_type: 'application/pdf',
    uploaded_by: 'Contabilidad Test',
    created_at: '2026-06-18T00:00:00Z',
    ...overrides,
  }
}

function renderModal(paymentId = 1) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <VerComprobanteModal paymentId={paymentId} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('VerComprobanteModal — REQ-472', () => {
  it('Escenario 1 — con comprobante PDF, muestra la previsualización y quién/cuándo lo adjuntó', async () => {
    mockedApi.payments.attachment.mockResolvedValue(makeAttachment())
    renderModal()

    expect(await screen.findByTitle('comprobante.pdf')).toBeInTheDocument()
    expect(screen.getByText(/adjuntadoPor.*Contabilidad Test/)).toBeInTheDocument()
  })

  it('con un comprobante de imagen, previsualiza con <img> en vez de <iframe>', async () => {
    mockedApi.payments.attachment.mockResolvedValue(makeAttachment({ mime_type: 'image/jpeg', nombre_archivo: 'transferencia.jpg' }))
    renderModal()

    expect(await screen.findByAltText('transferencia.jpg')).toBeInTheDocument()
    expect(screen.queryByTitle('transferencia.jpg')).not.toBeInTheDocument()
  })

  it('Escenario 2 — sin comprobante, muestra el mensaje explícito en vez de una pantalla vacía', async () => {
    mockedApi.payments.attachment.mockResolvedValue(null)
    renderModal()

    expect(await screen.findByText('cobros.comprobanteModal.sinComprobante')).toBeInTheDocument()
  })
})
