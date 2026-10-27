import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CatalogsPanel from './CatalogsPanel'
import { catalogsApi } from '@/api/catalogsApi'
import type { CatalogEntry } from '@/types/catalogs'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, o?: { defaultValue?: string }) => o?.defaultValue ?? key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/catalogsApi', () => ({
  catalogsApi: { domains: vi.fn(), adminList: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), list: vi.fn() },
}))

const api = vi.mocked(catalogsApi, true)

const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
  id: 1, domain: 'provider_category', key: 'locales', label: 'Locales', sort_order: 0, is_active: true, is_system: true,
  props: { origen: 'local', valida_identificacion: true }, ...over,
})

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><CatalogsPanel /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.domains.mockResolvedValue([{
    domain: 'provider_category', label: 'Categorías de proveedor',
    props: { origen: { type: 'enum', values: ['local', 'internacional'], default: 'internacional' }, valida_identificacion: { type: 'bool', default: false } },
  }])
  api.adminList.mockResolvedValue([entry({}), entry({ id: 9, key: 'mayorista', label: 'Mayorista', is_system: false, props: {} })])
})

describe('CatalogsPanel', () => {
  it('lista las entradas del primer dominio; las de sistema no se pueden borrar', async () => {
    renderPanel()
    expect(await screen.findByDisplayValue('Locales')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Mayorista')).toBeInTheDocument()
    expect(screen.getAllByText('globalSettings.catalogsTab.system')).toHaveLength(1)
    expect(screen.getAllByText('globalSettings.catalogsTab.delete')).toHaveLength(1)
  })

  it('guarda la etiqueta y las propiedades de comportamiento de una entrada', async () => {
    api.update.mockResolvedValue(entry({ label: 'Nacionales' }))
    renderPanel()
    fireEvent.change(await screen.findByDisplayValue('Locales'), { target: { value: 'Nacionales' } })
    fireEvent.click(screen.getAllByText('globalSettings.catalogsTab.save')[0])
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('provider_category', 1, {
      label: 'Nacionales', sort_order: 0, props: { origen: 'local', valida_identificacion: true },
    }))
  })

  it('crea una entrada nueva con sus propiedades', async () => {
    api.create.mockResolvedValue(entry({ id: 10, key: 'importador', label: 'Importador', is_system: false }))
    renderPanel()
    await screen.findByDisplayValue('Locales')
    fireEvent.change(screen.getByPlaceholderText('globalSettings.catalogsTab.newKey'), { target: { value: 'importador' } })
    fireEvent.change(screen.getByPlaceholderText('globalSettings.catalogsTab.newLabel'), { target: { value: 'Importador' } })
    fireEvent.click(screen.getByText('globalSettings.catalogsTab.add'))
    await waitFor(() => expect(api.create).toHaveBeenCalledWith('provider_category', { key: 'importador', label: 'Importador', props: {} }))
  })

  it('muestra el motivo cuando el backend rechaza el borrado', async () => {
    api.remove.mockRejectedValue({ isAxiosError: true, response: { data: { message: 'Hay registros que la usan.' } } })
    renderPanel()
    await screen.findByDisplayValue('Mayorista')
    fireEvent.click(screen.getByText('globalSettings.catalogsTab.delete'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/globalSettings.catalogsTab.deleteError|Hay registros/)
  })
})
