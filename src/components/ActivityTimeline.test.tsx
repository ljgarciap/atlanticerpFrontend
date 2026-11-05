import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ActivityTimeline from './ActivityTimeline'
import { catalogsApi } from '@/api/catalogsApi'
import type { Activity } from '@/types/project'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, o?: { defaultValue?: string }) => (/^crm:activityTypes\.(llamada|email|reunion|whatsapp|visita|otro)$/.test(key) ? `i18n:${key.split('.')[1]}` : (o?.defaultValue ?? key)), i18n: { language: 'es' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/catalogsApi', () => ({ catalogsApi: { list: vi.fn() } }))
const api = vi.mocked(catalogsApi, true)

function renderTimeline(activities: Activity[], onAdd = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><ActivityTimeline activities={activities} canWrite onAdd={onAdd} onDelete={() => {}} /></QueryClientProvider>)
  return onAdd
}

beforeEach(() => { vi.clearAllMocks() })

describe('ActivityTimeline — tipos de actividad del catálogo', () => {
  it('ofrece los tipos de la empresa, incluido uno propio, y registra con su clave', async () => {
    api.list.mockResolvedValue([
      { id: 1, domain: 'crm_activity_type', key: 'llamada', label: 'Llamada', sort_order: 1, is_active: true, is_system: false, props: {} },
      { id: 2, domain: 'crm_activity_type', key: 'capacitacion', label: 'Capacitación', sort_order: 2, is_active: true, is_system: false, props: {} },
    ])
    const onAdd = renderTimeline([])
    fireEvent.click(await screen.findByText('Capacitación'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Sesión de uso' } })
    fireEvent.click(screen.getByText('crm:activity.add'))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'capacitacion', notas: 'Sesión de uso' }))
  })

  it('mientras no hay catálogo usa los tipos de siempre', async () => {
    api.list.mockResolvedValue([])
    renderTimeline([])
    expect(await screen.findByText('i18n:llamada')).toBeInTheDocument()
    expect(screen.getByText('i18n:otro')).toBeInTheDocument()
  })

  it('una actividad con un tipo ya desactivado se muestra con su nombre legible', async () => {
    api.list.mockResolvedValue([])
    renderTimeline([{ id: 1, tipo: 'capacitacion', fecha: '2026-11-01', notas: 'x', user: { id: 1, first_name: 'A', last_name: 'T' }, siguiente: null } as unknown as Activity])
    expect(await screen.findByText('Capacitacion')).toBeInTheDocument()
  })
})
