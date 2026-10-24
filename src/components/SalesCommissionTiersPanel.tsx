import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { SalesCommissionTier, SalesCommissionTierInput } from '@/types/ventasDiseno'
import { parseApiValidationError } from '@/lib/apiValidationError'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoPlus, IcoBan } from '@/components/icons'

const QUERY_KEY = ['ventas-diseno-sales-commission-tiers']

/** Fila en edición: strings para que el input pueda quedar vacío sin producir NaN. */
interface DraftRow {
  key: string
  /** Solo filas ya guardadas: se reenvía en el PUT para actualizarlas en el lugar (conservan id). */
  id?: number
  monto_minimo: string
  monto_maximo: string
  porcentaje: string
}

type RowField = 'monto_minimo' | 'monto_maximo' | 'porcentaje' | 'orden'

function toDraft(tiers: SalesCommissionTier[]): DraftRow[] {
  return [...tiers].sort((a, b) => a.orden - b.orden).map(tier => ({
    key: `tier-${tier.id}`,
    id: tier.id,
    monto_minimo: String(tier.monto_minimo),
    monto_maximo: tier.monto_maximo === null ? '' : String(tier.monto_maximo),
    porcentaje: String(tier.porcentaje),
  }))
}

function serialize(rows: DraftRow[]): string {
  return JSON.stringify(rows.map(r => [r.monto_minimo, r.monto_maximo, r.porcentaje]))
}

/** Convierte el borrador al payload del guardado atómico — `orden` es la posición en la tabla. */
function toPayload(rows: DraftRow[]): SalesCommissionTierInput[] {
  return rows.map((r, i) => ({
    ...(r.id !== undefined ? { id: r.id } : {}),
    monto_minimo: Number(r.monto_minimo),
    monto_maximo: r.monto_maximo.trim() === '' ? null : Number(r.monto_maximo),
    porcentaje:   Number(r.porcentaje),
    orden:        i + 1,
  }))
}

/**
 * SCRUM-944/945 — auditoría de valores de negocio hardcodeados. La tabla de comisión escalonada
 * de vendedores estaba hardcodeada en `SalesTotalsService::percentFor()` (backend); Luis pidió
 * migrarla (2026-09-23). Panel en vez de modal — se monta inline en la vista consolidada de
 * superadmin (`GlobalSettingsPage`), sin pantalla propia de VentasDiseno todavía.
 *
 * Pre-QA (2026-09-23, hallazgos A y B): un tramo suelto no permite validar solapamientos ni huecos
 * (dependen de los demás tramos), y el 422 no se mostraba. Ahora la tabla se edita completa en
 * local y un único "Guardar tramos" la envía entera (`replaceAll`); el backend valida el conjunto y
 * cualquier rechazo se muestra en la tabla, por fila cuando el backend indica la ruta `tiers.N.campo`.
 */
export default function SalesCommissionTiersPanel() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()
  const nextKey = useRef(0)

  const { data: tiers, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn:  () => ventasDisenoApi.salesCommissionTiers.list(),
  })

  const [draft, setDraft] = useState<DraftRow[]>([])
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (tiers) setDraft(toDraft(tiers))
  }, [tiers])

  const save = useMutation({
    mutationFn: (rows: SalesCommissionTierInput[]) => ventasDisenoApi.salesCommissionTiers.replaceAll(rows),
    onSuccess: saved => {
      qc.setQueryData(QUERY_KEY, saved)
      qc.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  const dirty = tiers != null && serialize(draft) !== serialize(toDraft(tiers))

  function clearFeedback() {
    if (save.isError) save.reset()
    if (Object.keys(localErrors).length > 0) setLocalErrors({})
  }

  function updateRow(key: string, field: 'monto_minimo' | 'monto_maximo' | 'porcentaje', value: string) {
    clearFeedback()
    setDraft(rows => rows.map(r => (r.key === key ? { ...r, [field]: value } : r)))
  }

  function removeRow(key: string) {
    clearFeedback()
    setDraft(rows => rows.filter(r => r.key !== key))
  }

  function addRow() {
    clearFeedback()
    setDraft(rows => {
      const last = rows[rows.length - 1]
      const lastMax = last && last.monto_maximo.trim() !== '' ? Number(last.monto_maximo) : null
      const suggestedMin = lastMax !== null && Number.isFinite(lastMax) ? (Math.round((lastMax + 0.01) * 100) / 100) : 0
      nextKey.current += 1
      return [...rows, { key: `new-${nextKey.current}`, monto_minimo: String(suggestedMin), monto_maximo: '', porcentaje: '0' }]
    })
  }

  function discard() {
    clearFeedback()
    if (tiers) setDraft(toDraft(tiers))
  }

  function submit() {
    // Validación mínima de cliente: lo que no es un número no llega al backend (llegaría como null).
    const errors: Record<string, string> = {}
    draft.forEach((r, i) => {
      if (r.monto_minimo.trim() === '' || !Number.isFinite(Number(r.monto_minimo))) errors[`tiers.${i}.monto_minimo`] = t('ventasDiseno:salesCommissionTiers.errores.numeroRequerido')
      if (r.monto_maximo.trim() !== '' && !Number.isFinite(Number(r.monto_maximo))) errors[`tiers.${i}.monto_maximo`] = t('ventasDiseno:salesCommissionTiers.errores.numeroInvalido')
      if (r.porcentaje.trim() === '' || !Number.isFinite(Number(r.porcentaje))) errors[`tiers.${i}.porcentaje`] = t('ventasDiseno:salesCommissionTiers.errores.numeroRequerido')
    })
    setLocalErrors(errors)
    if (Object.keys(errors).length > 0) return

    if (!window.confirm(t('ventasDiseno:salesCommissionTiers.confirmarGuardar'))) return
    save.mutate(toPayload(draft))
  }

  // Errores a mostrar: los locales, o los del backend (422) separados en "por fila" y "generales".
  const apiError = save.isError ? parseApiValidationError(save.error) : null
  const rowErrors: Record<number, Partial<Record<RowField, string>>> = {}
  const generalErrors: string[] = []
  const merged: Record<string, string[]> = { ...(apiError?.fields ?? {}) }
  for (const [path, msg] of Object.entries(localErrors)) merged[path] = [msg]
  for (const [path, msgs] of Object.entries(merged)) {
    const m = /^tiers\.(\d+)\.(monto_minimo|monto_maximo|porcentaje|orden)$/.exec(path)
    if (m) {
      const idx = Number(m[1])
      rowErrors[idx] = { ...rowErrors[idx], [m[2] as RowField]: msgs.join(' ') }
    } else {
      // Errores del conjunto (clave `tiers`: hueco, solapamiento, tramo abierto...): TODOS, no solo
      // el primero — si no, el usuario los descubre de a uno guardando varias veces (S4).
      generalErrors.push(...msgs)
    }
  }
  if (apiError?.message && generalErrors.length === 0 && Object.keys(rowErrors).length === 0) {
    generalErrors.push(apiError.message)
  }
  if (save.isError && apiError === null) generalErrors.push(t('ventasDiseno:salesCommissionTiers.errores.guardar'))
  // Con errores por fila el mensaje general del backend ("The given data was invalid") es ruido, pero si
  // trae contexto propio (ej. "Los tramos se solapan") y no es por-fila, ya quedó en `generalErrors`.

  const rowErrorText = (i: number) => Object.values(rowErrors[i] ?? {}).join(' · ')
  const inputClass = (i: number, field: RowField) =>
    `w-full rounded-lg border dark:bg-slate-900 px-2 py-1.5 text-xs ${
      rowErrors[i]?.[field] ? 'border-red-400' : 'border-slate-300 dark:border-slate-600'
    }`

  return (
    <Card variant="panel" className="p-4 mb-3">
      <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1">
        {t('ventasDiseno:salesCommissionTiers.title')}
      </h3>
      <p className="text-[12px] text-slate-400 mb-3">{t('ventasDiseno:salesCommissionTiers.subtitle')}</p>

      <table className="w-full text-sm mb-3">
        <thead>
          <tr className="text-left text-[10.5px] font-medium text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
            <th className="py-2 pr-2">{t('ventasDiseno:salesCommissionTiers.form.montoMinimo')}</th>
            <th className="py-2 pr-2">{t('ventasDiseno:salesCommissionTiers.form.montoMaximo')}</th>
            <th className="py-2 pr-2">{t('ventasDiseno:salesCommissionTiers.columnas.porcentaje')}</th>
            <th className="py-2 pr-2" />
          </tr>
        </thead>
        <tbody>
          {draft.map((row, i) => (
            <RowFragment key={row.key} errorText={rowErrorText(i)}>
              <td className="py-1.5 pr-2">
                <input
                  type="number" min={0} step="0.01" value={row.monto_minimo}
                  aria-label={`${t('ventasDiseno:salesCommissionTiers.form.montoMinimo')} ${i + 1}`}
                  aria-invalid={rowErrors[i]?.monto_minimo ? true : undefined}
                  onChange={e => updateRow(row.key, 'monto_minimo', e.target.value)}
                  className={inputClass(i, 'monto_minimo')}
                />
              </td>
              <td className="py-1.5 pr-2">
                <input
                  type="number" min={0} step="0.01" value={row.monto_maximo}
                  placeholder={t('ventasDiseno:salesCommissionTiers.form.sinTope')}
                  aria-label={`${t('ventasDiseno:salesCommissionTiers.form.montoMaximo')} ${i + 1}`}
                  aria-invalid={rowErrors[i]?.monto_maximo ? true : undefined}
                  onChange={e => updateRow(row.key, 'monto_maximo', e.target.value)}
                  className={inputClass(i, 'monto_maximo')}
                />
              </td>
              <td className="py-1.5 pr-2">
                <input
                  type="number" min={0} max={100} step="0.1" value={row.porcentaje}
                  aria-label={`${t('ventasDiseno:salesCommissionTiers.columnas.porcentaje')} ${i + 1}`}
                  aria-invalid={rowErrors[i]?.porcentaje ? true : undefined}
                  onChange={e => updateRow(row.key, 'porcentaje', e.target.value)}
                  className={inputClass(i, 'porcentaje')}
                />
              </td>
              <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                <button
                  type="button" onClick={() => removeRow(row.key)}
                  className="text-slate-400 hover:text-red-600"
                  aria-label={`${t('ventasDiseno:salesCommissionTiers.quitarFila')} ${i + 1}`}
                >
                  <IcoBan size={14} />
                </button>
              </td>
            </RowFragment>
          ))}
          {!isLoading && draft.length === 0 && (
            <tr><td colSpan={4} className="py-4 text-center text-slate-400">{t('ventasDiseno:salesCommissionTiers.vacio')}</td></tr>
          )}
        </tbody>
      </table>

      {generalErrors.length > 0 && (
        <div role="alert" className="mb-3 text-xs text-red-500 space-y-0.5">
          {generalErrors.map((msg, i) => <p key={i}>{msg}</p>)}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-dark hover:underline">
          <IcoPlus size={13} /> {t('ventasDiseno:salesCommissionTiers.agregar')}
        </button>
        {dirty && (
          <div className="flex gap-2">
            <Button variant="secondary" className="!text-xs !py-1.5" onClick={discard} disabled={save.isPending}>
              {t('common:actions.cancel')}
            </Button>
            <Button className="!text-xs !py-1.5" onClick={submit} loading={save.isPending}>
              {t('ventasDiseno:salesCommissionTiers.guardar')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

/** Fila de tabla + (si hay error) una segunda fila con el mensaje, sin romper el ancho de columnas. */
function RowFragment({ children, errorText }: { children: React.ReactNode; errorText: string }) {
  return (
    <>
      <tr className="border-b border-slate-50 dark:border-slate-800">{children}</tr>
      {errorText !== '' && (
        <tr>
          <td colSpan={4} className="pb-1.5 text-xs text-red-500" role="alert">{errorText}</td>
        </tr>
      )}
    </>
  )
}
