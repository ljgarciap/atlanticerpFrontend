import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VentasDisenoCotizaYaPage from './CotizaYaPage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { CotizaYaListResult, CotizaYaListRow } from '@/types/ventasDiseno'
import * as pdf from './cotizaYaPdf'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/ventasDisenoApi', () => ({ ventasDisenoApi: { cotizaya: { list: vi.fn(), pdf: vi.fn() } } }))
vi.mock('./cotizaYaPdf', () => ({ downloadCotizaYaPdf: vi.fn().mockResolvedValue(undefined) }))

const api = vi.mocked(ventasDisenoApi, true)

function row(over: Partial<CotizaYaListRow> = {}): CotizaYaListRow {
  return {
    id: 7, folio: 'CotizaYA-2026-0001', customer_name: 'Zulema Quintero', customer_phone: '6000-1234',
    description: 'Venta de mostrador', owner: { id: 1, name: 'Ana Pérez' }, generated_at: '2026-10-08T14:00:00Z', grand_total: 214, ...over,
  }
}
function result(rows: CotizaYaListRow[]): CotizaYaListResult {
  return { data: rows, meta: { total: rows.length, per_page: 20, current_page: 1, last_page: 1 } }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/ventas-diseno/cotizaya']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/ventas-diseno/cotizaya" element={<VentasDisenoCotizaYaPage />} />
          <Route path="/ventas-diseno/cotizaya/nueva" element={<div>FORM_PAGE</div>} />
          <Route path="/ventas-diseno/cotizaya/:id" element={<div>DETAIL_PAGE</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.cotizaya.list.mockResolvedValue(result([row()]))
})

describe('CotizaYA — listado (SCRUM-1120)', () => {
  it('muestra ID (folio), nombre de cliente, teléfono, descripción, diseñador y total', async () => {
    renderPage()
    expect(await screen.findByText('CotizaYA-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('Zulema Quintero')).toBeInTheDocument()
    expect(screen.getByText('6000-1234')).toBeInTheDocument()
    expect(screen.getByText('Venta de mostrador')).toBeInTheDocument()
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('$214.00')).toBeInTheDocument()
  })

  it('sin nombre de cliente muestra CotizaYA', async () => {
    api.cotizaya.list.mockResolvedValue(result([row({ customer_name: null })]))
    renderPage()
    expect(await screen.findByText('CotizaYA')).toBeInTheDocument()
  })

  it('el botón superior derecho se llama CotizaYA y abre el formulario', async () => {
    renderPage()
    await screen.findByText('CotizaYA-2026-0001')
    fireEvent.click(screen.getByRole('button', { name: 'ventasDiseno:cotizaya.button' }))
    expect(await screen.findByText('FORM_PAGE')).toBeInTheDocument()
  })

  it('ver detalle abre la cotización', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('ventasDiseno:cotizaya.table.viewDetail'))
    expect(await screen.findByText('DETAIL_PAGE')).toBeInTheDocument()
  })

  it('descargar PDF pide el PDF de esa cotización', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('ventasDiseno:cotizaya.table.downloadPdf'))
    await waitFor(() => expect(pdf.downloadCotizaYaPdf).toHaveBeenCalledWith(7, 'CotizaYA-2026-0001'))
  })

  it('si la descarga del PDF falla lo avisa', async () => {
    vi.mocked(pdf.downloadCotizaYaPdf).mockRejectedValueOnce(new Error('500'))
    renderPage()
    fireEvent.click(await screen.findByText('ventasDiseno:cotizaya.table.downloadPdf'))
    expect(await screen.findByTestId('cotizaya-pdf-error')).toHaveTextContent('ventasDiseno:cotizaya.pdfError')
  })

  it('buscar manda el texto al backend', async () => {
    renderPage()
    await screen.findByText('CotizaYA-2026-0001')
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:cotizaya.searchPlaceholder'), { target: { value: 'zulema' } })
    await waitFor(() => expect(api.cotizaya.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'zulema' })))
  })

  it('sin cotizaciones muestra el estado vacío', async () => {
    api.cotizaya.list.mockResolvedValue(result([]))
    renderPage()
    expect(await screen.findByText('ventasDiseno:cotizaya.empty')).toBeInTheDocument()
  })
})
