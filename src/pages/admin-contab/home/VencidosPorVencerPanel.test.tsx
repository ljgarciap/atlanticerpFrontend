import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VencidosPorVencerPanel from './VencidosPorVencerPanel'
import { adminContabApi } from '@/api/adminContabApi'
import type { HomeVencidosPorVencer } from '@/types/adminContab'

// Batch Home (SCRUM-503→512), Grupo 4 (SCRUM-511, REQ-434) — "Vencidos y por vencer".
// Cubre ambas secciones, el texto exacto por fila (incluyendo "vence hoy" para
// dias_para_vencer === 0) y los estados vacíos.

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
    home: { vencidosPorVencer: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <VencidosPorVencerPanel />
    </QueryClientProvider>,
  )
}

describe('VencidosPorVencerPanel', () => {
  it('muestra una factura vencida y una por vencer con su texto de días', async () => {
    const data: HomeVencidosPorVencer = {
      vencidos: [
        { numero: 'FAC-4410', cliente: 'Torres Pacífico', dias_vencido: 12, monto: 6200, fecha_vencimiento: '2026-08-15' },
      ],
      por_vencer: [
        { numero: 'FAC-4421', cliente: 'Hotel Riu', dias_para_vencer: 3, monto: 9800, fecha_vencimiento: '2026-09-01' },
      ],
    }
    mockedApi.home.vencidosPorVencer.mockResolvedValue(data)
    renderPanel()

    expect(await screen.findByText('FAC-4410')).toBeInTheDocument()
    expect(screen.getByText('Torres Pacífico')).toBeInTheDocument()
    expect(screen.getByText('adminContab:home.vencidosPorVencer.vencidos.texto:dias=12')).toBeInTheDocument()

    expect(screen.getByText('FAC-4421')).toBeInTheDocument()
    expect(screen.getByText('Hotel Riu')).toBeInTheDocument()
    expect(screen.getByText('adminContab:home.vencidosPorVencer.porVencer.texto:dias=3')).toBeInTheDocument()
  })

  it('muestra "vence hoy" cuando dias_para_vencer es 0, distinto del texto de "vence en N días"', async () => {
    const data: HomeVencidosPorVencer = {
      vencidos: [],
      por_vencer: [
        { numero: 'FAC-9001', cliente: 'Cliente Hoy', dias_para_vencer: 0, monto: 500, fecha_vencimiento: '2026-08-27' },
      ],
    }
    mockedApi.home.vencidosPorVencer.mockResolvedValue(data)
    renderPanel()

    expect(await screen.findByText('adminContab:home.vencidosPorVencer.porVencer.hoy')).toBeInTheDocument()
    expect(screen.queryByText(/porVencer\.texto/)).not.toBeInTheDocument()
  })

  it('muestra los estados vacíos de ambas secciones', async () => {
    mockedApi.home.vencidosPorVencer.mockResolvedValue({ vencidos: [], por_vencer: [] })
    renderPanel()

    expect(await screen.findByText('adminContab:home.vencidosPorVencer.vencidos.empty')).toBeInTheDocument()
    expect(screen.getByText('adminContab:home.vencidosPorVencer.porVencer.empty')).toBeInTheDocument()
  })
})
