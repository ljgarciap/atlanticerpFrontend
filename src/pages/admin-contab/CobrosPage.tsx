import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { usePaymentSummary } from '@/hooks/useAdminContab'
import type { PaymentEstado } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoDollarSign } from '@/components/icons'
import RegistrarCobroModal from '@/components/admin-contab/RegistrarCobroModal'
import HistorialCobrosPanel from '@/components/admin-contab/HistorialCobrosPanel'
import DetalleCobroModal from '@/components/admin-contab/DetalleCobroModal'

const VALID_ESTADOS: PaymentEstado[] = ['confirmado', 'esperando_confirmacion']
function isPaymentEstado(v: string | null): v is PaymentEstado {
  return v !== null && (VALID_ESTADOS as string[]).includes(v)
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

/**
 * Batch 5 del cuerpo principal (SCRUM-539→544, REQ-462→467) — Cobros. Reemplaza por completo a
 * `CobrosPlaceholderPage.tsx` (ver su docblock histórico). REQ-462 RN2 — `master_client_id` +
 * `accion=nuevo-cobro` en la query string (ya enviados desde `FacturacionPage.tsx` → botón
 * "Registrar cobro" del detalle de factura, Batch 4) abren el formulario con el cliente
 * preseleccionado, sin que el usuario tenga que buscarlo de nuevo.
 */
export default function CobrosPage() {
  const { t } = useTranslation('adminContab')
  const [searchParams, setSearchParams] = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [preselectedClientId, setPreselectedClientId] = useState<number | null>(null)
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null)

  const { data: summary } = usePaymentSummary()

  useEffect(() => {
    const masterClientId = searchParams.get('master_client_id')
    const accion = searchParams.get('accion')
    if (accion === 'nuevo-cobro' && masterClientId) {
      setPreselectedClientId(Number(masterClientId))
      setModalOpen(true)
      // Limpia la query string para que un refresh no vuelva a abrir el modal solo.
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openModal() {
    setPreselectedClientId(null)
    setModalOpen(true)
  }

  const cards = [
    { label: t('cobros.stats.totalCobrado'), value: summary ? formatCurrency(summary.total_cobrado) : '—' },
    { label: t('cobros.stats.numeroCobros'), value: summary?.cantidad ?? '—' },
    { label: t('cobros.stats.cobroPromedio'), value: summary ? formatCurrency(summary.promedio) : '—' },
    {
      label: t('cobros.stats.metodoPrincipal'),
      value: summary?.metodo_principal
        ? t('cobros.stats.metodoPrincipalValue', {
            metodo: t(`cobros.metodos.${summary.metodo_principal.metodo}`),
            porcentaje: summary.metodo_principal.porcentaje,
          })
        : t('cobros.stats.sinDatos'),
      small: true,
    },
  ]

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="flex items-start justify-between mb-1 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <IcoDollarSign size={20} className="text-slate-500 dark:text-slate-400" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('cobros.title')}</h1>
        </div>
        <Button onClick={openModal}>{t('cobros.registrarButton')}</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {cards.map(c => (
          <Card key={c.label} variant="panel" className="p-3.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">{c.label}</div>
            <div className={c.small ? 'text-sm font-semibold text-slate-800 dark:text-slate-100' : 'text-xl font-bold text-primary-dark'}>
              {c.value}
            </div>
          </Card>
        ))}
      </div>

      <HistorialCobrosPanel
        onSelectPayment={setSelectedPaymentId}
        initialEstado={isPaymentEstado(searchParams.get('estado')) ? searchParams.get('estado') as PaymentEstado : undefined}
      />

      {modalOpen && (
        <RegistrarCobroModal
          initialMasterClientId={preselectedClientId}
          onClose={() => setModalOpen(false)}
          onRegistered={() => setModalOpen(false)}
        />
      )}

      {selectedPaymentId !== null && (
        <DetalleCobroModal paymentId={selectedPaymentId} onClose={() => setSelectedPaymentId(null)} />
      )}
    </div>
  )
}
