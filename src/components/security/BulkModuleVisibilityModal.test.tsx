import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BulkModuleVisibilityModal from './BulkModuleVisibilityModal'
import { usersApi, type UatVisibilityState } from '@/api/usersApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/usersApi', async () => {
  const actual = await vi.importActual<typeof import('@/api/usersApi')>('@/api/usersApi')
  return { ...actual, usersApi: { moduleVisibility: { bulk: { get: vi.fn(), set: vi.fn() } } } }
})

const mockedApi = vi.mocked(usersApi, true)

function emptyState(overrides: Partial<UatVisibilityState> = {}): UatVisibilityState {
  return { hidden_modules: [], hidden_menu_items: [], ...overrides }
}

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BulkModuleVisibilityModal onClose={onClose} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BulkModuleVisibilityModal (SCRUM-739)', () => {
  it('precarga el checklist con lo que ya está oculto según el GET', async () => {
    mockedApi.moduleVisibility.bulk.get.mockResolvedValue(emptyState({
      hidden_modules:    ['compras'],
      hidden_menu_items: [{ module: 'configuracion', key: 'root' }],
    }))
    renderModal()

    // El label aparece en el render donde isLoading pasa a false; el checked=true recién
    // llega en un SEGUNDO render, disparado por el useEffect que hidrata selectedModules/
    // selectedItems desde `data`. Afirmar `.checked` sin esperar ese segundo render es la
    // misma carrera que hizo flaky a "restaurar" más abajo — se espera explícitamente con
    // waitFor en vez de asumir que ya se resolvió para cuando el label es visible.
    const comprasLabel = (await screen.findByText('security:roles.modules.compras')).closest('label') as HTMLLabelElement
    await waitFor(() => expect((comprasLabel.querySelector('input') as HTMLInputElement).checked).toBe(true))

    const configLabel = screen.getByText('security:users.bulkVisibility.configuracion').closest('label') as HTMLLabelElement
    await waitFor(() => expect((configLabel.querySelector('input') as HTMLInputElement).checked).toBe(true))
  })

  it('sin nada seleccionado, Ocultar/Restaurar muestra el aviso, no llama a la API', async () => {
    mockedApi.moduleVisibility.bulk.get.mockResolvedValue(emptyState())
    renderModal()

    await screen.findByText('security:roles.modules.compras')
    fireEvent.click(screen.getByText('security:users.bulkVisibility.hide'))

    expect(await screen.findByText('security:users.bulkVisibility.selectAtLeastOne')).toBeInTheDocument()
    expect(mockedApi.moduleVisibility.bulk.set).not.toHaveBeenCalled()
  })

  it('ocultar con módulos y accesos marcados envía el payload correcto', async () => {
    mockedApi.moduleVisibility.bulk.get.mockResolvedValue(emptyState())
    mockedApi.moduleVisibility.bulk.set.mockResolvedValue(emptyState({
      hidden_modules:    ['compras', 'bodega'],
      hidden_menu_items: [{ module: 'ventas_diseno', key: 'catalogo_inventario_compras' }],
    }))
    renderModal()

    await screen.findByText('security:roles.modules.compras')
    fireEvent.click(screen.getByText('security:roles.modules.compras'))
    fireEvent.click(screen.getByText('security:roles.modules.bodega'))
    fireEvent.click(screen.getByText('security:users.bulkVisibility.catalogInventoryCompras'))

    fireEvent.click(screen.getByText('security:users.bulkVisibility.hide'))

    await waitFor(() => expect(mockedApi.moduleVisibility.bulk.set).toHaveBeenCalledWith({
      modules:   ['compras', 'bodega'],
      menuItems: [{ module: 'ventas_diseno', key: 'catalogo_inventario_compras' }],
      action:    'hide',
    }))
    expect(await screen.findByText('security:users.bulkVisibility.hideSuccess')).toBeInTheDocument()
  })

  it('restaurar envía action=restore con la misma selección', async () => {
    mockedApi.moduleVisibility.bulk.get.mockResolvedValue(emptyState({ hidden_modules: ['servicios'] }))
    mockedApi.moduleVisibility.bulk.set.mockResolvedValue(emptyState())
    renderModal()

    // Flaky en CI (2026-08-16): el label "servicios" ya está en el DOM en el render donde
    // isLoading pasa a false, pero selectedModules recién se hidrata en un SEGUNDO render
    // (el useEffect que lee `data`). Clickear "Restaurar" apenas aparece el label podía
    // disparar la mutación con selectedModules aún vacío — se espera el checkbox
    // efectivamente marcado antes de clickear, no solo la presencia del texto.
    const label = (await screen.findByText('security:roles.modules.servicios')).closest('label') as HTMLLabelElement
    await waitFor(() => expect((label.querySelector('input') as HTMLInputElement).checked).toBe(true))
    fireEvent.click(screen.getByText('security:users.bulkVisibility.restore'))

    await waitFor(() => expect(mockedApi.moduleVisibility.bulk.set).toHaveBeenCalledWith({
      modules:   ['servicios'],
      menuItems: [],
      action:    'restore',
    }))
    expect(await screen.findByText('security:users.bulkVisibility.restoreSuccess')).toBeInTheDocument()
  })

  it('SCRUM-785 — muestra el estado real (Oculto/Visible) por fila, independiente del checkbox', async () => {
    mockedApi.moduleVisibility.bulk.get.mockResolvedValue(emptyState({
      hidden_modules:    ['compras'],
      hidden_menu_items: [{ module: 'ventas_diseno', key: 'catalogo_inventario_bodega' }],
    }))
    renderModal()

    const comprasLabel = (await screen.findByText('security:roles.modules.compras')).closest('label') as HTMLLabelElement
    await waitFor(() => expect(comprasLabel).toHaveTextContent('security:users.bulkVisibility.stateHidden'))

    const ventasLabel = (await screen.findByText('security:roles.modules.ventas_diseno')).closest('label') as HTMLLabelElement
    expect(ventasLabel).toHaveTextContent('security:users.bulkVisibility.stateVisible')

    const bodegaItemLabel = screen.getByText('security:users.bulkVisibility.catalogInventoryBodega').closest('label') as HTMLLabelElement
    expect(bodegaItemLabel).toHaveTextContent('security:users.bulkVisibility.stateHidden')
  })

  it('SCRUM-785 — restaurar algo que ya está visible no hace ningún cambio real y lo avisa', async () => {
    // Nada oculto de entrada: el checkbox de "compras" arranca destildado (no hay nada que
    // precargar), el superadmin lo marca a mano y aprieta Restaurar sobre algo que YA es visible.
    mockedApi.moduleVisibility.bulk.get.mockResolvedValue(emptyState())
    mockedApi.moduleVisibility.bulk.set.mockResolvedValue(emptyState())
    renderModal()

    fireEvent.click(await screen.findByText('security:roles.modules.compras'))
    fireEvent.click(screen.getByText('security:users.bulkVisibility.restore'))

    await waitFor(() => expect(mockedApi.moduleVisibility.bulk.set).toHaveBeenCalledWith({
      modules:   ['compras'],
      menuItems: [],
      action:    'restore',
    }))
    expect(await screen.findByText('security:users.bulkVisibility.noChanges')).toBeInTheDocument()
  })

  it('Cerrar no llama a la API', async () => {
    mockedApi.moduleVisibility.bulk.get.mockResolvedValue(emptyState())
    const onClose = vi.fn()
    renderModal(onClose)

    await screen.findByText('security:roles.modules.compras')
    fireEvent.click(screen.getByText('common:actions.close'))

    expect(onClose).toHaveBeenCalled()
    expect(mockedApi.moduleVisibility.bulk.set).not.toHaveBeenCalled()
  })
})
