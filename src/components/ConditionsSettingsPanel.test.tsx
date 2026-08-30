import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ConditionsSettingsPanel from './ConditionsSettingsPanel'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    quoteConditionsSettings: { get: vi.fn(), update: vi.fn() },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConditionsSettingsPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.quoteConditionsSettings.get.mockResolvedValue({ text: 'Texto por defecto' })
})

describe('ConditionsSettingsPanel', () => {
  it('carga el texto configurado', async () => {
    renderPanel()
    expect(await screen.findByDisplayValue('Texto por defecto')).toBeInTheDocument()
  })

  it('el botón Guardar solo aparece cuando el texto cambió', async () => {
    renderPanel()
    await screen.findByDisplayValue('Texto por defecto')

    expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('Texto por defecto'), { target: { value: 'Texto nuevo' } })
    expect(screen.getByText('common:actions.save')).toBeInTheDocument()
  })

  it('guarda el texto actualizado', async () => {
    mockedApi.quoteConditionsSettings.update.mockResolvedValue({ text: 'Texto nuevo' })
    renderPanel()
    await screen.findByDisplayValue('Texto por defecto')

    fireEvent.change(screen.getByDisplayValue('Texto por defecto'), { target: { value: 'Texto nuevo' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.quoteConditionsSettings.update).toHaveBeenCalledWith({ text: 'Texto nuevo' }))
  })
})
