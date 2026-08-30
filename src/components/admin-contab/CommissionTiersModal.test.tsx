import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CommissionTiersModal from './CommissionTiersModal'
import { adminContabApi } from '@/api/adminContabApi'
import type { CommissionTier } from '@/types/adminContab'

// Rebote de QA (SCRUM-575, 2026-08-26, BUG-1): eliminar un tramo no pedía confirmación — un clic
// accidental en el ícono de basura borraba de inmediato un tramo que afecta el % de comisión de
// todos los vendedores activos.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    commissionsInternal: {
      tiers: {
        list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
      },
    },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeTier(overrides: Partial<CommissionTier> = {}): CommissionTier {
  return { id: 1, monto_minimo: 0, monto_maximo: 20000, porcentaje: 1.5, orden: 1, ...overrides }
}

function renderModal(editable = true, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <CommissionTiersModal editable={editable} onClose={onClose} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CommissionTiersModal — SCRUM-575', () => {
  it('pide confirmación antes de eliminar y NO llama al backend si se cancela', async () => {
    mockedApi.commissionsInternal.tiers.list.mockResolvedValue([makeTier()])
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderModal()

    const deleteBtn = await screen.findByLabelText('common:actions.delete')
    fireEvent.click(deleteBtn)

    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(mockedApi.commissionsInternal.tiers.remove).not.toHaveBeenCalled()
  })

  it('elimina el tramo solo tras confirmar', async () => {
    mockedApi.commissionsInternal.tiers.list.mockResolvedValue([makeTier()])
    mockedApi.commissionsInternal.tiers.remove.mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderModal()

    const deleteBtn = await screen.findByLabelText('common:actions.delete')
    fireEvent.click(deleteBtn)

    await waitFor(() => expect(mockedApi.commissionsInternal.tiers.remove).toHaveBeenCalledWith(1))
  })
})
