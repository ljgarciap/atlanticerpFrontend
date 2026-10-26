import type { PhysicalWarehouse } from '@/types/bodega'

/** SCRUM-990 — bodegas OPERATIVAS: las que forman parte del inventario de Atlantic. Excluye las de solo consulta (Zona
 * Libre: se retira en la 5b-2). Todo selector de bodega donde se ESCRIBE stock o se mira el inventario de
 * Atlantic usa esto; Zona Libre no debe aparecer ahí ni deshabilitada. El backend ya lo exige con `Warehouse::operativaRule()`,
 * así que esto solo evita ofrecer una opción que el API rechazaría. */
export function operativeWarehouses(warehouses: PhysicalWarehouse[]): PhysicalWarehouse[] {
  return warehouses.filter(w => !w.solo_consulta)
}
