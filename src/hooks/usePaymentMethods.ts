import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCatalog } from '@/hooks/useCatalog'
import { PAYMENT_METHODS } from '@/types/adminContab'

export interface PaymentMethodInfo {
  key:              string
  label:            string
  /** Nunca representa dinero entrando a una cuenta bancaria real: el formulario no la pide. */
  sinCuentaBancaria: boolean
  /** Se confirma en el momento (entra al arqueo del día) en vez de esperar la confirmación del banco. */
  inmediato:        boolean
  /** También se ofrece al pagar un reporte de caja chica. */
  cajaChica:        boolean
}

/** Respaldo = lo que antes eran constantes del código; rige mientras el catálogo carga o si falla. */
const FALLBACK_PROPS: Record<string, Pick<PaymentMethodInfo, 'sinCuentaBancaria' | 'inmediato' | 'cajaChica'>> = {
  transferencia:       { sinCuentaBancaria: false, inmediato: false, cajaChica: true },
  cheque:              { sinCuentaBancaria: false, inmediato: false, cajaChica: true },
  efectivo:            { sinCuentaBancaria: false, inmediato: true,  cajaChica: true },
  yappy:               { sinCuentaBancaria: false, inmediato: false, cajaChica: true },
  retencion_impuestos: { sinCuentaBancaria: true,  inmediato: true,  cajaChica: false },
  ajuste_cuenta:       { sinCuentaBancaria: true,  inmediato: true,  cajaChica: false },
}
const NO_PROPS = { sinCuentaBancaria: false, inmediato: false, cajaChica: false }

/**
 * Fase 14b — formas de pago de cobros, abonos y caja chica, como catálogo por empresa (`payment_method`). `methods` trae las ACTIVAS con su
 * comportamiento; `label(key)` resuelve la etiqueta de cualquier clave guardada (mientras el catálogo carga cae a la traducción de siempre).
 * Los reportes de ventas por método conservan sus columnas fijas y no usan este hook.
 */
export function usePaymentMethods() {
  const { t } = useTranslation('adminContab')
  const { data } = useCatalog('payment_method')
  const tr = useCallback((key: string) => t(`cobros.metodos.${key}`), [t])

  const methods = useMemo<PaymentMethodInfo[]>(() => {
    if (data && data.length > 0) {
      return data.map(e => ({
        key:   e.key,
        label: e.label,
        sinCuentaBancaria: e.props?.sin_cuenta_bancaria === true,
        inmediato:         e.props?.inmediato === true,
        cajaChica:         e.props?.caja_chica === true,
      }))
    }
    return PAYMENT_METHODS.map(key => ({ key, label: tr(key), ...(FALLBACK_PROPS[key] ?? NO_PROPS) }))
  }, [data, tr])

  const find = useCallback((key: string | null | undefined) => methods.find(m => m.key === key), [methods])
  const label = useCallback((key: string) => find(key)?.label ?? tr(key), [find, tr])
  const sinCuentaBancaria = useCallback((key: string | null | undefined) => find(key)?.sinCuentaBancaria ?? false, [find])
  const inmediato = useCallback((key: string | null | undefined) => find(key)?.inmediato ?? false, [find])
  const cajaChica = useMemo(() => methods.filter(m => m.cajaChica), [methods])

  return { methods, cajaChica, label, sinCuentaBancaria, inmediato }
}
