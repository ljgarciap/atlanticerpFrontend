import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import {
  usePaymentClients, useNotaCreditoItbmsRates, useNotaCreditoFacturas, useRegisterNotaCredito,
  useBankAccounts,
} from '@/hooks/useAdminContab'
import type {
  NotaCreditoTipo, NotaCreditoSubtipoAnulacion, NotaCreditoMotivoCorreccion, NotaCreditoResultado,
  NotaCreditoDevolucionPrecargada, NotaCreditoFacturaOrigen, PaymentClientOption,
  PreviewCorreccionPayload,
} from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoSearch, IcoTruck, IcoAlertTriangle, IcoPaperclip } from '@/components/icons'

const SUBTIPOS_ANULACION: NotaCreditoSubtipoAnulacion[] = ['cancelado', 'correccion']
const MOTIVOS_CORRECCION: NotaCreditoMotivoCorreccion[] = ['itbms', 'fecha', 'ambos']

const COMPROBANTE_MAX_BYTES = 10 * 1024 * 1024
const COMPROBANTE_ACCEPTED  = ['image/jpeg', 'image/png', 'application/pdf']

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

interface Props {
  /**
   * REQ-481 — cuando llega precargada (desde la cola de devoluciones confirmadas por Bodega,
   * REQ-491/Batch 12, que todavía no existe), el formulario se abre en modo Devolución de
   * mercancía: cliente bloqueado y bloque de detalle de solo lectura. Sin esta prop, el
   * formulario abre en modo manual (REQ-478 RN1: Descuento comercial / Anulación completa,
   * "Devolución de mercancía" nunca seleccionable a mano — RN1 REQ-481).
   */
  devolucionPrecargada?: NotaCreditoDevolucionPrecargada | null
  /** REQ-482 RN2/RN3 — umbral configurable de aprobación de Mark (`NotaCreditoResumenMes.mark_
   *  approval_threshold`, Configuración Fiscal). `undefined` mientras el resumen del mes no cargó
   *  todavía — el banner y el gate de comprobante obligatorio quedan inactivos hasta entonces
   *  (nunca asumen un umbral por defecto en el frontend). */
  primaryApprovalThreshold?: number
  onClose: () => void
  onRegistered: () => void
  /** Batch 12 (REQ-488/489) — "Corrección de datos" no registra directo: pide revisión previa +
   *  vista previa de factura nueva antes de confirmar (RN1 REQ-489). El padre (`NotasCreditoPage`)
   *  abre `RevisionPreviaCorreccionModal` con este payload y mantiene ESTE modal montado (oculto,
   *  no desmontado) para que "Volver y corregir" no pierda lo ya llenado (RN4 REQ-489). */
  onRequestCorreccionPreview: (payload: PreviewCorreccionPayload) => void
}

/**
 * Batch 10 (SCRUM-553→558, REQ-476→481) construyó el formulario dinámico (cliente/tipo, subtipo
 * de Anulación completa, Corrección de datos, bloque de solo lectura de Devolución). Batch 11
 * (SCRUM-559→564, REQ-482→487) agrega el submit real: selección de factura de origen, monto/
 * desglose ITBMS, resolución del excedente, banners+avisos automáticos, comprobante de soporte y
 * el POST que registra la nota. Batch 12 (SCRUM-565→570, REQ-488→490) conecta "Corrección de
 * datos" a la revisión previa real en vez del hint "próximamente".
 */
export default function RegistrarNotaCreditoModal({ devolucionPrecargada, primaryApprovalThreshold, onClose, onRegistered, onRequestCorreccionPreview }: Props) {
  const { t } = useTranslation('adminContab')
  const esDevolucion = devolucionPrecargada != null

  const [clientQuery, setClientQuery]     = useState(devolucionPrecargada?.cliente_nombre ?? '')
  const [clientOpen, setClientOpen]       = useState(false)
  const [masterClientId, setMasterClientId] = useState<number | null>(devolucionPrecargada?.cliente_id ?? null)

  const [tipo, setTipo] = useState<NotaCreditoTipo>(esDevolucion ? 'devolucion_mercancia' : 'descuento_comercial')
  const [subtipoAnulacion, setSubtipoAnulacion] = useState<NotaCreditoSubtipoAnulacion>('cancelado')
  const [mercanciaRegresaBodega, setMercanciaRegresaBodega] = useState(false)
  const [motivoCorreccion, setMotivoCorreccion] = useState<NotaCreditoMotivoCorreccion | ''>('')
  const [tratamientoCorrectoId, setTratamientoCorrectoId] = useState<number | null>(null)

  // REQ-483 — factura de origen: siempre obligatoria; precargada y bloqueada en modo Devolución.
  const [facturaOrigenId, setFacturaOrigenId] = useState<number | null>(devolucionPrecargada?.factura_origen_id ?? null)
  // REQ-485 — monto editable (Descuento comercial / Devolución); en Anulación completa se ignora
  // este valor y se usa el monto total exacto de la factura elegida (ver `monto` derivado abajo).
  const [montoInput, setMontoInput] = useState<string>('')
  const [motivo, setMotivo]         = useState('')
  // REQ-484 — resolución del excedente, solo cuando aplica.
  const [resultado, setResultado]                     = useState<NotaCreditoResultado | ''>('')
  const [cuentaBancariaSalidaId, setCuentaBancariaSalidaId] = useState<number | null>(null)
  // REQ-487 — comprobante de soporte.
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [error, setError]             = useState<string | null>(null)

  const { data: clientOptions = [] } = usePaymentClients(clientQuery)
  // REQ-480 RN1 — solo se piden las tasas cuando el motivo de corrección incluye ITBMS, no antes.
  const necesitaTasas = tipo === 'anulacion_completa' && subtipoAnulacion === 'correccion'
    && (motivoCorreccion === 'itbms' || motivoCorreccion === 'ambos')
  const { data: itbmsRates = [] } = useNotaCreditoItbmsRates(necesitaTasas)
  const { data: facturasCliente = [] } = useNotaCreditoFacturas(esDevolucion ? null : masterClientId)
  const { data: bankAccounts = [] } = useBankAccounts()
  const registerMutation = useRegisterNotaCredito()

  // REQ-483 — en modo Devolución la factura de origen ya viene resuelta (monto/saldo/tasa de
  // ITBMS incluidos en la prop, RN3) — no hace falta pedirla a `notas-credito/clientes/.../facturas`.
  const facturaSeleccionada: NotaCreditoFacturaOrigen | null = useMemo(() => {
    if (esDevolucion && devolucionPrecargada) {
      return {
        id:               devolucionPrecargada.factura_origen_id,
        numero:           devolucionPrecargada.referencia,
        monto:            devolucionPrecargada.factura_monto,
        saldo_pendiente:  devolucionPrecargada.factura_saldo_pendiente,
        itbms_percentage: devolucionPrecargada.factura_itbms_percentage,
        // Devolución de mercancía nunca pasa por el bloque de Corrección de datos (que es lo único
        // que usa `itbms_rate_id`) — null acá es correcto, no un placeholder pendiente.
        itbms_rate_id: null,
      }
    }
    return facturasCliente.find(f => f.id === facturaOrigenId) ?? null
  }, [esDevolucion, devolucionPrecargada, facturasCliente, facturaOrigenId])

  // REQ-480 RN1/RN2 / Batch 12 — "Corrección de datos" ahora sí selecciona una factura de origen
  // real (ver bloque de selección más abajo, ya no excluido para este subtipo); el tratamiento
  // ACTUAL es la tasa ya aplicada a esa factura.
  const facturaActualRateId: number | null = facturaSeleccionada?.itbms_rate_id ?? null
  const tratamientoActual = itbmsRates.find(r => r.id === facturaActualRateId) ?? null
  const opcionesTratamientoCorrecto = itbmsRates.filter(r => r.id !== facturaActualRateId)

  useEffect(() => {
    if (tipo !== 'anulacion_completa') {
      setSubtipoAnulacion('cancelado')
      setMercanciaRegresaBodega(false)
      setMotivoCorreccion('')
      setTratamientoCorrectoId(null)
    }
  }, [tipo])

  useEffect(() => {
    if (subtipoAnulacion !== 'correccion') {
      setMotivoCorreccion('')
      setTratamientoCorrectoId(null)
    }
    if (subtipoAnulacion !== 'cancelado') {
      setMercanciaRegresaBodega(false)
    }
  }, [subtipoAnulacion])

  useEffect(() => {
    if (motivoCorreccion !== 'itbms' && motivoCorreccion !== 'ambos') {
      setTratamientoCorrectoId(null)
    }
  }, [motivoCorreccion])

  // REQ-485 — en modo Devolución el monto arranca precargado con la suma de los productos
  // devueltos (sigue siendo editable, RN de REQ-485 — Devolución no queda bloqueada como Anulación).
  useEffect(() => {
    if (esDevolucion && devolucionPrecargada) {
      const total = devolucionPrecargada.productos.reduce((sum, p) => sum + p.cantidad * p.monto_unitario, 0)
      setMontoInput(String(round2(total)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectClient(opt: PaymentClientOption) {
    setMasterClientId(opt.id)
    setClientQuery(opt.name)
    setClientOpen(false)
    setFacturaOrigenId(null)
  }

  // REQ-487 RN1 — imagen o PDF, mismo límite/tipos que el comprobante de Cobros. Validación
  // client-side solo para UX inmediata, el backend revalida igual.
  function pickComprobante(file: File | undefined | null) {
    if (!file) return
    if (!COMPROBANTE_ACCEPTED.includes(file.type)) {
      setError(t('notasCredito.formulario.comprobanteInvalidType'))
      return
    }
    if (file.size > COMPROBANTE_MAX_BYTES) {
      setError(t('notasCredito.formulario.comprobanteTooLarge'))
      return
    }
    setError(null)
    setComprobante(file)
  }

  const motivoIncluyeItbms  = motivoCorreccion === 'itbms' || motivoCorreccion === 'ambos'
  const motivoIncluyeFecha  = motivoCorreccion === 'fecha' || motivoCorreccion === 'ambos'

  // REQ-484 RN4 — en Anulación completa el monto SIEMPRE es el total exacto de la factura elegida,
  // nunca editable a mano. En Descuento comercial / Devolución viene del input.
  const esAnulacion = tipo === 'anulacion_completa'
  const monto = esAnulacion ? (facturaSeleccionada?.monto ?? 0) : (Number(montoInput) || 0)

  // REQ-485 — desglose subtotal/ITBMS a partir del monto, usando la tasa YA aplicada a la factura
  // de origen (no una tasa nueva).
  const itbmsPct  = facturaSeleccionada?.itbms_percentage ?? 0
  const subtotal  = monto > 0 ? round2(monto / (1 + itbmsPct / 100)) : 0
  const itbmsMonto = round2(monto - subtotal)

  // REQ-484 — auto-aplicación al saldo pendiente y resolución del excedente. Caso especial RN3:
  // Anulación completa/Pedido cancelado sobre una factura nunca cobrada (saldo pendiente = monto
  // total) cancela la deuda sin mover dinero, sin pedir excedente.
  const saldoPendienteFactura = facturaSeleccionada?.saldo_pendiente ?? 0
  const esAnulacionNuncaCobrada = esAnulacion && subtipoAnulacion === 'cancelado'
    && facturaSeleccionada !== null && saldoPendienteFactura === facturaSeleccionada.monto
  const excedente = facturaSeleccionada !== null && !esAnulacionNuncaCobrada
    ? Math.max(0, round2(monto - saldoPendienteFactura))
    : 0
  const hayExcedente = excedente > 0

  // REQ-482 RN2/RN3 — umbral parejo para los 3 tipos, recalculado en tiempo real con el monto.
  const superaUmbral = primaryApprovalThreshold !== undefined && monto > primaryApprovalThreshold

  // REQ-487 RN1/RN2 — obligatorio en Anulación completa (cualquier monto) o al superar el umbral,
  // EXCEPTO en modo Devolución, donde nunca es obligatorio (RN2 pisa a RN1).
  const comprobanteObligatorio = !esDevolucion && (esAnulacion || superaUmbral)

  // REQ-486 RN2 / REQ-480 — el subtipo "Corrección de datos" no aplica reducción de comisión, y
  // tampoco tiene submit real todavía: su "revisión previa + vista previa de factura nueva" es
  // Batch 12 (REQ-488/489/490) — "Corrección de datos" ya no registra directo: pide revisión
  // previa + vista previa de factura nueva antes de confirmar (ver `handleRevisar`/
  // `onRequestCorreccionPreview`), así que queda fuera del `canSubmit`/`handleSubmit` normales de
  // los otros 3 tipos.
  const esCorreccionDeDatos = esAnulacion && subtipoAnulacion === 'correccion'

  const canSubmit = masterClientId !== null
    && facturaSeleccionada !== null
    && !esCorreccionDeDatos
    && monto > 0
    && motivo.trim() !== ''
    && (!hayExcedente || (resultado !== '' && (resultado !== 'devuelto' || cuentaBancariaSalidaId !== null)))
    && (!comprobanteObligatorio || comprobante !== null)
    && !registerMutation.isPending

  function handleSubmit() {
    if (masterClientId === null || facturaSeleccionada === null || !canSubmit) return
    setError(null)
    registerMutation.mutate({
      master_client_id: masterClientId,
      cliente: clientQuery,
      factura_origen_id: facturaSeleccionada.id,
      tipo,
      subtipo_anulacion: esAnulacion ? subtipoAnulacion : null,
      mercancia_regresa_bodega: esAnulacion && subtipoAnulacion === 'cancelado' ? mercanciaRegresaBodega : null,
      monto,
      motivo: motivo.trim(),
      resultado: hayExcedente ? (resultado || null) : null,
      cuenta_bancaria_salida_id: hayExcedente && resultado === 'devuelto' ? cuentaBancariaSalidaId : null,
      comprobante,
      // REQ-491 (Batch 12) — presente solo cuando la nota nace de la cola de devoluciones
      // confirmadas por Bodega, para que el backend cierre el círculo del lado de Bodega.
      devolucion_bodega_id: devolucionPrecargada?.customer_return_id ?? null,
    }, {
      onSuccess: onRegistered,
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setError(msg ?? t('notasCredito.formulario.error'))
      },
    })
  }

  // REQ-488 (validaciones) / REQ-489 (revisión previa) — motivo de corrección + su detalle (tasa o
  // fecha, según el motivo), factura de origen y motivo de texto libre.
  const correccionListaParaRevisar = masterClientId !== null
    && facturaSeleccionada !== null
    && motivoCorreccion !== ''
    && (!motivoIncluyeItbms || tratamientoCorrectoId !== null)
    && motivo.trim() !== ''

  function handleRevisar() {
    if (!correccionListaParaRevisar || masterClientId === null) return
    setError(null)
    onRequestCorreccionPreview({
      master_client_id: masterClientId,
      factura_origen_id: (facturaSeleccionada as NotaCreditoFacturaOrigen).id,
      motivo_correccion: motivoCorreccion as NotaCreditoMotivoCorreccion,
      nuevo_tratamiento_itbms_rate_id: motivoIncluyeItbms ? tratamientoCorrectoId : null,
      nueva_fecha: motivoIncluyeFecha ? todayIso() : null,
      motivo: motivo.trim(),
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('notasCredito.formulario.title')}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <p className="text-xs text-slate-400 dark:text-slate-500">{t('notasCredito.formulario.subtitle')}</p>

          {/* Cliente — REQ-478 RN3 / REQ-481 RN2 (bloqueado cuando viene de Bodega) */}
          <div className="relative">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('notasCredito.formulario.clienteLabel')}
            </label>
            {esDevolucion ? (
              <div className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                {clientQuery}
              </div>
            ) : (
              <div className="relative">
                <IcoSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={clientQuery}
                  onChange={e => { setClientQuery(e.target.value); setClientOpen(true); setMasterClientId(null); setFacturaOrigenId(null) }}
                  onFocus={() => setClientOpen(true)}
                  onBlur={() => setTimeout(() => setClientOpen(false), 150)}
                  placeholder={t('notasCredito.formulario.clientePlaceholder')}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 pl-8 pr-3 py-2 text-sm"
                />
              </div>
            )}
            {!esDevolucion && clientOpen && clientOptions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white dark:bg-slate-800 py-1 shadow-lg max-h-48 overflow-auto">
                {clientOptions.map(opt => (
                  <li key={opt.id} onMouseDown={() => selectClient(opt)}
                    className="cursor-pointer px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                    {opt.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Tipo de nota — REQ-478 RN1/RN2, RN1 REQ-481 (nunca seleccionable a mano) */}
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('notasCredito.formulario.tipoLabel')}
            </span>
            {esDevolucion ? (
              <div className="flex items-center gap-2 rounded-lg bg-primary-soft/60 dark:bg-slate-700/40 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
                <IcoTruck size={14} className="text-primary-dark dark:text-primary-light" />
                {t('notasCredito.formulario.tipoDevolucionReadonly')}
              </div>
            ) : (
              <select
                value={tipo}
                onChange={e => setTipo(e.target.value as NotaCreditoTipo)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
              >
                <option value="descuento_comercial">{t('notasCredito.tipos.descuento_comercial')}</option>
                <option value="anulacion_completa">{t('notasCredito.tipos.anulacion_completa')}</option>
              </select>
            )}
          </div>

          {/* Anulación completa — subtipo + regreso de mercancía (REQ-479) */}
          {tipo === 'anulacion_completa' && (
            <>
              <label className="text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('notasCredito.formulario.subtipoLabel')}
                </span>
                <select
                  value={subtipoAnulacion}
                  onChange={e => setSubtipoAnulacion(e.target.value as NotaCreditoSubtipoAnulacion)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  {SUBTIPOS_ANULACION.map(s => (
                    <option key={s} value={s}>{t(`notasCredito.subtiposAnulacion.${s}`)}</option>
                  ))}
                </select>
              </label>

              {subtipoAnulacion === 'cancelado' && (
                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('notasCredito.formulario.mercanciaRegresaLabel')}
                  </span>
                  <select
                    value={mercanciaRegresaBodega ? '1' : '0'}
                    onChange={e => setMercanciaRegresaBodega(e.target.value === '1')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                  >
                    <option value="0">{t('notasCredito.formulario.mercanciaRegresaNo')}</option>
                    <option value="1">{t('notasCredito.formulario.mercanciaRegresaSi')}</option>
                  </select>
                </label>
              )}

              {subtipoAnulacion === 'correccion' && (
                <>
                  <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2">
                    {t('notasCredito.formulario.correccionAviso')}
                  </p>

                  <label className="text-sm">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                      {t('notasCredito.formulario.motivoCorreccionLabel')}
                    </span>
                    <select
                      value={motivoCorreccion}
                      onChange={e => setMotivoCorreccion(e.target.value as NotaCreditoMotivoCorreccion | '')}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                    >
                      <option value="" disabled>{t('notasCredito.formulario.motivoCorreccionPlaceholder')}</option>
                      {MOTIVOS_CORRECCION.map(m => (
                        <option key={m} value={m}>{t(`notasCredito.motivosCorreccion.${m}`)}</option>
                      ))}
                    </select>
                  </label>

                  {motivoIncluyeItbms && (
                    <>
                      <label className="text-sm">
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                          {t('notasCredito.formulario.tratamientoActualLabel')}
                        </span>
                        <div className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                          {tratamientoActual ? `${tratamientoActual.descripcion} (${tratamientoActual.porcentaje}%)` : '—'}
                        </div>
                      </label>
                      <label className="text-sm">
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                          {t('notasCredito.formulario.tratamientoCorrectoLabel')}
                        </span>
                        <select
                          value={tratamientoCorrectoId ?? ''}
                          onChange={e => setTratamientoCorrectoId(e.target.value ? Number(e.target.value) : null)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                        >
                          <option value="">{t('notasCredito.formulario.tratamientoCorrectoPlaceholder')}</option>
                          {opcionesTratamientoCorrecto.map(r => (
                            <option key={r.id} value={r.id}>{r.descripcion} ({r.porcentaje}%)</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}

                  {motivoIncluyeFecha && (
                    <label className="text-sm">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                        {t('notasCredito.formulario.nuevaFechaLabel')}
                      </span>
                      <input
                        type="text" value={todayIso()} disabled
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-500 dark:text-slate-400"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">{t('notasCredito.formulario.nuevaFechaHint')}</p>
                    </label>
                  )}
                </>
              )}

            </>
          )}

          {/* Devolución de mercancía — solo lectura, REQ-481 */}
          {esDevolucion && devolucionPrecargada && (
            <div className="flex flex-col gap-3">
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('notasCredito.formulario.referenciaLabel')}
                </span>
                <div className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                  {devolucionPrecargada.referencia}
                </div>
              </div>

              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('notasCredito.formulario.productosDevueltosLabel')}
                </span>
                <div className="flex flex-col gap-1.5">
                  {devolucionPrecargada.productos.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/40 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">{p.cantidad} × {p.descripcion}</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {formatCurrency(p.monto_unitario * p.cantidad)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('notasCredito.formulario.personaDevuelveLabel')}
                  </span>
                  <div className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                    {devolucionPrecargada.persona_devuelve}
                  </div>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('notasCredito.formulario.proyectoLabel')}
                  </span>
                  <div className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                    {devolucionPrecargada.proyecto ?? '—'}
                  </div>
                </div>
              </div>

              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('notasCredito.formulario.conformidadLabel')}
                </span>
                <div className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                  {devolucionPrecargada.conformidad}
                </div>
              </div>

              {/* Banner de confirmación física — REQ-482 RN1 */}
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-primary-soft/60 dark:bg-slate-700/40 text-primary-dark dark:text-primary-light text-xs">
                <IcoTruck size={14} className="mt-0.5 shrink-0" />
                {t('notasCredito.formulario.devolucionAviso')}
              </div>
            </div>
          )}

          {/* Factura de origen — REQ-483, siempre obligatoria (en Devolución ya viene resuelta).
              Batch 12 — "Corrección de datos" también la necesita (es la factura a anular). */}
          {!esDevolucion && (
            <label className="text-sm">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                {t('notasCredito.formulario.facturaOrigenLabel')}
              </span>
              <select
                value={facturaOrigenId ?? ''}
                onChange={e => setFacturaOrigenId(e.target.value ? Number(e.target.value) : null)}
                disabled={masterClientId === null}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="">{t('notasCredito.formulario.facturaOrigenPlaceholder')}</option>
                {facturasCliente.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.numero} — {formatCurrency(f.monto)} ({t('notasCredito.formulario.facturaSaldoPendiente')}: {formatCurrency(f.saldo_pendiente)})
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Motivo — Corrección de datos (REQ-488/489). El resto del bloque de abajo (monto
              editable, ITBMS derivado del monto, excedente, comprobante) no aplica: el monto de la
              factura nueva y el comprobante se resuelven en la pantalla de revisión previa. */}
          {facturaSeleccionada && esCorreccionDeDatos && (
            <label className="text-sm">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                {t('notasCredito.formulario.motivoLabel')}
              </span>
              <textarea
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
              />
            </label>
          )}

          {/* Monto / ITBMS / motivo / fecha — REQ-485 */}
          {facturaSeleccionada && !esCorreccionDeDatos && (
            <>
              <label className="text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('notasCredito.formulario.montoLabel')}
                </span>
                {esAnulacion ? (
                  <div className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                    {formatCurrency(monto)}
                  </div>
                ) : (
                  <input
                    type="number" min="0" step="0.01"
                    value={montoInput}
                    onChange={e => setMontoInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                )}
              </label>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('notasCredito.formulario.subtotalLabel')}
                  </span>
                  <div className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-slate-600 dark:text-slate-300">
                    {formatCurrency(subtotal)}
                  </div>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('notasCredito.formulario.itbmsLabel')} ({itbmsPct}%)
                  </span>
                  <div className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-slate-600 dark:text-slate-300">
                    {formatCurrency(itbmsMonto)}
                  </div>
                </div>
              </div>

              <label className="text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('notasCredito.formulario.motivoLabel')}
                </span>
                <textarea
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </label>

              <label className="text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('notasCredito.formulario.fechaLabel')}
                </span>
                <input
                  type="text" value={todayIso()} disabled
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-500 dark:text-slate-400"
                />
              </label>

              {/* Excedente — REQ-484 */}
              {esAnulacionNuncaCobrada ? (
                <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2">
                  {t('notasCredito.formulario.excedenteSinMovimiento')}
                </p>
              ) : hayExcedente ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2">
                    {t('notasCredito.formulario.excedenteAviso')}: {formatCurrency(excedente)}
                  </p>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name="resultado" value="devuelto"
                        checked={resultado === 'devuelto'}
                        onChange={() => setResultado('devuelto')} />
                      {t('notasCredito.formulario.resultadoDevuelto')}
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name="resultado" value="saldo_favor"
                        checked={resultado === 'saldo_favor'}
                        onChange={() => setResultado('saldo_favor')} />
                      {t('notasCredito.formulario.resultadoSaldoFavor')}
                    </label>
                  </div>
                  {resultado === 'devuelto' && (
                    <label className="text-sm">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                        {t('notasCredito.formulario.cuentaBancariaSalidaLabel')}
                      </span>
                      <select
                        value={cuentaBancariaSalidaId ?? ''}
                        onChange={e => setCuentaBancariaSalidaId(e.target.value ? Number(e.target.value) : null)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                      >
                        <option value="">{t('notasCredito.formulario.cuentaBancariaSalidaPlaceholder')}</option>
                        {bankAccounts.filter(a => a.activa).map(a => (
                          <option key={a.id} value={a.id}>{a.banco} — {t(`cuentasBancarias.tipos.${a.tipo_cuenta}`)} ****{a.ultimos_4_digitos}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2">
                  {t('notasCredito.formulario.nuevoSaldoPendiente')}: {formatCurrency(Math.max(0, round2(saldoPendienteFactura - monto)))}
                </p>
              )}

              {/* Banner de umbral de aprobación — REQ-482 RN2/RN3 */}
              {superaUmbral && (
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg text-amber-700 dark:text-amber-300 text-xs">
                  <IcoAlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {t('notasCredito.formulario.umbralAviso')}
                </div>
              )}

              {/* Avisos automáticos — REQ-486 */}
              <div className="flex flex-col gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2">
                  {t('notasCredito.formulario.avisoNotificacionCliente')}
                </p>
                {!esCorreccionDeDatos && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2">
                    {t('notasCredito.formulario.avisoReduccionComision')}
                  </p>
                )}
              </div>

              {/* Comprobante de soporte — REQ-487 */}
              <label className="text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('notasCredito.formulario.comprobanteLabel')}
                  {comprobanteObligatorio && <span className="text-red-500"> *</span>}
                </span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-500 dark:text-slate-400 cursor-pointer hover:border-primary">
                    <IcoPaperclip size={14} />
                    {comprobante ? comprobante.name : t('notasCredito.formulario.comprobantePlaceholder')}
                    <input
                      type="file" className="hidden" accept={COMPROBANTE_ACCEPTED.join(',')}
                      onChange={e => pickComprobante(e.target.files?.[0])}
                    />
                  </label>
                </div>
                {comprobanteObligatorio && (
                  <p className="text-[11px] text-slate-400 mt-1">{t('notasCredito.formulario.comprobanteObligatorioHint')}</p>
                )}
              </label>
            </>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>
            {t('notasCredito.formulario.cancel')}
          </Button>
          {esCorreccionDeDatos ? (
            <Button
              disabled={!correccionListaParaRevisar}
              onClick={handleRevisar}
              data-client-selected={masterClientId !== null}
            >
              {t('notasCredito.formulario.correccionRevisarButton')}
            </Button>
          ) : (
            <Button
              disabled={!canSubmit}
              onClick={handleSubmit}
              data-client-selected={masterClientId !== null}
            >
              {t('notasCredito.formulario.confirm')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
