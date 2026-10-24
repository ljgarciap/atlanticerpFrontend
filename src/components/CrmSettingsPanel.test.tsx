import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CrmSettingsPanel from './CrmSettingsPanel'
import { projectsApi } from '@/api/projectsApi'
import type { CrmSettings } from '@/types/project'

// SCRUM-944/945 — umbrales de CRM antes hardcodeados (addDays(3)/subDays(7)/subDays(21)
// duplicados en DashboardService/ProjectService), migrados a crm_settings.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/projectsApi', () => ({
  projectsApi: {
    settings: { get: vi.fn(), update: vi.fn() },
  },
}))

const mockedApi = vi.mocked(projectsApi, true)

function makeSettings(overrides: Partial<CrmSettings> = {}): CrmSettings {
  return {
    entrega_proxima_dias: 3, freshness_recent_dias: 7, freshness_stale_dias: 21,
    // Fase 1 — valores distintos a propósito (`getByDisplayValue`).
    pipeline_estancado_dias: 16, cliente_contacto_obsoleto_dias: 61,
    // SCRUM-998 — valores distintos de los de arriba a propósito (`getByDisplayValue` no puede repetir un valor).
    catalog_pdf_max_single_products: 500, catalog_pdf_max_single_photos: 200, catalog_pdf_volume_size: 250, catalog_pdf_export_retention_days: 14,
    ...overrides,
  }
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CrmSettingsPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.settings.get.mockResolvedValue(makeSettings())
})

describe('CrmSettingsPanel', () => {
  it('carga los valores configurados', async () => {
    renderPanel()

    expect(await screen.findByDisplayValue('3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('7')).toBeInTheDocument()
    expect(screen.getByDisplayValue('21')).toBeInTheDocument()
  })

  it('el botón Guardar solo aparece cuando un valor cambió', async () => {
    renderPanel()
    await screen.findByDisplayValue('3')

    expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '10' } })
    expect(screen.getByText('common:actions.save')).toBeInTheDocument()
  })

  it('guarda los valores actualizados', async () => {
    mockedApi.settings.update.mockResolvedValue(makeSettings({ entrega_proxima_dias: 10 }))
    renderPanel()
    await screen.findByDisplayValue('3')

    fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '10' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.settings.update).toHaveBeenCalledWith({
      entrega_proxima_dias: 10, freshness_recent_dias: 7, freshness_stale_dias: 21,
      pipeline_estancado_dias: 16, cliente_contacto_obsoleto_dias: 61,
      catalog_pdf_max_single_products: 500, catalog_pdf_max_single_photos: 200, catalog_pdf_volume_size: 250, catalog_pdf_export_retention_days: 14,
    }))
  })

  // SCRUM-998 — umbrales del PDF de Catálogo (PDF plano hasta el máximo; ZIP de volúmenes en segundo plano por encima).
  it('SCRUM-998 — carga y guarda los cuatro umbrales del PDF de Catálogo', async () => {
    mockedApi.settings.update.mockResolvedValue(makeSettings({ catalog_pdf_max_single_products: 800 }))
    renderPanel()

    expect(await screen.findByDisplayValue('500')).toBeInTheDocument()
    expect(screen.getByDisplayValue('250')).toBeInTheDocument()
    expect(screen.getByDisplayValue('14')).toBeInTheDocument()
    expect(screen.getByDisplayValue('200')).toBeInTheDocument()
    expect(screen.getByText('crm:settings.fields.catalogPdfMaxSingleProducts')).toBeInTheDocument()
    expect(screen.getByText('crm:settings.fields.catalogPdfMaxSinglePhotos')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('500'), { target: { value: '800' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.settings.update).toHaveBeenCalledWith({
      entrega_proxima_dias: 3, freshness_recent_dias: 7, freshness_stale_dias: 21,
      pipeline_estancado_dias: 16, cliente_contacto_obsoleto_dias: 61,
      catalog_pdf_max_single_products: 800, catalog_pdf_max_single_photos: 200, catalog_pdf_volume_size: 250, catalog_pdf_export_retention_days: 14,
    }))
  })

  it('SCRUM-998 — un 422 del volumen del ZIP se muestra junto a su campo', async () => {
    mockedApi.settings.update.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'Inválido.', errors: { catalog_pdf_volume_size: ['Debe ser al menos 50.'] } } },
    })
    renderPanel()
    await screen.findByDisplayValue('250')

    fireEvent.change(screen.getByDisplayValue('250'), { target: { value: '10' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    expect(await screen.findByText('Debe ser al menos 50.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('10')).toBeInTheDocument()
  })

  // Pre-QA SCRUM-945 (hallazgo B): el backend respondía 422 y la UI no mostraba nada.
  it('muestra el error del backend junto al campo cuando responde 422', async () => {
    mockedApi.settings.update.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'The given data was invalid.', errors: { entrega_proxima_dias: ['Debe ser al menos 1.'] } } },
    })
    renderPanel()
    await screen.findByDisplayValue('3')

    fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '0' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    expect(await screen.findByText('Debe ser al menos 1.')).toBeInTheDocument()
    // El valor rechazado no se descarta: el usuario puede corregirlo sin reescribir.
    expect(screen.getByDisplayValue('0')).toBeInTheDocument()
  })

  it('muestra TODOS los mensajes del campo, no solo el primero', async () => {
    mockedApi.settings.update.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'Inválido.', errors: { freshness_recent_dias: ['Debe ser al menos 1.', 'Debe ser menor que el umbral de proyecto frío.'] } } },
    })
    renderPanel()
    await screen.findByDisplayValue('3')

    fireEvent.change(screen.getByDisplayValue('7'), { target: { value: '60' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    expect(await screen.findByText(/Debe ser al menos 1\..*Debe ser menor que el umbral de proyecto frío\./)).toBeInTheDocument()
  })

  it('muestra el mensaje general del backend si el 422 no trae errores por campo', async () => {
    mockedApi.settings.update.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'La ventana reciente debe ser menor que la de proyecto frío.' } },
    })
    renderPanel()
    await screen.findByDisplayValue('3')

    fireEvent.change(screen.getByDisplayValue('7'), { target: { value: '60' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    expect(await screen.findByText('La ventana reciente debe ser menor que la de proyecto frío.')).toBeInTheDocument()
  })

  it('muestra un mensaje genérico ante un error que no es de validación', async () => {
    mockedApi.settings.update.mockRejectedValue(new Error('Network Error'))
    renderPanel()
    await screen.findByDisplayValue('3')

    fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '10' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    expect(await screen.findByText('crm:settings.saveError')).toBeInTheDocument()
  })

  it('el error desaparece al volver a editar', async () => {
    mockedApi.settings.update.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'Inválido.' } },
    })
    renderPanel()
    await screen.findByDisplayValue('3')

    fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '0' } })
    fireEvent.click(screen.getByText('common:actions.save'))
    await screen.findByText('Inválido.')

    fireEvent.change(screen.getByDisplayValue('0'), { target: { value: '5' } })
    await waitFor(() => expect(screen.queryByText('Inválido.')).not.toBeInTheDocument())
  })
})
