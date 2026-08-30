import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VentasDisenoAuditLogPage from './AuditLogPage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { AuditLogEntry, AuditLogResult } from '@/types/ventasDiseno'

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

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: { auditLog: { list: vi.fn() } },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 1,
    action: 'ventas_diseno.sub_client.updated',
    entity_type: 'sub_client',
    entity_id: '42',
    old_values: { category: 'a_walkin' },
    new_values: { category: 'b_architect_designer' },
    user: { id: 1, name: 'Management Demo' },
    created_at: '2026-07-09T12:00:00Z',
    ...overrides,
  }
}

function makeResult(overrides: Partial<AuditLogResult> = {}): AuditLogResult {
  return { data: [], current_page: 1, last_page: 1, total: 0, ...overrides }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <VentasDisenoAuditLogPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.auditLog.list.mockResolvedValue(makeResult())
})

describe('VentasDisenoAuditLogPage', () => {
  it('muestra el título de la pantalla', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:auditLog.title')).toBeInTheDocument()
  })

  it('sin actividad muestra el mensaje vacío', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:auditLog.table.empty')).toBeInTheDocument()
  })

  it('muestra una fila con usuario, acción y el diff de campos', async () => {
    mockedApi.auditLog.list.mockResolvedValue(makeResult({ data: [makeEntry()] }))
    renderPage()

    expect(await screen.findByText('Management Demo')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:auditLog.action.updated')).toBeInTheDocument()
    expect(screen.getByText(/category: "a_walkin" → "b_architect_designer"/)).toBeInTheDocument()
  })

  it('sin usuario (evento del sistema) muestra el texto de sistema', async () => {
    mockedApi.auditLog.list.mockResolvedValue(makeResult({ data: [makeEntry({ user: null })] }))
    renderPage()

    expect(await screen.findByText('ventasDiseno:auditLog.table.systemUser')).toBeInTheDocument()
  })

  it('cambiar el tipo de entidad vuelve a pedir la lista con el filtro', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.auditLog.list).toHaveBeenCalled())

    fireEvent.change(screen.getByDisplayValue('ventasDiseno:auditLog.filters.allTypes'), { target: { value: 'quote' } })

    await waitFor(() => expect(mockedApi.auditLog.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ entity_type: 'quote' }),
    ))
  })

  it('la paginación pide la página siguiente', async () => {
    mockedApi.auditLog.list.mockResolvedValue(makeResult({ data: [makeEntry()], current_page: 1, last_page: 2 }))
    renderPage()

    fireEvent.click(await screen.findByText('ventasDiseno:auditLog.pagination.next'))

    await waitFor(() => expect(mockedApi.auditLog.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    ))
  })
})
