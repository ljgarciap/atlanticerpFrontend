import { describe, expect, it, vi, beforeEach } from 'vitest'
import { globalSettingsApi } from './globalSettingsApi'
import api from './authApi'

// SCRUM-1158 — contrato de guardado de los ajustes globales: con contraseña manda `{ value, operator_password }` (mismo campo que ya usan
// los ajustes del reset de contraseñas); sin contraseña manda solo `{ value }`, igual que antes para el resto de ajustes.
vi.mock('./authApi', () => ({ default: { get: vi.fn(), put: vi.fn() } }))

const put = vi.mocked(api.put)
const item = { key: 'impersonation_max_minutes', value: 45, type: 'integer', group: 'impersonation', label_key: 'x', requires_reauth: true }

beforeEach(() => { put.mockReset(); put.mockResolvedValue({ data: { data: item } }) })

describe('globalSettingsApi.update', () => {
  it('con contraseña del operador envía value y operator_password', async () => {
    await globalSettingsApi.update('impersonation_max_minutes', 45, 'Operador-123')
    expect(put).toHaveBeenCalledWith('/admin/global-settings/impersonation_max_minutes', { value: 45, operator_password: 'Operador-123' })
  })

  it('sin contraseña envía solo value (ajustes comunes sin cambios)', async () => {
    await globalSettingsApi.update('documents.max_size_mb', 600)
    expect(put).toHaveBeenCalledWith('/admin/global-settings/documents.max_size_mb', { value: 600 })
  })

  it('una contraseña vacía no se envía', async () => {
    await globalSettingsApi.update('documents.max_size_mb', 600, '')
    expect(put).toHaveBeenCalledWith('/admin/global-settings/documents.max_size_mb', { value: 600 })
  })
})
