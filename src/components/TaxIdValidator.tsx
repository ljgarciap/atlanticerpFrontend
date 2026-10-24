import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { TaxIdValidationResult } from '@/types/ventasDiseno'
import { Button } from '@/components/ui/Button'
import { IcoCheck, IcoAlertTriangle } from '@/components/icons'

/**
 * SCRUM-1002 — "Validar RUC" contra la DGI (vía MSL), compartido entre el alta de cliente/subcliente y la edición de
 * datos fiscales. Reglas (decisiones de Luis):
 *  - NUNCA bloquea el guardado: si la consulta no está disponible (FE apagada, sin credenciales, MSL caído) o el RUC no
 *    figura, solo avisa.
 *  - NUNCA pisa en silencio: el DV y la razón social oficiales se PROPONEN y solo se aplican con un clic.
 *  - "no disponible" jamás se muestra como "RUC inválido".
 *  - El estado del contribuyente (p. ej. "I") NO se muestra: el sandbox de MSL lo devuelve para todo RUC válido (también el de
 *    Atlantic), así que avisar con él era ruido (decisión de Luis, 2026-10-01).
 */
interface Props {
  taxId:        string
  taxIdDv:      string
  businessName: string
  /** El usuario aceptó los datos oficiales propuestos. */
  onApply:      (datos: { dv: string | null; nombre: string | null }) => void
}

function horaPanama(fecha: Date): string {
  return fecha.toLocaleTimeString('es-PA', { timeZone: 'America/Panama', hour: '2-digit', minute: '2-digit', hour12: false })
}

const normalizar = (v: string) => v.trim().toUpperCase().replace(/\s+/g, ' ')
// El DV "5" y "05" son el mismo dígito: mismo criterio que el reporte de SCRUM-1005 en el backend.
const normalizarDv = (v: string) => v.trim().replace(/^0+/, '')

export default function TaxIdValidator({ taxId, taxIdDv, businessName, onApply }: Props) {
  const { t } = useTranslation('ventasDiseno')
  const [resultado, setResultado] = useState<{ para: string; data: TaxIdValidationResult; hora: string } | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  const consultado = taxId.trim()

  const mutation = useMutation({
    mutationFn: (valor: string) => ventasDisenoApi.clients.validateTaxId(valor),
    onSuccess: (data, valor) => {
      setErrorKey(null)
      setResultado({ para: valor, data, hora: horaPanama(new Date()) })
    },
    onError: (err: unknown) => {
      setResultado(null)
      setErrorKey(isAxiosError(err) && err.response?.status === 429 ? 'limite' : 'errorGenerico')
    },
  })

  // Un resultado de otro RUC (el usuario siguió editando) no se muestra: sería engañoso.
  const vigente = resultado !== null && resultado.para === consultado ? resultado : null
  const k = 'clients.taxIdValidation'

  function avisoNoDisponible(codigo: TaxIdValidationResult['codigo']): string {
    if (codigo === 'apagado') return t(`${k}.noDisponible.apagado`)
    if (codigo === 'sin_credenciales') return t(`${k}.noDisponible.sinCredenciales`)
    return t(`${k}.noDisponible.generico`)
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="tax-id-validator">
      <div>
        <Button
          variant="secondary" type="button"
          disabled={consultado.length < 3 || mutation.isPending}
          onClick={() => mutation.mutate(consultado)}
        >
          {mutation.isPending ? t(`${k}.validando`) : t(`${k}.validar`)}
        </Button>
      </div>

      {errorKey !== null && (
        <p role="status" className="text-[11.5px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
          <IcoAlertTriangle size={13} /> {t(`${k}.${errorKey}`)}
        </p>
      )}

      {vigente !== null && !vigente.data.disponible && (
        <p role="status" className="text-[11.5px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
          <IcoAlertTriangle size={13} /> {avisoNoDisponible(vigente.data.codigo)}
        </p>
      )}

      {vigente !== null && vigente.data.disponible && vigente.data.valido === false && (
        <p role="status" className="text-[11.5px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
          <IcoAlertTriangle size={13} /> {t(`${k}.noEncontrado`)}
        </p>
      )}

      {vigente !== null && vigente.data.valido === true && (() => {
        const d = vigente.data
        const dvDifiere = d.dv !== null && normalizarDv(d.dv) !== normalizarDv(taxIdDv)
        const nombreDifiere = d.nombre !== null && normalizar(d.nombre) !== normalizar(businessName)

        return (
          <div role="status" className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50/60 dark:bg-green-950/20 p-2.5 text-[11.5px] text-slate-700 dark:text-slate-200 flex flex-col gap-1">
            <p className="flex items-center gap-1.5 font-semibold text-green-700 dark:text-green-400">
              <IcoCheck size={13} /> {t(`${k}.validadoHoy`, { hora: vigente.hora })}
            </p>
            {d.nombre !== null && <p>{t(`${k}.nombreOficial`)}: <span className="font-medium">{d.nombre}</span></p>}
            {d.dv !== null && <p>{t(`${k}.dvOficial`)}: <span className="font-medium">{d.dv}</span></p>}
            {dvDifiere && <p className="text-amber-700 dark:text-amber-400">{t(`${k}.dvDifiere`, { ingresado: taxIdDv.trim() || '—', oficial: d.dv })}</p>}
            {nombreDifiere && <p className="text-amber-700 dark:text-amber-400">{t(`${k}.nombreDifiere`)}</p>}
            {dvDifiere || nombreDifiere ? (
              <div>
                <Button variant="secondary" type="button" onClick={() => onApply({ dv: d.dv, nombre: d.nombre })}>
                  {t(`${k}.usarOficiales`)}
                </Button>
              </div>
            ) : (
              <p className="text-green-700 dark:text-green-400">{t(`${k}.coincide`)}</p>
            )}
          </div>
        )
      })()}
    </div>
  )
}
