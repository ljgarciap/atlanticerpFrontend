import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import VentasDisenoCatalogPage from './CatalogPage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useToastStore } from '@/store/toastStore'
import { useAuthStore } from '@/store/authStore'
import type { CatalogItem, CatalogListResult } from '@/types/ventasDiseno'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => (opts?.count != null ? `${key}:${opts.count}` : key),
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    catalog: {
      list: vi.fn(),
      get: vi.fn(),
      technicalSheetUrl: vi.fn(),
      uploadTechnicalSheet: vi.fn(),
      sendPdf: vi.fn(),
    },
  },
}))

vi.mock('@/store/toastStore', () => ({ useToastStore: vi.fn() }))

const mockedApi   = vi.mocked(ventasDisenoApi, true)
const mockedToast = vi.mocked(useToastStore)

function mockToast(showSpy: (msg: string, type?: 'success' | 'error') => void = vi.fn()) {
  mockedToast.mockImplementation(((selector?: (s: { show: typeof showSpy }) => unknown) => {
    const state = { show: showSpy }
    return selector ? selector(state) : state
  }) as never)
  return showSpy
}

function makeItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 1, reference: 'IL-DEC-1410A', factory_reference: null, name: 'Lámpara Colgante Decorativa', description: 'Lámpara colgante LED', brand: '770 Lights',
    photo_url: null, price_full: 522, category: 'candelabros_colgantes', family_id: null, family_name: null,
    disponible: 14, en_camino: 0, has_technical_sheet: false, technical_sheet_filename: null,
    technical_sheet_uploaded_at: null,
    ...overrides,
  }
}

function makeResult(overrides: Partial<CatalogListResult> = {}): CatalogListResult {
  return {
    data: [makeItem()],
    meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    categories: [{ value: 'candelabros_colgantes', count: 1 }],
    families: [],
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <VentasDisenoCatalogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.catalog.list.mockResolvedValue(makeResult())
  mockToast()
  useAuthStore.setState({ user: null })
})

describe('VentasDisenoCatalogPage', () => {
  it('muestra el título de la pantalla', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:catalog.pageTitle')).toBeInTheDocument()
  })

  it('renderiza los productos en cuadrícula por defecto, con badge "sin ficha"', async () => {
    renderPage()
    expect(await screen.findByText('IL-DEC-1410A · 770 Lights')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:catalogScreen.badge.missing')).toBeInTheDocument()
  })

  // Criterio duro REQ-615 Escenario 1 — nunca debe verse costo/margen en ningún lado del render.
  it('nunca renderiza costo ni margen', async () => {
    mockedApi.catalog.list.mockResolvedValue(makeResult({
      data: [makeItem({ description: 'Lámpara test' })],
    }))
    renderPage()
    await screen.findByText('Lámpara test')
    expect(screen.queryByText(/cost/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/margen/i)).not.toBeInTheDocument()
  })

  it('badge "Ficha" cuando el producto tiene ficha técnica cargada', async () => {
    mockedApi.catalog.list.mockResolvedValue(makeResult({
      data: [makeItem({ has_technical_sheet: true, technical_sheet_filename: 'ficha.pdf' })],
    }))
    renderPage()
    expect(await screen.findByText('ventasDiseno:catalogScreen.badge.ok')).toBeInTheDocument()
  })

  it('cambiar a vista Lista no reinicia el buscador (mismo estado, otro render)', async () => {
    renderPage()
    await screen.findByText('IL-DEC-1410A · 770 Lights')

    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:catalogScreen.filters.searchPlaceholder'), {
      target: { value: 'lampara' },
    })
    await waitFor(() => expect(mockedApi.catalog.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'lampara' })))

    fireEvent.click(screen.getByText('ventasDiseno:catalogScreen.view.list'))

    // El texto del buscador sigue igual tras cambiar de vista.
    expect(screen.getByPlaceholderText('ventasDiseno:catalogScreen.filters.searchPlaceholder')).toHaveValue('lampara')
  })

  it('REQ-619 — "Enviar seleccionados" solo se habilita con ≥1 seleccionado, "Enviar catálogo completo" siempre habilitado', async () => {
    renderPage()
    await screen.findByText('IL-DEC-1410A · 770 Lights')

    const sendSelected = screen.getByText('ventasDiseno:catalogScreen.actions.sendSelected').closest('button')
    const sendFull      = screen.getByText('ventasDiseno:catalogScreen.actions.sendFull').closest('button')
    expect(sendSelected).toBeDisabled()
    expect(sendFull).not.toBeDisabled()

    const checkboxes = screen.getAllByRole('checkbox')
    // El primer checkbox es "Seleccionar todo"; el segundo es el del producto.
    fireEvent.click(checkboxes[1])

    expect(screen.getByText('ventasDiseno:catalogScreen.selectedCount:1')).toBeInTheDocument()
    expect(sendSelected).not.toBeDisabled()
  })

  it('REQ-619 RN1 — "Seleccionar todo" selecciona solo los productos visibles según filtros', async () => {
    mockedApi.catalog.list.mockResolvedValue(makeResult({
      data: [makeItem({ id: 1, reference: 'A-1' }), makeItem({ id: 2, reference: 'A-2' })],
    }))
    renderPage()
    await screen.findByText('A-1 · 770 Lights')

    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(await screen.findByText('ventasDiseno:catalogScreen.selectedCount:2')).toBeInTheDocument()
  })

  it('SCRUM-754 — "Seleccionar todo" trae el universo filtrado completo aparte, no solo la página actual', async () => {
    // La página actual (lo que ya se renderiza) trae 1 producto; el universo filtrado completo
    // (per_page=all, mismos filtros) trae 3 — "Seleccionar todo" debe contar los 3, no solo el 1
    // ya visible en pantalla.
    mockedApi.catalog.list.mockImplementation(filters =>
      Promise.resolve(makeResult({
        data: filters?.per_page === 'all'
          ? [makeItem({ id: 1 }), makeItem({ id: 2 }), makeItem({ id: 3 })]
          : [makeItem({ id: 1 })],
      })),
    )
    renderPage()
    await screen.findByText('IL-DEC-1410A · 770 Lights')

    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(await screen.findByText('ventasDiseno:catalogScreen.selectedCount:3')).toBeInTheDocument()
  })

  it('SCRUM-754 — cambiar un filtro limpia la selección (RN1: selección solo aplica al filtro activo)', async () => {
    mockedApi.catalog.list.mockResolvedValue(makeResult())
    renderPage()
    await screen.findByText('IL-DEC-1410A · 770 Lights')

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    expect(screen.getByText('ventasDiseno:catalogScreen.selectedCount:1')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:catalogScreen.filters.searchPlaceholder'), {
      target: { value: 'lampara' },
    })
    expect(screen.getByText('ventasDiseno:catalogScreen.selectedCount:0')).toBeInTheDocument()
  })

  it('SCRUM-702 — "Enviar catálogo completo" dispara la descarga con mode:completo y sin product_ids', async () => {
    const showSpy = mockToast()
    mockedApi.catalog.sendPdf.mockResolvedValue(undefined)
    renderPage()
    await screen.findByText('IL-DEC-1410A · 770 Lights')

    fireEvent.click(screen.getByText('ventasDiseno:catalogScreen.actions.sendFull'))

    await waitFor(() => expect(mockedApi.catalog.sendPdf).toHaveBeenCalledWith('completo', undefined))
    await waitFor(() => expect(showSpy).toHaveBeenCalledWith('ventasDiseno:catalogScreen.sendSuccess', 'success'))
  })

  it('SCRUM-702 — "Enviar seleccionados" dispara la descarga con mode:seleccionados y los ids marcados', async () => {
    mockedApi.catalog.list.mockResolvedValue(makeResult({
      data: [makeItem({ id: 1, reference: 'A-1' }), makeItem({ id: 2, reference: 'A-2' })],
    }))
    mockedApi.catalog.sendPdf.mockResolvedValue(undefined)
    renderPage()
    await screen.findByText('A-1 · 770 Lights')

    const checkboxes = screen.getAllByRole('checkbox')
    // checkboxes[0] es "Seleccionar todo"; [1] y [2] son los de cada producto — marcamos solo id 2.
    fireEvent.click(checkboxes[2])

    fireEvent.click(screen.getByText('ventasDiseno:catalogScreen.actions.sendSelected'))
    await waitFor(() => expect(mockedApi.catalog.sendPdf).toHaveBeenCalledWith('seleccionados', [2]))
  })

  it('SCRUM-702 — error al generar el PDF muestra toast de error', async () => {
    const showSpy = mockToast()
    mockedApi.catalog.sendPdf.mockRejectedValue(new Error('fail'))
    renderPage()
    await screen.findByText('IL-DEC-1410A · 770 Lights')

    fireEvent.click(screen.getByText('ventasDiseno:catalogScreen.actions.sendFull'))
    await waitFor(() => expect(showSpy).toHaveBeenCalledWith('ventasDiseno:catalogScreen.sendError', 'error'))
  })

  it('REQ-620 — botones de Inventario navegan a las rutas reales', async () => {
    renderPage()
    await screen.findByText('IL-DEC-1410A · 770 Lights')

    fireEvent.click(screen.getByText('ventasDiseno:catalogScreen.actions.inventoryCompras'))
    expect(mockNavigate).toHaveBeenCalledWith('/inventario')

    fireEvent.click(screen.getByText('ventasDiseno:catalogScreen.actions.inventoryBodega'))
    expect(mockNavigate).toHaveBeenCalledWith('/bodega/inventario')
  })

  it('SCRUM-785 — Vendedor/Diseñador no ve el atajo "Inventario de Bodega", pero sí "Inventario de Compras"', async () => {
    useAuthStore.setState({ user: { id: 1, first_name: 'V', last_name: 'D', email: 'v@t.com', role: 'vendedor_disenador', permissions: [], modules: {} } })
    renderPage()
    await screen.findByText('IL-DEC-1410A · 770 Lights')

    expect(screen.queryByText('ventasDiseno:catalogScreen.actions.inventoryBodega')).not.toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:catalogScreen.actions.inventoryCompras')).toBeInTheDocument()
  })

  it('clic en un producto abre el detalle con aviso de ficha faltante', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('IL-DEC-1410A · 770 Lights'))

    expect(await screen.findByText('ventasDiseno:catalogScreen.detail.missingWarning')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:catalogScreen.detail.uploadButton')).toBeInTheDocument()
  })

  it('detalle con ficha cargada muestra "Ver documento" y abre presigned URL', async () => {
    mockedApi.catalog.list.mockResolvedValue(makeResult({
      data: [makeItem({ has_technical_sheet: true, technical_sheet_filename: 'ficha.pdf' })],
    }))
    mockedApi.catalog.technicalSheetUrl.mockResolvedValue({ url: 'https://s3.example/presigned' })
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    renderPage()
    fireEvent.click(await screen.findByText('IL-DEC-1410A · 770 Lights'))

    fireEvent.click(await screen.findByText('ventasDiseno:catalogScreen.detail.viewDocument'))
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://s3.example/presigned', '_blank', 'noopener'))
  })

  it('REQ-618 RN4 — subir ficha técnica exitosa actualiza el badge sin recargar', async () => {
    mockedApi.catalog.uploadTechnicalSheet.mockResolvedValue({
      id: 1, has_technical_sheet: true, technical_sheet_filename: 'nueva-ficha.pdf', technical_sheet_uploaded_at: '2026-07-31T00:00:00Z',
    })

    renderPage()
    fireEvent.click(await screen.findByText('IL-DEC-1410A · 770 Lights'))
    fireEvent.click(await screen.findByText('ventasDiseno:catalogScreen.detail.uploadButton'))

    const file = new File(['x'], 'nueva-ficha.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    // Tras subir con éxito, la query se refetchea con el producto ya con ficha — segunda
    // respuesta simula el estado actualizado del backend.
    mockedApi.catalog.list.mockResolvedValue(makeResult({
      data: [makeItem({ has_technical_sheet: true, technical_sheet_filename: 'nueva-ficha.pdf' })],
    }))
    fireEvent.click(screen.getByText('ventasDiseno:catalogScreen.upload.save'))

    await waitFor(() => expect(mockedApi.catalog.uploadTechnicalSheet).toHaveBeenCalledWith(1, file))
  })
})
