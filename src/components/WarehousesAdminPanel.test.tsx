import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import WarehousesAdminPanel from './WarehousesAdminPanel'
import { useCreateWarehouse, useDeleteWarehouse, useUpdateWarehouseSaleRule, useWarehouseSaleRules } from '@/hooks/useBodega'
import type { WarehouseSaleRule } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts?.name ? `${key}:${opts.name}` : key), i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/hooks/useBodega', () => ({
  useWarehouseSaleRules: vi.fn(), useUpdateWarehouseSaleRule: vi.fn(), useCreateWarehouse: vi.fn(), useDeleteWarehouse: vi.fn(),
}))

const base = { permite_venta: false, despacho_por_defecto: false, excluye_disponible: false }
const WAREHOUSES: WarehouseSaleRule[] = [
  { id: 1, name: 'Bodega Central', ...base, permite_venta: true, despacho_por_defecto: true, tipo: 'bodega', funcion: null, is_active: true },
  { id: 2, name: 'Reserva Servicios', ...base, tipo: 'bodega', funcion: 'reserva_servicios', is_active: true },
  { id: 3, name: 'Sala de exhibición 1', ...base, tipo: 'exhibicion', funcion: null, is_active: true },
  { id: 4, name: 'Almacén viejo', ...base, tipo: 'bodega', funcion: null, is_active: false },
]

let createMutate: ReturnType<typeof vi.fn>
let updateMutate: ReturnType<typeof vi.fn>
let removeMutate: ReturnType<typeof vi.fn>

function setup(opts: { error?: unknown } = {}) {
  createMutate = vi.fn(); updateMutate = vi.fn(); removeMutate = vi.fn()
  vi.mocked(useWarehouseSaleRules).mockReturnValue({ data: WAREHOUSES, isLoading: false } as unknown as ReturnType<typeof useWarehouseSaleRules>)
  vi.mocked(useCreateWarehouse).mockReturnValue({ mutate: createMutate, isPending: false, reset: vi.fn() } as unknown as ReturnType<typeof useCreateWarehouse>)
  vi.mocked(useUpdateWarehouseSaleRule).mockReturnValue({ mutate: updateMutate, isPending: false, error: opts.error, reset: vi.fn() } as unknown as ReturnType<typeof useUpdateWarehouseSaleRule>)
  vi.mocked(useDeleteWarehouse).mockReturnValue({ mutate: removeMutate, isPending: false, reset: vi.fn() } as unknown as ReturnType<typeof useDeleteWarehouse>)
  render(<WarehousesAdminPanel />)
}

// Fase 8b — administración de almacenes por superadmin.
describe('WarehousesAdminPanel (Fase 8b)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('agrega un almacén con nombre y tipo', () => {
    setup()
    fireEvent.change(screen.getByTestId('warehouse-new-name'), { target: { value: 'Almacén norte' } })
    fireEvent.change(screen.getByTestId('warehouse-new-tipo'), { target: { value: 'exhibicion' } })
    fireEvent.click(screen.getByTestId('warehouse-new-add'))
    expect(createMutate).toHaveBeenCalledWith({ name: 'Almacén norte', tipo: 'exhibicion' }, expect.anything())
  })

  it('no permite agregar con nombre vacío', () => {
    setup()
    expect(screen.getByTestId('warehouse-new-add')).toBeDisabled()
  })

  it('renombra solo cuando el nombre cambió', () => {
    setup()
    expect(screen.queryByTestId('warehouse-save-3')).toBeNull()
    fireEvent.change(screen.getByTestId('warehouse-name-3'), { target: { value: 'Sala norte' } })
    fireEvent.click(screen.getByTestId('warehouse-save-3'))
    expect(updateMutate).toHaveBeenCalledWith({ id: 3, data: { name: 'Sala norte' } }, expect.anything())
  })

  it('cambia el tipo y desactiva o activa un almacén', () => {
    setup()
    fireEvent.change(screen.getByTestId('warehouse-tipo-1'), { target: { value: 'exhibicion' } })
    expect(updateMutate).toHaveBeenCalledWith({ id: 1, data: { tipo: 'exhibicion' } })
    fireEvent.click(screen.getByTestId('warehouse-toggle-3'))
    expect(updateMutate).toHaveBeenCalledWith({ id: 3, data: { is_active: false } })
    fireEvent.click(screen.getByTestId('warehouse-toggle-4'))
    expect(updateMutate).toHaveBeenCalledWith({ id: 4, data: { is_active: true } })
  })

  it('un almacén de sistema no ofrece desactivar ni borrar', () => {
    setup()
    expect(screen.queryByTestId('warehouse-toggle-2')).toBeNull()
    expect(screen.queryByTestId('warehouse-delete-2')).toBeNull()
  })

  it('borra solo tras confirmar', () => {
    setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    fireEvent.click(screen.getByTestId('warehouse-delete-3'))
    expect(removeMutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('warehouse-delete-3'))
    expect(removeMutate).toHaveBeenCalledWith(3)
    confirm.mockRestore()
  })

  it('muestra el motivo que da el servidor cuando rechaza', () => {
    const err = Object.assign(new Error('x'), { isAxiosError: true, response: { data: { message: 'Tiene 3 unidades en existencia: muévelas a otro almacén primero.' } } })
    setup({ error: err })
    expect(screen.getByTestId('warehouses-admin-error')).toHaveTextContent('Tiene 3 unidades en existencia')
  })
})
