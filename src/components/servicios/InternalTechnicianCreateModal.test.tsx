import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InternalTechnicianCreateModal from './InternalTechnicianCreateModal'
import { serviciosApi } from '@/api/serviciosApi'
import type { InternalTechnician } from '@/types/servicios'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/hooks/useFixedLists', () => ({
  useTechnicianSpecialties: () => ({ options: [{ key: 'general', label: 'General' }], label: (k: string) => k }),
}))
vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: { internalTechnicians: { update: vi.fn(), create: vi.fn(), linkUser: vi.fn(), linkableUsers: vi.fn() } },
}))

const api = vi.mocked(serviciosApi, true)

const tecnico = { id: 5, user_id: null, nombre: 'Técnico Test', telefono: null, email: null, especialidad: 'general' } as InternalTechnician

function renderModal(technician?: InternalTechnician) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><InternalTechnicianCreateModal onClose={() => {}} onCreated={() => {}} technician={technician} /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.internalTechnicians.linkableUsers.mockResolvedValue([{ id: 9, name: 'Usuario Técnico' }])
  api.internalTechnicians.update.mockResolvedValue({ ...tecnico })
  api.internalTechnicians.linkUser.mockResolvedValue({ ...tecnico, user_id: 9 })
})

describe('InternalTechnicianCreateModal — usuario vinculado', () => {
  it('no ofrece el selector al crear', () => {
    renderModal()
    expect(screen.queryByTestId('technician-linked-user')).toBeNull()
  })

  it('al editar, elegir un usuario liga la ficha', async () => {
    renderModal(tecnico)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Usuario Técnico' })).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('technician-linked-user'), { target: { value: '9' } })
    fireEvent.click(screen.getByText('technicians.internal.createModal.save'))
    await waitFor(() => expect(api.internalTechnicians.linkUser).toHaveBeenCalledWith(5, 9))
  })

  it('si el vínculo no cambió, no lo toca', async () => {
    renderModal(tecnico)
    fireEvent.click(screen.getByText('technicians.internal.createModal.save'))
    await waitFor(() => expect(api.internalTechnicians.update).toHaveBeenCalled())
    expect(api.internalTechnicians.linkUser).not.toHaveBeenCalled()
  })
})
