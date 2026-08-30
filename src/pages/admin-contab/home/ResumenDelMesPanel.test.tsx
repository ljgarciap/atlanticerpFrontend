import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ResumenDelMesPanel from './ResumenDelMesPanel'
import { adminContabApi } from '@/api/adminContabApi'
import type { HomeResumenMes } from '@/types/adminContab'

// Se matchea solo la parte numérica (no el símbolo completo "$X"/"USD X") porque el símbolo real
// de Intl.NumberFormat('es-PA', ...) y el espacio que lo separa (NBSP vs. espacio normal) dependen
// de los datos ICU del entorno que corre el test — Node sin full-icu imprime "USD 5,550.00" en vez
// de "$5,550.00", y la comparación de texto exacta de RTL no siempre normaliza el NBSP.
function amountRegex(value: number): RegExp {
  const digits = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return new RegExp(digits.replace('.', '\\.'))
}

// Batch Home (SCRUM-503→512), Grupo 1 (SCRUM-504→508, REQ-427→431) — "Resumen del mes".
// Cubre los 6 valores mostrados (cobrado del mes, cuentas al día, cartera por cobrar, ventas de
// ayer, comisiones internas/externas por pagar) + el click de "ver reporte completo".

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
    home: { resumenMes: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeResumen(overrides: Partial<HomeResumenMes> = {}): HomeResumenMes {
  return {
    mes_label: 'Junio 2026',
    total_cobrado_mes: 96400,
    cuentas_al_dia: { porcentaje: 76, monto_al_dia: 27000, monto_con_mora: 8600 },
    cartera_por_cobrar: { monto: 35600, monto_incobrable_excluido: 6200 },
    ventas_de_ayer: { monto: 4250, cantidad: 7, fecha: '2026-06-25' },
    comisiones_por_pagar: { internas: 5550, externas: 3400 },
    ...overrides,
  }
}

function renderPanel(onVerReporte = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ResumenDelMesPanel onVerReporte={onVerReporte} />
    </QueryClientProvider>,
  )
  return { onVerReporte }
}

describe('ResumenDelMesPanel', () => {
  it('muestra los 6 valores del resumen del mes', async () => {
    mockedApi.home.resumenMes.mockResolvedValue(makeResumen())
    renderPanel()

    expect(await screen.findByText(amountRegex(96400))).toBeInTheDocument()
    expect(screen.getByText('76%')).toBeInTheDocument()
    expect(screen.getByText(amountRegex(35600))).toBeInTheDocument()
    expect(screen.getByText(amountRegex(4250))).toBeInTheDocument()
    expect(screen.getByText(amountRegex(5550))).toBeInTheDocument()
    expect(screen.getByText(amountRegex(3400))).toBeInTheDocument()
  })

  it('dispara onVerReporte al hacer click en el ícono de Ventas de ayer', async () => {
    mockedApi.home.resumenMes.mockResolvedValue(makeResumen())
    const { onVerReporte } = renderPanel()

    const btn = await screen.findByLabelText('adminContab:home.resumenMes.ventasAyer.verReporte')
    fireEvent.click(btn)

    await waitFor(() => expect(onVerReporte).toHaveBeenCalledTimes(1))
  })
})
