import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useNotaCreditoResumenMes, useNotaCreditoDevolucionDetail, useNotaCreditoFacturas,
} from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoBan } from '@/components/icons'
import RegistrarNotaCreditoModal from '@/components/admin-contab/RegistrarNotaCreditoModal'
import RevisionPreviaCorreccionModal from '@/components/admin-contab/RevisionPreviaCorreccionModal'
import HistorialNotasCreditoPanel from '@/components/admin-contab/HistorialNotasCreditoPanel'
import DetalleNotaCreditoModal from '@/components/admin-contab/DetalleNotaCreditoModal'
import type {
  NotaCreditoDevolucionPrecargada, NotaCreditoHistorialRow, PreviewCorreccionPayload,
  NotaCreditoDevolucionDetail,
} from '@/types/adminContab'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

export default function NotasCreditoPage() {
  const { t } = useTranslation('adminContab')
  const [modalOpen, setModalOpen] = useState(false)
  const [devolucionPreview, setDevolucionPreview] = useState<NotaCreditoDevolucionPrecargada | null>(null)
  const [correccionPreview, setCorreccionPreview] = useState<PreviewCorreccionPayload | null>(null)
  const [selectedNotaId, setSelectedNotaId] = useState<number | null>(null)

  const { data: resumen } = useNotaCreditoResumenMes()

  // REQ-491 (Batch 12) — precarga real: `GET /notas-credito/devoluciones/{customerReturnId}`
  // (`NotaCreditoDevolucionDetail`) es más angosto que lo que el formulario necesita (ver docblock
  // del tipo) — no trae monto/saldo/% ITBMS de la factura de origen, así que se combina con
  // `facturas()` (mismo endpoint que usa el modo manual) para completar
  // `NotaCreditoDevolucionPrecargada`. `persona_devuelve`/`conformidad` no existen en ningún lado
  // del backend (`CustomerReturnLine` no los trackea) — se muestran con un placeholder explícito,
  // nunca inventados; gap real documentado para Pre-QA/Senior Review.
  const [pendingDevolucion, setPendingDevolucion] = useState<NotaCreditoDevolucionDetail | null>(null)
  const [precargaError, setPrecargaError] = useState(false)
  const devolucionDetailMutation = useNotaCreditoDevolucionDetail()
  const { data: facturasParaPrecarga } = useNotaCreditoFacturas(pendingDevolucion?.master_client_id ?? null)

  useEffect(() => {
    if (pendingDevolucion === null || facturasParaPrecarga === undefined) return
    const factura = facturasParaPrecarga.find(f => f.id === pendingDevolucion.factura_origen_id)
    if (factura === undefined) {
      // La lista de facturas del cliente ya resolvió y no trae la factura de origen de la
      // devolución — dato inconsistente entre Bodega y Admin&Cont, no un timing normal de carga.
      // No se deja la cola esperando en silencio.
      setPrecargaError(true)
      setPendingDevolucion(null)
      return
    }

    const precargada: NotaCreditoDevolucionPrecargada = {
      cliente_id: pendingDevolucion.master_client_id,
      cliente_nombre: pendingDevolucion.cliente,
      factura_origen_id: pendingDevolucion.factura_origen_id,
      referencia: pendingDevolucion.return_number,
      productos: pendingDevolucion.productos.map(p => ({
        descripcion: p.description,
        cantidad: p.qty_received,
        // SCRUM-786 — `CustomerReturnLine.unit_price` puede ser null en devoluciones de pedidos
        // creados antes del backfill (ver docblock de `NotaCreditoDevolucionDetail`); el monto
        // sugerido cae a 0 en ese caso. El campo sigue editable siempre.
        monto_unitario: p.unit_price ?? 0,
      })),
      persona_devuelve: t('notasCredito.formulario.precargaDatoNoDisponible'),
      proyecto: null,
      conformidad: t('notasCredito.formulario.precargaDatoNoDisponible'),
      factura_monto: factura.monto,
      factura_saldo_pendiente: factura.saldo_pendiente,
      factura_itbms_percentage: factura.itbms_percentage,
      customer_return_id: pendingDevolucion.customer_return_id,
    }
    setDevolucionPreview(precargada)
    setCorreccionPreview(null)
    setModalOpen(true)
    setPendingDevolucion(null)
  }, [pendingDevolucion, facturasParaPrecarga, t])

  function openManual() {
    setDevolucionPreview(null)
    setCorreccionPreview(null)
    setModalOpen(true)
  }

  function openDesdeDevolucion(row: NotaCreditoHistorialRow) {
    if (row.customer_return_id === null || devolucionDetailMutation.isPending) return
    setPrecargaError(false)
    devolucionDetailMutation.mutate(row.customer_return_id, {
      onSuccess: setPendingDevolucion,
      onError: () => setPrecargaError(true),
    })
  }

  const cards = [
    { label: t('notasCredito.stats.totalAcreditado'), value: resumen ? formatCurrency(resumen.total_acreditado) : '—' },
    { label: t('notasCredito.stats.numeroNotas'), value: resumen?.numero_notas ?? '—' },
    {
      label: t('notasCredito.stats.pendientesAprobacion'),
      value: resumen ? formatCurrency(resumen.pendientes_aprobacion_monto) : '—',
      small: true,
    },
    { label: t('notasCredito.stats.devolucionesPorGenerar'), value: resumen?.devoluciones_por_generar ?? '—' },
    { label: t('notasCredito.stats.notaPromedio'), value: resumen ? formatCurrency(resumen.nota_promedio) : '—' },
  ]

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="flex items-start justify-between mb-1 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <IcoBan size={20} className="text-slate-500 dark:text-slate-400" />
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('notasCredito.title')}</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">{t('notasCredito.subtitle')}</p>
          </div>
        </div>
        <Button onClick={openManual}>{t('notasCredito.nuevaNotaButton')}</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
        {cards.map(c => (
          <Card key={c.label} variant="panel" className="p-3.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">{c.label}</div>
            <div className={c.small ? 'text-sm font-semibold text-slate-800 dark:text-slate-100' : 'text-xl font-bold text-primary-dark'}>
              {c.value}
            </div>
          </Card>
        ))}
      </div>

      <HistorialNotasCreditoPanel
        onSelectNota={setSelectedNotaId}
        onGenerarDesdeDevolucion={openDesdeDevolucion}
      />

      {precargaError && (
        <p className="mt-2 text-xs text-red-600">{t('notasCredito.historial.precargaError')}</p>
      )}

      {/* RN4 REQ-489 — el formulario queda MONTADO (oculto, no desmontado) mientras la revisión
          previa de Corrección de datos está abierta, para que "Volver y corregir" no pierda lo ya
          llenado (su estado interno de React se conserva). */}
      {modalOpen && (
        <div className={correccionPreview !== null ? 'hidden' : ''}>
          <RegistrarNotaCreditoModal
            devolucionPrecargada={devolucionPreview}
            primaryApprovalThreshold={resumen?.primary_approval_threshold}
            onClose={() => setModalOpen(false)}
            onRegistered={() => setModalOpen(false)}
            onRequestCorreccionPreview={setCorreccionPreview}
          />
        </div>
      )}

      {correccionPreview !== null && (
        <RevisionPreviaCorreccionModal
          params={correccionPreview}
          onBack={() => setCorreccionPreview(null)}
          onClose={() => { setCorreccionPreview(null); setModalOpen(false) }}
          onConfirmed={() => { setCorreccionPreview(null); setModalOpen(false) }}
        />
      )}

      {selectedNotaId !== null && (
        <DetalleNotaCreditoModal notaId={selectedNotaId} onClose={() => setSelectedNotaId(null)} />
      )}
    </div>
  )
}
