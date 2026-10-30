import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { usePaymentMethods } from './usePaymentMethods'
import { catalogsApi } from '@/api/catalogsApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key.replace('cobros.metodos.', 'T:') }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/catalogsApi', () => ({ catalogsApi: { list: vi.fn() } }))
const api = vi.mocked(catalogsApi, true)

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)
const entry = (key: string, label: string, props: Record<string, boolean> = {}) =>
  ({ id: 1, domain: 'payment_method', key, label, sort_order: 0, is_active: true, is_system: false, props })

describe('formas de pago del catálogo (Fase 14b)', () => {
  it('sin catálogo rigen las nueve de siempre con su comportamiento', async () => {
    api.list.mockRejectedValue(new Error('500'))
    const { result } = renderHook(() => usePaymentMethods(), { wrapper })
    await waitFor(() => expect(api.list).toHaveBeenCalled())

    expect(result.current.methods).toHaveLength(9)
    expect(result.current.sinCuentaBancaria('retencion_impuestos')).toBe(true)
    expect(result.current.sinCuentaBancaria('transferencia')).toBe(false)
    expect(result.current.inmediato('efectivo')).toBe(true)
    expect(result.current.inmediato('cheque')).toBe(false)
    expect(result.current.cajaChica.map(m => m.key)).toEqual(['transferencia', 'cheque', 'efectivo', 'yappy'])
    expect(result.current.label('deposito')).toBe('T:deposito')
  })

  it('con catálogo usa sus entradas, etiquetas y propiedades (una forma propia hereda su comportamiento)', async () => {
    api.list.mockResolvedValue([
      entry('efectivo', 'Efectivo', { inmediato: true, caja_chica: true }),
      entry('ventanilla', 'Ventanilla bancaria', { sin_cuenta_bancaria: true, inmediato: true }),
    ])
    const { result } = renderHook(() => usePaymentMethods(), { wrapper })

    await waitFor(() => expect(result.current.methods.map(m => m.key)).toEqual(['efectivo', 'ventanilla']))
    expect(result.current.label('ventanilla')).toBe('Ventanilla bancaria')
    expect(result.current.sinCuentaBancaria('ventanilla')).toBe(true)
    expect(result.current.inmediato('ventanilla')).toBe(true)
    expect(result.current.cajaChica.map(m => m.key)).toEqual(['efectivo'])
    // Una clave que no está en el catálogo no pide nada especial.
    expect(result.current.sinCuentaBancaria('desconocida')).toBe(false)
  })
})
