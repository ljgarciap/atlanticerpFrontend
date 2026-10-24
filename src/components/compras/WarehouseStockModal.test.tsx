import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import WarehouseStockModal from './WarehouseStockModal'
import { useInventoryWarehouseStock } from '@/hooks/useCompras'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/hooks/useCompras', () => ({ useInventoryWarehouseStock: vi.fn() }))

const mocked = vi.mocked(useInventoryWarehouseStock)

// SCRUM-1196 — «Ver bodegas» muestra todo saldo distinto de 0, también el negativo, y la suma coincide con el Stock total.
describe('WarehouseStockModal (SCRUM-1196)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('muestra el saldo negativo resaltado y un total que suma todas las bodegas', () => {
    mocked.mockReturnValue({
      data: { data: [
        { warehouse_id: 1, warehouse_name: 'Bodega Central', quantity: 10 },
        { warehouse_id: 3, warehouse_name: 'Showroom Obarrio', quantity: 1 },
        { warehouse_id: 7, warehouse_name: 'Reclamos y Devoluciones', quantity: -8 },
      ] }, isLoading: false,
    } as unknown as ReturnType<typeof useInventoryWarehouseStock>)

    render(<WarehouseStockModal productId={9} onClose={vi.fn()} />)

    expect(screen.getByTestId('warehouse-qty-7')).toHaveTextContent('-8')
    expect(screen.getByTestId('warehouse-qty-7').className).toMatch(/text-red-600/)
    expect(screen.getByTestId('warehouse-total')).toHaveTextContent('3') // 10 + 1 − 8
  })

  it('sin bodegas con saldo no muestra el total', () => {
    mocked.mockReturnValue({ data: { data: [] }, isLoading: false } as unknown as ReturnType<typeof useInventoryWarehouseStock>)
    render(<WarehouseStockModal productId={9} onClose={vi.fn()} />)
    expect(screen.queryByTestId('warehouse-total')).not.toBeInTheDocument()
  })
})
