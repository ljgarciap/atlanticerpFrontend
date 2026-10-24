import { MemoryRouter } from 'react-router-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LogsPage from './LogsPage'
import { auditLogsApi, type AuditLogEntry, type AuditLogsResult } from '@/api/auditLogsApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      const vals = Object.values(opts).filter(v => typeof v === 'string' || typeof v === 'number')
      return vals.length ? `${key}:${vals.join(',')}` : key
    },
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/auditLogsApi', () => ({
  auditLogsApi: { list: vi.fn(), entityTypes: vi.fn() },
}))

const mockedApi = vi.mocked(auditLogsApi, true)

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 1,
    action: 'servicios.ticket.updated',
    module: 'servicios',
    tipo: 'cambio_dato',
    entity_type: 'ticket',
    entity_id: '42',
    old_values: { estado: 'reported' },
    new_values: { estado: 'scheduled' },
    metadata: null,
    user: { id: 1, name: 'Lider Servicios Test' },
    created_at: '2026-08-25T12:00:00Z',
    ...overrides,
  }
}

function makeResult(overrides: Partial<AuditLogsResult> = {}): AuditLogsResult {
  return { data: [], current_page: 1, last_page: 1, total: 0, ...overrides }
}

function renderPage(initialEntry = '/auditoria/logs') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <LogsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.list.mockResolvedValue(makeResult())
  mockedApi.entityTypes.mockResolvedValue(['ticket', 'sub_client'])
})

describe('LogsPage', () => {
  it('muestra el título de la pantalla', async () => {
    renderPage()
    expect(await screen.findByText('logs:title')).toBeInTheDocument()
  })

  it('sin actividad muestra el mensaje vacío', async () => {
    renderPage()
    expect(await screen.findByText('logs:table.empty')).toBeInTheDocument()
  })

  it('muestra una fila con usuario, módulo, tipo, acción y el diff de campos', async () => {
    mockedApi.list.mockResolvedValue(makeResult({ data: [makeEntry()] }))
    renderPage()

    expect(await screen.findByText('Lider Servicios Test')).toBeInTheDocument()
    // Ambos textos también aparecen como <option> de sus respectivos <select> de filtro.
    expect(screen.getAllByText('logs:module.servicios').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('logs:filters.cambioDato').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('logs:action.updated')).toBeInTheDocument()
    expect(screen.getByText(/estado: "reported" → "scheduled"/)).toBeInTheDocument()
  })

  it('una acción sin escritura (sufijo distinto de created/updated/deleted) muestra el action crudo', async () => {
    mockedApi.list.mockResolvedValue(makeResult({
      data: [makeEntry({ action: 'servicios.ticket.pdf_downloaded', tipo: 'accion', old_values: null, new_values: null })],
    }))
    renderPage()

    expect(await screen.findByText('servicios.ticket.pdf_downloaded')).toBeInTheDocument()
    // 'logs:filters.accion' aparece 2 veces: la opción del <select> de tipo y la celda de la fila.
    expect(screen.getAllByText('logs:filters.accion').length).toBeGreaterThanOrEqual(2)
  })

  // SCRUM-814 — antes esta fila siempre mostraba "—" en "Cambios" pese a que el prompt sí estaba
  // capturado (ai.usage.requested nunca tiene old_values/new_values, solo metadata.prompt_preview).
  it('una fila de uso de IA muestra el preview del prompt en "Cambios", no un guion', async () => {
    mockedApi.list.mockResolvedValue(makeResult({
      data: [makeEntry({
        action: 'ai.usage.requested', module: 'ai', tipo: 'accion',
        entity_type: 'ai_analysis', entity_id: '9',
        old_values: null, new_values: null,
        metadata: { job: 'App\\Modules\\AI\\Jobs\\SummarizeJob', prompt_preview: 'Resumí el estado del proyecto X' },
      })],
    }))
    renderPage()

    expect(await screen.findByText('Resumí el estado del proyecto X')).toBeInTheDocument()
  })

  it('sin usuario (evento del sistema) muestra el texto de sistema', async () => {
    mockedApi.list.mockResolvedValue(makeResult({ data: [makeEntry({ user: null })] }))
    renderPage()

    expect(await screen.findByText('logs:table.systemUser')).toBeInTheDocument()
  })

  it('cambiar el filtro de módulo vuelve a pedir la lista con el filtro', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.list).toHaveBeenCalled())

    fireEvent.change(screen.getByDisplayValue('logs:filters.allModules'), { target: { value: 'compras' } })

    await waitFor(() => expect(mockedApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ module: 'compras' }),
    ))
  })

  it('cambiar el filtro de tipo vuelve a pedir la lista con el filtro', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.list).toHaveBeenCalled())

    fireEvent.change(screen.getByDisplayValue('logs:filters.allTipos'), { target: { value: 'accion' } })

    await waitFor(() => expect(mockedApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ tipo: 'accion' }),
    ))
  })

  it('SCRUM-813: el filtro de entidad es un select con las entidades conocidas, humanizadas', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.entityTypes).toHaveBeenCalled())

    const select = await screen.findByLabelText('logs:filters.entityType')
    expect(screen.getByRole('option', { name: 'Sub Client' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Ticket' })).toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'sub_client' } })

    await waitFor(() => expect(mockedApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ entity_type: 'sub_client' }),
    ))
  })

  it('la paginación pide la página siguiente', async () => {
    mockedApi.list.mockResolvedValue(makeResult({ data: [makeEntry()], current_page: 1, last_page: 2 }))
    renderPage()

    fireEvent.click(await screen.findByText('logs:pagination.next'))

    await waitFor(() => expect(mockedApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    ))
  })

  // SCRUM-1020 — el dashboard de actividad enlaza a Logs con filtros en la URL.
  it('toma los filtros iniciales de la URL (usuario, módulo, rango)', async () => {
    renderPage('/auditoria/logs?user_id=3&module=compras&from=2026-09-10&to=2026-09-12')

    await waitFor(() => expect(mockedApi.list).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 3, module: 'compras', from: '2026-09-10', to: '2026-09-12',
    })))
  })

  it('ignora fechas inválidas de la URL y no las manda al backend', async () => {
    renderPage('/auditoria/logs?from=garbage&to=2026-13-45')

    await waitFor(() => expect(mockedApi.list).toHaveBeenCalled())
    const call = mockedApi.list.mock.calls[0][0]
    expect(call?.from).toBeUndefined()
    expect(call?.to).toBeUndefined()
  })

  it('un módulo de la URL fuera de la lista fija aparece seleccionado en el filtro', async () => {
    renderPage('/auditoria/logs?module=admin_contab')

    const select = (await screen.findAllByRole('combobox'))[0] as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('admin_contab'))
  })
})
