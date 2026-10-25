import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NotificationRulesPage from './NotificationRulesPage'
import { notificationRulesApi, type NotificationRuleRegistry } from '@/api/notificationRulesApi'
import { usersApi } from '@/api/usersApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/notificationRulesApi', () => ({
  notificationRulesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

vi.mock('@/api/rolesApi', () => ({
  rolesApi: { list: vi.fn().mockResolvedValue([
    { id: 1, key: 'management', name: 'Gerencia', is_superadmin: false, is_system: true, is_active: true, default_security_level_id: null },
    { id: 2, key: 'vendedor_disenador', name: 'Vendedor/Diseñador', is_superadmin: false, is_system: true, is_active: true, default_security_level_id: null },
  ]) },
}))

vi.mock('@/api/usersApi', () => ({
  usersApi: {
    list: vi.fn(),
  },
}))

const mockedRules = vi.mocked(notificationRulesApi)
const mockedUsers = vi.mocked(usersApi)

const REGISTRY: NotificationRuleRegistry = {
  models: { Project: ['etapa', 'valor'], ProjectActivity: ['tipo'] },
  operators: ['changed', 'changed_to', 'equals', 'gt', 'lt', 'gte', 'lte'],
  recipient_types: ['user', 'role', 'project_assignees'],
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationRulesPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedRules.list.mockResolvedValue({ data: [], registry: REGISTRY })
  mockedUsers.list.mockResolvedValue({
    data: [{ id: 1, first_name: 'Ana', last_name: 'Diaz' } as never],
    meta: { total: 1, per_page: 100, current_page: 1, last_page: 1 },
  })
})

describe('NotificationRulesPage', () => {
  it('muestra el estado vacío cuando no hay reglas', async () => {
    renderPage()
    expect(await screen.findByText('security:notificationRules.table.empty')).toBeInTheDocument()
  })

  it('lista las reglas existentes', async () => {
    mockedRules.list.mockResolvedValue({
      data: [{
        id: 1, name: 'Avisar cierre', trigger_type: 'model_event', trigger_model: 'Project',
        trigger_event: 'updated', field: 'etapa', operator: 'changed_to', value: 'cerrado',
        channels: ['in_app'], recipient_type: 'user', recipient_value: [1], is_active: true,
        created_at: '2026-01-01',
      }],
      registry: REGISTRY,
    })
    renderPage()
    expect(await screen.findByText('Avisar cierre')).toBeInTheDocument()
  })

  it('abre el formulario y el campo se limita a los del modelo elegido', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('security:notificationRules.actions.create'))

    const selects = await screen.findAllByRole('combobox')
    // selects[0] = modelo, selects[1] = evento, selects[2] = campo
    fireEvent.change(selects[0], { target: { value: 'Project' } })

    await waitFor(() => {
      const fieldSelect = screen.getAllByRole('combobox')[2]
      const options = Array.from(fieldSelect.querySelectorAll('option')).map(o => o.textContent)
      expect(options).toContain('etapa')
      expect(options).toContain('valor')
    })
  })

  it('Fase 2 — con destinatario «rol» ofrece los roles reales de la tabla (sin el enum legado)', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('security:notificationRules.actions.create'))

    const tipo = screen.getAllByRole('combobox').find(s => Array.from(s.querySelectorAll('option')).some(o => o.value === 'role')) as HTMLSelectElement
    fireEvent.change(tipo, { target: { value: 'role' } })

    expect(await screen.findByRole('button', { name: 'Vendedor/Diseñador' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gerencia' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /designer|supervisor|electrician/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Vendedor/Diseñador' }))
    fireEvent.change(screen.getByPlaceholderText('security:notificationRules.form.namePlaceholder'), { target: { value: 'Regla por rol' } })
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'Project' } })
    fireEvent.click(screen.getByText('common:actions.save'))
    // El valor guardado es la CLAVE del rol (lo que resuelve el backend con roles.key).
    await waitFor(() => expect(mockedRules.create).toHaveBeenCalled())
    expect(mockedRules.create.mock.calls[0][0].recipient_value).toEqual(['vendedor_disenador'])
  })

  it('crea una regla al guardar el formulario', async () => {
    mockedRules.create.mockResolvedValue({
      id: 2, name: 'Nueva regla', trigger_type: 'model_event', trigger_model: 'Project',
      trigger_event: 'updated', field: null, operator: null, value: null,
      channels: ['in_app'], recipient_type: 'user', recipient_value: [], is_active: true,
      created_at: '2026-01-01',
    })

    renderPage()
    fireEvent.click(await screen.findByText('security:notificationRules.actions.create'))

    const nameInput = screen.getByPlaceholderText('security:notificationRules.form.namePlaceholder')
    fireEvent.change(nameInput, { target: { value: 'Nueva regla' } })

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'Project' } }) // modelo

    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedRules.create).toHaveBeenCalled())
    const payload = mockedRules.create.mock.calls[0][0]
    expect(payload.name).toBe('Nueva regla')
    expect(payload.trigger_model).toBe('Project')
  })

  it('elimina una regla', async () => {
    mockedRules.list.mockResolvedValue({
      data: [{
        id: 5, name: 'A borrar', trigger_type: 'model_event', trigger_model: 'Project',
        trigger_event: 'updated', field: null, operator: null, value: null,
        channels: ['in_app'], recipient_type: 'user', recipient_value: [1], is_active: true,
        created_at: '2026-01-01',
      }],
      registry: REGISTRY,
    })
    mockedRules.remove.mockResolvedValue(undefined)

    renderPage()
    fireEvent.click(await screen.findByText('common:actions.delete'))

    await waitFor(() => expect(mockedRules.remove).toHaveBeenCalledWith(5))
  })
})
