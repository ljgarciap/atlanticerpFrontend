import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PendientesPanel from './PendientesPanel'
import { adminContabApi } from '@/api/adminContabApi'
import type { HomePendientes } from '@/types/adminContab'

// Batch Home (SCRUM-503→512), Grupo 3 (SCRUM-510, REQ-433) — "Pendientes".
// Cubre el badge de conteo, el color del punto por severidad, el texto de cada fila y el estado
// vacío.

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
    home: { pendientes: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <PendientesPanel />
    </QueryClientProvider>,
  )
}

describe('PendientesPanel', () => {
  it('muestra el badge de conteo y cada alerta con su punto de severidad', async () => {
    const data: HomePendientes = {
      count: 2,
      items: [
        {
          tipo: 'factura_vencida_sin_pago',
          severidad: 'alta',
          titulo: 'Factura #1234 vencida sin pago',
          detalle: 'Cliente ACME — 15 días vencida',
          monto: 1200,
          fecha_referencia: '2026-08-12',
        },
        {
          tipo: 'comision_pendiente',
          severidad: 'media',
          titulo: 'Comisión pendiente de pago',
          detalle: 'Annie — 12 días pendiente',
          monto: 340,
          fecha_referencia: '2026-08-15',
        },
      ],
    }
    mockedApi.home.pendientes.mockResolvedValue(data)
    renderPanel()

    expect(await screen.findByText('2')).toBeInTheDocument()
    expect(screen.getByText('Factura #1234 vencida sin pago')).toBeInTheDocument()
    expect(screen.getByText('Cliente ACME — 15 días vencida')).toBeInTheDocument()
    expect(screen.getByText('Comisión pendiente de pago')).toBeInTheDocument()

    const dots = document.querySelectorAll('[aria-hidden="true"]')
    expect(dots).toHaveLength(2)
    expect(dots[0]?.className).toContain('bg-red-500')
    expect(dots[1]?.className).toContain('bg-amber-500')
  })

  it('muestra el estado vacío sin pendientes', async () => {
    mockedApi.home.pendientes.mockResolvedValue({ count: 0, items: [] })
    renderPanel()

    expect(await screen.findByText('adminContab:home.pendientes.empty')).toBeInTheDocument()
    expect(screen.queryByText('adminContab:home.pendientes.title')).toBeInTheDocument()
  })
})
