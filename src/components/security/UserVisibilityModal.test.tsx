import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UserVisibilityModal from './UserVisibilityModal'
import { usersApi, type UserListItem, type UserModuleVisibilityResponse } from '@/api/usersApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/usersApi', async () => {
  const actual = await vi.importActual<typeof import('@/api/usersApi')>('@/api/usersApi')
  return { ...actual, usersApi: { moduleVisibility: { get: vi.fn(), update: vi.fn() } } }
})

const mockedApi = vi.mocked(usersApi, true)

function makeUser(overrides: Partial<UserListItem> = {}): UserListItem {
  return {
    id: 5, first_name: 'Juan', last_name: 'García', email: 'juan@atlantic.test', phone: null,
    is_active: true, mfa_enabled: false, notes: null, department: null, extra_permissions: [],
    security_level: { id: 3, level: 3, name: 'Nivel 3' }, roles: [],
    role_id: 1, additional_role_ids: [], approve_large_amounts: false, manage_users: false,
    ...overrides,
  }
}

function emptyVisibility(overrides: Partial<UserModuleVisibilityResponse> = {}): UserModuleVisibilityResponse {
  return { modules: [], menuItems: [], ...overrides }
}

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <UserVisibilityModal user={makeUser()} onClose={onClose} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UserVisibilityModal (SCRUM-724)', () => {
  it('sin overrides, todos los módulos arrancan en Ninguno y sin ítems marcados como ocultos', async () => {
    mockedApi.moduleVisibility.get.mockResolvedValue(emptyVisibility())
    renderModal()

    // Ver nota en el siguiente test sobre por qué se espera el heading de un módulo
    // (señal real) y no el texto de un botón de can_view (siempre presente).
    await screen.findByText('security:roles.modules.ventas_diseno')
    // Con can_view = None, los checkboxes de ítems quedan deshabilitados.
    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThan(0)
    checkboxes.forEach(cb => expect(cb).toBeDisabled())
  })

  it('hidrata el can_view existente del GET y habilita los checkboxes de ese módulo', async () => {
    mockedApi.moduleVisibility.get.mockResolvedValue(emptyVisibility({
      modules: [{ module: 'ventas_diseno', can_view: 2, can_view_team: false }],
    }))
    renderModal()

    // SCRUM-724 (flaky en CI, 2026-08-04): esperar el texto estático de un botón
    // ("Completo") no sincroniza con el estado real — los 3 botones de can_view se
    // renderizan igual sin importar si `rows` ya se hidrató. El heading del módulo,
    // en cambio, solo existe una vez que `rows[module]` está poblado (el componente
    // devuelve null por módulo hasta entonces) — es la señal real a esperar, no un
    // proxy. findByText reintenta hasta que aparece, checkboxes ya llegan con el
    // estado final en el mismo commit (mismo patrón que feedback_async_field_not_
    // covered_by_unrelated_findby.md / feedback_flaky_controlled_value_assertions.md).
    const heading = await screen.findByText('security:roles.modules.ventas_diseno')

    // Ubicar el bloque del módulo ventas_diseno vía su heading y verificar que sus
    // checkboxes de ítems quedaron habilitados (can_view != None).
    const moduleBlock = heading.parentElement as HTMLElement
    const checkboxes = within(moduleBlock).getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThan(0)
    checkboxes.forEach(cb => expect(cb).not.toBeDisabled())
  })

  it('un ítem con override visible=false en el GET aparece destildado', async () => {
    mockedApi.moduleVisibility.get.mockResolvedValue(emptyVisibility({
      modules: [{ module: 'ventas_diseno', can_view: 2, can_view_team: false }],
      menuItems: [{ module: 'ventas_diseno', key: 'quotes_list', visible: false }],
    }))
    renderModal()

    const heading = await screen.findByText('security:roles.modules.ventas_diseno')
    const moduleBlock = heading.parentElement as HTMLElement
    const label = within(moduleBlock).getByText('Cotizaciones').closest('label') as HTMLLabelElement
    const checkbox = within(label).getByRole('checkbox') as HTMLInputElement
    // Fix CI flaky 2026-08-13 (mismo patrón que feedback_ci_flaky_quotepage_tests): aunque
    // `rows`/`itemVisible` se setean en el mismo efecto batcheado y no se reprodujo en 20
    // corridas locales, un assert síncrono sobre `checked` sigue siendo el patrón exacto que ya
    // causó flakes reales en otros archivos bajo el timing de GitHub Actions — `waitFor` es
    // estrictamente más seguro sin costo real (el checkbox ya existe, solo tolera un tick más).
    await waitFor(() => expect(checkbox.checked).toBe(false))
  })

  it('guardar envía can_view por los 7 módulos completos y solo los ítems destildados', async () => {
    mockedApi.moduleVisibility.get.mockResolvedValue(emptyVisibility({
      modules: [{ module: 'ventas_diseno', can_view: 2, can_view_team: false }],
    }))
    mockedApi.moduleVisibility.update.mockResolvedValue(emptyVisibility())
    const onClose = vi.fn()
    renderModal(onClose)

    const heading = await screen.findByText('security:roles.modules.ventas_diseno')
    const moduleBlock = heading.parentElement as HTMLElement
    const label = within(moduleBlock).getByText('Cotizaciones').closest('label') as HTMLLabelElement
    fireEvent.click(within(label).getByRole('checkbox'))

    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.moduleVisibility.update).toHaveBeenCalled())
    const payload = mockedApi.moduleVisibility.update.mock.calls[0][1]
    expect(payload.modules).toHaveLength(7)
    expect(payload.menuItems).toEqual([{ module: 'ventas_diseno', key: 'quotes_list', visible: false }])
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('Cancelar cierra sin llamar a update', async () => {
    mockedApi.moduleVisibility.get.mockResolvedValue(emptyVisibility())
    const onClose = vi.fn()
    renderModal(onClose)

    await screen.findByText('security:roles.modules.ventas_diseno')
    fireEvent.click(screen.getByText('common:actions.cancel'))

    expect(onClose).toHaveBeenCalled()
    expect(mockedApi.moduleVisibility.update).not.toHaveBeenCalled()
  })
})
