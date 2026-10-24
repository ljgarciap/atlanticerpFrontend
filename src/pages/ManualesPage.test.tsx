import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ManualesPage from './ManualesPage'
import { manualesApi } from '@/api/manualesApi'
import type { Manual } from '@/types/manuales'

// t devuelve la clave (+ los parámetros serializados, para poder afirmar interpolaciones).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}))

let canManage = false
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => canManage }))

vi.mock('@/api/manualesApi', () => ({
  manualesApi: {
    list: vi.fn(), getUrl: vi.fn(), getConfig: vi.fn(),
    initUpload: vi.fn(), finalizeUpload: vi.fn(), remove: vi.fn(),
  },
}))

const api = vi.mocked(manualesApi)

const DATA: Manual[] = [
  { id: '1', name: 'Guía de pedidos', module: 'bodega', type: 'pdf', size_bytes: 2 * 1024 * 1024, created_at: '2026-09-10T10:00:00Z' },
  { id: '2', name: 'Conteo general', module: 'bodega', type: 'video', size_bytes: 120 * 1024 * 1024, created_at: '2026-09-05T10:00:00Z' },
  { id: '3', name: 'Órdenes de compra', module: 'compras', type: 'pdf', size_bytes: 500 * 1024, created_at: '2026-09-01T10:00:00Z' },
]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ManualesPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  canManage = false
  api.list.mockResolvedValue(DATA)
  api.getConfig.mockResolvedValue({
    max_pdf_bytes: 50 * 1024 * 1024, max_video_bytes: 500 * 1024 * 1024,
    allowed_extensions: ['pdf', 'mp4', 'webm'], modules: [],
  })
})

describe('ManualesPage', () => {
  it('lista todos los manuales por defecto con el filtro en "Todos"', async () => {
    renderPage()
    expect(await screen.findByText('Guía de pedidos')).toBeInTheDocument()
    expect(screen.getByText('Conteo general')).toBeInTheDocument()
    expect(screen.getByText('Órdenes de compra')).toBeInTheDocument()
    expect(screen.getByText(/manuales:count/)).toHaveTextContent('"count":3')
    expect(screen.getByLabelText('manuales:filters.module')).toHaveValue('all')
    expect(screen.getByRole('button', { name: 'manuales:filters.typeAll' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('el selector de módulo ofrece Todos + los 7 módulos del ticket', async () => {
    renderPage()
    await screen.findByText('Guía de pedidos')
    const options = within(screen.getByLabelText('manuales:filters.module')).getAllByRole('option')
    expect(options).toHaveLength(8)
  })

  it('al elegir un módulo muestra solo sus manuales', async () => {
    renderPage()
    await screen.findByText('Guía de pedidos')
    await userEvent.selectOptions(screen.getByLabelText('manuales:filters.module'), 'compras')
    expect(screen.getByText('Órdenes de compra')).toBeInTheDocument()
    expect(screen.queryByText('Guía de pedidos')).not.toBeInTheDocument()
  })

  it('un módulo sin manuales muestra el mensaje vacío del ticket', async () => {
    renderPage()
    await screen.findByText('Guía de pedidos')
    await userEvent.selectOptions(screen.getByLabelText('manuales:filters.module'), 'gerencia')
    expect(screen.getByText('manuales:empty.module')).toBeInTheDocument()
  })

  it('el filtro de tipo marca aria-pressed y filtra', async () => {
    renderPage()
    await screen.findByText('Guía de pedidos')
    await userEvent.click(screen.getByRole('button', { name: 'manuales:filters.typeVideo' }))
    expect(screen.getByRole('button', { name: 'manuales:filters.typeVideo' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Conteo general')).toBeInTheDocument()
    expect(screen.queryByText('Guía de pedidos')).not.toBeInTheDocument()
  })

  it('búsqueda sin resultados muestra el mensaje y "Limpiar filtros" restablece', async () => {
    renderPage()
    await screen.findByText('Guía de pedidos')
    await userEvent.type(screen.getByLabelText('manuales:filters.search'), 'zzz')
    expect(await screen.findByText('manuales:empty.search')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'manuales:filters.clear' }))
    expect(await screen.findByText('Guía de pedidos')).toBeInTheDocument()
  })

  it('catálogo vacío: mensaje propio y sin botón de subir para quien no administra', async () => {
    api.list.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('manuales:empty.catalog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'manuales:admin.upload' })).not.toBeInTheDocument()
  })

  it('error de carga muestra el mensaje y Reintentar vuelve a pedir', async () => {
    api.list.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    expect(await screen.findByText('manuales:error.load')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'manuales:retry' }))
    expect(await screen.findByText('Guía de pedidos')).toBeInTheDocument()
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('sin manuales.manage no existe el botón Administrar ni el panel, ni se pide la config', async () => {
    renderPage()
    await screen.findByText('Guía de pedidos')
    expect(screen.queryByRole('button', { name: /manuales:admin.button/ })).not.toBeInTheDocument()
    expect(document.getElementById('manuales-admin-panel')).toBeNull()
    expect(api.getConfig).not.toHaveBeenCalled()
  })

  it('con manuales.manage aparece Administrar y despliega el panel (aria-expanded)', async () => {
    canManage = true
    renderPage()
    // Con permiso, el nombre aparece también en la lista de "publicados" del panel.
    await screen.findAllByText('Guía de pedidos')
    const toggle = screen.getByRole('button', { name: /manuales:admin.button/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('manuales-admin-panel')).toHaveAttribute('hidden')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(document.getElementById('manuales-admin-panel')).not.toHaveAttribute('hidden'))
  })

  it('Ver en un PDF pide la URL y abre pestaña nueva; si el navegador bloquea el popup muestra error', async () => {
    api.getUrl.mockResolvedValue({ url: 'https://s3.example/x.pdf', expires_at: '2026-09-30T00:00:00Z' })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ opener: 'x' } as unknown as Window)
    renderPage()
    await screen.findByText('Guía de pedidos')
    await userEvent.click(screen.getByRole('button', { name: 'card.viewAria {"name":"Guía de pedidos"}' }))
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://s3.example/x.pdf', '_blank'))
    expect(api.getUrl).toHaveBeenCalledWith('1', 'ver')
    openSpy.mockRestore()
  })
})
