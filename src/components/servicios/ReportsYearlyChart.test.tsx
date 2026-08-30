import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ReportsYearlyChart from './ReportsYearlyChart'
import { serviciosApi } from '@/api/serviciosApi'
import type { ReportsCompletadosAnioItem } from '@/types/servicios'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }),
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: { reportes: { completadosAnio: vi.fn() } },
}))

const mockedApi = vi.mocked(serviciosApi, true)

function renderChart(year = 2026) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ReportsYearlyChart year={year} />
    </QueryClientProvider>,
  )
}

beforeEach(() => { vi.clearAllMocks() })

// SCRUM-354 (rebote Daniela 2026-08-20) — un mes sin ningún servicio registrado no debe mostrar
// "0 0 0 0" ni un total "0"; un mes con datos parciales solo muestra los tipos con cantidad > 0.
describe('ReportsYearlyChart — SCRUM-354, ocultar ceros', () => {
  const items: ReportsCompletadosAnioItem[] = [
    { mes: 1, por_tipo: { installation: 0, warranty: 0, claim: 0, retrofit: 0 }, total: 0 },
    { mes: 2, por_tipo: { installation: 4, warranty: 0, claim: 2, retrofit: 0 }, total: 6 },
  ]

  it('un mes sin datos no muestra ningún "0" ni el total, pero sí mantiene la etiqueta del mes', async () => {
    mockedApi.reportes.completadosAnio.mockResolvedValue(items)
    renderChart()

    // Enero (mes sin datos) debe aparecer en la grilla...
    expect(await screen.findByText('ene', { exact: false })).toBeInTheDocument()
    // ...pero el "0" del total de enero queda oculto (clase `invisible`) — el nodo sigue en el DOM
    // solo para preservar la alineación vertical entre columnas, nunca visible al usuario. jsdom no
    // aplica Tailwind de verdad, así que se verifica la clase en vez de `toBeVisible()`.
    for (const el of screen.getAllByText('0')) expect(el.className).toContain('invisible')
  })

  it('un mes con datos parciales solo muestra los tipos con cantidad > 0 y su total', async () => {
    mockedApi.reportes.completadosAnio.mockResolvedValue(items)
    renderChart()

    await screen.findByText('feb', { exact: false })
    // Febrero: Instalaciones=4, Reclamos=2, total=6 — visibles.
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
  })

  it('un mes con todos los tipos en 0 no renderiza ninguna barra', async () => {
    mockedApi.reportes.completadosAnio.mockResolvedValue([items[0]])
    renderChart()
    await screen.findByText('ene', { exact: false })

    expect(screen.queryAllByTestId('tipo-bar').length).toBe(0)
  })

  it('mantiene los 6 meses en la grilla aunque varios estén en blanco (no se eliminan ni reordenan)', async () => {
    const sixMonths: ReportsCompletadosAnioItem[] = Array.from({ length: 6 }, (_, i) => ({
      mes: i + 1,
      por_tipo: { installation: 0, warranty: 0, claim: 0, retrofit: 0 },
      total: 0,
    }))
    sixMonths[2] = { mes: 3, por_tipo: { installation: 1, warranty: 0, claim: 0, retrofit: 0 }, total: 1 }
    mockedApi.reportes.completadosAnio.mockResolvedValue(sixMonths)
    renderChart()

    const grid = (await screen.findByText('mar', { exact: false })).closest('div')!.parentElement!.parentElement!
    const monthLabels = within(grid).getAllByText(/ene|feb|mar|abr|may|jun/i)
    expect(monthLabels.length).toBe(6)
  })
})
