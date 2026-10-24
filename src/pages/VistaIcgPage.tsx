import { useState } from 'react'
import { LegacyDocumentoTabPanel } from '@/components/legacy/LegacyDocumentoTabPanel'
import { PagosTabPanel } from '@/components/legacy/PagosTabPanel'
import { ClientesTabPanel } from '@/components/legacy/ClientesTabPanel'
import { ProveedoresTabPanel } from '@/components/legacy/ProveedoresTabPanel'
import { ProductosTabPanel } from '@/components/legacy/ProductosTabPanel'
import type { VistaIcgEntidad } from '@/types/legacyMigration'

type Tab = VistaIcgEntidad | 'pagos'

const TABS: { id: Tab; label: string }[] = [
  { id: 'cotizaciones', label: 'Cotizaciones' },
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'albaranes', label: 'Albaranes' },
  { id: 'albaranes_compra', label: 'Albaranes de Compra' },
  { id: 'facturas', label: 'Facturas' },
  { id: 'pagos', label: 'Pagos' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'proveedores', label: 'Proveedores' },
  { id: 'productos', label: 'Productos' },
]

// "Vista ICG" (SCRUM-749, 2026-09-03, a pedido de Luis) — pantalla propia bajo Migración con una
// pestaña por entidad migrada, sin partir de un Subcliente puntual (a diferencia de "Historial
// ICG" dentro del detalle de Cliente, que sigue existiendo sin cambios). Gate role:superadmin
// exclusivo en App.tsx/Sidebar.tsx, mismo criterio que Pagos ICG — audiencia técnica, datos
// crudos de ICG sin traducir.
//
// Cada pestaña reusa un componente ya existente (Pagos reusa PagosTabPanel, el mismo que la
// pantalla standalone /migracion/pagos) o uno nuevo dedicado (Clientes/Proveedores/Productos,
// cuyo detalle no encaja en la ficha genérica de cabecera+líneas).
export default function VistaIcgPage() {
  const [tab, setTab] = useState<Tab>('cotizaciones')

  return (
    <div className="p-6 space-y-5 max-w-screen-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Vista ICG</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
          Datos migrados de ICG por entidad — solo lectura, sin partir de un cliente puntual
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              tab === t.id
                ? 'bg-[#5BA5A0] text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cotizaciones' && <LegacyDocumentoTabPanel entidad="cotizaciones" />}
      {tab === 'pedidos' && <LegacyDocumentoTabPanel entidad="pedidos" />}
      {tab === 'albaranes' && <LegacyDocumentoTabPanel entidad="albaranes" />}
      {tab === 'albaranes_compra' && <LegacyDocumentoTabPanel entidad="albaranes_compra" ownerLabel="Proveedor" />}
      {tab === 'facturas' && <LegacyDocumentoTabPanel entidad="facturas" />}
      {tab === 'pagos' && <PagosTabPanel />}
      {tab === 'clientes' && <ClientesTabPanel />}
      {tab === 'proveedores' && <ProveedoresTabPanel />}
      {tab === 'productos' && <ProductosTabPanel />}
    </div>
  )
}
