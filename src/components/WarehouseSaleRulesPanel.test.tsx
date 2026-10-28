import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import WarehouseSaleRulesPanel from './WarehouseSaleRulesPanel'
import { useWarehouseSaleRules, useUpdateWarehouseSaleRule } from '@/hooks/useBodega'
import type { WarehouseSaleRule } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts?.name ? `${key}:${opts.name}` : key), i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/hooks/useBodega', () => ({ useWarehouseSaleRules: vi.fn(), useUpdateWarehouseSaleRule: vi.fn() }))

const mockedRules = vi.mocked(useWarehouseSaleRules)
const mockedUpdate = vi.mocked(useUpdateWarehouseSaleRule)

const RULES: WarehouseSaleRule[] = [
  { id: 1, name: 'Bodega Central', permite_venta: true, despacho_por_defecto: true, excluye_disponible: false },
  { id: 3, name: 'Sala de exhibición 1', permite_venta: true, despacho_por_defecto: false, excluye_disponible: true },
  { id: 7, name: 'Reclamos y Devoluciones', permite_venta: false, despacho_por_defecto: false, excluye_disponible: true },
]

let mutate: ReturnType<typeof vi.fn>

function setup(opts: { isError?: boolean; error?: unknown; isSuccess?: boolean } = {}) {
  mutate = vi.fn()
  mockedRules.mockReturnValue({ data: RULES, isLoading: false } as unknown as ReturnType<typeof useWarehouseSaleRules>)
  mockedUpdate.mockReturnValue({ mutate, isPending: false, ...opts } as unknown as ReturnType<typeof useUpdateWarehouseSaleRule>)
  render(<WarehouseSaleRulesPanel />)
}

// SCRUM-1196 — panel «Reglas de bodega»: lo que se vende y de dónde sale se cambia sin deploy.
describe('WarehouseSaleRulesPanel (SCRUM-1196)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('lista las bodegas con sus tres reglas', () => {
    setup()
    expect(screen.getByTestId('rule-sale-1')).toBeChecked()
    expect(screen.getByTestId('rule-default-1')).toBeChecked()
    expect(screen.getByTestId('rule-sale-7')).not.toBeChecked()
    expect(screen.getByTestId('rule-exclude-3')).toBeChecked()
  })

  it('la bodega por defecto no puede dejar de vender, y una que no vende no puede ser la por defecto', () => {
    setup()
    expect(screen.getByTestId('rule-sale-1')).toBeDisabled()
    expect(screen.getByTestId('rule-default-7')).toBeDisabled()
    expect(screen.getByTestId('rule-default-3')).toBeEnabled()
  })

  it('habilitar una bodega para ventas manda solo ese cambio', () => {
    setup()
    fireEvent.click(screen.getByTestId('rule-sale-7'))
    expect(mutate).toHaveBeenCalledWith({ id: 7, data: { permite_venta: true } })
  })

  it('elegir otra bodega como por defecto manda despacho_por_defecto', () => {
    setup()
    fireEvent.click(screen.getByTestId('rule-default-3'))
    expect(mutate).toHaveBeenCalledWith({ id: 3, data: { despacho_por_defecto: true } })
  })

  it('cambiar «excluir del Disponible» manda ese indicador', () => {
    setup()
    fireEvent.click(screen.getByTestId('rule-exclude-3'))
    expect(mutate).toHaveBeenCalledWith({ id: 3, data: { excluye_disponible: false } })
  })

  it('muestra el mensaje del servidor si rechaza el cambio (422)', () => {
    setup({ isError: true, error: { isAxiosError: true, response: { status: 422, data: { message: 'La bodega de despacho por defecto debe permitir ventas.' } } } })
    expect(screen.getByTestId('warehouse-rules-error')).toHaveTextContent('La bodega de despacho por defecto debe permitir ventas.')
  })
})
